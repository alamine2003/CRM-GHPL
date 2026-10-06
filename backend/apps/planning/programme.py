"""Programme de la semaine du délégué (VIS-001, cycle 0.4).

Le délégué exécute la **version approuvée** de son planning (RG-018) : la référence, avec les
heures changées depuis son approbation. Une modification majeure qui attend la décision du
superviseur n'y entre pas encore ; les visites qu'elle touche restent prévues comme approuvées.
Chaque journée liste ses visites dans l'ordre ; la prochaine visite du jour est celle qui
n'est pas encore faite, la première dans l'ordre (prd.md §12).

Une visite restée prévue après la fin de sa journée est « à justifier » (VIS-009 CA1) : le
programme la rappelle tant qu'elle n'est pas justifiée, sur la semaine et la précédente.
"""

from datetime import date, time, timedelta

from django.db.models import Q

from apps.identite.models import Utilisateur
from apps.socle.models import Pays
from apps.socle.services import aujourdhui, valeur_parametre

from .calendrier import jours_de_la_semaine, lundi
from .etats import StatutVisite
from .models import Activite, Decision, Planning, Visite


class Etat:
    """Ce que le programme peut dire de la semaine."""

    APPROUVE = "approuve"  # une version approuvée : le programme est là
    NON_APPROUVE = "non_approuve"  # un planning, pas encore approuvé
    SANS_PLANNING = "sans_planning"
    SANS_POSTE = "sans_poste"

    CHOIX = ((APPROUVE, "Approuvé"), (NON_APPROUVE, "Pas encore approuvé"),
             (SANS_PLANNING, "Sans planning"), (SANS_POSTE, "Sans poste"))  # fmt: skip


#: Une visite encore à faire.
A_FAIRE = (StatutVisite.PREVUE, StatutVisite.EN_COURS)


def _ordre(visite: dict) -> tuple:
    return (visite["date"], visite["heure"] or "99:99", visite.get("ordre") or 0)


def _motifs(pays: Pays) -> list:
    from apps.referentiel.models import Liste, Valeur

    motifs = Valeur.objects.filter(pays=pays, liste=Liste.MOTIF_ECART, archive_le__isnull=True)
    return list(motifs.order_by("ordre", "libelle"))


def _visites_approuvees(planning: Planning | None, ref) -> list[Visite]:
    """Les fiches vivantes (statut, prospect, lieu), à la date et à l'heure approuvées."""
    from . import services

    if ref is None:
        return []
    figees = sorted(services.contenu_effectif(ref).get("visites", []), key=_ordre)
    en_attente = set(services.suivi_apres_approbation(planning)["en_attente"])
    vivantes = Visite.objects.filter(pk__in=[v["id"] for v in figees]).select_related(
        "prospect__type", "prospect__specialite", "etablissement", "reseau", "motif_ecart"
    )
    par_id = {str(v.pk): v for v in vivantes}
    visites = []
    for figee in figees:
        visite = par_id.get(figee["id"])
        if visite is None:
            continue
        visite.date = date.fromisoformat(figee["date"])
        visite.heure = time.fromisoformat(figee["heure"]) if figee["heure"] else None
        visite.ordre = figee.get("ordre") or visite.ordre
        visite.modification_en_attente = figee["id"] in en_attente
        visites.append(visite)
    return visites


def a_justifier(pays: Pays, delegue: Utilisateur, today: date) -> list[Visite]:
    """VIS-009 CA1 : les visites approuvées restées prévues après leur journée, sur la semaine
    en cours et la précédente, les plus anciennes d'abord."""
    from . import services

    semaine = lundi(today)
    # Une version approuvée suffit : une modification soumise (un report, VIS-007 CA2) laisse
    # le planning « soumis » sans retirer ce qui a été approuvé.
    plannings = Planning.objects.filter(
        pays=pays, delegue=delegue, versions__decision=Decision.APPROUVE,
        semaine__in=[semaine - timedelta(days=7), semaine],
    ).distinct().order_by("semaine")  # fmt: skip
    return [
        v
        for p in plannings
        for v in _visites_approuvees(p, services.reference(p))
        if v.date < today and v.statut == StatutVisite.PREVUE
    ]


def programme(pays: Pays, delegue: Utilisateur, jour: date | None = None) -> dict:
    """La semaine qui contient `jour` (aujourd'hui par défaut), telle qu'approuvée."""
    from . import services

    today = aujourdhui(pays)
    semaine = lundi(jour or today)
    planning = Planning.objects.filter(pays=pays, delegue=delegue, semaine=semaine).first()
    ref = services.reference(planning) if planning else None
    visites = _visites_approuvees(planning, ref)

    activites = []
    if ref:
        ids = [a["id"] for a in services.contenu_effectif(ref).get("activites", [])]
        activites = list(Activite.objects.filter(pk__in=ids).order_by("date"))

    jours = [
        {"date": j.date, "ferie": j.ferie.libelle if j.ferie else None,
         "visites": [v for v in visites if v.date == j.date],
         "activites": [a for a in activites if a.date == j.date]}
        for j in jours_de_la_semaine(pays, semaine)
    ]  # fmt: skip
    prochaine = next((v for v in visites if v.date == today and v.statut in A_FAIRE), None)

    if ref:
        etat = Etat.APPROUVE
    elif planning:
        etat = Etat.NON_APPROUVE
    elif services.occupe_un_poste(delegue, pays, semaine):
        etat = Etat.SANS_PLANNING
    else:
        etat = Etat.SANS_POSTE
    return {
        "semaine": semaine,
        "aujourdhui": today,
        "fuseau": pays.fuseau,
        "etat": etat,
        "planning": planning,
        "version": ref.numero if ref else None,
        "jours": jours,
        "prochaine": prochaine.pk if prochaine else None,
        "geolocalisation": valeur_parametre(pays, "geolocalisation_active"),
        "attente_gps_secondes": valeur_parametre(pays, "attente_gps_secondes"),
        "motifs_ecart": _motifs(pays),
        "a_justifier": a_justifier(pays, delegue, today),
    }


#: Plannings dont les visites ont été prévues pour de bon : validés, puis exécutés.
EXECUTES = ("approuve", "en_cours", "termine")


def historique(visite: Visite, nombre: int = 3) -> list[Visite]:
    """VIS-002 : les dernières visites du même délégué chez le même prospect, avant celle-ci,
    dans des plannings validés ; jamais celles d'un collègue (CA1)."""
    if visite.prospect_id is None:
        return []
    return list(
        Visite.objects.filter(
            Q(planning__statut__in=EXECUTES) | Q(planning__versions__decision=Decision.APPROUVE),
            planning__delegue_id=visite.planning.delegue_id,
            prospect_id=visite.prospect_id,
            archive_le__isnull=True,
            date__lt=visite.date,
        )
        .select_related("etablissement")
        .distinct()
        .order_by("-date", "-heure")[:nombre]
    )

"""Programme de la semaine du délégué (VIS-001, cycle 0.4).

Le délégué exécute la **version approuvée** de son planning (RG-018) : la référence, avec les
heures changées depuis son approbation. Une modification majeure qui attend la décision du
superviseur n'y entre pas encore ; les visites qu'elle touche restent prévues comme approuvées.
Chaque journée liste ses visites dans l'ordre ; la prochaine visite du jour est celle qui
n'est pas encore faite, la première dans l'ordre (prd.md §12).
"""

from datetime import date, time

from apps.identite.models import Utilisateur
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .calendrier import jours_de_la_semaine, lundi
from .etats import StatutVisite
from .models import Activite, Planning, Visite


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


def programme(pays: Pays, delegue: Utilisateur, jour: date | None = None) -> dict:
    """La semaine qui contient `jour` (aujourd'hui par défaut), telle qu'approuvée."""
    from . import services

    today = aujourdhui(pays)
    semaine = lundi(jour or today)
    planning = Planning.objects.filter(pays=pays, delegue=delegue, semaine=semaine).first()
    ref = services.reference(planning) if planning else None
    figees = sorted(services.contenu_effectif(ref).get("visites", []), key=_ordre) if ref else []
    en_attente = set(services.suivi_apres_approbation(planning)["en_attente"]) if ref else set()

    # Les fiches vivantes (statut, prospect, lieu), à la date et à l'heure approuvées.
    vivantes = Visite.objects.filter(pk__in=[v["id"] for v in figees]).select_related(
        "prospect__type", "prospect__specialite", "etablissement", "reseau"
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
    }

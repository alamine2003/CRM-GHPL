"""Contrôles du planning (PLN-004, 0.2.4).

- **Bloquants** (RG-015) : ils empêcheront la soumission (0.2.8) — champs obligatoires ;
  prospect et établissement actifs, liés par un exercice actif ; pas deux visites à la même
  heure ; pas deux visites du même prospect le même jour.
- **Signalements** (RG-016) : ils n'empêchent rien mais apparaissent au superviseur (CA2) —
  seuils de visites par jour et type de poste, réduits au prorata des absences et sans les
  jours fériés (RG-022) ; prospect hors liste cible ; prospect hors secteur (RG-024) ; prospect
  A non planifié dans le mois. La soumission en retard s'y ajoutera avec la soumission (0.2.8).

Le délégué voit les uns et les autres pendant la préparation, pour corriger avant de soumettre.
"""

import datetime as dt
import math
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from django.utils.translation import gettext as _
from rest_framework import status

from apps.organisation.models import actif_le
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import valeur_parametre

from .calendrier import jours_de_la_semaine
from .models import Planning, Visite

BLOQUANT = "bloquant"
SIGNALEMENT = "signalement"
GRAVITES = (BLOQUANT, SIGNALEMENT)
CODES = (
    # Bloquants (RG-015)
    "incomplete", "fiche_inactive", "sans_exercice", "meme_heure", "meme_prospect",
    "jour_non_planifiable",
    # Signalements (RG-016)
    "seuil_bas", "seuil_haut", "hors_cible", "hors_secteur", "a_non_planifie",
    "echeance_depassee", "soumis_en_retard",
)  # fmt: skip


@dataclass
class Anomalie:
    code: str
    gravite: str
    date: dt.date | None = None
    visites: list[str] = field(default_factory=list)
    manquants: list[str] | None = None
    fiche: str | None = None
    heure: str | None = None
    nombre: int | None = None
    min: int | None = None
    max: int | None = None
    mois: str | None = None
    prospects: list[dict] | None = None


@dataclass
class Objectif:
    """Nombre de visites d'un jour face à son seuil, réduit au prorata des absences."""

    date: dt.date
    visites: int
    min: int
    max: int


@dataclass
class Bilan:
    bloquants: list[Anomalie]
    signalements: list[Anomalie]
    objectifs: list[Objectif]


def _visites(planning: Planning) -> list[Visite]:
    return list(
        planning.visites.filter(archive_le__isnull=True)
        .select_related("prospect", "etablissement")
        .order_by("date", "ordre")
    )


def _fiche_utilisable(fiche, planning: Planning) -> bool:
    from apps.prospects.models import StatutFiche

    if fiche.archive_le is not None:
        return False
    return fiche.statut == StatutFiche.ACTIF or (
        fiche.statut == StatutFiche.A_VALIDER and fiche.cree_par_id == planning.delegue_id
    )


def bloquants(planning: Planning, visites: list[Visite] | None = None) -> list[Anomalie]:
    from apps.prospects.models import Exercice

    from .services import champs_manquants, jour_absent

    visites = _visites(planning) if visites is None else visites
    anomalies: list[Anomalie] = []
    # Un jour devenu férié, ou d'absence toute la journée, après la pose de ses visites
    # (PLN-001 CA2, RG-022) : elles sont à déplacer avant de soumettre.
    planifiables = {j.date for j in jours_de_la_semaine(planning.pays, planning.semaine)
                    if j.planifiable and not jour_absent(planning, j.date)}  # fmt: skip
    for jour in sorted({v.date for v in visites} - planifiables):
        anomalies.append(Anomalie("jour_non_planifiable", BLOQUANT, jour,
                                  [str(v.pk) for v in visites if v.date == jour]))  # fmt: skip
    for v in visites:
        if manquants := champs_manquants(v):
            anomalies.append(Anomalie("incomplete", BLOQUANT, v.date, [str(v.pk)],
                                      manquants=manquants))  # fmt: skip
        for nom in ("prospect", "etablissement"):
            fiche = getattr(v, nom)
            if fiche is not None and not _fiche_utilisable(fiche, planning):
                anomalies.append(Anomalie("fiche_inactive", BLOQUANT, v.date, [str(v.pk)],
                                          fiche=nom))  # fmt: skip
        if (
            v.prospect_id
            and v.etablissement_id
            and not Exercice.objects.filter(
                actif_le(v.date), prospect_id=v.prospect_id, etablissement_id=v.etablissement_id
            ).exists()
        ):
            anomalies.append(Anomalie("sans_exercice", BLOQUANT, v.date, [str(v.pk)]))

    # Deux visites à la même heure (PLN-004 CA1) ; les visites d'un passage partagent la leur.
    par_heure: dict[tuple, dict] = defaultdict(dict)
    for v in visites:
        if v.heure is not None:
            par_heure[(v.date, v.heure)].setdefault(v.passage_id or v.pk, []).append(v)
    for (jour, heure), unites in par_heure.items():
        if len(unites) > 1:
            ids = [str(v.pk) for groupe in unites.values() for v in groupe]
            anomalies.append(Anomalie("meme_heure", BLOQUANT, jour, ids,
                                      heure=heure.strftime("%H:%M")))  # fmt: skip

    par_prospect: dict[tuple, list] = defaultdict(list)
    for v in visites:
        if v.prospect_id:
            par_prospect[(v.date, v.prospect_id)].append(str(v.pk))
    for (jour, _p), ids in par_prospect.items():
        if len(ids) > 1:
            anomalies.append(Anomalie("meme_prospect", BLOQUANT, jour, ids))
    return sorted(anomalies, key=lambda a: (a.date or date.min, a.code))


def _seuils(planning: Planning, postes) -> tuple[int, int] | None:
    """Seuil du jour selon le type de poste (RG-016). Pour qui occupe plusieurs postes de types
    différents, la fourchette la plus large [H]."""
    types = {p.type_poste for p in postes}
    if not types:
        return None
    seuils = valeur_parametre(planning.pays, "seuils_visites_jour")
    retenus = [seuils[t] for t in types if t in seuils]
    if not retenus:
        return None
    return min(s["min"] for s in retenus), max(s["max"] for s in retenus)


def objectifs(planning: Planning, visites: list[Visite], postes) -> list[Objectif]:
    """Seuils du jour au prorata de la part travaillée (PLN-009 CA1, RG-022) : minimum arrondi
    à l'entier inférieur, maximum à l'entier supérieur [H]. Jours fériés et journées entières
    d'absence sont exclus."""
    from .services import part_travaillee

    bornes = _seuils(planning, postes)
    if bornes is None:
        return []
    resultat = []
    for jour in jours_de_la_semaine(planning.pays, planning.semaine):
        part = part_travaillee(planning, jour.date) if jour.planifiable else 0
        if part <= 0:
            continue
        nombre = sum(1 for v in visites if v.date == jour.date)
        resultat.append(Objectif(jour.date, nombre, math.floor(bornes[0] * part),
                                 math.ceil(bornes[1] * part)))  # fmt: skip
    return resultat


def _derniers_jours_du_mois(planning: Planning) -> list[date]:
    """Mois dont le dernier jour ouvré tombe dans cette semaine : c'est la dernière occasion
    d'y planifier ses prospects A [H]."""
    ouvres = valeur_parametre(planning.pays, "jours_ouvres") or [1, 2, 3, 4, 5]
    mois = []
    for j in jours_de_la_semaine(planning.pays, planning.semaine):
        suivant = j.date + timedelta(days=1)
        while suivant.isoweekday() not in ouvres:
            suivant += timedelta(days=1)
        if suivant.month != j.date.month:
            mois.append(j.date)
    return mois


def signalements(
    planning: Planning, visites: list[Visite] | None = None, postes=None
) -> list[Anomalie]:
    from apps.prospects.models import Cible

    from .services import postes_de_la_semaine

    visites = _visites(planning) if visites is None else visites
    postes = list(postes_de_la_semaine(planning)) if postes is None else postes
    anomalies: list[Anomalie] = []

    for o in objectifs(planning, visites, postes):
        if o.visites < o.min:
            anomalies.append(Anomalie("seuil_bas", SIGNALEMENT, o.date, nombre=o.visites,
                                      min=o.min, max=o.max))  # fmt: skip
        elif o.visites > o.max:
            anomalies.append(Anomalie("seuil_haut", SIGNALEMENT, o.date, nombre=o.visites,
                                      min=o.min, max=o.max))  # fmt: skip

    cibles = Cible.objects.filter(actif_le(planning.semaine), poste__in=postes)
    cibles_ids = set(cibles.values_list("prospect_id", flat=True))
    secteurs = {s.pk for p in postes for s in p.secteurs.all()}
    # Un commando, un déplacement ou un accompagnement explique les visites de sa journée hors
    # secteur ou hors liste cible (PLN-018 CA1) : le superviseur lit l'activité, pas une anomalie.
    from .services import jours_d_activite_avec_visites

    couverts = jours_d_activite_avec_visites(planning)
    for v in visites:
        if v.date in couverts:
            continue
        if v.prospect_id and v.prospect_id not in cibles_ids:
            anomalies.append(Anomalie("hors_cible", SIGNALEMENT, v.date, [str(v.pk)]))
        lieu = v.etablissement or v.prospect
        if lieu is not None and secteurs and lieu.secteur_id not in secteurs:
            anomalies.append(Anomalie("hors_secteur", SIGNALEMENT, v.date, [str(v.pk)]))

    # Prospects A de la liste cible sans visite dans le mois, à sa dernière semaine.
    for fin_de_mois in _derniers_jours_du_mois(planning):
        debut = fin_de_mois.replace(day=1)
        planifies = set(
            Visite.objects.filter(
                planning__delegue=planning.delegue, archive_le__isnull=True,
                date__gte=debut, date__lte=fin_de_mois, prospect__isnull=False,
            ).values_list("prospect_id", flat=True)
        )  # fmt: skip
        oublies = (
            cibles.filter(prospect__potentiel="A")
            .exclude(prospect_id__in=planifies)
            .select_related("prospect")
            .order_by("prospect__nom", "prospect__prenom")
            .distinct()
        )
        # Un prospect ciblé par deux postes n'est nommé qu'une fois.
        uniques = {c.prospect_id: c.prospect for c in oublies}
        prospects = [{"id": str(pk), "nom": f"{p.prenom} {p.nom}".strip()}
                     for pk, p in uniques.items()]  # fmt: skip
        if prospects:
            anomalies.append(Anomalie("a_non_planifie", SIGNALEMENT, fin_de_mois,
                                      mois=fin_de_mois.strftime("%Y-%m"),
                                      prospects=prospects))  # fmt: skip
    # Soumission en retard (RG-016, PLN-008) : annoncée avant, constatée après.
    from django.utils import timezone

    from .etats import StatutPlanning
    from .services import echeance

    if planning.en_retard:
        anomalies.append(Anomalie("soumis_en_retard", SIGNALEMENT))
    # Pendant une révision, l'échéance ne compte plus : la nouvelle soumission n'est jamais en
    # retard (décision du 5 octobre 2026).
    elif planning.statut == StatutPlanning.BROUILLON and timezone.now() > echeance(planning):
        anomalies.append(Anomalie("echeance_depassee", SIGNALEMENT))
    return sorted(anomalies, key=lambda a: (a.date or date.min, a.code))


def bilan(planning: Planning) -> Bilan:
    from .services import postes_de_la_semaine

    visites = _visites(planning)
    postes = list(postes_de_la_semaine(planning))
    return Bilan(
        bloquants=bloquants(planning, visites),
        signalements=signalements(planning, visites, postes),
        objectifs=objectifs(planning, visites, postes),
    )


def _detail(anomalie: Anomalie) -> dict:
    detail = {k: v for k, v in asdict(anomalie).items() if v is not None and k != "gravite"}
    if anomalie.date:
        detail["date"] = str(anomalie.date)
    return detail


def exiger_sans_bloquant(planning: Planning) -> None:
    """Garde de la soumission (0.2.8) : refus motivé, avec la liste des contrôles bloquants."""
    if anomalies := bloquants(planning):
        raise ErreurMetier(
            "planning_bloque",
            _("Le planning ne peut pas être soumis : corrigez les points signalés."),
            status.HTTP_400_BAD_REQUEST,
            # Tout le détail de chaque point (champs manquants, fiche, heure…), comme dans la
            # semaine : le refus suffit à corriger (PLN-002 CA1).
            anomalies=[_detail(a) for a in anomalies],
        )

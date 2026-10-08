"""Délais de validation (DSH-007, KPI-02, KPI-09, 0.7.7).

Le délai d'une décision court de la soumission d'une version à la décision qui la tranche ; il
se compte en heures ouvrées du pays (DSH-007 CA1), comme l'escalade (RG-019) : les jours ouvrés
du pays comptent pour 24 heures, les week-ends et jours fériés pour rien.

- **Plannings** (KPI-02) : chaque version décidée (approuvée ou à réviser), de sa soumission à
  sa décision.
- **Rapports** (KPI-09) : chaque validation et chaque demande de correction, depuis la
  soumission de la version qu'elle tranche. Une demande de correction déjà suivie d'une
  nouvelle version se lit dans cette version (RPT-015) ; une réouverture n'est pas une décision
  sur un rapport en attente.

Une décision compte dans la période où elle est prise. On publie la médiane, le nombre de
décisions et combien l'ont été en moins d'un jour ouvré (la cible des deux indicateurs) ; ni
moyenne, ni classement (DC-49).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from apps.planning.calendrier import feries
from apps.planning.echeances import heures_ouvrees
from apps.planning.models import VersionPlanning
from apps.rapports.models import Rapport, VersionRapport
from apps.socle.services import valeur_parametre

#: La cible des deux délais : moins d'un jour ouvré (KPI-02, KPI-09).
CIBLE_HEURES = 24


def _instants(pays, debut: date, fin: date) -> tuple[datetime, datetime]:
    fuseau = ZoneInfo(pays.fuseau)
    return (datetime.combine(debut, time.min, tzinfo=fuseau),
            datetime.combine(fin + timedelta(days=1), time.min, tzinfo=fuseau))  # fmt: skip


def durees(pays, delegues: list, debut: date, fin: date) -> dict:
    """Pour chaque délégué, les délais (en heures ouvrées) des décisions prises sur la
    période : `{delegue_id: {"plannings": [...], "rapports": [...]}}`."""
    ids = [d.pk for d in delegues]
    a, b = _instants(pays, debut, fin)
    resultat: dict = defaultdict(lambda: {"plannings": [], "rapports": []})
    paires: list[tuple] = []  # (délégué, nature, soumis, décidé)
    for delegue, soumis, decide in VersionPlanning.objects.filter(
        pays=pays, planning__delegue_id__in=ids, decide_le__gte=a, decide_le__lt=b
    ).values_list("planning__delegue_id", "soumis_le", "decide_le"):
        paires.append((delegue, "plannings", soumis, decide))
    # Validations, et demandes de correction encore sans réponse : sur la dernière version.
    for delegue, soumis, valide, correction in (
        Rapport.objects.filter(pays=pays, delegue_id__in=ids, soumis_le__isnull=False)
        .filter(_dans("valide_le", a, b) | _dans("correction_le", a, b))
        .values_list("delegue_id", "soumis_le", "valide_le", "correction_le")
    ):
        for decision in (valide, correction):
            if decision is not None and a <= decision < b and decision >= soumis:
                paires.append((delegue, "rapports", soumis, decision))
                break
    # Demandes de correction auxquelles une nouvelle version a répondu (RPT-015).
    reponses = list(
        VersionRapport.objects.filter(
            pays=pays, rapport__delegue_id__in=ids, numero__gt=1, correction__isnull=False
        ).values_list("rapport_id", "numero", "correction", "rapport__delegue_id")
    )
    if reponses:
        soumissions = {
            (r, n): s
            for r, n, s in VersionRapport.objects.filter(
                rapport_id__in={r for r, *_ in reponses}
            ).values_list("rapport_id", "numero", "soumis_le")
        }
        for rapport, numero, correction, delegue in reponses:
            if correction.get("reouverture"):
                continue
            decision = datetime.fromisoformat(correction["le"])
            soumis = soumissions.get((rapport, numero - 1))
            if soumis is not None and a <= decision < b and decision >= soumis:
                paires.append((delegue, "rapports", soumis, decision))
    if not paires:
        return resultat
    # Le calendrier du pays, lu une fois pour toutes les décisions.
    plus_tot = min(s for *_, s, _ in paires).astimezone(ZoneInfo(pays.fuseau)).date()
    calendrier = (set(valeur_parametre(pays, "jours_ouvres")), set(feries(pays, plus_tot, fin)))
    for delegue, nature, soumis, decide in paires:
        resultat[delegue][nature].append(heures_ouvrees(pays, soumis, decide, calendrier))
    return resultat


def _dans(champ: str, a: datetime, b: datetime):
    from django.db.models import Q

    return Q(**{f"{champ}__gte": a, f"{champ}__lt": b})


def resume(heures: list[float]) -> dict:
    """Médiane (une décimale), nombre de décisions, et celles prises en moins d'un jour ouvré."""
    return {
        "decisions": len(heures),
        "mediane": round(median(heures), 1) if heures else None,
        "dans_cible": sum(1 for h in heures if h <= CIBLE_HEURES),
    }


def delais(listes: list[dict]) -> dict:
    """Le résumé de plusieurs délégués : la médiane se tire de tous leurs délais réunis, jamais
    des médianes de chacun."""
    return {
        "cible_heures": CIBLE_HEURES,
        "plannings": resume([h for x in listes for h in x["plannings"]]),
        "rapports": resume([h for x in listes for h in x["rapports"]]),
    }

"""Indicateurs de succès du pilote (prd.md §5 ; 0.9.7, §21.2 condition 4).

KPI-01 à KPI-05 et KPI-09 se calculent sur les délégués d'un pays (ou d'un réseau) et une
période, avec les moteurs déjà en place (tableau de pilotage, délais de validation). KPI-06
(isolation) se prouve par la suite d'isolation à chaque livraison, pas par les données.
KPI-07 (rapports jamais reçus) se relève sur les téléphones (file d'envoi, OFF-003) ; le
serveur en donne un signal : les visites faites dont aucun rapport n'est arrivé après 48 h.
Les cibles sont les hypothèses du PRD [H].
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.utils import timezone

from apps.planning.calendrier import lundi

from .delais import CIBLE_HEURES, delais, durees
from .indicateurs import Lot, delegues_des_postes, somme

CIBLES = {"KPI-01": 0.90, "KPI-03": 0.85, "KPI-04": 0.90, "KPI-05": 0.80}


def _taux(n: int, d: int) -> float | None:
    return round(n / d, 3) if d else None


def semaines(debut: date, fin: date) -> list[date]:
    premier = lundi(debut)
    return [premier + timedelta(weeks=i) for i in range((fin - premier).days // 7 + 1)]


def kpi(pays, debut: date, fin: date, reseau=None) -> dict:
    from apps.identite.models import JourDeContact
    from apps.organisation.models import Poste
    from apps.planning.etats import StatutVisite
    from apps.planning.models import Planning, Visite

    postes = Poste.objects.filter(pays=pays)
    if reseau is not None:
        postes = postes.filter(reseaux=reseau)
    delegues = [d for d, _ in delegues_des_postes(postes, None, debut, fin)]
    ids = [d.pk for d in delegues]
    lundis = semaines(debut, fin)

    # KPI-01 : un planning attendu par délégué et par semaine de la période.
    a_l_heure = Planning.objects.filter(
        pays=pays, delegue_id__in=ids, semaine__in=lundis, soumis_le__isnull=False,
        en_retard=False,
    ).count()  # fmt: skip
    attendus = len(ids) * len(lundis)

    # KPI-02, KPI-09 : délais de décision en heures ouvrées (DSH-007).
    d = delais(list(durees(pays, delegues, debut, fin).values()))

    # KPI-03, KPI-04 : le moteur des indicateurs, sommé sur les délégués.
    lot = Lot(pays, delegues, debut, fin)
    total = somme([lot.calculer(x, debut, fin) for x in delegues])
    v, r = total["visites"], total["rapports"]

    # KPI-05 : par semaine, les délégués dont le téléphone a échangé au moins 3 jours.
    jours: dict = defaultdict(lambda: defaultdict(set))
    for utilisateur_id, jour in JourDeContact.objects.filter(
        utilisateur_id__in=ids, jour__gte=lundis[0], jour__lte=fin
    ).values_list("utilisateur_id", "jour"):
        jours[lundi(jour)][utilisateur_id].add(jour)
    adoption = [
        {"semaine": s, "actifs": sum(1 for u in ids if len(jours[s][u]) >= 3),
         "delegues": len(ids), "taux": _taux(sum(1 for u in ids if len(jours[s][u]) >= 3),
                                              len(ids))}
        for s in lundis
    ]  # fmt: skip
    actifs = sum(x["actifs"] for x in adoption)

    # KPI-07, signal du serveur : visites faites il y a plus de 48 h sans rapport reçu.
    limite = timezone.now() - timedelta(hours=48)
    sans_rapport = Visite.objects.filter(
        pays=pays, planning__delegue_id__in=ids, statut=StatutVisite.EFFECTUEE,
        date__gte=debut, date__lte=fin, fin_le__lt=limite, rapport__isnull=True,
        archive_le__isnull=True,
    ).count()  # fmt: skip

    def ligne(code, libelle, valeur, cible, mesure, detail=""):
        atteinte = None if valeur is None or cible is None else (
            valeur <= cible if code in ("KPI-02", "KPI-09") else valeur >= cible
        )  # fmt: skip
        return {"code": code, "libelle": libelle, "valeur": valeur, "cible": cible,
                "mesure": mesure, "atteinte": atteinte, "detail": detail}  # fmt: skip

    mediane = lambda nature: d[nature]["mediane"]  # noqa: E731
    return {
        "debut": debut,
        "fin": fin,
        "delegues": len(ids),
        "indicateurs": [
            ligne(
                "KPI-01",
                "Plannings soumis à l'heure",
                _taux(a_l_heure, attendus),
                CIBLES["KPI-01"],
                "taux",
                f"{a_l_heure} sur {attendus}",
            ),
            ligne(
                "KPI-02",
                "Délai de validation des plannings (médiane)",
                mediane("plannings"),
                CIBLE_HEURES,
                "heures ouvrées",
                f"{d['plannings']['decisions']} décisions",
            ),
            ligne(
                "KPI-03",
                "Taux de réalisation",
                total["taux"]["realisation"],
                CIBLES["KPI-03"],
                "taux",
                f"{v['effectuees_prevues']} sur {v['echues']} ; écarts justifiés "
                f"{total['taux']['ecarts_justifies']}",
            ),
            ligne(
                "KPI-04",
                "Rapports dans le délai",
                _taux(r["dans_delai"], v["effectuees"]),
                CIBLES["KPI-04"],
                "taux",
                f"{r['dans_delai']} sur {v['effectuees']}",
            ),
            ligne(
                "KPI-05",
                "Adoption (3 jours de synchronisation par semaine)",
                _taux(actifs, len(ids) * len(lundis)),
                CIBLES["KPI-05"],
                "taux",
                "par semaine : "
                + ", ".join(f"{x['semaine']:%d/%m} {x['actifs']}" for x in adoption),
            ),
            ligne(
                "KPI-06",
                "Isolation",
                None,
                0,
                "fuites",
                "prouvé par la suite d'isolation (make isolation) à chaque livraison",
            ),
            ligne(
                "KPI-07",
                "Rapports jamais reçus",
                sans_rapport,
                0,
                "visites",
                "signal du serveur : visites faites depuis plus de 48 h sans rapport ; "
                "à confirmer sur les téléphones (file d'envoi)",
            ),
            ligne(
                "KPI-09",
                "Délai de validation des rapports (médiane)",
                mediane("rapports"),
                CIBLE_HEURES,
                "heures ouvrées",
                f"{d['rapports']['decisions']} décisions",
            ),
        ],  # fmt: skip
        "adoption": adoption,
    }

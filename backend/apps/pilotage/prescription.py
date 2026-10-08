"""Tendance de prescription et points d'attention (DC-53, DC-57, §14.35 ; 0.7.9).

Tout se tire des rapports soumis (jamais d'un brouillon) des délégués retenus par le tableau de
pilotage : même périmètre, même période, mêmes filtres (DSH-005).

- **Tendance de prescription** (DC-53) : par produit, les retours des prescripteurs sur la
  période et sur la période précédente de même durée, et la part favorable (« prescrit » ou
  « prescrit très bien ») ; agrégée, sans aucun nom de prescripteur. Produits par ordre
  alphabétique, sans classement (DC-49).
- **Points d'attention** (DC-57) : des phrases calculées par des règles, chacune reliée aux
  visites qui la fondent ; rien n'est envoyé à un service extérieur.
  1. Actions promises en retard : l'échéance de la prochaine action (RPT-006) est passée et le
     délégué n'a pas revu le prospect depuis.
  2. Passages à « prescrit » : sur un produit, un prescripteur passe d'un retour défavorable à
     un retour favorable d'une présentation à la suivante.
  3. Retours en baisse : l'inverse.
  Les points de prescription ne nomment pas le prescripteur (DC-53) : la visite se lit dans la
  journée du délégué, réservée à l'encadrement qui valide.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from apps.planning.etats import StatutVisite
from apps.planning.models import Visite
from apps.rapports.models import Rapport, RetourPrescripteur, StatutRapport
from apps.socle.services import aujourdhui

FAVORABLES = {RetourPrescripteur.PRESCRIT, RetourPrescripteur.TRES_BIEN}
DEFAVORABLES = {RetourPrescripteur.NON_PRESCRIT, RetourPrescripteur.PEU}
#: Au plus tant de visites détaillées par point ; le nombre, lui, est complet.
VISITES_MAX = 20


def _rapports(pays, ids, debut: date, fin: date):
    return list(
        Rapport.objects.filter(pays=pays, delegue_id__in=ids, visite__date__gte=debut,
                               visite__date__lte=fin)
        .exclude(statut=StatutRapport.BROUILLON)
        .select_related("delegue", "visite__prospect")
        .order_by("visite__date", "visite__heure")
    )  # fmt: skip


def _nom(u) -> str:
    return f"{u.first_name} {u.last_name}".strip()


def tendance(pays, ids, debut: date, fin: date) -> list[dict]:
    """DC-53 : les retours par produit, période et période précédente de même durée."""
    duree = (fin - debut).days + 1
    avant_debut, avant_fin = debut - timedelta(days=duree), debut - timedelta(days=1)
    produits: dict = {}
    vides = {r: 0 for r in RetourPrescripteur.values}
    for nom, (d, f) in (("periode", (debut, fin)), ("precedente", (avant_debut, avant_fin))):
        for r in _rapports(pays, ids, d, f):
            for p in r.presentations:
                cle = p.get("produit") or f"autre:{p.get('libelle', '')}"
                ligne = produits.setdefault(cle, {
                    "produit": p.get("produit"), "libelle": p.get("libelle", ""),
                    "periode": dict(vides), "precedente": dict(vides),
                })  # fmt: skip
                if p.get("retour") in vides:
                    ligne[nom][p["retour"]] += 1
    resultat = []
    for ligne in produits.values():
        for nom in ("periode", "precedente"):
            n = sum(ligne[nom].values())
            favorables = sum(ligne[nom][r] for r in FAVORABLES)
            ligne[f"favorable_{nom}"] = round(favorables / n, 3) if n else None
        if sum(ligne["periode"].values()):
            resultat.append(ligne)
    return sorted(resultat, key=lambda x: x["libelle"].lower())


def _visite(r: Rapport, produit: str = "", prospect: bool = False) -> dict:
    v = r.visite
    return {
        "visite": v.pk, "date": v.date, "delegue": _nom(r.delegue), "delegue_id": r.delegue_id,
        "produit": produit,
        "prospect": (f"{v.prospect.prenom} {v.prospect.nom}".strip()
                     if prospect and v.prospect else ""),
    }  # fmt: skip


def points(pays, ids, debut: date, fin: date) -> list[dict]:
    """DC-57 : les points d'attention de la période, chacun avec ses visites."""
    today = aujourdhui(pays)
    resultat = []

    # 1. Actions promises en retard (échéance dans la période et passée).
    promises = [
        r for r in Rapport.objects.filter(
            pays=pays, delegue_id__in=ids, prochaine_action_echeance__gte=debut,
            prochaine_action_echeance__lte=min(fin, today - timedelta(days=1)),
        ).exclude(statut=StatutRapport.BROUILLON).select_related("delegue", "visite__prospect")
    ]  # fmt: skip
    derniere: dict = {}
    for d, p, j in Visite.objects.filter(
        pays=pays, planning__delegue_id__in=ids, statut=StatutVisite.EFFECTUEE,
        date__gte=debut - timedelta(days=365),
    ).values_list("planning__delegue_id", "prospect_id", "date"):  # fmt: skip
        derniere[(d, p)] = max(j, derniere.get((d, p), j))
    en_retard = [
        r
        for r in promises
        if derniere.get((r.delegue_id, r.visite.prospect_id), r.visite.date) <= r.visite.date
    ]
    if en_retard:
        en_retard.sort(key=lambda r: r.prochaine_action_echeance)
        visites = [_visite(r, prospect=True) for r in en_retard[:VISITES_MAX]]
        resultat.append({"regle": "actions_en_retard", "nombre": len(en_retard),
                         "produit": "", "visites": visites})  # fmt: skip

    # 2 et 3. Évolution du retour d'un prescripteur sur un produit, d'une présentation à la
    # suivante ; la précédente peut être antérieure à la période (un an au plus).
    historique: dict = defaultdict(list)
    for r in _rapports(pays, ids, debut - timedelta(days=365), fin):
        for p in r.presentations:
            if p.get("produit") and p.get("retour") and r.visite.prospect_id:
                historique[(r.visite.prospect_id, p["produit"])].append((r, p))
    hausses: dict = defaultdict(list)
    baisses: dict = defaultdict(list)
    for suite in historique.values():
        for (_, pa), (apres, pb) in zip(suite, suite[1:], strict=False):
            if apres.visite.date < debut:
                continue
            if pa["retour"] in DEFAVORABLES and pb["retour"] in FAVORABLES:
                hausses[pb.get("libelle", "")].append(apres)
            elif pa["retour"] in FAVORABLES and pb["retour"] in DEFAVORABLES:
                baisses[pb.get("libelle", "")].append(apres)
    for regle, groupes in (("passages_prescrit", hausses), ("retours_en_baisse", baisses)):
        for produit in sorted(groupes, key=str.lower):
            rapports = groupes[produit]
            visites = [_visite(r, produit) for r in rapports[:VISITES_MAX]]
            resultat.append({"regle": regle, "nombre": len(rapports), "produit": produit,
                             "visites": visites})  # fmt: skip
    return resultat


def prescription(pays, pilotes, debut: date, fin: date) -> dict:
    ids = [d.pk for d, _ in pilotes]
    return {"tendance": tendance(pays, ids, debut, fin), "points": points(pays, ids, debut, fin)}

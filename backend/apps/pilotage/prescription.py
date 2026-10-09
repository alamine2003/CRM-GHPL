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

from django.db import connection
from django.db.models import Exists, OuterRef

from apps.planning.etats import StatutVisite
from apps.planning.models import Visite
from apps.rapports.models import Rapport, RetourPrescripteur, StatutRapport
from apps.socle.services import aujourdhui

FAVORABLES = {RetourPrescripteur.PRESCRIT, RetourPrescripteur.TRES_BIEN}
DEFAVORABLES = {RetourPrescripteur.NON_PRESCRIT, RetourPrescripteur.PEU}
#: Au plus tant de visites détaillées par point ; le nombre, lui, est complet.
VISITES_MAX = 20


def _lignes(sql: str, parametres: list) -> list[tuple]:
    with connection.cursor() as curseur:
        curseur.execute(sql, parametres)
        return curseur.fetchall()


#: Les présentations des rapports soumis des délégués, une ligne par produit présenté (0.9.4 :
#: dépliées et comptées par la base, un pays de 500 délégués en produit des centaines de
#: milliers par trimestre).
PRESENTATIONS = """
    FROM rapports_rapport r
    JOIN planning_visite v ON v.id = r.visite_id
    CROSS JOIN LATERAL jsonb_array_elements(r.presentations) p
    WHERE r.pays_id = %s AND r.delegue_id = ANY(%s) AND r.statut <> %s
      AND v.date BETWEEN %s AND %s
"""


def _nom(u) -> str:
    return f"{u.first_name} {u.last_name}".strip()


def tendance(pays, ids, debut: date, fin: date) -> list[dict]:
    """DC-53 : les retours par produit, période et période précédente de même durée."""
    duree = (fin - debut).days + 1
    avant_debut = debut - timedelta(days=duree)
    produits: dict = {}
    vides = {r: 0 for r in RetourPrescripteur.values}
    lignes = _lignes(
        f"""SELECT v.date >= %s, p->>'produit', coalesce(p->>'libelle', ''), p->>'retour',
                   count(*), min(v.date)
            {PRESENTATIONS}
            GROUP BY 1, 2, 3, 4 ORDER BY 6""",  # noqa: S608 — requête constante
        [debut, pays.pk, ids, StatutRapport.BROUILLON, avant_debut, fin],
    )
    for dans_periode, produit, libelle, retour, nombre, _ in lignes:
        nom = "periode" if dans_periode else "precedente"
        cle = produit or f"autre:{libelle}"
        ligne = produits.setdefault(cle, {
            "produit": produit, "libelle": libelle,
            "periode": dict(vides), "precedente": dict(vides),
        })  # fmt: skip
        if retour in vides:
            ligne[nom][retour] += nombre
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

    # 1. Actions promises en retard (échéance dans la période et passée), sans visite faite
    # au même prospect par le même délégué depuis.
    revenu = Visite.objects.filter(
        planning__delegue_id=OuterRef("delegue_id"), prospect_id=OuterRef("visite__prospect_id"),
        statut=StatutVisite.EFFECTUEE, date__gt=OuterRef("visite__date"),
    )  # fmt: skip
    en_retard = (
        Rapport.objects.filter(
            pays=pays, delegue_id__in=ids, prochaine_action_echeance__gte=debut,
            prochaine_action_echeance__lte=min(fin, today - timedelta(days=1)),
        )
        .exclude(statut=StatutRapport.BROUILLON)
        .exclude(Exists(revenu))
        .select_related("delegue", "visite__prospect")
        .order_by("prochaine_action_echeance", "visite__date")
    )  # fmt: skip
    if nombre := en_retard.count():
        visites = [_visite(r, prospect=True) for r in en_retard[:VISITES_MAX]]
        resultat.append({"regle": "actions_en_retard", "nombre": nombre,
                         "produit": "", "visites": visites})  # fmt: skip

    # 2 et 3. Évolution du retour d'un prescripteur sur un produit, d'une présentation à la
    # suivante ; la précédente peut être antérieure à la période (un an au plus). La base
    # range les présentations et compare chacune à la précédente (0.9.4).
    favorables = sorted(FAVORABLES)
    defavorables = sorted(DEFAVORABLES)
    changements = _lignes(
        f"""WITH suite AS (
                SELECT r.id AS rapport, v.date, v.heure, p->>'libelle' AS libelle,
                       p->>'retour' AS retour,
                       lag(p->>'retour') OVER (PARTITION BY v.prospect_id, p->>'produit'
                                               ORDER BY v.date, v.heure, r.id) AS avant
                {PRESENTATIONS}
                  AND v.prospect_id IS NOT NULL
                  AND coalesce(p->>'produit', '') <> '' AND coalesce(p->>'retour', '') <> ''
            )
            , changements AS (
                SELECT rapport, coalesce(libelle, '') AS libelle, date, heure,
                       avant = ANY(%s) AND retour = ANY(%s) AS hausse
                FROM suite
                WHERE date >= %s AND ((avant = ANY(%s) AND retour = ANY(%s))
                                      OR (avant = ANY(%s) AND retour = ANY(%s)))
            ), rangs AS (
                SELECT rapport, libelle, hausse,
                       count(*) OVER (PARTITION BY hausse, libelle) AS nombre,
                       row_number() OVER (PARTITION BY hausse, libelle
                                          ORDER BY date, heure, rapport) AS rang
                FROM changements
            )
            SELECT rapport, libelle, hausse, nombre FROM rangs WHERE rang <= %s
            ORDER BY rang""",  # noqa: S608 — requête constante
        [pays.pk, ids, StatutRapport.BROUILLON, debut - timedelta(days=365), fin,
         defavorables, favorables, debut, defavorables, favorables, favorables, defavorables,
         VISITES_MAX],
    )  # fmt: skip
    # Seules les premières visites de chaque point sont lues ; le nombre, lui, est complet.
    hausses: dict = defaultdict(list)
    baisses: dict = defaultdict(list)
    nombres: dict = {}
    for rapport, libelle, hausse, nombre in changements:
        (hausses if hausse else baisses)[libelle].append(rapport)
        nombres[(hausse, libelle)] = nombre
    a_lire = [r for groupes in (hausses, baisses) for liste in groupes.values() for r in liste]
    rapports = Rapport.objects.select_related("delegue", "visite").in_bulk(a_lire)
    for regle, groupes in (("passages_prescrit", hausses), ("retours_en_baisse", baisses)):
        for produit in sorted(groupes, key=str.lower):
            visites = [_visite(rapports[r], produit) for r in groupes[produit]]
            nombre = nombres[(regle == "passages_prescrit", produit)]
            resultat.append({"regle": regle, "nombre": nombre, "produit": produit,
                             "visites": visites})  # fmt: skip
    return resultat


def prescription(pays, pilotes, debut: date, fin: date) -> dict:
    ids = [d.pk for d, _ in pilotes]
    return {"tendance": tendance(pays, ids, debut, fin), "points": points(pays, ids, debut, fin)}

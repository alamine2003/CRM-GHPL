"""Agrégats de pilotage pour Grafana (DSH-010, DSH-011 ; architecture §25.2, 0.7.9).

Chaque heure, `rafraichir` recalcule, pour chaque pays, les comptages de chaque jour des
`JOURS` derniers jours avec le moteur commun (`indicateurs.Lot`) : le même calcul que le
portail, sommé par jour pour le pays entier (chaque délégué une fois) et pour chaque réseau
(un poste rattaché à deux réseaux compte dans chacun, DSH-003). Aucun nom de délégué, aucun
texte libre (DSH-010 CA3).

Isolation (DSH-010 CA1, CA2) : `acces_sql` écrit, pour chaque pays, deux vues filtrées sur son
code et le rôle `innov_grafana_<pays>` qui ne lit qu'elles ; le rôle `innov_grafana_siege` ne
lit que la vue agrégée par pays. Les rôles sont créés sans connexion : l'exploitation leur
donne un mot de passe hors du dépôt (`ALTER ROLE … LOGIN PASSWORD …`).
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta

from django.db import connection, transaction
from django.utils import timezone

from apps.socle.models import Pays
from apps.socle.services import aujourdhui

#: Fenêtre recalculée à chaque passage ; un passage complet peut en demander davantage.
JOURS = 35

COLONNES = (
    "delegues_actifs", "visites_prevues", "visites_echues", "visites_effectuees_prevues",
    "visites_effectuees", "visites_imprevues", "ecarts", "ecarts_justifies",
    "visites_geolocalisees", "rapports_soumis", "rapports_dans_delai", "rapports_valides",
)  # fmt: skip


def _comptes(indicateurs: dict) -> dict:
    v, r = indicateurs["visites"], indicateurs["rapports"]
    return {
        "delegues_actifs": int(indicateurs["activite"]),
        "visites_prevues": v["prevues"],
        "visites_echues": v["echues"],
        "visites_effectuees_prevues": v["effectuees_prevues"],
        "visites_effectuees": v["effectuees"],
        "visites_imprevues": v["imprevues"],
        "ecarts": v["ecarts"],
        "ecarts_justifies": v["ecarts_justifies"],
        "visites_geolocalisees": v["geolocalisees"],
        "rapports_soumis": r["soumis"],
        "rapports_dans_delai": r["dans_delai"],
        "rapports_valides": r["valides"],
    }


def agreger(pays: Pays, debut: date, fin: date) -> list[dict]:
    """Les lignes du pays sur la période : une par jour pour l'ensemble, une par jour et par
    réseau. Les sommes de l'ensemble sont celles du tableau du pays (même moteur)."""
    from apps.organisation.models import Poste

    from .indicateurs import Lot, delegues_des_postes

    pilotes = delegues_des_postes(
        Poste.objects.filter(pays=pays).prefetch_related("reseaux"), None, debut, fin
    )
    lot = Lot(pays, [d for d, _ in pilotes], debut, fin)
    vides = dict.fromkeys(COLONNES, 0)
    ensemble: dict = defaultdict(lambda: dict(vides))
    par_reseau: dict = defaultdict(lambda: dict(vides))
    libelles: dict = {}
    vus: set = set()
    for delegue, poste in pilotes:
        reseaux = list(poste.reseaux.all())
        for r in reseaux:
            libelles[r.pk] = r.libelle
        jour = debut
        while jour <= fin:
            comptes = _comptes(lot.calculer(delegue, jour, jour))
            if (delegue.pk, jour) not in vus:  # l'ensemble compte chaque délégué une fois
                vus.add((delegue.pk, jour))
                for k, n in comptes.items():
                    ensemble[jour][k] += n
            for r in reseaux:
                for k, n in comptes.items():
                    par_reseau[(jour, r.pk)][k] += n
            jour += timedelta(days=1)
    lignes = [{"jour": j, "reseau_id": None, "reseau": "", **c} for j, c in ensemble.items()]
    lignes += [
        {"jour": j, "reseau_id": r, "reseau": libelles[r], **c} for (j, r), c in par_reseau.items()
    ]
    return lignes


@transaction.atomic
def rafraichir_pays(pays: Pays, jours: int = JOURS) -> int:
    """Remplace les agrégats des `jours` derniers jours du pays ; rend le nombre de lignes."""
    fin = aujourdhui(pays)
    debut = fin - timedelta(days=jours - 1)
    lignes = agreger(pays, debut, fin)
    maintenant = timezone.now()
    with connection.cursor() as c:
        c.execute("DELETE FROM pilotage.agregat_jour WHERE pays_code = %s AND jour BETWEEN %s "
                  "AND %s", [pays.code.lower(), debut, fin])  # fmt: skip
        if lignes:
            colonnes = ("pays_code", "jour", "reseau_id", "reseau", *COLONNES, "calcule_le")
            valeurs = [
                (pays.code.lower(), x["jour"], x["reseau_id"], x["reseau"],
                 *(x[k] for k in COLONNES), maintenant)
                for x in lignes
            ]  # fmt: skip
            c.executemany(
                f"INSERT INTO pilotage.agregat_jour ({', '.join(colonnes)}) VALUES "  # noqa: S608 — noms tirés de constantes ou d'un code vérifié
                f"({', '.join(['%s'] * len(colonnes))})",
                valeurs,
            )
    return len(lignes)


def rafraichir(jours: int = JOURS) -> dict:
    """DSH-011 : tous les pays actifs ; appelé chaque heure par le worker."""
    return {
        p.code: rafraichir_pays(p, jours) for p in Pays.objects.filter(statut=Pays.Statut.ACTIF)
    }


def _code(pays: Pays) -> str:
    code = pays.code.lower()
    if not re.fullmatch(r"[a-z]{2,3}", code):  # le code entre dans des noms SQL
        raise ValueError(f"Code de pays inattendu : {pays.code!r}")
    return code


def acces_sql(pays_liste) -> list[str]:
    """Les instructions qui isolent Grafana par pays (DSH-010) ; rejouables sans effet de bord.
    Aucun mot de passe : les rôles sont créés sans connexion."""
    instructions = []

    def role(nom: str) -> None:
        instructions.append(
            f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{nom}') THEN "  # noqa: S608 — noms tirés de constantes ou d'un code vérifié
            f"CREATE ROLE {nom} NOLOGIN; END IF; END $$;"
        )
        instructions.append(f"GRANT USAGE ON SCHEMA pilotage TO {nom};")

    for pays in pays_liste:
        code = _code(pays)
        nom = f"innov_grafana_{code}"
        role(nom)
        for vue, source in (("pays_jour", "indicateurs_pays_jour"),
                            ("reseau_jour", "indicateurs_reseau_jour")):  # fmt: skip
            instructions.append(
                f"CREATE OR REPLACE VIEW pilotage.{code}_{vue} WITH (security_barrier) AS "  # noqa: S608 — noms tirés de constantes ou d'un code vérifié
                f"SELECT * FROM pilotage.{source} WHERE pays_code = '{code}';"
            )
            instructions.append(f"GRANT SELECT ON pilotage.{code}_{vue} TO {nom};")
        instructions.append(
            f"CREATE OR REPLACE VIEW pilotage.{code}_fraicheur WITH (security_barrier) AS "  # noqa: S608 — noms tirés de constantes ou d'un code vérifié
            f"SELECT * FROM pilotage.fraicheur WHERE pays_code = '{code}';"
        )
        instructions.append(f"GRANT SELECT ON pilotage.{code}_fraicheur TO {nom};")
    role("innov_grafana_siege")
    instructions.append("GRANT SELECT ON pilotage.indicateurs_pays_jour TO innov_grafana_siege;")
    instructions.append("GRANT SELECT ON pilotage.fraicheur TO innov_grafana_siege;")
    return instructions

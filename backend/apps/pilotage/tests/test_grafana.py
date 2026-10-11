# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.9 : DSH-010, Grafana isolé par pays ; DSH-011, fraîcheur ; fiabilité des calculs.

CA1 : un compte Grafana d'un pays ne lit que les vues de ce pays. CA2 : le siège lit des
agrégats. CA3 : aucune donnée de rapport en texte libre n'est exposée à Grafana."""

from datetime import date

import pytest
from django.core.management import call_command
from django.db import ProgrammingError, connection, transaction
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.pilotage import grafana

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.isolation]

DU, AU = date(2026, 10, 6), date(2026, 10, 15)


def lignes(sql, parametres=None):
    with connection.cursor() as c:
        c.execute(sql, parametres or [])
        return c.fetchall()


@pytest.fixture
def agregats(monde, semaine):
    with freeze_time("2026-10-15 12:00"):
        n = grafana.rafraichir_pays(monde["sn"], jours=10)
    # Un pays voisin, pour vérifier l'isolation.
    colonnes = ", ".join(grafana.COLONNES)
    valeurs = ", ".join(["1"] * len(grafana.COLONNES))
    insertion = (
        f"INSERT INTO pilotage.agregat_jour (pays_code, jour, reseau, {colonnes}, "  # noqa: S608
        f"calcule_le) VALUES ('tg', '2026-10-13', '', {valeurs}, now()) RETURNING jour"
    )
    lignes(insertion)  # fmt: skip
    return n


def test_dsh011_fiabilite_les_jours_font_le_tableau_du_pays(monde, agregats):
    assert agregats > 0
    jours = lignes("SELECT sum(visites_effectuees), sum(visites_echues), sum(ecarts), "
                   "sum(ecarts_justifies), sum(visites_geolocalisees), sum(rapports_soumis) "
                   "FROM pilotage.indicateurs_pays_jour WHERE pays_code = 'sn'")[0]  # fmt: skip
    with freeze_time("2026-10-15 12:00"):
        t = (
            client_de(monde["resp.sn"])
            .get("/api/v1/pilotage/equipe/", {"periode": "dates", "du": DU, "au": AU})
            .json()["total"]["semaine"]
        )
    v = t["visites"]
    assert jours == (v["effectuees"], v["echues"], v["ecarts"], v["ecarts_justifies"],
                     v["geolocalisees"], t["rapports"]["soumis"])  # fmt: skip
    assert v["effectuees"] == 1
    # Par réseau : le réseau du poste porte la même visite.
    (reseau,) = lignes("SELECT reseau, sum(visites_effectuees) FROM "
                       "pilotage.indicateurs_reseau_jour GROUP BY reseau")  # fmt: skip
    assert reseau[1] == 1
    # DSH-011 : la fraîcheur se lit.
    assert lignes("SELECT pays_code FROM pilotage.fraicheur ORDER BY 1") == [("sn",), ("tg",)]
    # Rejouer le calcul remplace, sans doubler.
    with freeze_time("2026-10-15 12:00"):
        grafana.rafraichir_pays(monde["sn"], jours=10)
    assert lignes("SELECT sum(visites_effectuees) FROM pilotage.indicateurs_pays_jour "
                  "WHERE pays_code = 'sn'")[0][0] == 1  # fmt: skip


def test_dsh010_ca3_aucun_texte_libre_ni_nom():
    colonnes = {
        c
        for (c,) in lignes(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'pilotage'"
        )  # fmt: skip
    }
    assert colonnes <= {"pays_code", "jour", "reseau_id", "reseau", "calcule_le",
                        *grafana.COLONNES}  # fmt: skip


def lire_en_tant_que(role, sql):
    """Lit en tant que `role` ; rend les lignes, ou None si la lecture est refusée."""
    try:
        with transaction.atomic(), connection.cursor() as c:
            c.execute(f"SET LOCAL ROLE {role}")
            c.execute(sql)
            return c.fetchall()
    except ProgrammingError:
        return None


def test_dsh010_ca1_ca2_chaque_pays_ne_lit_que_ses_vues(monde, agregats):
    call_command("grafana_acces", "--appliquer")
    togo = "innov_grafana_tg"
    assert lire_en_tant_que(togo, "SELECT pays_code FROM pilotage.tg_pays_jour") == [("tg",)]
    assert lire_en_tant_que(togo, "SELECT 1 FROM pilotage.sn_pays_jour") is None
    assert lire_en_tant_que(togo, "SELECT 1 FROM pilotage.agregat_jour") is None
    assert lire_en_tant_que(togo, "SELECT 1 FROM pilotage.indicateurs_pays_jour") is None
    # Aucune table métier.
    assert lire_en_tant_que(togo, "SELECT 1 FROM rapports_rapport") is None
    assert lire_en_tant_que(togo, "SELECT 1 FROM identite_utilisateur") is None
    # CA2 : le siège lit l'agrégat par pays, pas le détail par réseau.
    siege = "innov_grafana_siege"
    pays = lire_en_tant_que(siege, "SELECT DISTINCT pays_code FROM pilotage.indicateurs_pays_jour "
                                   "ORDER BY 1")  # fmt: skip
    assert pays == [("sn",), ("tg",)]
    assert lire_en_tant_que(siege, "SELECT 1 FROM pilotage.indicateurs_reseau_jour") is None
    assert lire_en_tant_que(siege, "SELECT 1 FROM rapports_rapport") is None


def test_dsh010_instructions_sans_mot_de_passe(monde, capsys):
    call_command("grafana_acces")
    sortie = capsys.readouterr().out
    assert "CREATE ROLE innov_grafana_sn NOLOGIN" in sortie
    assert "PASSWORD" not in sortie.upper()

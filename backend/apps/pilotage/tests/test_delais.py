# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.7 : DSH-007, délais de validation des plannings (KPI-02) et des rapports (KPI-09).

CA1 : calculés en heures ouvrées du pays (jours ouvrés, sans les week-ends ni les jours fériés).
"""

from datetime import UTC, date, datetime

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.pilotage.delais import delais, durees, resume
from apps.planning.models import JourFerie, VersionPlanning
from apps.rapports import services as rapports
from apps.rapports import validation
from apps.rapports.tests.test_rapport import portefeuille  # noqa: F401
from apps.rapports.tests.test_validation import soumettre

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db


def instant(jour, heure, minute=0):
    return datetime(2026, 10, jour, heure, minute, tzinfo=UTC)


@pytest.fixture
def decisions(monde, semaine, portefeuille):
    """Planning soumis le vendredi 9 à 18 h, approuvé le lundi 12 à 10 h : 6 + 10 = 16 heures
    ouvrées. Rapport soumis le mardi 13 à 20 h, correction demandée le mercredi 14 à 8 h
    (12 h), resoumis à 10 h, validé à 12 h (2 h)."""
    VersionPlanning.objects.filter(planning__delegue=monde["deleg.sn"]).update(
        soumis_le=instant(9, 18), decide_le=instant(12, 10)
    )
    rapport = soumettre(monde, semaine["faite"], [portefeuille[0]])
    with freeze_time(instant(14, 8)):
        rapport = validation.demander_correction(rapport, monde["sup.sn"], "Précisez.",
                                                 ["resume"])  # fmt: skip
    with freeze_time(instant(14, 10)):
        rapport = rapports.soumettre(rapport, instant(14, 10))
    with freeze_time(instant(14, 12)):
        validation.valider_rapport(rapport, monde["sup.sn"])
    return rapport


def test_dsh007_ca1_heures_ouvrees_du_pays(monde, decisions):
    d = durees(monde["sn"], [monde["deleg.sn"]], date(2026, 10, 1), date(2026, 10, 31))
    (seul,) = d.values()
    assert seul["plannings"] == [16.0]
    assert sorted(seul["rapports"]) == [2.0, 12.0]
    assert delais([seul]) == {
        "cible_heures": 24,
        "plannings": {"decisions": 1, "mediane": 16.0, "dans_cible": 1},
        "rapports": {"decisions": 2, "mediane": 7.0, "dans_cible": 2},
    }
    # Un jour férié le lundi : le délai du planning ne compte plus que le vendredi soir.
    JourFerie.objects.create(pays=monde["sn"], date=date(2026, 10, 12), libelle="Férié")
    d = durees(monde["sn"], [monde["deleg.sn"]], date(2026, 10, 1), date(2026, 10, 31))
    assert d[monde["deleg.sn"].pk]["plannings"] == [6.0]


def test_dsh007_une_decision_compte_dans_la_periode_ou_elle_est_prise(monde, decisions):
    # Du 13 au 31 : le planning, décidé le 12, n'y est plus ; les deux décisions du rapport, si.
    d = durees(monde["sn"], [monde["deleg.sn"]], date(2026, 10, 13), date(2026, 10, 31))
    seul = d[monde["deleg.sn"].pk]
    assert (seul["plannings"], sorted(seul["rapports"])) == ([], [2.0, 12.0])
    assert durees(monde["sn"], [monde["deleg.sn"]], date(2026, 11, 1), date(2026, 11, 30)) == {}


def test_dsh007_mediane_sans_decision_et_cible():
    assert resume([]) == {"decisions": 0, "mediane": None, "dans_cible": 0}
    assert resume([30.0, 2.0, 50.0]) == {"decisions": 3, "mediane": 30.0, "dans_cible": 1}


def test_dsh007_au_pilotage_et_au_siege(monde, decisions):
    with freeze_time("2026-10-15 12:00"):
        equipe = client_de(monde["resp.sn"]).get("/api/v1/pilotage/equipe/?periode=30j").json()
        siege = client_de(monde["ada.siege"]).get("/api/v1/pilotage/siege/?periode=30j").json()
    assert equipe["delais"]["plannings"]["mediane"] == 16.0
    assert equipe["delais"]["rapports"] == {"decisions": 2, "mediane": 7.0, "dans_cible": 2}
    (senegal,) = [x for x in siege["pays"] if x["pays"]["code"] == "SN"]
    assert senegal["delais"] == equipe["delais"]
    assert siege["delais"]["rapports"]["decisions"] == 2

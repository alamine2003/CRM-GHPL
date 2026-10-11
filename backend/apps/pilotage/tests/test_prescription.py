# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.9 : DC-53, tendance de prescription agrégée ; DC-57, points d'attention par règles,
chacun relié aux visites qui le fondent."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.planning.models import Visite
from apps.rapports.models import Rapport
from apps.rapports.tests.test_rapport import portefeuille  # noqa: F401
from apps.rapports.tests.test_validation import soumettre

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/prescription/"
PERIODE = {"periode": "dates", "du": "2026-10-13", "au": "2026-10-15"}


def lire(monde, qui, **parametres):
    with freeze_time("2026-10-15 12:00"):
        return client_de(monde[qui]).get(URL, parametres or PERIODE)


@pytest.fixture
def historique(monde, semaine, portefeuille):
    """Le lundi 12, le prescripteur prescrit peu le Cardiol ; le mardi 13, il le prescrit.
    L'action promise le 13 avait pour échéance le 14 : le délégué n'est pas revenu."""
    cardiol = portefeuille[0]
    rapport = soumettre(monde, semaine["faite"], [cardiol])
    Rapport.objects.filter(pk=rapport.pk).update(prochaine_action_echeance=date(2026, 10, 14))
    ancienne = Visite.objects.get(pk=semaine["faite"].pk)
    ancienne.pk, ancienne._state.adding = None, True
    ancienne.date = date(2026, 10, 12)
    ancienne.save()
    Rapport.objects.create(
        pays=monde["sn"], visite=ancienne, delegue=monde["deleg.sn"], statut="valide",
        soumis_le=rapport.soumis_le,
        presentations=[{"produit": str(cardiol.pk), "libelle": "Cardiol", "retour": "peu"}],
    )  # fmt: skip
    return rapport


def test_dc53_tendance_agregee_par_produit(monde, historique):
    r = lire(monde, "sup.sn")
    assert r.status_code == 200, r.content
    (cardiol,) = r.json()["tendance"]
    assert cardiol["libelle"] == "Cardiol"
    assert cardiol["periode"]["prescrit"] == 1 and cardiol["favorable_periode"] == 1.0
    # La période précédente (du 10 au 12) : « prescrit peu ».
    assert cardiol["precedente"]["peu"] == 1 and cardiol["favorable_precedente"] == 0.0
    assert "prospect" not in cardiol and "prescripteur" not in str(cardiol)


def test_dc57_points_d_attention_relies_a_leurs_visites(monde, semaine, historique):
    points = {p["regle"]: p for p in lire(monde, "sup.sn").json()["points"]}
    passage = points["passages_prescrit"]
    assert (passage["nombre"], passage["produit"]) == (1, "Cardiol")
    (visite,) = passage["visites"]
    assert visite["visite"] == str(semaine["faite"].pk) and visite["date"] == "2026-10-13"
    # DC-53 : un point de prescription ne nomme pas le prescripteur.
    assert visite["prospect"] == ""
    retard = points["actions_en_retard"]
    assert retard["nombre"] == 1 and retard["visites"][0]["prospect"]
    assert "retours_en_baisse" not in points


def test_dc57_l_action_n_est_plus_en_retard_si_le_delegue_est_revenu(monde, semaine, historique):
    revue = Visite.objects.get(pk=semaine["faite"].pk)
    revue.pk, revue._state.adding = None, True
    revue.date = date(2026, 10, 14)
    revue.save()
    regles = {p["regle"] for p in lire(monde, "sup.sn").json()["points"]}
    assert "actions_en_retard" not in regles


def test_dc53_le_perimetre_seulement(monde, historique):
    vide = lire(monde, "dm.sn").json()
    assert (vide["tendance"], vide["points"]) == ([], [])
    assert lire(monde, "deleg.sn").status_code == 403

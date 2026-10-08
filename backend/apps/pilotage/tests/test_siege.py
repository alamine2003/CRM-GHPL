# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.4 : DSH-004, la consolidation du siège (REC-10).

Comparaison et total par pays, agrégés, sans aucun nom ; descente au nominatif d'un pays choisi.
CA1 : chaque consultation nominative par le siège crée un événement d'audit."""

import json

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

SIEGE = "/api/v1/pilotage/siege/"
EQUIPE = "/api/v1/pilotage/equipe/"


def lire(monde, qui, url, pays=None, **params):
    with freeze_time("2026-10-15 12:00"):
        return client_de(monde[qui], pays).get(url, params)


def test_dsh004_comparaison_et_total_par_pays_sans_aucun_nom(monde, semaine):
    r = lire(monde, "dina.direction", SIEGE)
    assert r.status_code == 200, r.content
    d = r.json()
    assert (d["debut"], d["fin"]) == ("2026-10-12", "2026-10-18")
    par_pays = {x["pays"]["code"]: x for x in d["pays"]}
    assert set(par_pays) >= {"SN", "TG"}
    sn, tg = par_pays["SN"], par_pays["TG"]
    assert (sn["delegues"], tg["delegues"]) == (1, 0)
    assert sn["total"]["semaine"]["visites"]["effectuees"] == 1
    assert sn["total"]["semaine"]["taux"]["realisation"] == 0.333
    assert tg["total"]["semaine"]["activite"] is False
    # Le total de tous les pays est la somme des pays.
    for cle, valeur in d["total"]["semaine"]["visites"].items():
        assert valeur == sum(x["total"]["semaine"]["visites"][cle] for x in d["pays"]), cle
    assert d["delegues"] == 1
    # Agrégé : aucun nom, aucun identifiant de délégué.
    texte = json.dumps(d)
    assert monde["deleg.sn"].last_name not in texte and str(monde["deleg.sn"].pk) not in texte
    # La consultation agrégée n'est pas nominative : pas d'événement.
    assert not EvenementAudit.objects.filter(action="pilotage.consultation_nominative").exists()


def test_dsh004_ca1_la_descente_nominative_du_siege_est_auditee(monde, semaine):
    r = lire(monde, "ada.siege", EQUIPE, "SN", par="reseau")
    assert r.status_code == 200, r.content
    assert [x["delegue"]["id"] for x in r.json()["delegues"]] == [str(monde["deleg.sn"].pk)]
    (e,) = EvenementAudit.objects.filter(action="pilotage.consultation_nominative")
    assert (e.acteur, e.pays.code) == (monde["ada.siege"], "SN")
    assert e.details == {"semaine": "2026-10-12", "par": "reseau", "delegues": 1}
    # Chaque consultation compte.
    lire(monde, "ada.siege", EQUIPE, "SN")
    assert EvenementAudit.objects.filter(action="pilotage.consultation_nominative").count() == 2
    # L'encadrement du pays consulte sans événement : il pilote son propre périmètre.
    assert lire(monde, "resp.sn", EQUIPE).status_code == 200
    assert EvenementAudit.objects.filter(action="pilotage.consultation_nominative").count() == 2


def test_dsh004_la_consolidation_est_reservee_au_siege(monde, semaine):
    r = lire(monde, "resp.sn", SIEGE)
    assert (r.status_code, r.json()["code"]) == (403, "reserve_au_siege")
    assert lire(monde, "deleg.sn", SIEGE).status_code == 403

# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.5 : DSH-005, les filtres du pilotage.

Période (semaine, 30 jours, 90 jours, 6 mois, 1 an, dates choisies, §14.18), zone, secteur,
division, réseau, superviseur, délégué, statut. CA1 : les filtres proposés sont limités au
périmètre."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de

from .test_equipe import delegue
from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/equipe/"


def lire(monde, qui="resp.sn", **params):
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde[qui]).get(URL, params)
    assert r.status_code == 200, r.content
    return r.json()


def test_dsh005_periodes(monde, semaine):
    assert (lire(monde)["debut"], lire(monde)["fin"]) == ("2026-10-12", "2026-10-18")
    d = lire(monde, periode="30j")
    assert (d["periode"], d["debut"], d["fin"]) == ("30j", "2026-09-16", "2026-10-15")
    # Plus longue qu'un cycle, la période porte aussi la couverture.
    d = lire(monde, periode="90j")
    assert (d["debut"], d["cycle"]["debut"]) == ("2026-07-18", "2026-07-18")
    d = lire(monde, periode="dates", du="2026-10-13", au="2026-10-13")
    (ligne,) = d["delegues"]
    assert ligne["semaine"]["visites"]["effectuees"] == 1
    assert ligne["semaine"]["visites"]["prevues"] == 2


def test_dsh005_dates_invalides(monde, semaine):
    with freeze_time("2026-10-15 12:00"):
        c = client_de(monde["resp.sn"])
        assert c.get(URL, {"periode": "dates", "du": "2026-10-13"}).status_code == 400
        assert c.get(URL, {"periode": "dates", "du": "2026-10-14",
                           "au": "2026-10-13"}).status_code == 400  # fmt: skip
        assert c.get(URL, {"periode": "dates", "du": "2025-01-01",
                           "au": "2026-10-13"}).status_code == 400  # fmt: skip


def test_dsh005_ca1_les_options_sont_celles_du_perimetre(monde, terrain, semaine):
    # Un poste d'un autre réseau, dans une autre zone, hors du périmètre du DM.
    gastro = org.creer_reseau(monde["sn"], terrain["division"], "GAS1", "Gastro")
    thies = org.creer_secteur(monde["sn"], org.creer_zone(monde["sn"], "Thiès"), "Mbour")
    hors = delegue(monde, terrain, "moussa.fall", "VM Mbour", rattache=False)
    from apps.organisation.models import Poste

    poste = Poste.objects.get(libelle="VM Mbour")
    poste.reseaux.set([gastro])
    poste.secteurs.set([thies])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    o = lire(monde, "dm.sn")["options"]
    assert [x["libelle"] for x in o["reseaux"]] == ["Cardio"]
    assert [x["libelle"] for x in o["zones"]] == ["Dakar"]
    assert [x["libelle"] for x in o["divisions"]] == ["Cardiologie"]
    assert [x["id"] for x in o["delegues"]] == [str(monde["deleg.sn"].pk)]
    assert [x["id"] for x in o["superviseurs"]] == [str(monde["sup.sn"].pk)]
    # Le responsable pays voit les deux réseaux et les deux zones.
    o = lire(monde)["options"]
    assert {x["libelle"] for x in o["reseaux"]} == {"Cardio", "Gastro"}
    assert {x["libelle"] for x in o["zones"]} == {"Dakar", "Thiès"}
    # Un filtre hors périmètre ne révèle rien : il ne fait que restreindre.
    assert lire(monde, "dm.sn", reseau=str(gastro.pk))["delegues"] == []
    assert lire(monde, "dm.sn", delegue=str(hors.pk))["delegues"] == []


def test_dsh005_chaque_filtre_restreint(monde, terrain, semaine):
    autre = delegue(monde, terrain, "aminata.ba", "VM Médina")  # sans visite
    gabriel = str(monde["deleg.sn"].pk)
    ids = lambda **f: {x["delegue"]["id"] for x in lire(monde, **f)["delegues"]}  # noqa: E731
    assert ids() == {gabriel, str(autre.pk)}
    assert ids(delegue=gabriel) == {gabriel}
    assert ids(statut="actif") == {gabriel}
    assert ids(statut="sans_activite") == {str(autre.pk)}
    assert ids(superviseur=str(monde["sup.sn"].pk)) == {gabriel, str(autre.pk)}
    assert ids(reseau=str(terrain["cardio"].pk)) == {gabriel, str(autre.pk)}
    assert ids(division=str(terrain["division"].pk)) == {gabriel, str(autre.pk)}
    assert ids(secteur=str(terrain["secteur"].pk)) == {gabriel, str(autre.pk)}
    # Les totaux suivent le filtre.
    total = lire(monde, statut="sans_activite")["total"]["semaine"]
    assert total["visites"]["effectuees"] == 0

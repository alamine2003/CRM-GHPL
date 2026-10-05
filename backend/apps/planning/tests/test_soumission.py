"""PLN-008 : soumission avec contrôle final ; marquage « en retard » après l'échéance.
CA1 : une soumission après jeudi 18 h (heure du pays) est acceptée et marquée « en retard ».
ORG-007 CA1 : un délégué sans superviseur actif ne peut pas soumettre (message explicite)."""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import controles, services
from apps.socle.services import definir_parametre

from .conftest import SEMAINE

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def soumettre(monde, terrain):
    return client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/soumettre/"
    )


def pret(monde, terrain):
    """Un superviseur au poste et une visite complète."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    services.ajouter_visite(
        terrain["planning"], date=MARDI, heure=time(9, 30), prospect=terrain["medecin"],
        etablissement=terrain["clinique"], objectif="Vasculor",
    )  # fmt: skip


def test_l_echeance_est_jeudi_18_h_de_la_semaine_precedente(monde, terrain):
    assert services.echeance(terrain["planning"]) == datetime(
        2026, 10, 8, 18, 0, tzinfo=ZoneInfo("Africa/Dakar"))  # fmt: skip
    # Paramètre du pays (RG-013) : vendredi midi.
    definir_parametre(monde["sn"], "echeance_soumission_planning", {"jour": 5, "heure": "12:00"})
    assert services.echeance(terrain["planning"]).isoformat().startswith("2026-10-09T12:00")


def test_org007_ca1_sans_superviseur_pas_de_soumission(monde, terrain):
    services.ajouter_visite(terrain["planning"], date=MARDI, heure=time(9, 30),
                            prospect=terrain["medecin"], etablissement=terrain["clinique"],
                            objectif="Vasculor")  # fmt: skip
    r = soumettre(monde, terrain)
    assert r.status_code == 409 and r.json()["code"] == "sans_superviseur"
    assert "superviseur" in r.json()["message"]


def test_un_planning_vide_ou_bloque_n_est_pas_soumis(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    r = soumettre(monde, terrain)
    assert r.status_code == 400 and r.json()["code"] == "planning_vide"
    # Contrôle final (PLN-004, RG-015) : une visite incomplète bloque, avec la liste.
    visite = services.ajouter_visite(terrain["planning"], date=MARDI)
    r = soumettre(monde, terrain)
    assert r.status_code == 400 and r.json()["code"] == "planning_bloque"
    assert r.json()["details"]["anomalies"][0] == {
        "code": "incomplete", "date": "2026-10-13", "visites": [str(visite.pk)],
        "manquants": ["heure", "prospect", "etablissement", "objectif"]}  # fmt: skip


def test_ca1_soumis_a_temps_puis_plus_modifiable(monde, terrain):
    pret(monde, terrain)
    r = soumettre(monde, terrain)
    assert r.status_code == 200, r.content
    p = r.json()
    assert (p["statut"], p["en_retard"]) == ("soumis", False)
    assert p["soumis_le"].startswith("2026-10-07T09:00")
    assert EvenementAudit.objects.filter(action="planning.soumission").count() == 1
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert semaine["modifiable"] is False
    # Soumis, il ne se resoumet pas et ne reçoit plus de visite (révision : cycle 0.3).
    assert soumettre(monde, terrain).json()["code"] == "planning_non_modifiable"
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/visites/", {"date": "2026-10-14"},
        format="json",
    )  # fmt: skip
    assert r.status_code == 409 and r.json()["code"] == "planning_non_modifiable"


def test_ca1_apres_l_echeance_la_soumission_est_acceptee_et_marquee_en_retard(monde, terrain):
    pret(monde, terrain)
    with freeze_time("2026-10-09 10:00"):
        # Avant de soumettre, l'échéance passée est déjà dite au délégué.
        assert "echeance_depassee" in [a.code for a in controles.signalements(terrain["planning"])]
        r = soumettre(monde, terrain)
        assert r.status_code == 200 and r.json()["en_retard"] is True
        # Le superviseur le verra (RG-016).
        terrain["planning"].refresh_from_db()
        codes = [a.code for a in controles.signalements(terrain["planning"])]
        assert "soumis_en_retard" in codes and "echeance_depassee" not in codes
    assert EvenementAudit.objects.get(action="planning.soumission").details["en_retard"] is True


def test_une_semaine_toute_d_absence_se_soumet_sans_visite(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    for jour in range(12, 17):
        services.declarer_activite(terrain["planning"], date=date(2026, 10, jour), type="conge")
    assert soumettre(monde, terrain).status_code == 200


def test_un_planning_approuve_ne_se_resoumet_pas_ici(monde, terrain):
    """La machine à états permet approuvé → soumis (modification, cycle 0.3) : pas cette route."""
    pret(monde, terrain)
    terrain["planning"].statut = "approuve"
    terrain["planning"].save(update_fields=["statut"])
    r = soumettre(monde, terrain)
    assert r.status_code == 409 and r.json()["code"] == "planning_non_modifiable"
    assert not EvenementAudit.objects.filter(action="planning.soumission").exists()

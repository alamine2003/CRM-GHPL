"""0.4.3 : démarrer une visite (VIS-003) — « en cours », heure réelle de début, position GPS si
le pays l'active (RG-028).

CA1 : la position est capturée hors connexion : le téléphone l'envoie plus tard, avec l'heure
réelle du démarrage, et le rejeu ne change rien. CA2 : sans GPS, la visite démarre quand même,
marquée « sans GPS ». CA3 : la distance à l'établissement est gardée et rendue."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.socle.services import definir_parametre

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture
def approuvee(monde, terrain):
    """Une visite le mardi 13 à 9 h, approuvée ; la clinique est à Dakar (14,7 ; -17,4)."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    clinique = terrain["clinique"]
    clinique.latitude, clinique.longitude = 14.7, -17.4
    clinique.save(update_fields=["latitude", "longitude"])
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        visite = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                         prospect=terrain["medecin"], etablissement=clinique,
                                         objectif="A")  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    return visite


def demarrer(monde, visite, **corps):
    return client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/demarrer/",
                                             corps, format="json")  # fmt: skip


@freeze_time("2026-10-13 09:05")
def test_vis003_la_visite_demarre_a_l_heure_reelle_avec_sa_position(monde, approuvee):
    # 0,001° de latitude, c'est environ 111 m.
    r = demarrer(monde, approuvee, debut_le="2026-10-13T09:02:00Z", latitude=14.701,
                 longitude=-17.4, precision_m=12.4)  # fmt: skip
    assert r.status_code == 200, r.json()
    v = r.json()
    assert (v["statut"], v["debut_le"], v["sans_gps"]) == ("en_cours", "2026-10-13T09:02:00Z",
                                                          False)  # fmt: skip
    assert 105 <= v["distance_debut_m"] <= 115  # CA3
    approuvee.refresh_from_db()
    assert (str(approuvee.debut_latitude), approuvee.debut_precision_m) == ("14.701000", 12)
    assert EvenementAudit.objects.filter(action="visite.demarrage").exists()


def test_vis003_ca1_demarree_hors_connexion_l_envoi_arrive_plus_tard(monde, approuvee):
    """Démarrée à 9 h 02 sans réseau, envoyée à 11 h : l'heure réelle est celle du téléphone ;
    rejouée une seconde fois, rien ne change."""
    corps = dict(debut_le="2026-10-13T09:02:00Z", latitude=14.7, longitude=-17.4)
    with freeze_time("2026-10-13 11:00"):
        assert demarrer(monde, approuvee, **corps).status_code == 200
        assert demarrer(monde, approuvee, **corps).status_code == 200
    approuvee.refresh_from_db()
    assert approuvee.debut_le.isoformat() == "2026-10-13T09:02:00+00:00"
    assert EvenementAudit.objects.filter(action="visite.demarrage").count() == 1
    # Un autre début pour la même visite, lui, est refusé.
    with freeze_time("2026-10-13 11:05"):
        r = demarrer(monde, approuvee, debut_le="2026-10-13T11:04:00Z")
    assert (r.status_code, r.json()["code"]) == (409, "transition_interdite")


@freeze_time("2026-10-13 09:05")
def test_vis003_ca2_sans_gps_la_visite_demarre_et_est_marquee(monde, approuvee):
    r = demarrer(monde, approuvee, debut_le="2026-10-13T09:04:00Z")
    assert r.status_code == 200
    assert (r.json()["statut"], r.json()["sans_gps"], r.json()["distance_debut_m"]) == (
        "en_cours", True, None)  # fmt: skip


@freeze_time("2026-10-13 09:05")
def test_rg028_un_pays_sans_geolocalisation_ne_garde_aucune_position(monde, approuvee):
    definir_parametre(monde["sn"], "geolocalisation_active", False)
    r = demarrer(monde, approuvee, debut_le="2026-10-13T09:04:00Z", latitude=14.7,
                 longitude=-17.4)  # fmt: skip
    assert (r.json()["sans_gps"], r.json()["distance_debut_m"]) == (False, None)
    approuvee.refresh_from_db()
    assert approuvee.debut_latitude is None


def test_seule_une_visite_approuvee_du_jour_se_demarre(monde, terrain, approuvee):
    with freeze_time("2026-10-12 09:00"):
        r = demarrer(monde, approuvee, debut_le="2026-10-12T08:59:00Z")
        assert (r.status_code, r.json()["code"]) == (409, "autre_jour")
        r = demarrer(monde, approuvee, debut_le="2026-10-13T09:00:00Z")
        assert (r.status_code, r.json()["code"]) == (400, "moment_futur")
    # Une visite ajoutée après l'approbation, qui attend la décision, ne se démarre pas.
    with freeze_time("2026-10-09 09:00"):
        jeudi = dict(date=date(2026, 10, 15), heure=time(15, 0), objectif="B")
        ajout = services.ajouter_visite(terrain["planning"], prospect=terrain["medecin"],
                                        etablissement=terrain["clinique"], **jeudi)  # fmt: skip
    with freeze_time("2026-10-15 15:00"):
        r = demarrer(monde, ajout, debut_le="2026-10-15T14:59:00Z")
    assert (r.status_code, r.json()["code"]) == (409, "visite_non_approuvee")


@freeze_time("2026-10-13 09:05")
def test_le_programme_dit_la_visite_en_cours_et_la_geolocalisation(monde, approuvee):
    demarrer(monde, approuvee, debut_le="2026-10-13T09:02:00Z")
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert p["geolocalisation"] is True
    (v,) = p["jours"][1]["visites"]
    assert (v["statut"], v["sans_gps"]) == ("en_cours", True)
    # En cours, elle reste la prochaine : elle n'est pas encore faite.
    assert p["prochaine"] == str(approuvee.pk)


@freeze_time("2026-10-13 09:05")
def test_un_collegue_ne_demarre_pas_la_visite_d_un_autre(monde, approuvee):
    corps = {"debut_le": "2026-10-13T09:02:00Z"}
    r = client_de(monde["sup.sn"]).post(f"/api/v1/visites/{approuvee.pk}/demarrer/", corps,
                                        format="json")  # fmt: skip
    assert r.status_code == 404

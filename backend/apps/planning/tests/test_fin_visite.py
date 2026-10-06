"""0.4.4 : terminer une visite (VIS-004) — « effectuée », heure réelle de fin, position GPS.

CA1 : l'heure de fin est postérieure à l'heure de début. Comme au début (VIS-003), la fin peut
partir plus tard depuis la file du téléphone, sans effet si elle est rejouée, et une visite
terminée sans position est marquée « sans GPS » à la fin."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services
from apps.socle.services import definir_parametre

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture
def en_cours(monde, terrain):
    """Approuvée pour le mardi 13 à 9 h, démarrée à 9 h 02 près de la clinique."""
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
    with freeze_time("2026-10-13 09:02"):
        from django.utils import timezone

        execution.demarrer(visite, timezone.now(), 14.7, -17.4, 10)
    visite.refresh_from_db()
    return visite


def terminer(monde, visite, **corps):
    return client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/terminer/", corps,
                                             format="json")  # fmt: skip


@freeze_time("2026-10-13 09:30")
def test_vis004_la_visite_est_effectuee_a_l_heure_reelle_avec_sa_position(monde, en_cours):
    r = terminer(monde, en_cours, fin_le="2026-10-13T09:27:00Z", latitude=14.7005,
                 longitude=-17.4, precision_m=8)  # fmt: skip
    assert r.status_code == 200, r.json()
    v = r.json()
    assert (v["statut"], v["fin_le"], v["fin_sans_gps"]) == ("effectuee", "2026-10-13T09:27:00Z",
                                                            False)  # fmt: skip
    assert 50 <= v["distance_fin_m"] <= 60
    evenement = EvenementAudit.objects.get(action="visite.fin")
    assert evenement.details["duree_min"] == 25


@freeze_time("2026-10-13 09:30")
def test_vis004_ca1_la_fin_suit_le_debut(monde, en_cours):
    for fin in ("2026-10-13T09:02:00Z", "2026-10-13T08:50:00Z"):
        r = terminer(monde, en_cours, fin_le=fin)
        assert (r.status_code, r.json()["code"]) == (400, "fin_avant_debut")
    r = terminer(monde, en_cours, fin_le="2026-10-13T10:00:00Z")
    assert (r.status_code, r.json()["code"]) == (400, "moment_futur")
    en_cours.refresh_from_db()
    assert en_cours.statut == "en_cours"


def test_vis004_terminee_hors_connexion_l_envoi_arrive_plus_tard(monde, en_cours):
    corps = dict(fin_le="2026-10-13T09:27:00Z")
    with freeze_time("2026-10-13 12:00"):
        assert terminer(monde, en_cours, **corps).status_code == 200
        assert terminer(monde, en_cours, **corps).status_code == 200
    en_cours.refresh_from_db()
    assert (en_cours.statut, en_cours.fin_sans_gps) == ("effectuee", True)
    assert EvenementAudit.objects.filter(action="visite.fin").count() == 1


@freeze_time("2026-10-13 09:30")
def test_seule_une_visite_en_cours_se_termine(monde, terrain, en_cours):
    """Une visite prévue, jamais démarrée, ne se termine pas : il faut d'abord la démarrer."""
    with freeze_time("2026-10-08 10:00"):
        lieu = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
        autre = services.ajouter_visite(terrain["planning"], date=date(2026, 10, 14),
                                        heure=time(9, 0), objectif="B", **lieu)  # fmt: skip
    r = terminer(monde, autre, fin_le="2026-10-13T09:27:00Z")
    assert (r.status_code, r.json()["code"]) == (409, "transition_interdite")


@freeze_time("2026-10-13 09:30")
def test_rg028_sans_geolocalisation_aucune_position_a_la_fin(monde, en_cours):
    definir_parametre(monde["sn"], "geolocalisation_active", False)
    r = terminer(monde, en_cours, fin_le="2026-10-13T09:27:00Z", latitude=14.7, longitude=-17.4)
    assert (r.json()["fin_sans_gps"], r.json()["distance_fin_m"]) == (False, None)


@freeze_time("2026-10-13 09:30")
def test_effectuee_elle_n_est_plus_la_prochaine_et_se_lit_dans_l_historique(monde, en_cours):
    terminer(monde, en_cours, fin_le="2026-10-13T09:27:00Z")
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    (v,) = p["jours"][1]["visites"]
    assert (v["statut"], p["prochaine"]) == ("effectuee", None)
    assert p["attente_gps_secondes"] == 60

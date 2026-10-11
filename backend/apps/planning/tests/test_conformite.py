"""0.4.9 : contrôles de conformité des visites (VIS-010, RG-029).

CA1 : une journée sans aucun écart est « conforme ». CA2 : les seuils viennent des paramètres
du pays. CA3 : le résultat est recalculé si les paramètres changent avant validation, jamais
après."""

from datetime import UTC, date, datetime, time, timedelta

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import conformite, execution, services
from apps.planning.models import ConformiteJournee
from apps.planning.tests.conftest import valeur
from apps.prospects.services import creer_exercice, creer_prospect
from apps.socle.services import definir_parametre

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


def utc(h, m=0):
    return datetime(2026, 10, 13, h, m, tzinfo=UTC)


@pytest.fixture
def approuvees(monde, terrain):
    """Deux visites approuvées le mardi (Dakar = UTC)."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        lieu = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
        v1 = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A", **lieu)
        confrere = creer_prospect(
            monde["sn"], monde["admin.sn"], actif=True, nom="Sarr", prenom="Ibou",
            potentiel="B", type=valeur(monde, "type_prospect", "medecin"),
            specialite=valeur(monde, "specialite", "cardiologie"),
        )  # fmt: skip
        creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
        v2 = services.ajouter_visite(planning, date=MARDI, heure=time(11, 0), objectif="B",
                                     prospect=confrere,
                                     etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    return v1, v2


def faire(visite, debut, fin, distance=40):
    with freeze_time(fin + timedelta(minutes=1)):
        execution.demarrer(visite, debut)
        visite.refresh_from_db()
        execution.terminer(visite, fin)
    type(visite).objects.filter(pk=visite.pk).update(distance_debut_m=distance,
                                                     distance_fin_m=distance)  # fmt: skip


def journee(monde, planning):
    r = client_de(monde["sup.sn"]).get(f"/api/v1/plannings/{planning.pk}/consultation/")
    assert r.status_code == 200, r.json()
    return {j["date"]: j for j in r.json()["conformite"]}[MARDI.isoformat()]


@freeze_time("2026-10-13 18:00")
def test_vis010_ca1_une_journee_sans_ecart_est_conforme(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25))
    faire(v2, utc(11, 0), utc(11, 20))
    j = journee(monde, v1.planning)
    assert (j["classement"], j["ecarts"]) == ("conforme", [])


@freeze_time("2026-10-13 22:00")
def test_vis010_chaque_ecart_est_releve(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(7, 40), utc(7, 41), distance=350)  # hors plage, trop court, trop loin
    faire(v2, utc(11, 0), utc(15, 30))  # plus de 3 h
    j = journee(monde, v1.planning)
    assert j["classement"] == "a_verifier"
    assert sorted(e["code"] for e in j["ecarts"]) == [
        "distance", "duree_courte", "duree_longue", "hors_plage"]  # fmt: skip
    distance = next(e for e in j["ecarts"] if e["code"] == "distance")
    assert (distance["distance_m"], distance["seuil_m"], distance["visite"]) == (
        350, 100, str(v1.pk))  # fmt: skip


@freeze_time("2026-10-14 08:00")
def test_vis010_une_visite_restee_prevue_est_a_justifier(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25))
    j = journee(monde, v1.planning)
    assert [(e["code"], e["visite"]) for e in j["ecarts"]] == [("a_justifier", str(v2.pk))]


@freeze_time("2026-10-13 18:00")
def test_vis010_ca2_les_seuils_viennent_du_pays(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25), distance=350)
    faire(v2, utc(11, 0), utc(11, 20))
    assert journee(monde, v1.planning)["classement"] == "a_verifier"
    definir_parametre(monde["sn"], "distance_pointage_m", 500)
    assert journee(monde, v1.planning)["classement"] == "conforme"


@freeze_time("2026-10-13 18:00")
def test_vis010_ca3_figee_a_la_validation_elle_ne_change_plus(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25), distance=350)
    faire(v2, utc(11, 0), utc(11, 20))
    conformite.figer(ConformiteJournee.objects.get(date=MARDI))
    definir_parametre(monde["sn"], "distance_pointage_m", 500)
    j = journee(monde, v1.planning)
    assert (j["classement"], j["fige"]) == ("a_verifier", True)


@freeze_time("2026-10-13 18:00")
def test_vis010_sans_gps_au_dela_de_la_tolerance(monde, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25))
    faire(v2, utc(11, 0), utc(11, 20))
    type(v1).objects.filter(pk__in=[v1.pk, v2.pk]).update(sans_gps=True)
    assert journee(monde, v1.planning)["classement"] == "conforme"  # 2 ≤ 3 tolérées
    definir_parametre(monde["sn"], "visites_sans_gps_tolerees", 1)
    j = journee(monde, v1.planning)
    assert [(e["code"], e["nombre"], e["tolerees"]) for e in j["ecarts"]] == [("sans_gps", 2, 1)]


@freeze_time("2026-10-13 12:00")
def test_vis010_calculee_a_la_reception(monde, approuvees):
    v1, _ = approuvees
    execution.demarrer(v1, utc(7, 30))
    c = ConformiteJournee.objects.get(date=MARDI)
    assert [e["code"] for e in c.ecarts] == ["hors_plage"]


@freeze_time("2026-10-13 12:00")
def test_vis010_une_visite_imprevue_est_a_verifier(monde, terrain, approuvees):
    v1, _ = approuvees
    execution.visite_imprevue(v1.planning.delegue, monde["sn"], le=utc(11, 50),
                              prospect=terrain["medecin"],
                              justification="Croisé en ville")  # fmt: skip
    c = ConformiteJournee.objects.get(date=MARDI)
    assert [(e["code"], e["justification"]) for e in c.ecarts] == [("imprevue", "Croisé en ville")]


@freeze_time("2026-10-13 10:00")
def test_vis010_ca1_la_journee_du_jour_n_est_pas_terminee(monde, approuvees):
    v1, _ = approuvees
    faire(v1, utc(9, 2), utc(9, 25))
    j = journee(monde, v1.planning)
    assert (j["classement"], j["terminee"]) == ("conforme", False)
    with freeze_time("2026-10-14 08:00"):
        assert journee(monde, v1.planning)["terminee"] is True


@freeze_time("2026-10-13 18:00")
def test_dc55_une_position_imprecise_n_est_pas_loin_du_lieu(monde, approuvees):
    """Précision annoncée de 250 m pour un seuil de 100 m : rien ne se conclut sur la
    distance ; la visite compte comme sans GPS, dans la tolérance du pays."""
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25), distance=180)
    type(v1).objects.filter(pk=v1.pk).update(debut_precision_m=250, fin_precision_m=250)
    faire(v2, utc(11, 0), utc(11, 20))
    j = journee(monde, v1.planning)
    assert (j["classement"], j["ecarts"]) == ("conforme", [])


@freeze_time("2026-10-13 18:00")
def test_dc55_le_rayon_propre_de_l_etablissement_remplace_celui_du_pays(monde, terrain, approuvees):
    v1, v2 = approuvees
    faire(v1, utc(9, 2), utc(9, 25), distance=350)
    faire(v2, utc(11, 0), utc(11, 20))
    assert journee(monde, v1.planning)["classement"] == "a_verifier"
    clinique = terrain["clinique"]
    clinique.rayon_pointage_m = 400
    clinique.save(update_fields=["rayon_pointage_m"])
    assert journee(monde, v1.planning)["classement"] == "conforme"

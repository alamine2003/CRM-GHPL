"""DC-51 (0.5.9) : l'indisponibilité imprévue remplace « maladie ». Elle se déclare le jour
même, sans motif médical, même semaine fermée, et justifie les visites de la période."""

import uuid
from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.models import Activite
from apps.planning.tests.conftest import valeur
from apps.prospects.services import creer_exercice, creer_prospect

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
URL = "/api/v1/programme/indisponibilite/"


@pytest.fixture
def approuve(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        lieu = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
        matin = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                        **lieu)  # fmt: skip
        confrere = creer_prospect(
            monde["sn"], monde["admin.sn"], actif=True, nom="Sarr", prenom="Ibou",
            potentiel="B", type=valeur(monde, "type_prospect", "medecin"),
            specialite=valeur(monde, "specialite", "cardiologie"),
        )  # fmt: skip
        creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
        soir = services.ajouter_visite(planning, date=MARDI, heure=time(15, 0), objectif="B",
                                       prospect=confrere,
                                       etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    return matin, soir


def test_dc51_maladie_ne_se_planifie_plus(monde, terrain):
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/activites/",
        {"date": "2026-10-14", "type": "indisponibilite"}, format="json",
    )  # fmt: skip
    assert r.json()["code"] in ("indisponibilite_du_jour", "valeur_invalide", "donnees_invalides")


def test_dc51_le_matin_justifie_ses_visites_semaine_fermee(monde, approuve):
    matin, soir = approuve
    ident = uuid.uuid4()
    with freeze_time("2026-10-13 08:00"):
        c = client_de(monde["deleg.sn"])
        r = c.post(URL, {"id": str(ident), "periode": "matin"}, format="json")
        assert r.status_code == 201, r.content
        assert (r.json()["type"], r.json()["commentaire"]) == ("indisponibilite", "")
        # Rejoué depuis la file d'attente : rien de plus.
        assert c.post(URL, {"id": str(ident), "periode": "matin"}, format="json").status_code == 201
        assert Activite.objects.filter(type="indisponibilite").count() == 1
        programme = c.get("/api/v1/programme/").json()
        # La visite du matin n'est plus la prochaine : celle de l'après-midi l'est.
        assert programme["prochaine"] == str(soir.pk)
        (jour,) = [j for j in programme["jours"] if j["date"] == "2026-10-13"]
        assert [a["type"] for a in jour["activites"]] == ["indisponibilite"]
    with freeze_time("2026-10-14 08:00"):
        # Le lendemain, seule la visite de l'après-midi reste à justifier.
        restees = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()["a_justifier"]
        assert [v["id"] for v in restees] == [str(soir.pk)]


def test_dc51_une_seule_fois_par_periode(monde, approuve):
    with freeze_time("2026-10-13 08:00"):
        c = client_de(monde["deleg.sn"])
        assert c.post(URL, {}, format="json").status_code == 201
        r = c.post(URL, {"periode": "apres_midi"}, format="json")
        assert r.json()["code"] == "deja_declaree"


def test_dc51_une_visite_couverte_n_est_pas_un_ecart_de_conformite(monde, approuve):
    matin, soir = approuve
    with freeze_time("2026-10-13 08:00"):
        client_de(monde["deleg.sn"]).post(URL, {"periode": "matin"}, format="json")
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).get(f"/api/v1/plannings/{matin.planning_id}/consultation/")
        assert r.status_code == 200, r.content
        (jour,) = [j for j in r.json()["conformite"] if j["date"] == MARDI.isoformat()]
        # Seule la visite de l'après-midi, non couverte, reste à justifier.
        assert [(e["code"], e["visite"]) for e in jour["ecarts"]] == [("a_justifier", str(soir.pk))]

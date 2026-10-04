import pytest
from django.conf import settings

pytestmark = pytest.mark.django_db


def test_sante_renvoie_version_et_base(client):
    reponse = client.get("/api/health/")
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["statut"] == "ok"
    assert corps["base"] == "ok"
    assert corps["version"] == settings.INNOV_VERSION


def test_version_vient_du_fichier_version():
    racine = settings.BASE_DIR.parent
    assert settings.INNOV_VERSION == (racine / "VERSION").read_text().strip()


def test_informations_en_francais_par_defaut(client):
    corps = client.get("/api/v1/informations/").json()
    assert corps["langue"] == "fr"
    assert corps["message"] == "Bienvenue dans INNOV CRM."
    assert {lang["code"] for lang in corps["langues"]} == {"fr", "en"}


def test_informations_en_anglais(client):
    corps = client.get("/api/v1/informations/", HTTP_ACCEPT_LANGUAGE="en").json()
    assert corps["langue"] == "en"
    assert corps["message"] == "Welcome to INNOV CRM."


def test_api_protegee_par_defaut(client):
    """Toute route nouvelle exige une authentification, sauf exception explicite."""
    from rest_framework.settings import api_settings

    noms = [c.__name__ for c in api_settings.DEFAULT_PERMISSION_CLASSES]
    assert noms == ["IsAuthenticated"]

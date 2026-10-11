"""0.9.6 : version minimale de l'application mobile (architecture §14.8, docs/mise-a-jour.md).

Une application plus ancienne que `INNOV_VERSION_MIN_APP` reçoit 426 et la version minimale ;
le portail (sans en-tête), la sonde et une application à jour passent."""

import pytest

from apps.perimetre.tests.conftest import client_de, monde  # noqa: F401
from apps.socle.version_app import numeros

pytestmark = pytest.mark.django_db
URL = "/api/v1/referentiel/valeurs/"


def test_les_versions_se_comparent_nombre_par_nombre():
    assert numeros("0.9.10") > numeros("0.9.9")
    assert numeros("1.0") < numeros("1.0.0")
    assert numeros("abc") is None


def test_une_application_trop_ancienne_recoit_426(settings, monde):  # noqa: F811
    settings.VERSION_MIN_APP = "0.9.6"
    c = client_de(monde["deleg.sn"])
    r = c.get(URL, HTTP_X_VERSION_APP="0.9.5")
    assert r.status_code == 426
    assert r.json()["code"] == "mise_a_jour_requise"
    assert r.json()["details"]["version_minimale"] == "0.9.6"
    assert c.get(URL, HTTP_X_VERSION_APP="0.9.6").status_code == 200
    assert c.get(URL, HTTP_X_VERSION_APP="1.0.0").status_code == 200
    # Le portail n'envoie pas l'en-tête ; la sonde de l'hébergeur n'est jamais refusée.
    assert c.get(URL).status_code == 200
    assert c.get("/api/health/", HTTP_X_VERSION_APP="0.1.0").status_code == 200


def test_sans_version_minimale_tout_passe(settings, monde):  # noqa: F811
    settings.VERSION_MIN_APP = ""
    r = client_de(monde["deleg.sn"]).get(URL, HTTP_X_VERSION_APP="0.0.1")
    assert r.status_code == 200

import pytest
from rest_framework.test import APIClient

from apps.identite.services import creer_utilisateur
from apps.socle.services import creer_pays

MOT_DE_PASSE = __import__("secrets").token_hex(16)


@pytest.fixture
def senegal(db):
    return creer_pays("SN")


@pytest.fixture
def delegue(senegal):
    return creer_utilisateur(
        "awa.diallo",
        prenom="Awa",
        nom="Diallo",
        courriel="awa.diallo@exemple.org",
        pays=senegal,
        mot_de_passe=MOT_DE_PASSE,
    )


@pytest.fixture
def siege(db):
    return creer_utilisateur(
        "moussa.ndiaye", prenom="Moussa", nom="Ndiaye", mot_de_passe=MOT_DE_PASSE
    )


@pytest.fixture
def api():
    return APIClient()


def connecter(api, identifiant="awa.diallo", mot_de_passe=MOT_DE_PASSE, client="mobile"):
    return api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": identifiant, "mot_de_passe": mot_de_passe, "client": client},
        format="json",
    )


@pytest.fixture(autouse=True)
def _courriels_immediats(monkeypatch):
    """Les courriels partent après la transaction ; les tests ne valident jamais la leur."""
    from django.db import transaction

    monkeypatch.setattr(transaction, "on_commit", lambda fonction, *a, **k: fonction())

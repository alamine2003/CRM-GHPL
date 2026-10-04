import secrets

import pytest
from rest_framework.test import APIClient

from apps.identite.services import creer_utilisateur
from apps.socle.services import creer_pays


def mot_de_passe_solide() -> str:
    """Généré à l'exécution : aucun mot de passe, même de test, n'est écrit dans le dépôt."""
    return f"{secrets.token_urlsafe(12)}-Aa9"


MOT_DE_PASSE = mot_de_passe_solide()
FAUX = mot_de_passe_solide()


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


# Téléphone fictif décrit par l'application mobile à la connexion (USR-006).
TELEPHONE = {
    "identifiant_installation": "0b7e4c1a-2f6d-4e8b-9a31-5c2d7e8f9a10",
    "plateforme": "android",
    "systeme": "Android 14",
    "modele": "Galaxy A15",
    "version_app": "0.0.6",
}


def connecter(api, identifiant="awa.diallo", mot_de_passe=MOT_DE_PASSE, client="mobile"):
    corps = {"identifiant": identifiant, "mot_de_passe": mot_de_passe, "client": client}
    if client == "mobile":
        corps["appareil"] = TELEPHONE
    return api.post("/api/v1/auth/connexion/", corps, format="json")


@pytest.fixture(autouse=True)
def _courriels_immediats(monkeypatch):
    """Les courriels partent après la transaction ; les tests ne valident jamais la leur."""
    from django.db import transaction

    monkeypatch.setattr(transaction, "on_commit", lambda fonction, *a, **k: fonction())

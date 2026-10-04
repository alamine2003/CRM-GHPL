"""ORG-001 de bout en bout par l'API : création, liste du siège, archivage."""

import pytest

from apps.perimetre.tests.conftest import client_de

pytestmark = pytest.mark.django_db


def test_un_pays_cree_apparait_actif_dans_la_liste_du_siege(monde):
    """ORG-001 CA1."""
    siege = client_de(monde["ada.siege"])
    assert siege.post("/api/v1/pays/", {"code": "BJ"}, format="json").status_code == 201
    pays = {p["code"]: p for p in siege.get("/api/v1/pays/").json()}
    assert pays["BJ"]["statut"] == "actif"


def test_un_pays_archive_reste_lisible_par_le_siege(monde):
    """ORG-001 CA3 : lecture seule, mais toujours consultable."""
    siege = client_de(monde["ada.siege"], "TG")
    reponse = siege.post("/api/v1/pays/TG/statut/", {"statut": "archive"}, format="json")
    assert reponse.status_code == 200, reponse.content
    lu = client_de(monde["ada.siege"]).get("/api/v1/pays/TG/")
    assert lu.status_code == 200 and lu.json()["statut"] == "archive"
    retour = siege.post("/api/v1/pays/TG/statut/", {"statut": "actif"}, format="json")
    assert retour.status_code == 400

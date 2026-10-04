"""Isolation entre pays et rôles (USR-001 CA2, USR-002 CA2, RG-001, SEC-008 — première partie)."""

import pytest

from apps.identite.models import RoleUtilisateur
from apps.socle.models import ParametrePays

from .conftest import client_de

pytestmark = pytest.mark.django_db


def test_un_utilisateur_sans_role_ne_voit_rien(monde):
    """USR-001 CA2."""
    client = client_de(monde["sansrole.sn"])
    assert client.get("/api/v1/pays/").status_code == 403
    assert client.get("/api/v1/utilisateurs/").status_code == 403
    perimetre = client.get("/api/v1/auth/perimetre/").json()
    assert perimetre["roles"] == [] and perimetre["actions"] == []


def test_un_pays_ne_voit_que_lui_meme(monde):
    client = client_de(monde["resp.sn"])
    assert [p["code"] for p in client.get("/api/v1/pays/").json()] == ["SN"]
    # Hors périmètre : 404, sans révéler que le Togo existe.
    reponse = client.get("/api/v1/pays/TG/")
    assert reponse.status_code == 404 and reponse.json()["code"] == "introuvable"
    assert client.get("/api/v1/pays/ZZ/").status_code == 404


def test_comptes_isoles_par_pays(monde):
    client = client_de(monde["admin.sn"])
    identifiants = {u["identifiant"] for u in client.get("/api/v1/utilisateurs/").json()}
    assert monde["deleg.sn"].username in identifiants
    assert not {i for i in identifiants if i.endswith(".tg")}
    assert not identifiants & {monde["ada.siege"].username, monde["dina.direction"].username}
    assert client.get(f"/api/v1/utilisateurs/{monde['deleg.tg'].id}/").status_code == 404
    assert client.get(f"/api/v1/utilisateurs/{monde['ada.siege'].id}/roles/").status_code == 404


def test_un_admin_pays_ne_modifie_pas_un_autre_pays(monde):
    client = client_de(monde["admin.sn"])
    reponse = client.put(
        "/api/v1/pays/TG/parametres/distance_pointage_m/", {"valeur": 999}, format="json"
    )
    assert reponse.status_code == 404
    assert not ParametrePays.objects.filter(pays=monde["tg"]).exists()


def test_en_tete_x_pays_d_un_autre_pays_refuse(monde):
    client = client_de(monde["admin.sn"], pays="TG")
    reponse = client.get("/api/v1/pays/")
    assert reponse.status_code == 403 and reponse.json()["code"] == "pays_non_autorise"


def test_le_siege_choisit_son_pays_ou_la_vue_consolidee(monde):
    consolide = client_de(monde["dina.direction"])
    assert {p["code"] for p in consolide.get("/api/v1/pays/").json()} == {"SN", "TG"}
    perimetre = consolide.get("/api/v1/auth/perimetre/").json()
    assert perimetre["vue_consolidee"] is True and perimetre["pays_actif"] is None
    togo = client_de(monde["dina.direction"], pays="TG")
    assert [p["code"] for p in togo.get("/api/v1/pays/").json()] == ["TG"]
    comptes = {u["identifiant"] for u in togo.get("/api/v1/utilisateurs/").json()}
    assert comptes and all(i.endswith(".tg") for i in comptes)


def test_la_direction_du_siege_ne_modifie_rien(monde):
    client = client_de(monde["dina.direction"], pays="SN")
    assert client.post("/api/v1/pays/", {"code": "BJ"}, format="json").status_code == 403
    assert (
        client.put(
            "/api/v1/pays/SN/parametres/distance_pointage_m/", {"valeur": 300}, format="json"
        ).status_code
        == 403
    )


def test_perimetre_expose_roles_et_actions(monde):
    perimetre = client_de(monde["admin.sn"]).get("/api/v1/auth/perimetre/").json()
    assert perimetre["pays_actif"]["code"] == "SN"
    assert perimetre["roles"] == ["admin_pays"]
    assert "utilisateurs.gerer" in perimetre["actions"]
    assert "pays.creer" not in perimetre["actions"]
    assert [p["code"] for p in perimetre["pays_accessibles"]] == ["SN"]


def test_role_termine_ne_donne_plus_acces(monde):
    from apps.identite.services import retirer_role

    role = RoleUtilisateur.objects.get(utilisateur=monde["admin.sn"])
    retirer_role(role, par=monde["ada.siege"])
    assert client_de(monde["admin.sn"]).get("/api/v1/utilisateurs/").status_code == 403

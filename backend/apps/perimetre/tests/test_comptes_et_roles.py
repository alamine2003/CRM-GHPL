"""USR-003 (gestion des comptes) et ORG-002 (désignations par le siège)."""

import pytest
from django.core.management import CommandError, call_command

from apps.identite.models import Role, RoleUtilisateur

from .conftest import client_de

pytestmark = pytest.mark.django_db


def test_admin_pays_cree_un_compte_dans_son_pays_et_envoie_le_lien(monde, mailoutbox):
    client = client_de(monde["admin.sn"])
    reponse = client.post(
        "/api/v1/utilisateurs/",
        {"identifiant": "moussa.fall", "prenom": "Moussa", "nom": "Fall",
         "courriel": "moussa.fall@exemple.org"},
        format="json",
    )  # fmt: skip
    assert reponse.status_code == 201
    assert reponse.json()["pays_principal"]["code"] == "SN"
    assert len(mailoutbox) == 1


def test_creation_refusee_pour_un_compte_generique(monde):
    reponse = client_de(monde["admin.sn"]).post(
        "/api/v1/utilisateurs/", {"identifiant": "admin", "prenom": "A", "nom": "B"}, format="json"
    )
    assert reponse.status_code == 400 and reponse.json()["code"] == "donnees_invalides"


def test_admin_pays_attribue_un_role_terrain(monde):
    client = client_de(monde["admin.sn"])
    cible = monde["sansrole.sn"]
    reponse = client.post(
        f"/api/v1/utilisateurs/{cible.id}/roles/", {"role": "delegue"}, format="json"
    )
    assert reponse.status_code == 201
    assert (
        reponse.json()["pays"] == "SN"
        and reponse.json()["attribue_par"] == monde["admin.sn"].username
    )
    doublon = client.post(
        f"/api/v1/utilisateurs/{cible.id}/roles/", {"role": "delegue"}, format="json"
    )
    assert doublon.json()["code"] == "role_deja_attribue"


@pytest.mark.parametrize("role", ["responsable_pays", "admin_pays", "admin_siege"])
def test_admin_pays_ne_designe_pas_les_responsables(monde, role):
    """ORG-002 : seul l'administrateur du siège désigne responsables et administrateurs pays."""
    reponse = client_de(monde["admin.sn"]).post(
        f"/api/v1/utilisateurs/{monde['sansrole.sn'].id}/roles/", {"role": role}, format="json"
    )
    assert reponse.status_code == 403


def test_le_siege_designe_un_responsable_et_garde_l_historique(monde):
    """ORG-002 CA1 et CA2."""
    siege = client_de(monde["ada.siege"], pays="SN")
    cible = monde["sansrole.sn"]
    designation = siege.post(
        f"/api/v1/utilisateurs/{cible.id}/roles/", {"role": "responsable_pays"}, format="json"
    ).json()
    ancien = RoleUtilisateur.objects.get(utilisateur=monde["resp.sn"], role=Role.RESPONSABLE_PAYS)
    assert siege.post(f"/api/v1/roles/{ancien.id}/retirer/").status_code == 200
    historique = siege.get("/api/v1/pays/SN/designations/").json()
    responsables = [(r["role"], r["actif"]) for r in historique if r["role"] == "responsable_pays"]
    assert sorted(responsables) == [("responsable_pays", False), ("responsable_pays", True)]
    assert designation["debut"] is not None
    # CA2 : chaque désignation garde son auteur et ses dates, y compris celle qui a pris fin.
    passee = next(r for r in historique if r["id"] == str(ancien.id))
    assert passee["fin"] is not None and passee["retire_par"] == monde["ada.siege"].username
    nouvelle = next(r for r in historique if r["id"] == designation["id"])
    assert nouvelle["attribue_par"] == monde["ada.siege"].username and nouvelle["fin"] is None


def test_un_role_de_pays_porte_sur_le_pays_du_compte(monde):
    reponse = client_de(monde["ada.siege"]).post(
        f"/api/v1/utilisateurs/{monde['ada.siege'].id}/roles/", {"role": "delegue"}, format="json"
    )
    assert reponse.json()["code"] == "pays_requis"


def test_role_du_siege_refuse_pour_un_compte_de_pays(monde):
    reponse = client_de(monde["ada.siege"]).post(
        f"/api/v1/utilisateurs/{monde['sansrole.sn'].id}/roles/", {"role": "direction_siege"},
        format="json",
    )  # fmt: skip
    assert reponse.status_code == 400 and reponse.json()["code"] == "role_reserve_siege"


def test_role_du_siege_refuse_pour_un_compte_de_pays_metier(monde):
    from apps.identite.services import attribuer_role
    from apps.socle.erreurs import ErreurMetier

    with pytest.raises(ErreurMetier, match="siège"):
        attribuer_role(monde["sansrole.sn"], Role.DIRECTION_SIEGE, None, par=None)


def test_suspension_et_reinitialisation_par_l_admin_pays(monde, mailoutbox):
    client = client_de(monde["admin.sn"])
    cible = monde["deleg.sn"]
    assert client.post(f"/api/v1/utilisateurs/{cible.id}/suspendre/").json()["actif"] is False
    assert client.post(f"/api/v1/utilisateurs/{cible.id}/reactiver/").json()["actif"] is True
    client.post(f"/api/v1/utilisateurs/{cible.id}/reinitialiser/")
    assert len(mailoutbox) == 0  # compte de test sans courriel : lien créé, rien envoyé
    assert client.post(f"/api/v1/utilisateurs/{monde['admin.sn'].id}/suspendre/").json()[
        "code"
    ] == ("auto_suspension")


def test_commande_attribuer_role(monde, capsys):
    call_command("attribuer_role", monde["sansrole.tg"].username, "superviseur")
    assert RoleUtilisateur.objects.filter(
        utilisateur=monde["sansrole.tg"], role="superviseur"
    ).exists()
    with pytest.raises(CommandError, match="siège"):
        call_command("attribuer_role", monde["sansrole.sn"].username, "admin_siege")

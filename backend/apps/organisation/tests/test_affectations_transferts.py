"""Affectations multi-pays (ORG-009) et transferts (ORG-010)."""

from datetime import timedelta

import pytest

from apps.identite.models import AffectationPays, RoleUtilisateur, Transfert
from apps.identite.services import accorder_affectation
from apps.organisation import services
from apps.organisation.models import Occupation
from apps.perimetre.matrice import MATRICE, Action
from apps.perimetre.tests.conftest import client_de
from apps.perimetre.tests.test_matrice import COMPTE_PAR_ROLE
from apps.socle.services import aujourdhui

pytestmark = pytest.mark.django_db


def accorder(client, compte, **corps):
    corps = {"pays": "TG", "role": "df", "motif": "Intérim du DF Togo", **corps}
    return client.post(f"/api/v1/utilisateurs/{compte.pk}/affectations/", corps, format="json")


@pytest.mark.parametrize("role", list(COMPTE_PAR_ROLE))
def test_seul_l_administrateur_du_siege_accorde_une_affectation(monde, role):
    acteur = monde[COMPTE_PAR_ROLE[role]]
    pays = "SN" if role in {"admin_siege", "direction_siege"} else None
    reponse = accorder(client_de(acteur, pays), monde["df.sn"])
    if role in MATRICE[Action.AFFECTATIONS_GERER]:
        assert reponse.status_code == 201, reponse.content
    else:
        assert reponse.status_code in {403, 404}, (role, reponse.status_code)


def test_l_affecte_choisit_le_pays_et_ne_voit_que_ses_donnees(monde):
    """ORG-009 CA1."""
    accorder(client_de(monde["ada.siege"]), monde["df.sn"])
    df = monde["df.sn"]
    perimetre = client_de(df).get("/api/v1/auth/perimetre/").json()
    assert {p["code"] for p in perimetre["pays_accessibles"]} == {"SN", "TG"}
    au_togo = client_de(df, "TG").get("/api/v1/auth/perimetre/").json()
    assert au_togo["pays_actif"]["code"] == "TG" and au_togo["roles"] == ["df"]
    services.creer_zone(monde["sn"], "Nord")
    services.creer_zone(monde["tg"], "Maritime")
    zones = client_de(df, "TG").get("/api/v1/organisation/zones/").json()
    assert [z["libelle"] for z in zones] == ["Maritime"]
    # L'administrateur du Togo voit le compte affecté et peut lui donner un autre rôle.
    comptes = client_de(monde["admin.tg"]).get("/api/v1/utilisateurs/").json()
    assert "omar.sn" in {c["identifiant"] for c in comptes}
    role = client_de(monde["admin.tg"]).post(
        f"/api/v1/utilisateurs/{df.pk}/roles/", {"role": "superviseur"}, format="json"
    )
    assert role.status_code == 201 and role.json()["pays"] == "TG"


def test_a_la_fin_de_l_affectation_l_acces_est_retire(monde):
    """ORG-009 CA2 : sans action de quiconque, la date de fin coupe l'accès."""
    df, tg = monde["df.sn"], monde["tg"]
    affectation = accorder_affectation(df, tg, "df", "Intérim", par=monde["ada.siege"])
    assert client_de(df, "TG").get("/api/v1/auth/perimetre/").status_code == 200
    # On simule le passage du temps : l'affectation a pris fin hier.
    hier = aujourdhui(tg) - timedelta(days=1)
    AffectationPays.objects.filter(pk=affectation.pk).update(
        debut=hier - timedelta(days=5), fin=hier
    )
    reponse = client_de(df, "TG").get("/api/v1/auth/perimetre/")
    assert reponse.status_code == 403 and reponse.json()["code"] == "pays_non_autorise"


def test_terminer_une_affectation_termine_ses_roles(monde):
    df, siege = monde["df.sn"], client_de(monde["ada.siege"])
    affectation = accorder(siege, df).json()
    fin = siege.post(f"/api/v1/affectations/{affectation['id']}/terminer/", {}, format="json")
    assert fin.status_code == 200 and fin.json()["active"] is False
    assert not any(
        r.est_actif() for r in RoleUtilisateur.objects.filter(utilisateur=df, pays__code="TG")
    )
    assert client_de(df, "TG").get("/api/v1/auth/perimetre/").status_code == 403


def test_regles_d_une_affectation(monde):
    siege = client_de(monde["ada.siege"])
    assert accorder(siege, monde["df.sn"], pays="SN").json()["code"] == "pays_principal"
    assert accorder(siege, monde["df.sn"], role="admin_siege").json()["code"] == "role_invalide"
    assert accorder(siege, monde["df.sn"], motif=" ").status_code == 400
    assert accorder(siege, monde["df.sn"]).status_code == 201
    assert accorder(siege, monde["df.sn"]).json()["code"] == "affectation_existante"


def test_transfert_l_utilisateur_ne_voit_plus_l_ancien_pays(monde):
    """ORG-010 CA1 et CA2."""
    sn = monde["sn"]
    deleg = monde["deleg.sn"]
    poste = services.creer_poste(sn, "vm", "VM Thiès", [], [])
    occupation = services.occuper(poste, deleg)
    reponse = client_de(monde["ada.siege"]).post(
        f"/api/v1/utilisateurs/{deleg.pk}/transferts/",
        {"pays": "TG", "motif": "Mutation à Lomé", "role": "delegue"},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["pays_origine"] == "SN" and reponse.json()["pays_destination"] == "TG"
    deleg.refresh_from_db()
    assert deleg.pays_principal.code == "TG"
    # CA1 : plus rien au Sénégal.
    assert client_de(deleg, "SN").get("/api/v1/auth/perimetre/").status_code == 403
    perimetre = client_de(deleg).get("/api/v1/auth/perimetre/").json()
    assert perimetre["pays_actif"]["code"] == "TG" and perimetre["roles"] == ["delegue"]
    # CA2 : l'historique reste au Sénégal, consultable par le Sénégal.
    occupation = Occupation.objects.get(pk=occupation.pk)
    assert occupation.pays == sn and occupation.fin == aujourdhui(sn)
    historique = client_de(monde["admin.sn"]).get(
        f"/api/v1/organisation/postes/{poste.pk}/occupations/"
    )
    assert [o["personne"]["identifiant"] for o in historique.json()] == ["gabriel.sn"]
    assert Transfert.objects.filter(utilisateur=deleg).count() == 1


def test_seul_le_siege_autorise_un_transfert(monde):
    reponse = client_de(monde["admin.sn"]).post(
        f"/api/v1/utilisateurs/{monde['deleg.sn'].pk}/transferts/",
        {"pays": "TG", "motif": "Mutation"},
        format="json",
    )
    assert reponse.status_code == 403


def test_le_pays_d_accueil_ne_touche_pas_aux_roles_d_origine(monde):
    """Isolation (USR-002) : l'administrateur du Togo ne voit ni ne retire les rôles
    sénégalais d'un compte affecté chez lui."""
    df = monde["df.sn"]
    accorder_affectation(df, monde["tg"], "dm", "Intérim", par=monde["ada.siege"])
    admin_tg = client_de(monde["admin.tg"])
    roles = admin_tg.get(f"/api/v1/utilisateurs/{df.pk}/roles/").json()
    assert {r["pays"] for r in roles} == {"TG"}
    compte = next(c for c in admin_tg.get("/api/v1/utilisateurs/").json() if c["id"] == str(df.pk))
    assert compte["roles"] == ["dm"]
    role_sn = RoleUtilisateur.objects.get(utilisateur=df, pays__code="SN")
    assert admin_tg.post(f"/api/v1/roles/{role_sn.pk}/retirer/").status_code == 404
    assert client_de(monde["admin.sn"]).get(f"/api/v1/utilisateurs/{df.pk}/").json()["roles"] == [
        "df"
    ]

"""USR-002 CA1 : chaque cellule de la matrice prd.md §6.3 (rôle × action) couverte par un test."""

import pytest

from apps.identite.models import Role
from apps.perimetre.matrice import ACTIONS_TECHNIQUES, MATRICE, Action

from .conftest import client_de

pytestmark = pytest.mark.django_db

# Attendu par action : rôles autorisés (prd.md §6.3). Toute divergence avec MATRICE échoue.
ATTENDU = {
    Action.PAYS_CREER: {"admin_siege"},
    Action.PAYS_CHANGER_STATUT: {"admin_siege"},
    Action.DESIGNER_RESPONSABLES_PAYS: {"admin_siege"},
    Action.UTILISATEURS_GERER: {"admin_siege", "admin_pays"},
    Action.ROLES_ATTRIBUER: {"admin_siege", "admin_pays"},
    Action.PARAMETRES_MODIFIER: {"admin_siege", "admin_pays"},
    Action.PARAMETRES_LIRE: {"admin_siege", "direction_siege", "responsable_pays", "admin_pays"},
    Action.UTILISATEURS_LIRE: {"admin_siege", "direction_siege", "responsable_pays", "admin_pays"},
    Action.ORGANISATION_GERER: {"admin_siege", "admin_pays"},
    Action.ORGANISATION_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
    },  # fmt: skip
    Action.AFFECTATIONS_GERER: {"admin_siege"},
    Action.APPAREILS_REVOQUER: {"admin_siege", "admin_pays"},
    Action.EXPLOITATION_LIRE: {"admin_technique", "admin_siege"},
    Action.REFERENTIELS_GERER: {"admin_siege", "admin_pays"},
    Action.REFERENTIELS_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
        "delegue",
    },  # fmt: skip
    Action.PAYS_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
        "delegue",
    },  # fmt: skip
}


def test_la_matrice_suit_le_prd():
    assert {action: set(roles) for action, roles in MATRICE.items()} == ATTENDU


def test_l_administrateur_technique_n_a_aucune_action_metier():
    metier = {a: r for a, r in MATRICE.items() if a not in ACTIONS_TECHNIQUES}
    assert all(Role.ADMIN_TECHNIQUE not in roles for roles in metier.values())


COMPTE_PAR_ROLE = {
    "admin_siege": "ada.siege",
    "direction_siege": "dina.direction",
    "admin_technique": "theo.technique",
    "responsable_pays": "resp.sn",
    "admin_pays": "admin.sn",
    "df": "df.sn",
    "dm": "dm.sn",
    "superviseur": "sup.sn",
    "delegue": "deleg.sn",
}

# Une requête représentative par action, sur le Sénégal (pays du compte ou X-Pays pour le siège).
REQUETES = {
    Action.PAYS_LIRE: ("get", "/api/v1/pays/SN/", None, 200),
    Action.PAYS_CREER: ("post", "/api/v1/pays/", {"code": "BJ"}, 201),
    Action.PAYS_CHANGER_STATUT: ("post", "/api/v1/pays/SN/statut/", {"statut": "suspendu"}, 200),
    Action.PARAMETRES_LIRE: ("get", "/api/v1/pays/SN/parametres/", None, 200),
    Action.PARAMETRES_MODIFIER: (
        "put",
        "/api/v1/pays/SN/parametres/distance_pointage_m/",
        {"valeur": 300},
        200,
    ),  # fmt: skip
    Action.UTILISATEURS_LIRE: ("get", "/api/v1/utilisateurs/", None, 200),
    Action.ORGANISATION_LIRE: ("get", "/api/v1/organisation/postes/", None, 200),
    Action.EXPLOITATION_LIRE: ("get", "/api/v1/exploitation/", None, 200),
    Action.ORGANISATION_GERER: ("post", "/api/v1/organisation/zones/", {"libelle": "Nord"}, 201),
    Action.UTILISATEURS_GERER: (
        "post",
        "/api/v1/utilisateurs/",
        {"identifiant": "nouveau.compte", "prenom": "N", "nom": "C"},
        201,
    ),  # fmt: skip
    Action.REFERENTIELS_LIRE: ("get", "/api/v1/referentiel/valeurs/", None, 200),
    Action.REFERENTIELS_GERER: (
        "post", "/api/v1/referentiel/valeurs/", {"liste": "specialite", "libelle": "Allergo"}, 201,
    ),  # fmt: skip
    # Routes qui désignent un objet : l'adresse dépend du jeu de données (fonction de `monde`).
    Action.ROLES_ATTRIBUER: (
        "post", lambda m: f"/api/v1/utilisateurs/{m['sansrole.sn'].pk}/roles/",
        {"role": "delegue"}, 201,
    ),
    Action.DESIGNER_RESPONSABLES_PAYS: (
        "post", lambda m: f"/api/v1/utilisateurs/{m['sansrole.sn'].pk}/roles/",
        {"role": "responsable_pays"}, 201,
    ),
    Action.AFFECTATIONS_GERER: (
        "post", lambda m: f"/api/v1/utilisateurs/{m['df.sn'].pk}/affectations/",
        {"pays": "TG", "role": "df", "motif": "Intérim du DF Togo"}, 201,
    ),
    Action.APPAREILS_REVOQUER: (
        "post", lambda m: f"/api/v1/appareils/{_telephone(m).pk}/revoquer/", {}, 200,
    ),
}  # fmt: skip


def _telephone(monde):
    from apps.identite.models import Appareil

    return Appareil.objects.get_or_create(
        utilisateur=monde["deleg.sn"], identifiant_installation="matrice-telephone-01",
        defaults={"plateforme": "android"},
    )[0]  # fmt: skip


def test_chaque_action_a_sa_requete():
    """Une nouvelle action sans requête représentative fait échouer la suite."""
    assert set(REQUETES) == set(MATRICE)


@pytest.mark.parametrize("role", list(COMPTE_PAR_ROLE))
@pytest.mark.parametrize("action", list(REQUETES))
def test_chaque_role_chaque_action(monde, role, action):
    compte = monde[COMPTE_PAR_ROLE[role]]
    # Le siège choisit le Sénégal ; l'administrateur technique n'a aucun pays.
    pays = "SN" if role in {"admin_siege", "direction_siege"} else None
    methode, url, corps, succes = REQUETES[action]
    url = url(monde) if callable(url) else url
    reponse = getattr(client_de(compte, pays), methode)(url, corps, format="json")
    if role in MATRICE[action]:
        assert reponse.status_code == succes, reponse.content
    elif isinstance(REQUETES[action][1], str):
        assert reponse.status_code == 403, (role, action, reponse.status_code)
        assert reponse.json()["code"] == "interdit"
    else:
        # Un objet hors de vue répond « introuvable » sans en révéler l'existence (USR-002 CA2).
        assert reponse.status_code in {403, 404}, (role, action, reponse.status_code)

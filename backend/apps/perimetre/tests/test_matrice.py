"""USR-002 CA1 : chaque cellule de la matrice prd.md §6.3 (rôle × action) couverte par un test."""

import pytest

from apps.identite.models import Role
from apps.perimetre.matrice import ACTIONS_TECHNIQUES, MATRICE, Action

from .conftest import client_de

pytestmark = pytest.mark.django_db

# Attendu par action : rôles autorisés (prd.md §6.3). Toute divergence avec MATRICE échoue.
ATTENDU = {
    Action.PAYS_CREER: {"admin_siege"},
    Action.PROPOSITIONS_CREER: {"delegue"},
    Action.PROPOSITIONS_TRANCHER: {"admin_pays", "superviseur"},
    Action.JOURS_FERIES_GERER: {"admin_pays"},
    Action.PLANNINGS_PREPARER: {"superviseur", "delegue"},
    Action.PLANNINGS_VALIDER: {"dm", "superviseur"},
    Action.RAPPORTS_REDIGER: {"superviseur", "delegue"},
    Action.RAPPORTS_LIRE: {"responsable_pays", "df", "dm", "superviseur", "delegue"},
    Action.RAPPORTS_VALIDER: {"dm", "superviseur"},
    Action.REMPLACEMENTS_GERER: {"admin_pays", "dm", "superviseur"},
    Action.NOTIFICATIONS_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
        "delegue",
    },  # fmt: skip
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
    Action.PROSPECTS_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
        "delegue",
    },  # fmt: skip
    Action.PROSPECTS_CREER: {"admin_pays", "delegue"},
    Action.PROSPECTS_GERER: {"admin_pays"},
    Action.IMPORTS_GERER: {"admin_pays"},
    Action.CIBLES_LIRE: {
        "admin_siege",
        "direction_siege",
        "responsable_pays",
        "admin_pays",
        "df",
        "dm",
        "superviseur",
        "delegue",
    },  # fmt: skip
    Action.CIBLES_GERER: {"admin_pays", "superviseur"},
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
    Action.PROSPECTS_LIRE: ("get", "/api/v1/prospects/", None, 200),
    Action.PROSPECTS_CREER: ("post", "/api/v1/prospects/", lambda m: _fiche(m), 201),
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
    Action.PROSPECTS_GERER: (
        "post", lambda m: f"/api/v1/prospects/{_prospect_a_valider(m).pk}/valider/", {}, 200,
    ),
    Action.IMPORTS_GERER: ("get", "/api/v1/imports/", None, 200),
    Action.CIBLES_LIRE: ("get", "/api/v1/ciblage/postes/", None, 200),
    # Sur un poste rattaché au superviseur (le périmètre fin est vérifié dans test_ciblage).
    Action.CIBLES_GERER: (
        "get", lambda m: f"/api/v1/ciblage/postes/{_poste_rattache(m).pk}/candidats/", None, 200,
    ),
    Action.APPAREILS_REVOQUER: (
        "post", lambda m: f"/api/v1/appareils/{_telephone(m).pk}/revoquer/", {}, 200,
    ),
    # PRP-014 : proposition sur une fiche commune ; décision sur celle d'un délégué dont le
    # poste est rattaché au superviseur.
    Action.PROPOSITIONS_CREER: (
        "post", "/api/v1/propositions/", lambda m: _proposition(m), 201,
    ),
    Action.PROPOSITIONS_TRANCHER: (
        "post", lambda m: f"/api/v1/propositions/{_proposition_en_attente(m).pk}/trancher/",
        {"decision": "refuser"}, 200,
    ),
    Action.JOURS_FERIES_GERER: ("get", "/api/v1/jours-feries/", None, 200),
    Action.PLANNINGS_PREPARER: ("get", "/api/v1/plannings/semaine/", None, 200),
    Action.PLANNINGS_VALIDER: ("get", "/api/v1/plannings/a-valider/", None, 200),
    Action.NOTIFICATIONS_LIRE: ("get", "/api/v1/notifications/", None, 200),
    Action.REMPLACEMENTS_GERER: ("get", "/api/v1/remplacements/", None, 200),
    # Le rapport ne s'ouvre que sur ses propres visites (test_rapport) : ici, l'action passe et
    # la visite inconnue répond « introuvable ».
    Action.RAPPORTS_REDIGER: (
        "get", "/api/v1/visites/00000000-0000-0000-0000-000000000000/rapport/", None, 404,
    ),
    Action.RAPPORTS_LIRE: (
        "get", "/api/v1/prospects/00000000-0000-0000-0000-000000000000/rapports/", None, 404,
    ),
    Action.RAPPORTS_VALIDER: ("get", "/api/v1/rapports/a-traiter/", None, 200),
}  # fmt: skip


def _fiche_commune(monde):
    from apps.prospects.models import Prospect
    from apps.prospects.services import creer_prospect
    from apps.referentiel.models import Valeur

    fiche = Prospect.objects.filter(nom="MATRICE").first()
    if fiche is None:
        autre = Valeur.objects.get(pays=monde["sn"], liste="type_prospect", code="grossiste")
        fiche = creer_prospect(monde["sn"], monde["admin.sn"], actif=True, nom="Matrice",
                               type=autre, potentiel="C")  # fmt: skip
    return fiche


def _proposition(monde):
    return {"prospect": str(_fiche_commune(monde).pk),
            "changements": {"courriel": "matrice@exemple.invalid"}}  # fmt: skip


def _proposition_en_attente(monde):
    from apps.organisation import services as org
    from apps.organisation.models import Occupation
    from apps.prospects.propositions import proposer

    poste = _poste_rattache(monde)
    if not Occupation.objects.filter(poste=poste).exists():
        org.occuper(poste, monde["deleg.sn"])
    return proposer(monde["deleg.sn"], _fiche_commune(monde), {"telephone_pro": "33 800 00 01"})


def _poste_rattache(monde):
    """Poste rattaché au superviseur du Sénégal : le superviseur et l'administrateur pays le
    gèrent."""
    from apps.organisation import services as org
    from apps.organisation.models import Poste

    poste = Poste.objects.filter(libelle="VM Matrice").first()
    if poste is None:
        sn = monde["sn"]
        secteur = org.creer_secteur(sn, org.creer_zone(sn, "Zone matrice"), "Secteur matrice")
        poste = org.creer_poste(sn, "vm", "VM Matrice", [], [secteur])
        org.rattacher(poste, monde["sup.sn"])
    return poste


def _telephone(monde):
    from apps.identite.models import Appareil

    return Appareil.objects.get_or_create(
        utilisateur=monde["deleg.sn"], identifiant_installation="matrice-telephone-01",
        defaults={"plateforme": "android"},
    )[0]  # fmt: skip


def _fiche(monde):
    from apps.referentiel.models import Valeur

    autre = Valeur.objects.get(pays=monde["sn"], liste="type_prospect", code="grossiste")
    return {"nom": "Faye", "type": str(autre.pk), "potentiel": "B"}


def _prospect_a_valider(monde):
    from apps.prospects.services import creer_prospect
    from apps.referentiel.models import Valeur

    autre = Valeur.objects.get(pays=monde["sn"], liste="type_prospect", code="grossiste")
    return creer_prospect(monde["sn"], monde["deleg.sn"], actif=False, nom="Kane",
                          type=autre, potentiel="C")  # fmt: skip


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
    corps = corps(monde) if callable(corps) else corps
    reponse = getattr(client_de(compte, pays), methode)(url, corps, format="json")
    if role in MATRICE[action]:
        assert reponse.status_code == succes, reponse.content
    elif isinstance(REQUETES[action][1], str):
        assert reponse.status_code == 403, (role, action, reponse.status_code)
        assert reponse.json()["code"] == "interdit"
    else:
        # Un objet hors de vue répond « introuvable » sans en révéler l'existence (USR-002 CA2).
        assert reponse.status_code in {403, 404}, (role, action, reponse.status_code)

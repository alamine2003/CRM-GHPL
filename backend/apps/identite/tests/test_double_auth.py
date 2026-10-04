"""SEC-003 (double authentification) et SEC-004 (sessions)."""

import pyotp
import pytest

from apps.identite import double_auth
from apps.identite.models import Role, Session
from apps.identite.services import attribuer_role
from apps.perimetre.tests.conftest import client_de

from .conftest import MOT_DE_PASSE, connecter

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_pays(delegue):
    """Le compte de test devient administrateur pays : la double authentification s'impose."""
    attribuer_role(delegue, Role.ADMIN_PAYS, delegue.pays_principal, par=None)
    return delegue


def code_actuel(utilisateur, decalage=0):
    import time

    secret = double_auth._secret(double_auth.dossier(utilisateur))
    totp = pyotp.TOTP(secret)
    return totp.at(time.time() + decalage * totp.interval)


def activer(utilisateur):
    double_auth.initialiser(utilisateur)
    return double_auth.activer(utilisateur, code_actuel(utilisateur))


def test_un_role_sensible_sans_double_auth_n_accede_a_aucune_donnee(api, admin_pays):
    """SEC-003 CA1."""
    jetons = connecter(api, client="portail").json()
    assert jetons["double_auth_a_activer"] is True
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {jetons['acces']}")
    for url in ("/api/v1/utilisateurs/", "/api/v1/auth/perimetre/", "/api/v1/organisation/zones/"):
        reponse = api.get(url)
        assert (
            reponse.status_code == 403
            and reponse.json()["code"] == "double_authentification_requise"
        )
    # Le compte peut en revanche s'inscrire.
    assert api.get("/api/v1/auth/moi/").json()["double_auth_requise"] is True
    assert api.post("/api/v1/auth/double-auth/initialiser/").status_code == 200


def test_activation_puis_acces(api, admin_pays):
    jetons = connecter(api, client="portail").json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {jetons['acces']}")
    init = api.post("/api/v1/auth/double-auth/initialiser/").json()
    assert init["uri"].startswith("otpauth://totp/INNOV%20CRM:awa.diallo")
    code = pyotp.TOTP(init["secret"]).now()
    activation = api.post("/api/v1/auth/double-auth/activer/", {"code": code}, format="json")
    assert activation.status_code == 200 and len(activation.json()["codes_secours"]) == 10
    assert api.get("/api/v1/auth/perimetre/").status_code == 200


def test_connexion_en_deux_etapes(api, admin_pays):
    activer(admin_pays)
    etape = connecter(api, client="portail")
    assert etape.status_code == 202 and etape.json()["etape"] == "code_requis"
    jeton = etape.json()["jeton_etape"]
    faux = api.post("/api/v1/auth/connexion/code/", {"jeton_etape": jeton, "code": "000000"},
                    format="json")  # fmt: skip
    assert faux.status_code == 401 and faux.json()["code"] == "code_invalide"
    bon = api.post(
        "/api/v1/auth/connexion/code/",
        {"jeton_etape": jeton, "code": code_actuel(admin_pays, 1)},
        format="json",
    )
    assert bon.status_code == 200 and bon.json()["double_auth_a_activer"] is False
    session = Session.objects.filter(utilisateur=admin_pays).latest("cree_le")
    assert session.double_auth_validee


def test_un_code_ne_sert_qu_une_fois(admin_pays):
    activer(admin_pays)
    from django.db import transaction

    code = code_actuel(admin_pays, 1)
    with transaction.atomic():
        assert double_auth.verifier(admin_pays, code)
    with transaction.atomic():
        assert not double_auth.verifier(admin_pays, code)


def test_un_code_de_secours_remplace_le_telephone_une_seule_fois(api, admin_pays):
    codes = activer(admin_pays)
    for attendu in (200, 401):
        jeton = connecter(api, client="portail").json()["jeton_etape"]
        reponse = api.post(
            "/api/v1/auth/connexion/code/", {"jeton_etape": jeton, "code": codes[0]}, format="json"
        )
        assert reponse.status_code == attendu


def test_cinq_codes_faux_verrouillent_le_compte(api, admin_pays):
    """SEC-002 s'applique aussi aux codes."""
    activer(admin_pays)
    jeton = connecter(api, client="portail").json()["jeton_etape"]
    for _ in range(5):
        api.post("/api/v1/auth/connexion/code/", {"jeton_etape": jeton, "code": "111111"},
                 format="json")  # fmt: skip
    admin_pays.refresh_from_db()
    assert admin_pays.est_verrouille


def test_un_role_sensible_ne_peut_pas_desactiver(api, admin_pays):
    activer(admin_pays)
    client = client_de(admin_pays)
    reponse = client.post("/api/v1/auth/double-auth/desactiver/",
                          {"code": code_actuel(admin_pays, 1)}, format="json")  # fmt: skip
    assert reponse.json()["code"] == "double_auth_obligatoire"


def test_l_administrateur_reinitialise_un_telephone_perdu(monde):
    compte = monde["admin.sn"]
    activer(compte)
    reponse = client_de(monde["ada.siege"], "SN").post(
        f"/api/v1/utilisateurs/{compte.pk}/reinitialiser_double_auth/"
    )
    assert reponse.status_code == 200
    assert not double_auth.est_active(compte)


def test_mes_sessions_et_revocation_a_distance(api, delegue):
    """SEC-004 CA1 : une session révoquée échoue à l'appel suivant."""
    autre = connecter(api).json()["acces"]
    courant = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {courant}")
    sessions = api.get("/api/v1/auth/sessions/").json()
    assert len(sessions) == 2 and sum(s["courante"] for s in sessions) == 1
    assert all(s["adresse"] is None or s["adresse"].endswith(".x.x") for s in sessions)
    assert api.post("/api/v1/auth/sessions/autres/revoquer/").status_code == 204
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {autre}")
    assert api.get("/api/v1/auth/moi/").status_code == 401
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {courant}")
    assert api.get("/api/v1/auth/moi/").status_code == 200


def test_on_ne_revoque_pas_la_session_d_un_autre(api, delegue, siege):
    session_siege = connecter(api, identifiant="moussa.ndiaye", client="portail")
    assert session_siege.status_code == 200
    autre = Session.objects.filter(utilisateur=siege).latest("cree_le")
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    assert api.post(f"/api/v1/auth/sessions/{autre.pk}/revoquer/").status_code == 404


def test_secret_chiffre_en_base(admin_pays):
    secret, _uri = double_auth.initialiser(admin_pays)
    assert secret not in double_auth.dossier(admin_pays).secret_chiffre
    assert MOT_DE_PASSE  # le module de test reste importé


def test_mon_activite_montre_les_connexions_reussies_et_echouees(api, delegue):
    connecter(api, mot_de_passe="faux-" + MOT_DE_PASSE)
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    activite = api.get("/api/v1/auth/activite/").json()
    assert [a["resultat"] for a in activite[:2]] == ["succes", "echec"]
    assert all(a["action"] == "connexion" for a in activite[:2])

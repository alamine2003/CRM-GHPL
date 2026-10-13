"""Connexion, verrouillage, sessions et pays suspendu (SEC-002, ORG-001 CA2)."""

from datetime import timedelta

import pytest
from django.conf import settings
from django.test import override_settings
from django.utils import timezone
from freezegun import freeze_time

from apps.identite.models import Session
from apps.socle.services import archiver_pays, suspendre_pays

from .conftest import FAUX, MOT_DE_PASSE, connecter

pytestmark = pytest.mark.django_db


def test_connexion_mobile_renvoie_les_deux_jetons(api, delegue):
    reponse = connecter(api)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["acces"] and corps["rafraichissement"]
    assert corps["expire_dans"] == 15 * 60
    assert corps["utilisateur"]["identifiant"] == "awa.diallo"
    assert corps["utilisateur"]["pays_principal"]["code"] == "SN"
    assert reponse["Cache-Control"] == "no-store"
    assert "innov_rafraichissement" not in reponse.cookies


def test_connexion_portail_met_le_rafraichissement_en_cookie_httponly(api, delegue):
    reponse = connecter(api, client="portail")
    assert reponse.json()["rafraichissement"] is None
    cookie = reponse.cookies["innov_rafraichissement"]
    assert cookie["httponly"] and cookie["samesite"] == "Strict"
    assert cookie["path"] == "/api/v1/auth/"
    assert int(cookie["max-age"]) == 30 * 60


def test_identifiant_insensible_a_la_casse(api, delegue):
    assert connecter(api, identifiant=" Awa.DIALLO ").status_code == 200


def test_connexion_par_adresse_courriel(api, delegue):
    """1.4.0 [D] : la maquette demande l'adresse courriel ; l'identifiant reste accepté."""
    assert connecter(api, identifiant=" Awa.Diallo@EXEMPLE.org ").status_code == 200
    assert connecter(api, identifiant="awa.diallo").status_code == 200


def test_meme_erreur_pour_compte_inconnu_et_mauvais_mot_de_passe(api, delegue):
    inconnu = connecter(api, identifiant="personne.inconnue")
    mauvais = connecter(api, mot_de_passe=FAUX)
    assert inconnu.status_code == mauvais.status_code == 401
    assert inconnu.json()["code"] == mauvais.json()["code"] == "identifiants_invalides"
    assert inconnu.json()["message"] == mauvais.json()["message"]


def test_message_traduit_selon_la_langue(api, delegue):
    reponse = api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "awa.diallo", "mot_de_passe": FAUX, "client": "mobile"},
        format="json",
        HTTP_ACCEPT_LANGUAGE="en",
    )
    assert reponse.json()["message"] == "Incorrect username or password."


def test_verrouillage_apres_cinq_echecs(api, delegue, mailoutbox):
    """SEC-002 CA1 : le 6e essai est refusé même avec le bon mot de passe pendant 15 min."""
    for _ in range(5):
        assert connecter(api, mot_de_passe=FAUX).status_code == 401
    reponse = connecter(api)
    assert reponse.status_code == 423
    assert reponse.json()["code"] == "compte_verrouille"
    assert "deverrouillage_le" in reponse.json()["details"]
    assert len(mailoutbox) == 1 and "verrouillé" in mailoutbox[0].subject
    with freeze_time(timezone.now() + timedelta(minutes=16)):
        assert connecter(api).status_code == 200


def test_un_succes_remet_le_compteur_a_zero(api, delegue):
    for _ in range(4):
        connecter(api, mot_de_passe=FAUX)
    assert connecter(api).status_code == 200
    for _ in range(4):
        connecter(api, mot_de_passe=FAUX)
    assert connecter(api).status_code == 200


def test_compte_desactive(api, delegue):
    delegue.is_active = False
    delegue.save()
    reponse = connecter(api)
    assert reponse.status_code == 403 and reponse.json()["code"] == "compte_desactive"


def test_pays_suspendu_refuse_la_connexion_avec_message_explicite(api, delegue, senegal):
    """ORG-001 CA2."""
    suspendre_pays(senegal)
    reponse = connecter(api)
    assert reponse.status_code == 403
    assert reponse.json()["code"] == "pays_suspendu"
    assert "Sénégal" in reponse.json()["message"]


def test_pays_archive_refuse_la_connexion(api, delegue, senegal):
    archiver_pays(senegal)
    assert connecter(api).json()["code"] == "pays_archive"


def test_le_siege_n_est_pas_bloque_par_un_pays_suspendu(api, siege, senegal):
    suspendre_pays(senegal)
    assert connecter(api, identifiant="moussa.ndiaye", client="portail").status_code == 200


def test_acces_protege_par_jeton_et_session(api, delegue):
    assert api.get("/api/v1/auth/moi/").status_code == 401
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    reponse = api.get("/api/v1/auth/moi/")
    assert reponse.status_code == 200 and reponse.json()["prenom"] == "Awa"


def test_jeton_d_acces_expire_apres_quinze_minutes(api, delegue):
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    with freeze_time(timezone.now() + timedelta(minutes=16)):
        reponse = api.get("/api/v1/auth/moi/")
    assert reponse.status_code == 401 and reponse.json()["code"] == "session_invalide"


def test_jeton_falsifie_refuse(api, delegue):
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces[:-3]}abc")
    assert api.get("/api/v1/auth/moi/").status_code == 401


def test_suspendre_le_pays_coupe_les_sessions_ouvertes(api, delegue, senegal):
    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    suspendre_pays(senegal)
    reponse = api.get("/api/v1/auth/moi/")
    assert reponse.status_code == 401 and reponse.json()["code"] == "pays_suspendu"


def test_rafraichissement_mobile_avec_rotation(api, delegue):
    premier = connecter(api).json()["rafraichissement"]
    reponse = api.post("/api/v1/auth/rafraichir/", {"rafraichissement": premier}, format="json")
    assert reponse.status_code == 200
    second = reponse.json()["rafraichissement"]
    assert second and second != premier
    assert Session.objects.get().empreinte_rafraichissement != ""


def test_jeton_de_rafraichissement_rejoue_revoque_la_session(api, delegue):
    """Rejouer un ancien jeton signale un vol : la session est fermée."""
    premier = connecter(api).json()["rafraichissement"]
    second = api.post(
        "/api/v1/auth/rafraichir/", {"rafraichissement": premier}, format="json"
    ).json()["rafraichissement"]
    rejeu = api.post("/api/v1/auth/rafraichir/", {"rafraichissement": premier}, format="json")
    assert rejeu.status_code == 401
    session = Session.objects.get()
    assert session.motif_revocation == "jeton_rejoue"
    assert (
        api.post("/api/v1/auth/rafraichir/", {"rafraichissement": second}, format="json").json()[
            "code"
        ]
        == "session_expiree"
    )


def test_rafraichissement_portail_par_cookie_et_entete(api, delegue):
    connecter(api, client="portail")
    sans_entete = api.post("/api/v1/auth/rafraichir/", {}, format="json")
    assert sans_entete.status_code == 400 and sans_entete.json()["code"] == "client_inconnu"
    reponse = api.post("/api/v1/auth/rafraichir/", {}, format="json", HTTP_X_INNOV_CLIENT="portail")
    assert reponse.status_code == 200 and reponse.json()["acces"]
    assert "innov_rafraichissement" in reponse.cookies


def _auth(**reglages):
    return override_settings(INNOV_AUTH={**settings.INNOV_AUTH, **reglages})


def test_cookie_samesite_none_est_toujours_secure(api, delegue):
    """1.0.1 : portail et API sur deux adresses *.onrender.com, sans domaine commun."""
    with _auth(COOKIE_SAMESITE="None", COOKIE_SECURISE=False):
        cookie = connecter(api, client="portail").cookies["innov_rafraichissement"]
    assert cookie["samesite"] == "None" and cookie["secure"] and cookie["httponly"]
    assert cookie["path"] == "/api/v1/auth/"


def test_samesite_none_le_cookie_n_est_lu_qu_avec_l_entete(api, delegue):
    with _auth(COOKIE_SAMESITE="None"):
        connecter(api, client="portail")
        sans = api.post("/api/v1/auth/rafraichir/", {}, format="json")
        assert sans.status_code == 400 and sans.json()["code"] == "client_inconnu"
        avec = api.post(
            "/api/v1/auth/rafraichir/", {}, format="json", HTTP_X_INNOV_CLIENT="portail"
        )
    assert avec.status_code == 200
    assert avec.cookies["innov_rafraichissement"]["samesite"] == "None"


def test_deconnexion_efface_le_cookie_avec_le_meme_samesite(api, delegue):
    with _auth(COOKIE_SAMESITE="None"):
        acces = connecter(api, client="portail").json()["acces"]
        reponse = api.post("/api/v1/auth/deconnexion/", HTTP_AUTHORIZATION=f"Bearer {acces}")
    cookie = reponse.cookies["innov_rafraichissement"]
    assert cookie["samesite"] == "None" and cookie["secure"] and int(cookie["max-age"]) == 0


def test_session_portail_expire_apres_trente_minutes_d_inactivite(api, delegue):
    connecter(api, client="portail")
    with freeze_time(timezone.now() + timedelta(minutes=31)):
        reponse = api.post(
            "/api/v1/auth/rafraichir/", {}, format="json", HTTP_X_INNOV_CLIENT="portail"
        )
    assert reponse.status_code == 401 and reponse.json()["code"] == "session_expiree"


def test_session_mobile_dure_sept_jours_glissants(api, delegue):
    jeton = connecter(api).json()["rafraichissement"]
    with freeze_time(timezone.now() + timedelta(days=6)):
        jeton = api.post(
            "/api/v1/auth/rafraichir/", {"rafraichissement": jeton}, format="json"
        ).json()["rafraichissement"]
    with freeze_time(timezone.now() + timedelta(days=12)):
        assert (
            api.post(
                "/api/v1/auth/rafraichir/", {"rafraichissement": jeton}, format="json"
            ).status_code
            == 200
        )
    with freeze_time(timezone.now() + timedelta(days=20)):
        assert (
            api.post(
                "/api/v1/auth/rafraichir/", {"rafraichissement": jeton}, format="json"
            ).status_code
            == 401
        )


def test_deconnexion_revoque_la_session(api, delegue):
    corps = connecter(api).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {corps['acces']}")
    assert api.post("/api/v1/auth/deconnexion/").status_code == 204
    assert api.get("/api/v1/auth/moi/").status_code == 401
    jeton = {"rafraichissement": corps["rafraichissement"]}
    assert api.post("/api/v1/auth/rafraichir/", jeton, format="json").status_code == 401


def test_limite_de_debit_sur_la_connexion(api, delegue):
    codes = [connecter(api, identifiant="personne.inconnue").status_code for _ in range(21)]
    assert codes[:20] == [401] * 20 and codes[-1] == 429
    assert api.post("/api/v1/auth/connexion/", {}, format="json").json()["code"] == (
        "trop_de_tentatives"
    )


def test_mot_de_passe_jamais_dans_la_reponse(api, delegue):
    assert MOT_DE_PASSE not in connecter(api).content.decode()

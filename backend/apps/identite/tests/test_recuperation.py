"""USR-005 : récupération d'accès par lien à usage unique de 30 minutes."""

import re
from datetime import timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.identite.models import Session

from .conftest import FAUX, MOT_DE_PASSE, connecter, mot_de_passe_solide

pytestmark = pytest.mark.django_db

NOUVEAU = mot_de_passe_solide()


def _demander(api, identifiant="awa.diallo"):
    return api.post("/api/v1/auth/mot-de-passe/oubli/", {"identifiant": identifiant}, format="json")


def _jeton(courriel):
    return re.search(r"jeton=([\w-]+)", courriel.body).group(1)


def _reinitialiser(api, jeton, mot_de_passe=NOUVEAU):
    return api.post(
        "/api/v1/auth/mot-de-passe/reinitialisation/",
        {"jeton": jeton, "mot_de_passe": mot_de_passe},
        format="json",
    )


def test_demande_envoie_un_lien_dans_la_langue_de_l_utilisateur(api, delegue, mailoutbox):
    assert _demander(api).status_code == 202
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["awa.diallo@exemple.org"]
    assert "30 minutes" in mailoutbox[0].body
    delegue.langue = "en"
    delegue.save()
    _demander(api, "awa.diallo@exemple.org")
    assert "reset your password" in mailoutbox[1].subject


def test_meme_reponse_pour_un_compte_inconnu(api, delegue, mailoutbox):
    assert _demander(api, "personne.inconnue").status_code == 202
    assert mailoutbox == []


def test_reinitialisation_change_le_mot_de_passe_et_ferme_les_sessions(api, delegue, mailoutbox):
    connecter(api)
    _demander(api)
    assert _reinitialiser(api, _jeton(mailoutbox[0])).status_code == 204
    assert not Session.objects.filter(revoquee_le=None).exists()
    assert connecter(api).status_code == 401
    assert connecter(api, mot_de_passe=NOUVEAU).status_code == 200


def test_lien_a_usage_unique(api, delegue, mailoutbox):
    _demander(api)
    jeton = _jeton(mailoutbox[0])
    assert _reinitialiser(api, jeton).status_code == 204
    reponse = _reinitialiser(api, jeton, mot_de_passe_solide())
    assert reponse.status_code == 400 and reponse.json()["code"] == "lien_invalide"


def test_lien_expire_apres_trente_minutes(api, delegue, mailoutbox):
    _demander(api)
    with freeze_time(timezone.now() + timedelta(minutes=31)):
        assert _reinitialiser(api, _jeton(mailoutbox[0])).json()["code"] == "lien_invalide"


def test_une_nouvelle_demande_invalide_l_ancien_lien(api, delegue, mailoutbox):
    _demander(api)
    _demander(api)
    assert _reinitialiser(api, _jeton(mailoutbox[0])).status_code == 400
    assert _reinitialiser(api, _jeton(mailoutbox[1])).status_code == 204


def test_nouveau_mot_de_passe_soumis_a_la_politique(api, delegue, mailoutbox):
    _demander(api)
    reponse = _reinitialiser(api, _jeton(mailoutbox[0]), "court")
    assert reponse.status_code == 400 and reponse.json()["code"] == "mot_de_passe_refuse"


def test_reinitialisation_deverrouille_le_compte(api, delegue, mailoutbox):
    for _ in range(5):
        connecter(api, mot_de_passe=FAUX)
    assert connecter(api).status_code == 423
    _demander(api)
    _reinitialiser(api, _jeton(mailoutbox[-1]))
    assert connecter(api, mot_de_passe=NOUVEAU).status_code == 200


def test_changement_de_mot_de_passe_connecte(api, delegue):
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {connecter(api).json()['acces']}")
    faux = api.post(
        "/api/v1/auth/mot-de-passe/changement/",
        {"actuel": FAUX, "nouveau": NOUVEAU},
        format="json",
    )
    assert faux.json()["code"] == "mot_de_passe_incorrect"
    reponse = api.post(
        "/api/v1/auth/mot-de-passe/changement/",
        {"actuel": MOT_DE_PASSE, "nouveau": NOUVEAU},
        format="json",
    )
    assert reponse.status_code == 204
    # Toutes les sessions sont fermées, y compris celle qui a fait le changement.
    assert api.get("/api/v1/auth/moi/").status_code == 401

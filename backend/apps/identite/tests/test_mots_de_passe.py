"""SEC-001 : mots de passe compromettants refusés, même déguisés, et fuites connues."""

import hashlib
import secrets

import pytest
from django.core.exceptions import ValidationError
from django.utils import translation

from apps.identite.mots_de_passe import (
    FuitesConnuesValidator,
    MotsCompromettantsValidator,
    mot_compromettant,
    mots_compromettants,
)

from .conftest import mot_de_passe_solide

# Mots assemblés à l'exécution pour illustrer les déguisements ; aucun n'est un vrai secret.
SUFFIXE = secrets.token_hex(3)


@pytest.mark.parametrize(
    ("deguise", "mot"),
    [
        (f"D@k4r-{SUFFIXE}-Tournee", "dakar"),
        (f"P4ssw0rd!{SUFFIXE}Long", "password"),
        (f"Sénégal{SUFFIXE}Bleu", "senegal"),
        (f"{SUFFIXE}-INNOV-Equipe", "innov"),
        (f"Az3rty-{SUFFIXE}-Cle", "azerty"),
        (f"Ma-V1s1te-{SUFFIXE}", "visite"),
    ],
)
def test_un_mot_compromettant_est_reconnu_meme_deguise(deguise, mot):
    assert mot_compromettant(deguise) == mot
    with translation.override("fr"), pytest.raises(ValidationError) as erreur:
        MotsCompromettantsValidator().validate(deguise)
    assert "peut être compromettant" in erreur.value.messages[0]
    assert f"« {mot} »" in erreur.value.messages[0]


def test_un_mot_de_passe_sans_mot_compromettant_passe():
    MotsCompromettantsValidator().validate(mot_de_passe_solide())


def test_la_liste_est_propre():
    mots = mots_compromettants()
    assert len(mots) > 50
    assert all(m == m.lower().strip() and len(m) >= 4 for m in mots)


class FuitesFactices(FuitesConnuesValidator):
    """Remplace l'appel réseau : renvoie la réponse préparée par le test."""

    def __init__(self, reponse: str | Exception):
        super().__init__(actif=True)
        self.reponse = reponse
        self.prefixes: list[str] = []

    def _suffixes(self, prefixe):
        self.prefixes.append(prefixe)
        if isinstance(self.reponse, Exception):
            raise self.reponse
        return self.reponse


def _suffixe(mot_de_passe):
    return hashlib.sha1(mot_de_passe.encode()).hexdigest().upper()  # noqa: S324


def test_un_mot_de_passe_divulgue_est_refuse_sans_jamais_l_envoyer():
    candidat = mot_de_passe_solide()
    empreinte = _suffixe(candidat)
    validateur = FuitesFactices(f"0000000000000000000000000000000000A:0\n{empreinte[5:]}:42\n")
    with pytest.raises(ValidationError) as erreur:
        validateur.validate(candidat)
    assert erreur.value.error_list[0].code == "mot_de_passe_divulgue"
    # k-anonymat : seuls les 5 premiers caractères de l'empreinte quittent le serveur.
    assert validateur.prefixes == [empreinte[:5]]


def test_le_remplissage_a_zero_n_est_pas_une_fuite():
    candidat = mot_de_passe_solide()
    FuitesFactices(f"{_suffixe(candidat)[5:]}:0\n").validate(candidat)


def test_service_indisponible_ne_bloque_pas():
    FuitesFactices(OSError("hors ligne")).validate(mot_de_passe_solide())


def test_desactive_en_developpement():
    validateur = FuitesConnuesValidator(actif=False)
    validateur._suffixes = lambda prefixe: pytest.fail("aucun appel attendu")  # type: ignore[method-assign]
    validateur.validate(mot_de_passe_solide())


def test_l_api_refuse_un_mot_compromettant(api, delegue):
    """Le changement de mot de passe renvoie le message à l'utilisateur."""
    from .conftest import MOT_DE_PASSE, connecter

    acces = connecter(api).json()["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    reponse = api.post(
        "/api/v1/auth/mot-de-passe/changement/",
        {"actuel": MOT_DE_PASSE, "nouveau": f"Bienvenue-{SUFFIXE}-Dakar"},
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )
    assert reponse.status_code == 400
    assert "peut être compromettant" in reponse.json()["message"]

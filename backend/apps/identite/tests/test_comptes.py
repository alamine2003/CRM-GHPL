"""USR-001, USR-003, SEC-001 : comptes nominatifs et politique de mot de passe."""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import CommonPasswordValidator
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command

from apps.identite.models import Session
from apps.identite.services import (
    connecter,
    creer_utilisateur,
    reactiver_utilisateur,
    suspendre_utilisateur,
)

from .conftest import MOT_DE_PASSE, mot_de_passe_solide

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "identifiant",
    ["admin", "awa", "Awa.Diallo ", "test.awa", "delegue.dakar", "awa diallo", "awa.diallo@x.org"],
)
def test_comptes_generiques_ou_non_nominatifs_refuses(senegal, identifiant):
    """USR-001 CA1 : aucun compte partagé ou générique."""
    if identifiant == "Awa.Diallo ":
        # Majuscules et espaces sont normalisés : l'identifiant reste nominatif.
        assert creer_utilisateur(identifiant, prenom="Awa", nom="Diallo").username == "awa.diallo"
        return
    with pytest.raises(ValidationError):
        creer_utilisateur(identifiant, prenom="Awa", nom="Diallo", pays=senegal)


def test_prenom_et_nom_obligatoires(senegal):
    with pytest.raises(ValidationError):
        creer_utilisateur("awa.diallo", prenom=" ", nom="Diallo", pays=senegal)


def test_langue_par_defaut_celle_du_pays(db):
    from apps.socle.services import creer_pays

    gambie = creer_pays("GM")
    utilisateur = creer_utilisateur("lamin.jallow", prenom="Lamin", nom="Jallow", pays=gambie)
    assert utilisateur.langue == "en"


def test_courriel_unique(delegue, senegal):
    with pytest.raises(ValidationError):
        creer_utilisateur(
            "awa.diallo2", prenom="Awa", nom="Diallo", courriel="AWA.DIALLO@exemple.org"
        )


def _courant_long() -> str:
    """Un mot de passe de la liste des mots de passe courants, d'au moins 12 caractères."""
    return next(p for p in sorted(CommonPasswordValidator().passwords) if len(p) >= 12)


@pytest.mark.parametrize(
    "fabrique",
    [
        lambda: mot_de_passe_solide()[:11],  # trop court
        lambda: "7" * 12,  # entièrement numérique
        _courant_long,  # courant
        lambda: "awa.diallo" + "2026",  # proche de l'identifiant
    ],
    ids=["court", "numerique", "courant", "proche-identite"],
)
def test_politique_de_mot_de_passe(senegal, fabrique):
    """SEC-001 : 12 caractères minimum, ni courant, ni numérique, ni proche de l'identité."""
    mot_de_passe = fabrique()
    with pytest.raises(ValidationError):
        creer_utilisateur(
            "awa.diallo", prenom="Awa", nom="Diallo", pays=senegal, mot_de_passe=mot_de_passe
        )


def test_mot_de_passe_hache_en_argon2(delegue):
    assert delegue.password.startswith("argon2")
    assert MOT_DE_PASSE not in delegue.password


def test_super_utilisateur_django_interdit():
    with pytest.raises(TypeError, match="rôles"):
        get_user_model().objects.create_superuser("awa.diallo", "a@b.c", MOT_DE_PASSE)


def test_suspension_ferme_les_sessions_et_garde_les_donnees(delegue):
    """USR-003 CA1 et CA2."""
    connecter("awa.diallo", MOT_DE_PASSE, "mobile")
    suspendre_utilisateur(delegue)
    assert not Session.objects.filter(utilisateur=delegue, revoquee_le=None).exists()
    delegue.refresh_from_db()
    assert delegue.username == "awa.diallo" and not delegue.is_active
    reactiver_utilisateur(delegue)
    assert connecter("awa.diallo", MOT_DE_PASSE, "mobile").session.est_active


def test_commande_creer_utilisateur_envoie_le_lien(senegal, mailoutbox, capsys):
    call_command(
        "creer_utilisateur", "fatou.sow", "--prenom", "Fatou", "--nom", "Sow",
        "--courriel", "fatou.sow@exemple.org", "--pays", "SN",
    )  # fmt: skip
    utilisateur = get_user_model().objects.get(username="fatou.sow")
    assert not utilisateur.has_usable_password()
    assert len(mailoutbox) == 1 and "/reinitialisation?jeton=" in mailoutbox[0].body
    assert "envoyé" in capsys.readouterr().out


def test_commande_sans_courriel_affiche_le_lien(db, capsys):
    call_command("creer_utilisateur", "fatou.sow", "--prenom", "Fatou", "--nom", "Sow")
    sortie = capsys.readouterr().out
    assert "(siège)" in sortie and "/reinitialisation?jeton=" in sortie


def test_commande_refuse_un_pays_inconnu(db):
    with pytest.raises(CommandError, match="Pays inconnu"):
        call_command(
            "creer_utilisateur", "fatou.sow", "--prenom", "F", "--nom", "S", "--pays", "SN"
        )

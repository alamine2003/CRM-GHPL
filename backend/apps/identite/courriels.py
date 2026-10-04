"""Courriels de sécurité du compte, seuls courriels envoyés par INNOV CRM (NOT-004)."""

from django.conf import settings
from django.core.mail import send_mail
from django.utils import translation
from django.utils.translation import gettext as _


def _envoyer(utilisateur, sujet: str, corps: str) -> None:
    if not utilisateur.email:
        return
    send_mail(sujet, corps, settings.DEFAULT_FROM_EMAIL, [utilisateur.email])


def courriel_reinitialisation(utilisateur, jeton: str, minutes: int) -> None:
    lien = f"{settings.PORTAIL_URL}/reinitialisation?jeton={jeton}"
    with translation.override(utilisateur.langue):
        sujet = _("INNOV CRM — réinitialisation de votre mot de passe")
        corps = _(
            "Bonjour %(prenom)s,\n\n"
            "Pour choisir un nouveau mot de passe, ouvrez ce lien dans les %(minutes)s minutes :\n"
            "%(lien)s\n\n"
            "Le lien ne fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande, "
            "ignorez ce message : votre mot de passe actuel reste valable."
        ) % {"prenom": utilisateur.first_name, "minutes": minutes, "lien": lien}
        _envoyer(utilisateur, sujet, corps)


def courriel_verrouillage(utilisateur, minutes: int) -> None:
    with translation.override(utilisateur.langue):
        sujet = _("INNOV CRM — compte verrouillé temporairement")
        corps = _(
            "Bonjour %(prenom)s,\n\n"
            "Après plusieurs mots de passe erronés, votre compte est verrouillé pour %(minutes)s "
            "minutes. Si ce n'était pas vous, prévenez votre administrateur pays."
        ) % {"prenom": utilisateur.first_name, "minutes": minutes}
        _envoyer(utilisateur, sujet, corps)

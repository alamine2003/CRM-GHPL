"""Courriels de sécurité du compte, seuls courriels envoyés par INNOV CRM (NOT-004).

Récupération d'accès, verrouillage, nouveau téléphone, double authentification, et secours d'une
décision en attente depuis plus de 48 heures. Aucun autre : un test vérifie qu'aucun autre module
n'envoie de courriel (NOT-004 CA1). Jamais de nom de prospect ni de donnée de santé.
"""

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


def courriel_nouvel_appareil(utilisateur, appareil) -> None:
    modele = " ".join(filter(None, [appareil.modele, appareil.systeme])) or "?"
    with translation.override(utilisateur.langue):
        sujet = _("INNOV CRM — nouveau téléphone connecté à votre compte")
        corps = _(
            "Bonjour %(prenom)s,\n\n"
            "Un nouveau téléphone (%(modele)s) vient de se connecter à votre compte INNOV CRM. "
            "Si c'est vous, il n'y a rien à faire. Sinon, prévenez tout de suite votre "
            "administrateur pays : il révoquera ce téléphone, qui effacera ses données."
        ) % {"prenom": utilisateur.first_name, "modele": modele}
        _envoyer(utilisateur, sujet, corps)


def courriel_double_auth(utilisateur, activee: bool) -> None:
    with translation.override(utilisateur.langue):
        sujet = _("INNOV CRM — double authentification modifiée")
        corps = (
            _(
                "Bonjour %(prenom)s,\n\n"
                "La double authentification est maintenant activée sur votre compte. Gardez vos "
                "codes de secours en lieu sûr."
            )
            if activee
            else _(
                "Bonjour %(prenom)s,\n\n"
                "La double authentification vient d'être désactivée sur votre compte. Si ce "
                "n'était pas vous, prévenez tout de suite votre administrateur pays."
            )
        ) % {"prenom": utilisateur.first_name}
        _envoyer(utilisateur, sujet, corps)


def courriel_secours(utilisateur, nombre: int) -> None:
    """NOT-004 : le secours d'une décision en attente depuis plus de 48 heures, sans détail."""
    with translation.override(utilisateur.langue):
        sujet = _("INNOV CRM — décisions en attente depuis plus de 48 heures")
        corps = _(
            "Bonjour %(prenom)s,\n\n"
            "%(nombre)s demande(s) attendent votre décision depuis plus de 48 heures. Ouvrez "
            "INNOV CRM pour les traiter : %(lien)s"
        ) % {"prenom": utilisateur.first_name, "nombre": nombre, "lien": settings.PORTAIL_URL}
        _envoyer(utilisateur, sujet, corps)

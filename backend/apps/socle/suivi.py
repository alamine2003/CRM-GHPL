"""Suivi des erreurs (architecture §19) : Sentry si `SENTRY_DSN` est fourni, sinon
seulement les journaux techniques. Rien de personnel ne quitte le serveur."""

import logging

from django.conf import settings

from . import journalisation

journal = logging.getLogger("innov.erreurs")

ENTETES_SENSIBLES = {"authorization", "cookie", "x-innov-client", "set-cookie"}


def avant_envoi(evenement, _indice):
    """Retire de l'événement Sentry tout ce qui pourrait identifier une personne."""
    requete = evenement.get("request") or {}
    requete.pop("cookies", None)
    requete.pop("data", None)
    requete.pop("query_string", None)
    entetes = requete.get("headers") or {}
    for nom in list(entetes):
        if nom.lower() in ENTETES_SENSIBLES:
            entetes[nom] = "[retiré]"
    evenement.pop("user", None)
    if journalisation.utilisateur.get():
        evenement["user"] = {"id": journalisation.utilisateur.get()}
    evenement.setdefault("tags", {})["reference"] = journalisation.reference.get()
    return evenement


def actif() -> bool:
    return bool(getattr(settings, "SENTRY_DSN", ""))


def signaler_exception(erreur: BaseException) -> None:
    journal.error("erreur_interne", exc_info=erreur)
    if actif():
        import sentry_sdk

        sentry_sdk.capture_exception(erreur)


def signaler_erreur_client(rapport: dict) -> None:
    """Erreur remontée par le portail ou l'application mobile."""
    journal.warning("erreur_client", extra={f"client_{k}": v for k, v in rapport.items()})
    if actif():
        import sentry_sdk

        with sentry_sdk.new_scope() as portee:
            portee.set_tag("client", rapport.get("client"))
            portee.set_tag("version_client", rapport.get("version"))
            portee.set_extra("pile", rapport.get("pile"))
            portee.set_extra("ecran", rapport.get("ecran"))
            sentry_sdk.capture_message(rapport.get("message", "erreur client"), level="error")

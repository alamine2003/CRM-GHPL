"""Format d'erreur commun de l'API : {"code", "message", "details"} (architecture §25.3).

Le code est stable et lisible par les clients ; le message est traduit dans la
langue de la requête.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from django.utils.translation import gettext as _
from rest_framework import exceptions, status
from rest_framework.response import Response


class ErreurMetier(exceptions.APIException):
    """Erreur prévue par une règle métier, avec un code stable."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, code: str, message: str, statut: int | None = None, **details):
        super().__init__(detail=message, code=code)
        self.code = code
        self.details = details
        if statut is not None:
            self.status_code = statut


CODES_PAR_DEFAUT = {
    exceptions.NotAuthenticated: ("non_authentifie", lambda: _("Authentification requise.")),
    exceptions.AuthenticationFailed: (
        "session_invalide",
        lambda: _("Session invalide ou expirée."),
    ),
    exceptions.PermissionDenied: ("interdit", lambda: _("Action non autorisée.")),
    exceptions.NotFound: ("introuvable", lambda: _("Ressource introuvable.")),
    exceptions.Throttled: (
        "trop_de_tentatives",
        lambda: _("Trop de tentatives, réessayez plus tard."),
    ),
    exceptions.ValidationError: ("donnees_invalides", lambda: _("Données invalides.")),
}


def gestionnaire_exceptions(exc, contexte):
    # Import tardif : rest_framework.views charge les classes d'authentification au démarrage.
    from rest_framework.views import exception_handler

    reponse = exception_handler(exc, contexte)
    if reponse is None:
        return None
    # Les 404 et 403 de Django prennent le code de leur équivalent DRF.
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    if isinstance(exc, ErreurMetier):
        corps = {"code": exc.code, "message": str(exc.detail), "details": exc.details}
    else:
        code, message = next(
            ((c, m()) for type_, (c, m) in CODES_PAR_DEFAUT.items() if isinstance(exc, type_)),
            ("erreur", str(getattr(exc, "detail", ""))),
        )
        if isinstance(exc, exceptions.AuthenticationFailed) and getattr(exc, "code_metier", None):
            code, message = exc.code_metier, str(exc.detail)
        details = reponse.data if isinstance(exc, exceptions.ValidationError) else {}
        corps = {"code": code, "message": message, "details": details}
    return Response(corps, status=reponse.status_code, headers=reponse.headers)

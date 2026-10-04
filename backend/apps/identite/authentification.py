"""Authentification des requêtes de l'API par jeton d'accès lié à une session.

Le jeton (JWT, 15 minutes) porte l'identifiant de session `sid`. Chaque
requête vérifie que la session est ouverte, que le compte est actif et que
son pays n'est pas suspendu : une révocation prend effet immédiatement.
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from apps.socle.erreurs import ErreurMetier

from .models import Session
from .services import verifier_acces_autorise


class AuthentificationSession(JWTAuthentication):
    def authenticate(self, request):
        try:
            resultat = super().authenticate(request)
        except InvalidToken as erreur:
            raise exceptions.AuthenticationFailed() from erreur
        if resultat is None:
            return None
        utilisateur, jeton = resultat
        session = (
            Session.objects.select_related("utilisateur__pays_principal")
            .filter(id=jeton.get("sid"), utilisateur_id=utilisateur.pk)
            .first()
        )
        if session is None or not session.est_active:
            raise exceptions.AuthenticationFailed()
        try:
            verifier_acces_autorise(session.utilisateur)
        except ErreurMetier as erreur:
            echec = exceptions.AuthenticationFailed(erreur.detail)
            echec.code_metier = erreur.code
            raise echec from erreur
        request.session_innov = session
        return session.utilisateur, jeton

    def authenticate_header(self, request):
        return 'Bearer realm="api"'


class SchemaAuthentificationSession(OpenApiAuthenticationExtension):
    """Décrit l'authentification dans le schéma OpenAPI (jeton « Bearer »)."""

    target_class = AuthentificationSession
    name = "jetonAcces"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}

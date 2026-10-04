"""Points d'accès de connexion, de session et de récupération d'accès (/api/v1/auth/)."""

from django.conf import settings
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.socle.erreurs import ErreurMetier

from . import services
from .models import Session
from .serializers import (
    ChangementLangueSerializer,
    ChangementSerializer,
    ConnexionSerializer,
    JetonsSerializer,
    MoiSerializer,
    OubliSerializer,
    RafraichissementSerializer,
    ReinitialisationSerializer,
)

ENTETE_CLIENT = "HTTP_X_INNOV_CLIENT"


def _cookie():
    return settings.INNOV_AUTH["COOKIE_RAFRAICHISSEMENT"]


def _reponse_jetons(connexion: services.Connexion, statut=status.HTTP_200_OK) -> Response:
    portail = connexion.session.client == Session.Client.PORTAIL
    corps = {
        "acces": connexion.acces,
        "expire_dans": connexion.expire_dans,
        "rafraichissement": None if portail else connexion.rafraichissement,
        "utilisateur": MoiSerializer(connexion.session.utilisateur).data,
    }
    reponse = Response(corps, status=statut)
    reponse["Cache-Control"] = "no-store"
    if portail:
        # Le jeton de rafraîchissement du portail n'est jamais lisible par JavaScript.
        reponse.set_cookie(
            _cookie(),
            connexion.rafraichissement,
            max_age=int(services.duree_session(connexion.session.client).total_seconds()),
            httponly=True,
            secure=settings.INNOV_AUTH["COOKIE_SECURISE"],
            samesite="Strict",
            path="/api/v1/auth/",
        )
    return reponse


def _adresse_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR")


class ConnexionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "connexion"

    @extend_schema(
        request=ConnexionSerializer, responses=JetonsSerializer, operation_id="connexion"
    )
    def post(self, request):
        donnees = ConnexionSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        connexion = services.connecter(
            donnees.validated_data["identifiant"],
            donnees.validated_data["mot_de_passe"],
            donnees.validated_data["client"],
            adresse_ip=_adresse_ip(request),
            agent=request.META.get("HTTP_USER_AGENT", ""),
            appareil=donnees.validated_data.get("appareil"),
        )
        return _reponse_jetons(connexion)


class RafraichissementView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "connexion"

    @extend_schema(
        request=RafraichissementSerializer, responses=JetonsSerializer, operation_id="rafraichir"
    )
    def post(self, request):
        donnees = RafraichissementSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        jeton = donnees.validated_data.get("rafraichissement")
        if not jeton:
            # Cookie du portail : l'en-tête personnalisé impose une requête CORS autorisée.
            if request.META.get(ENTETE_CLIENT) != "portail":
                raise ErreurMetier(
                    "client_inconnu",
                    _("En-tête X-Innov-Client manquant."),
                    status.HTTP_400_BAD_REQUEST,
                )
            jeton = request.COOKIES.get(_cookie())
        if not jeton:
            raise ErreurMetier(
                "session_invalide", _("Session invalide ou expirée."), status.HTTP_401_UNAUTHORIZED
            )
        return _reponse_jetons(services.rafraichir(jeton))


class DeconnexionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, operation_id="deconnexion")
    def post(self, request):
        services.deconnecter(request.session_innov)
        reponse = Response(status=status.HTTP_204_NO_CONTENT)
        reponse.delete_cookie(_cookie(), path="/api/v1/auth/", samesite="Strict")
        return reponse


class MoiView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MoiSerializer, operation_id="moi")
    def get(self, request):
        return Response(MoiSerializer(request.user).data)

    @extend_schema(
        request=ChangementLangueSerializer, responses=MoiSerializer, operation_id="moi_langue"
    )
    def patch(self, request):
        """Change la langue de l'interface de l'utilisateur (USR-004)."""
        donnees = ChangementLangueSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        utilisateur = services.changer_langue(request.user, donnees.validated_data["langue"])
        return Response(MoiSerializer(utilisateur).data)


class OubliView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "recuperation"

    @extend_schema(
        request=OubliSerializer, responses={202: None}, operation_id="mot_de_passe_oubli"
    )
    def post(self, request):
        donnees = OubliSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        services.demander_reinitialisation_par_identifiant(donnees.validated_data["identifiant"])
        # Même réponse que le compte existe ou non.
        return Response(status=status.HTTP_202_ACCEPTED)


class ReinitialisationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "recuperation"

    @extend_schema(
        request=ReinitialisationSerializer,
        responses={204: None},
        operation_id="mot_de_passe_reinitialisation",
    )
    def post(self, request):
        donnees = ReinitialisationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        services.reinitialiser_mot_de_passe(
            donnees.validated_data["jeton"], donnees.validated_data["mot_de_passe"]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangementView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangementSerializer, responses={204: None}, operation_id="mot_de_passe_changement"
    )
    def post(self, request):
        donnees = ChangementSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        services.changer_mot_de_passe(
            request.user, donnees.validated_data["actuel"], donnees.validated_data["nouveau"]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

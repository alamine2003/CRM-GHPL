"""Points d'accès de connexion, de session et de récupération d'accès (/api/v1/auth/)."""

from django.conf import settings
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.socle.erreurs import ErreurMetier

from . import double_auth, services
from .models import Session, Utilisateur
from .serializers import (
    ActiviteCompteSerializer,
    ChangementLangueSerializer,
    ChangementPreferencesSerializer,
    ChangementSerializer,
    CodeSerializer,
    CodesSecoursSerializer,
    ConnexionCodeSerializer,
    ConnexionSerializer,
    EtapeDoubleAuthSerializer,
    EtatDoubleAuthSerializer,
    InitialisationDoubleAuthSerializer,
    JetonPushSerializer,
    JetonsSerializer,
    MoiSerializer,
    OubliSerializer,
    PreferenceNotificationSerializer,
    RafraichissementSerializer,
    ReinitialisationSerializer,
    SessionSerializer,
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
        "double_auth_a_activer": doit_activer_double_auth(connexion.session),
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


def doit_activer_double_auth(session: Session) -> bool:
    """SEC-003 CA1 : rôle sensible sans code validé à l'ouverture de la session."""
    return not session.double_auth_validee and double_auth.exige_double_auth(session.utilisateur)


def exiger_double_auth(request) -> None:
    """Bloque l'accès aux données tant que la double authentification obligatoire manque."""
    session = getattr(request, "session_innov", None)
    if session is not None and doit_activer_double_auth(session):
        raise ErreurMetier(
            "double_authentification_requise",
            _("Votre rôle impose la double authentification : activez-la pour continuer."),
            status.HTTP_403_FORBIDDEN,
        )


def _adresse_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR")


class ConnexionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "connexion"

    @extend_schema(
        request=ConnexionSerializer,
        responses={200: JetonsSerializer, 202: EtapeDoubleAuthSerializer},
        operation_id="connexion",
    )
    def post(self, request):
        """Ouvre une session ; si la double authentification est active, répond 202 et
        attend le code sur connexion/code/ (SEC-003)."""
        donnees = ConnexionSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        resultat = services.connecter(
            donnees.validated_data["identifiant"],
            donnees.validated_data["mot_de_passe"],
            donnees.validated_data["client"],
            adresse_ip=_adresse_ip(request),
            agent=request.META.get("HTTP_USER_AGENT", ""),
            appareil=donnees.validated_data.get("appareil"),
        )
        if isinstance(resultat, services.EtapeDoubleAuth):
            return Response(
                {"etape": "code_requis", "jeton_etape": resultat.jeton_etape,
                 "expire_dans": resultat.expire_dans},
                status=status.HTTP_202_ACCEPTED,
            )  # fmt: skip
        return _reponse_jetons(resultat)


class ConnexionCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "connexion"

    @extend_schema(
        request=ConnexionCodeSerializer, responses=JetonsSerializer, operation_id="connexion_code"
    )
    def post(self, request):
        donnees = ConnexionCodeSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        connexion = services.connecter_avec_code(
            donnees.validated_data["jeton_etape"],
            donnees.validated_data["code"],
            adresse_ip=_adresse_ip(request),
            agent=request.META.get("HTTP_USER_AGENT", ""),
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


class JetonPushView(APIView):
    """NOT-002 (0.8.5) : le téléphone de la session donne, ou retire, son adresse push."""

    permission_classes = [IsAuthenticated]

    def _appareil(self, request):
        appareil = request.session_innov.appareil
        if appareil is None:
            raise ErreurMetier("appareil_requis", _("Réservé à l'application mobile."))
        return appareil

    @extend_schema(request=JetonPushSerializer, responses={204: None}, operation_id="push_jeton")
    def put(self, request):
        donnees = JetonPushSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        services.enregistrer_jeton_push(self._appareil(request), donnees.validated_data["jeton"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None}, operation_id="push_jeton_retirer")
    def delete(self, request):
        services.enregistrer_jeton_push(self._appareil(request), "")
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesNotificationsView(APIView):
    """NOT-005 (0.8.6) : ce que la personne reçoit en push ; les obligatoires restent."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PreferenceNotificationSerializer(many=True),
                   operation_id="preferences_notifications")  # fmt: skip
    def get(self, request):
        from apps.notifications import preferences

        return Response(
            PreferenceNotificationSerializer(preferences.preferences(request.user), many=True).data
        )

    @extend_schema(request=ChangementPreferencesSerializer,
                   responses=PreferenceNotificationSerializer(many=True),
                   operation_id="preferences_notifications_changer")  # fmt: skip
    def put(self, request):
        from apps.notifications import preferences

        donnees = ChangementPreferencesSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        utilisateur = preferences.changer(request.user, donnees.validated_data["coupes"])
        return Response(
            PreferenceNotificationSerializer(preferences.preferences(utilisateur), many=True).data
        )


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


# --- Double authentification (SEC-003) -------------------------------------------------


class DoubleAuthView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=EtatDoubleAuthSerializer, operation_id="double_auth_etat")
    def get(self, request):
        d = double_auth.dossier(request.user)
        return Response(
            EtatDoubleAuthSerializer(
                {
                    "active": bool(d and d.est_active),
                    "requise": double_auth.exige_double_auth(request.user),
                    "codes_secours_restants": len(d.codes_secours) if d and d.est_active else 0,
                }
            ).data
        )


class DoubleAuthInitialisationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses=InitialisationDoubleAuthSerializer,
        operation_id="double_auth_initialiser",
    )
    def post(self, request):
        secret, uri = double_auth.initialiser(request.user)
        reponse = Response(InitialisationDoubleAuthSerializer({"secret": secret, "uri": uri}).data)
        reponse["Cache-Control"] = "no-store"
        return reponse


class DoubleAuthActivationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CodeSerializer, responses=CodesSecoursSerializer, operation_id="double_auth_activer"
    )
    def post(self, request):
        donnees = CodeSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        codes = double_auth.activer(request.user, donnees.validated_data["code"])
        # La session courante a désormais prouvé le second facteur.
        session = request.session_innov
        session.double_auth_validee = True
        session.save(update_fields=["double_auth_validee"])
        reponse = Response(CodesSecoursSerializer({"codes_secours": codes}).data)
        reponse["Cache-Control"] = "no-store"
        return reponse


class DoubleAuthCodesSecoursView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CodeSerializer,
        responses=CodesSecoursSerializer,
        operation_id="double_auth_codes_secours",
    )
    def post(self, request):
        donnees = CodeSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        codes = double_auth.regenerer_codes(request.user, donnees.validated_data["code"])
        reponse = Response(CodesSecoursSerializer({"codes_secours": codes}).data)
        reponse["Cache-Control"] = "no-store"
        return reponse


class DoubleAuthDesactivationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CodeSerializer, responses={204: None}, operation_id="double_auth_desactiver"
    )
    def post(self, request):
        donnees = CodeSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        double_auth.desactiver(request.user, donnees.validated_data["code"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Sessions (SEC-004) ------------------------------------------------------------------


def _mes_sessions(utilisateur: Utilisateur):
    from django.utils import timezone

    return (
        Session.objects.select_related("appareil")
        .filter(utilisateur=utilisateur, revoquee_le=None, expire_le__gt=timezone.now())
        .order_by("-utilisee_le")
    )


class SessionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=SessionSerializer(many=True), operation_id="sessions_liste")
    def get(self, request):
        contexte = {"courante": request.session_innov.pk}
        return Response(
            SessionSerializer(_mes_sessions(request.user), many=True, context=contexte).data
        )


class SessionRevocationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, operation_id="session_revoquer")
    def post(self, request, id):
        from django.shortcuts import get_object_or_404

        session = get_object_or_404(_mes_sessions(request.user), pk=id)
        services.revoquer_session(session, motif="revoquee_par_utilisateur")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionsAutresRevocationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, operation_id="sessions_revoquer_autres")
    def post(self, request):
        for session in _mes_sessions(request.user).exclude(pk=request.session_innov.pk):
            services.revoquer_session(session, motif="revoquee_par_utilisateur")
        return Response(status=status.HTTP_204_NO_CONTENT)


ACTIONS_PERSONNELLES = (
    "connexion", "connexion.verrouillage", "deconnexion", "session.revocation",
    "session.jeton_rejoue", "mot_de_passe.changement", "mot_de_passe.reinitialisation",
    "double_auth.activation", "double_auth.desactivation", "double_auth.reinitialisation",
    "double_auth.codes_secours", "appareil.revocation",
)  # fmt: skip


class ActiviteView(APIView):
    """Les 20 derniers événements de sécurité du compte : repérer une connexion inconnue."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ActiviteCompteSerializer(many=True), operation_id="mon_activite")
    def get(self, request):
        from apps.audit.models import EvenementAudit

        evenements = EvenementAudit.objects.filter(
            objet_type="identite.utilisateur",
            objet_id=str(request.user.pk),
            action__in=ACTIONS_PERSONNELLES,
        ).order_by("-le")[:20]
        masque = SessionSerializer().get_adresse
        lignes = [
            {
                "le": e.le,
                "action": e.action,
                "resultat": e.resultat,
                "client": e.contexte.get("client"),
                "adresse": masque(type("S", (), {"adresse_ip": e.contexte.get("adresse_ip")})),
            }
            for e in evenements
        ]
        return Response(ActiviteCompteSerializer(lignes, many=True).data)

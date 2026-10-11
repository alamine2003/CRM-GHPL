"""Centre de notifications (prd.md §18) : chacun lit et marque les siennes, dans son pays
actif. Le DM, le superviseur et le délégué y trouvent les événements de leurs plannings."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre

from . import services
from .models import Notification
from .serializers import NotificationSerializer, ResumeNotificationsSerializer

LIRE = Action.NOTIFICATIONS_LIRE
#: Les plus récentes sur l'accueil ; le centre (NOT-001) en demande davantage.
LIMITE = 30
LIMITE_CENTRE = 100


class VueNotifications(VuePerimetre):
    serializer_class = NotificationSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Notification.objects.filter(destinataire=self.request.user, archive_le__isnull=True)
        )


class NotificationsVue(VueNotifications):
    actions = {"GET": LIRE}

    @extend_schema(
        parameters=[OpenApiParameter("centre", bool, required=False,
                                     description="Le centre complet : lues et non lues (NOT-001)")],
        responses=ResumeNotificationsSerializer,
        operation_id="notifications_liste",
    )  # fmt: skip
    def get(self, request):
        qs = self.get_queryset()
        limite = LIMITE_CENTRE if request.query_params.get("centre") in ("1", "true") else LIMITE
        return Response(
            ResumeNotificationsSerializer(
                {"non_lues": qs.filter(lue_le__isnull=True).count(), "notifications": qs[:limite]}
            ).data
        )


class LueVue(VueNotifications):
    actions = {"POST": LIRE}

    @extend_schema(request=None, responses=NotificationSerializer, operation_id="notification_lue")
    def post(self, request, id):
        notification = get_object_or_404(self.get_queryset(), pk=id)
        services.marquer_lues(self.get_queryset().filter(pk=notification.pk))
        notification.refresh_from_db()
        return Response(NotificationSerializer(notification).data)


class ToutesLuesVue(VueNotifications):
    actions = {"POST": LIRE}

    @extend_schema(request=None, responses=ResumeNotificationsSerializer,
                   operation_id="notifications_toutes_lues")  # fmt: skip
    def post(self, request):
        services.marquer_lues(self.get_queryset())
        qs = self.get_queryset()
        return Response(
            ResumeNotificationsSerializer({"non_lues": 0, "notifications": qs[:LIMITE]}).data
        )

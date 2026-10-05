"""Centre de notifications (prd.md §18) : chacun lit et marque les siennes, dans son pays
actif. Le DM, le superviseur et le délégué y trouvent les événements de leurs plannings."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre

from . import services
from .models import Notification
from .serializers import NotificationSerializer, ResumeNotificationsSerializer

LIRE = Action.NOTIFICATIONS_LIRE
#: Les plus récentes ; le centre complet, avec ses préférences, arrive en 0.3.8.
LIMITE = 30


class VueNotifications(VuePerimetre):
    serializer_class = NotificationSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Notification.objects.filter(destinataire=self.request.user, archive_le__isnull=True)
        )


class NotificationsVue(VueNotifications):
    actions = {"GET": LIRE}

    @extend_schema(responses=ResumeNotificationsSerializer, operation_id="notifications_liste")
    def get(self, request):
        qs = self.get_queryset()
        return Response(
            ResumeNotificationsSerializer(
                {"non_lues": qs.filter(lue_le__isnull=True).count(), "notifications": qs[:LIMITE]}
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

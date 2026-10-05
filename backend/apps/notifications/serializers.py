from rest_framework import serializers

from .models import TypeNotification


class DonneesNotificationSerializer(serializers.Serializer):
    """Ce qu'il faut pour composer le texte et ouvrir l'objet ; selon le type."""

    planning = serializers.UUIDField(required=False)
    semaine = serializers.DateField(required=False)
    numero_semaine = serializers.IntegerField(required=False)
    #: Planning soumis : numéro de la version à décider.
    version = serializers.IntegerField(required=False)
    #: Remplacement attribué (ORG-013) : période et superviseur remplacé.
    debut = serializers.DateField(required=False)
    fin = serializers.DateField(required=False)
    nom = serializers.CharField(required=False)


class NotificationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=TypeNotification.choices)
    donnees = DonneesNotificationSerializer()
    cree_le = serializers.DateTimeField()
    lue_le = serializers.DateTimeField(allow_null=True)


class ResumeNotificationsSerializer(serializers.Serializer):
    non_lues = serializers.IntegerField()
    notifications = NotificationSerializer(many=True)

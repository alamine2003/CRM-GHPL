from rest_framework import serializers

from .models import TypeNotification


class DonneesNotificationSerializer(serializers.Serializer):
    """Ce qu'il faut pour composer le texte et ouvrir l'objet ; selon le type."""

    planning = serializers.UUIDField(required=False)
    semaine = serializers.DateField(required=False)
    numero_semaine = serializers.IntegerField(required=False)
    #: Planning soumis : numéro de la version à décider.
    version = serializers.IntegerField(required=False)
    #: Planning soumis : première soumission, après révision ou modification (PLN-015).
    motif = serializers.ChoiceField(
        choices=["soumission", "revision", "modification"], required=False
    )
    #: Rappel (NOT-006) : échéance ; escalade (PLN-016) : délai en heures ouvrées ; plannings
    #: non approuvés le lundi : leur nombre.
    echeance = serializers.DateTimeField(required=False)
    heures = serializers.IntegerField(required=False)
    nombre = serializers.IntegerField(required=False)
    #: Remplacement attribué (ORG-013) : période et superviseur remplacé.
    debut = serializers.DateField(required=False)
    fin = serializers.DateField(required=False)
    nom = serializers.CharField(required=False)
    #: Correction demandée (RPT-014) : la visite dont le rapport est à corriger, et son jour.
    visite = serializers.UUIDField(required=False)
    date = serializers.DateField(required=False)
    #: Rapport corrigé (RPT-015) : le délégué, pour ouvrir sa journée.
    delegue = serializers.UUIDField(required=False)
    #: Objectif de ventes en retard (1.8.0) : l'objectif, son réseau, le mois écoulé (AAAA-MM)
    #: et le réalisé rapporté à l'attendu, en pourcentage.
    objectif = serializers.UUIDField(required=False)
    reseau = serializers.CharField(required=False)
    mois = serializers.CharField(required=False)
    taux = serializers.FloatField(required=False)


class NotificationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=TypeNotification.choices)
    donnees = DonneesNotificationSerializer()
    cree_le = serializers.DateTimeField()
    lue_le = serializers.DateTimeField(allow_null=True)


class ResumeNotificationsSerializer(serializers.Serializer):
    non_lues = serializers.IntegerField()
    notifications = NotificationSerializer(many=True)

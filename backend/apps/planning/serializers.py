from rest_framework import serializers

from .models import JourFerie, Planning


class JourFerieSerializer(serializers.ModelSerializer):
    #: Faux à partir du jour même : la date est acquise (ORG-012 CA2).
    modifiable = serializers.SerializerMethodField()

    class Meta:
        model = JourFerie
        fields = ["id", "date", "libelle", "variable", "modifiable"]

    def get_modifiable(self, jour) -> bool:
        aujourdhui = self.context.get("aujourdhui")
        return aujourdhui is not None and jour.date > aujourdhui


class SaisieJourFerieSerializer(serializers.Serializer):
    date = serializers.DateField()
    libelle = serializers.CharField(max_length=120)
    variable = serializers.BooleanField(required=False, default=False)


class ModificationJourFerieSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    libelle = serializers.CharField(max_length=120, required=False)
    variable = serializers.BooleanField(required=False)


class PlanningSerializer(serializers.ModelSerializer):
    class Meta:
        model = Planning
        fields = ["id", "semaine", "statut", "cree_le"]


class JourSemaineSerializer(serializers.Serializer):
    date = serializers.DateField()
    #: Libellé du jour férié, ou nul.
    ferie = serializers.CharField(allow_null=True)
    planifiable = serializers.BooleanField()


class SemaineSerializer(serializers.Serializer):
    """Semaine du délégué : ses jours ouvrés, ses jours fériés et son planning (PLN-001)."""

    semaine = serializers.DateField()
    precedente = serializers.DateField()
    suivante = serializers.DateField()
    courante = serializers.BooleanField()
    jours = JourSemaineSerializer(many=True)
    planning = PlanningSerializer(allow_null=True)
    #: Faux pour une semaine passée ou sans poste occupé.
    peut_creer = serializers.BooleanField()


class CreationPlanningSerializer(serializers.Serializer):
    semaine = serializers.DateField()

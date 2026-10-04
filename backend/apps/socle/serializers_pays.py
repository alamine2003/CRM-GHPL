from rest_framework import serializers

from .models import Pays


class PaysSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pays
        fields = ["code", "nom", "fuseau", "langue", "devise", "statut", "cree_le"]
        read_only_fields = fields


class CreationPaysSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=2, help_text="Code ISO d'une filiale du catalogue.")


class StatutPaysSerializer(serializers.Serializer):
    statut = serializers.ChoiceField(choices=Pays.Statut.choices)


class ParametreSerializer(serializers.Serializer):
    cle = serializers.CharField()
    description = serializers.CharField()
    valeur = serializers.JSONField()
    defaut = serializers.JSONField()
    personnalise = serializers.BooleanField(help_text="Vrai si le pays a changé la valeur.")
    hypothese = serializers.BooleanField(help_text="Valeur par défaut encore à confirmer.")


class ModificationParametreSerializer(serializers.Serializer):
    valeur = serializers.JSONField()

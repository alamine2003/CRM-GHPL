from rest_framework import serializers


class LangueSerializer(serializers.Serializer):
    code = serializers.CharField()
    libelle = serializers.CharField()


class InformationsSerializer(serializers.Serializer):
    produit = serializers.CharField()
    version = serializers.CharField()
    environnement = serializers.CharField()
    langue = serializers.CharField(help_text="Langue retenue pour la réponse.")
    message = serializers.CharField()
    langues = LangueSerializer(many=True)

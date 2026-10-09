from rest_framework import serializers


class EvenementJournalSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    le = serializers.DateTimeField()
    action = serializers.CharField()
    famille = serializers.CharField()
    resultat = serializers.CharField()
    acteur = serializers.CharField(allow_blank=True)
    acteur_nom = serializers.CharField(allow_blank=True)
    roles = serializers.ListField(child=serializers.CharField())
    pays = serializers.CharField(allow_null=True)
    objet_type = serializers.CharField(allow_blank=True)
    objet_id = serializers.CharField(allow_blank=True)
    details = serializers.DictField()
    client = serializers.CharField(allow_null=True)
    adresse = serializers.CharField(allow_null=True)
    reference = serializers.CharField(allow_null=True)


class JournalSerializer(serializers.Serializer):
    """AUD-002 : une page du journal et les familles d'actions de la portée."""

    total = serializers.IntegerField()
    page = serializers.IntegerField()
    taille = serializers.IntegerField()
    familles = serializers.ListField(child=serializers.CharField())
    resultats = EvenementJournalSerializer(many=True)

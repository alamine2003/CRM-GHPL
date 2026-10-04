from rest_framework import serializers

from .models import LotImport


class LotImportSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", read_only=True)
    lance_par = serializers.CharField(source="lance_par.username")
    #: Par entité (« prospects », « etablissements »…), le nombre de lignes par action
    #: (« crees », « existants », « rejetes »…).
    compteurs = serializers.DictField(child=serializers.DictField(child=serializers.IntegerField()))
    nb_anomalies = serializers.SerializerMethodField()
    rejets = serializers.SerializerMethodField()

    class Meta:
        model = LotImport
        fields = ["id", "pays", "source", "fichier", "simulation", "statut", "lance_par",
                  "debut", "fin", "compteurs", "nb_anomalies", "rejets"]  # fmt: skip

    def get_nb_anomalies(self, lot) -> int:
        return len(lot.anomalies)

    def get_rejets(self, lot) -> int:
        return sum(1 for a in lot.anomalies if a.get("niveau") == "rejet")


class AnomalieSerializer(serializers.Serializer):
    entite = serializers.CharField()
    identifiant = serializers.CharField()
    niveau = serializers.CharField()
    motif = serializers.CharField()


class DetailLotSerializer(LotImportSerializer):
    anomalies = AnomalieSerializer(many=True)

    class Meta(LotImportSerializer.Meta):
        fields = [*LotImportSerializer.Meta.fields, "anomalies"]


class ImportBirdNotesSerializer(serializers.Serializer):
    fichier = serializers.FileField()
    simulation = serializers.BooleanField(default=True)

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Liste, Portefeuille, Produit, Valeur


class _Element(serializers.ModelSerializer):
    archive = serializers.SerializerMethodField()
    pays = serializers.CharField(source="pays.code", read_only=True)

    def get_archive(self, objet) -> bool:
        return objet.est_archive


class ValeurSerializer(_Element):
    parent = serializers.UUIDField(source="parent_id", allow_null=True)
    utilisations = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Valeur
        fields = ["id", "pays", "liste", "code", "libelle", "ordre", "parent", "archive",
                  "utilisations"]  # fmt: skip


class CreationValeurSerializer(serializers.Serializer):
    liste = serializers.ChoiceField(choices=Liste.choices)
    libelle = serializers.CharField(max_length=120)
    code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    ordre = serializers.IntegerField(min_value=0, required=False)
    parent = serializers.UUIDField(required=False, allow_null=True)


class ModificationValeurSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120, required=False)
    ordre = serializers.IntegerField(min_value=0, required=False)
    parent = serializers.UUIDField(required=False, allow_null=True)


class ReseauResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    libelle = serializers.CharField()


class ProduitSerializer(_Element):
    classe = serializers.UUIDField(source="classe_id", allow_null=True)
    classe_libelle = serializers.CharField(source="classe.libelle", allow_null=True, default=None)
    reseaux = serializers.SerializerMethodField()

    class Meta:
        model = Produit
        fields = ["id", "pays", "code", "libelle", "classe", "classe_libelle", "reseaux",
                  "archive"]  # fmt: skip

    @extend_schema_field(ReseauResumeSerializer(many=True))
    def get_reseaux(self, produit):
        """Réseaux dont le portefeuille contient le produit aujourd'hui (ORG-004 CA2)."""
        liens = getattr(produit, "liens_actifs", None)
        if liens is None:
            return []
        return ReseauResumeSerializer([lien.reseau for lien in liens], many=True).data


class CreationProduitSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=160)
    code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    classe = serializers.UUIDField(required=False, allow_null=True)
    reseaux = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class ModificationProduitSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=160, required=False)
    classe = serializers.UUIDField(required=False, allow_null=True)
    reseaux = serializers.ListField(child=serializers.UUIDField(), required=False)


class ProduitResumeSerializer(serializers.ModelSerializer):
    classe_libelle = serializers.CharField(source="classe.libelle", allow_null=True, default=None)

    class Meta:
        model = Produit
        fields = ["id", "code", "libelle", "classe_libelle"]


class PortefeuilleSerializer(serializers.Serializer):
    """Portefeuille d'un réseau aujourd'hui."""

    reseau = ReseauResumeSerializer()
    division = serializers.CharField()
    produits = ProduitResumeSerializer(many=True)


class DefinitionPortefeuilleSerializer(serializers.Serializer):
    produits = serializers.ListField(child=serializers.UUIDField())


class LienPortefeuilleSerializer(serializers.ModelSerializer):
    reseau = ReseauResumeSerializer()
    produit = ProduitResumeSerializer()

    class Meta:
        model = Portefeuille
        fields = ["id", "reseau", "produit", "debut", "fin"]

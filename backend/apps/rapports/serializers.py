from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from . import services
from .models import ChampRapport, Rapport, RetourPrescripteur, StatutRapport, TypeChamp, TypeRemise


class ChampRapportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampRapport
        fields = ["id", "code", "libelle", "type", "options", "obligatoire", "ordre"]
        read_only_fields = fields


class SaisieChampSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120)
    type = serializers.ChoiceField(choices=TypeChamp.choices)
    options = serializers.ListField(child=serializers.CharField(max_length=120), required=False)
    obligatoire = serializers.BooleanField(required=False, default=False)


class ModificationChampSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120, required=False)
    options = serializers.ListField(child=serializers.CharField(max_length=120), required=False)
    obligatoire = serializers.BooleanField(required=False)
    ordre = serializers.IntegerField(required=False, min_value=0)


class DefinitionChampSerializer(serializers.Serializer):
    """Un champ du pays tel qu'à la création du rapport (RPT-008 CA1)."""

    code = serializers.CharField()
    libelle = serializers.CharField()
    type = serializers.ChoiceField(choices=TypeChamp.choices)
    options = serializers.ListField(child=serializers.CharField())
    obligatoire = serializers.BooleanField()


class PresentationSerializer(serializers.Serializer):
    """Un produit présenté, à son rang, avec le retour du prescripteur (RPT-004)."""

    #: Produit du portefeuille ; vide pour un produit « autre » saisi en clair (CA2).
    produit = serializers.UUIDField(allow_null=True, required=False)
    libelle = serializers.CharField(max_length=120, required=False, allow_blank=True)
    retour = serializers.ChoiceField(choices=RetourPrescripteur.choices, allow_null=True,
                                     required=False)  # fmt: skip


class RemiseSerializer(serializers.Serializer):
    """Un échantillon (produit) ou un cadeau (article) remis, avec sa quantité (RPT-005)."""

    type = serializers.ChoiceField(choices=TypeRemise.choices)
    produit = serializers.UUIDField(allow_null=True, required=False)
    article = serializers.UUIDField(allow_null=True, required=False)
    libelle = serializers.CharField(read_only=True)
    quantite = serializers.IntegerField(min_value=1, max_value=999)


class RapportSerializer(serializers.ModelSerializer):
    presentations = PresentationSerializer(many=True)
    remises = RemiseSerializer(many=True)
    resultat = serializers.UUIDField(source="resultat_id", allow_null=True)
    champs = serializers.JSONField()
    definitions = DefinitionChampSerializer(many=True)
    #: Visite imprévue : pas d'objectif planifié, la justification en tient lieu (RPT-003).
    est_imprevue = serializers.BooleanField(source="visite.est_imprevue")
    justification = serializers.CharField(source="visite.justification")
    #: Le socle, puis les champs obligatoires du pays, encore vides (RPT-002 CA1).
    manquants = serializers.SerializerMethodField()
    #: Le portefeuille du réseau de la visite (RG-033) et la liste courte des résultats.
    produits_proposes = serializers.SerializerMethodField()
    resultats_proposes = serializers.SerializerMethodField()
    #: RPT-004 CA2 : un produit « autre », saisi en clair, si le pays l'autorise.
    produit_autre_autorise = serializers.SerializerMethodField()
    #: RPT-005 : les articles que le pays propose en cadeau.
    articles_proposes = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = ["id", "visite", "statut", "objectif_prevu", "est_imprevue", "justification",
                  "presentations", "resultat", "resultat_obtenu", "resume", "prochaine_action",
                  "remises", "champs", "definitions", "soumis_le", "manquants",
                  "produits_proposes", "produit_autre_autorise", "resultats_proposes",
                  "articles_proposes"]  # fmt: skip
        read_only_fields = fields

    def get_manquants(self, rapport) -> list[str]:
        return services.manquants(rapport)

    @extend_schema_field(ResumeSerializer(many=True))
    def get_produits_proposes(self, rapport):
        return [{"id": p.pk, "libelle": p.libelle}
                for p in services.produits_proposes(rapport.visite)]  # fmt: skip

    @extend_schema_field(ResumeSerializer(many=True))
    def get_resultats_proposes(self, rapport):
        return [{"id": v.pk, "libelle": v.libelle} for v in services.resultats(rapport.pays)]

    def get_produit_autre_autorise(self, rapport) -> bool:
        from apps.socle.services import valeur_parametre

        return bool(valeur_parametre(rapport.pays, "produit_autre_autorise"))

    @extend_schema_field(ResumeSerializer(many=True))
    def get_articles_proposes(self, rapport):
        return [{"id": v.pk, "libelle": v.libelle} for v in services.articles(rapport.pays)]


class SaisieRapportSerializer(serializers.Serializer):
    presentations = PresentationSerializer(many=True, required=False)
    remises = RemiseSerializer(many=True, required=False)
    resultat = serializers.UUIDField(required=False, allow_null=True)
    resultat_obtenu = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    resume = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    prochaine_action = serializers.CharField(required=False, allow_blank=True, max_length=500)
    champs = serializers.JSONField(required=False)

    def validate_champs(self, valeur):
        if not isinstance(valeur, dict):
            raise serializers.ValidationError("Objet attendu.")
        return valeur


class SoumissionRapportSerializer(serializers.Serializer):
    soumis_le = serializers.DateTimeField()


STATUTS_RAPPORT_VISITE = [("attendu", "Rapport attendu"), *StatutRapport.choices]

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from . import services
from .models import (
    ChampRapport,
    PieceJointe,
    Rapport,
    RetourPrescripteur,
    StatutRapport,
    TypeChamp,
    TypeRemise,
)


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


class ActionPrecedenteSerializer(serializers.Serializer):
    """RPT-006 CA1 : la prochaine action notée à la dernière visite chez ce prospect."""

    date = serializers.DateField()
    type = serializers.CharField(allow_blank=True)
    texte = serializers.CharField(allow_blank=True)
    echeance = serializers.DateField(allow_null=True)
    visite_proposee = serializers.BooleanField()


class PieceJointeSerializer(serializers.ModelSerializer):
    """Une photo ou un document joint (RPT-007) ; le fichier se lit par sa propre adresse."""

    class Meta:
        model = PieceJointe
        fields = ["id", "nom", "type_mime", "taille", "prise_le"]
        read_only_fields = fields


class SaisiePieceSerializer(serializers.Serializer):
    #: Identifiant tiré par le téléphone : l'envoi se rejoue sans doublon.
    id = serializers.UUIDField()
    fichier = serializers.FileField()
    prise_le = serializers.DateTimeField()


class RapportSerializer(serializers.ModelSerializer):
    presentations = PresentationSerializer(many=True)
    remises = RemiseSerializer(many=True)
    pieces_jointes = serializers.SerializerMethodField()
    resultat = serializers.UUIDField(source="resultat_id", allow_null=True)
    prochaine_action_type = serializers.UUIDField(source="prochaine_action_type_id",
                                                  allow_null=True)  # fmt: skip
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
    #: RPT-006 : les types de prochaine action du pays, et l'action notée la fois précédente.
    types_action_proposes = serializers.SerializerMethodField()
    action_precedente = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = ["id", "visite", "statut", "objectif_prevu", "est_imprevue", "justification",
                  "presentations", "resultat", "resultat_obtenu", "resume", "prochaine_action",
                  "prochaine_action_type", "prochaine_action_echeance", "visite_proposee",
                  "remises", "champs", "definitions", "soumis_le", "manquants",
                  "produits_proposes", "produit_autre_autorise", "resultats_proposes",
                  "articles_proposes", "types_action_proposes", "action_precedente",
                  "pieces_jointes"]  # fmt: skip
        read_only_fields = fields

    @extend_schema_field(PieceJointeSerializer(many=True))
    def get_pieces_jointes(self, rapport):
        pieces = rapport.pieces_jointes.filter(archive_le__isnull=True)
        return PieceJointeSerializer(pieces, many=True).data

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

    @extend_schema_field(ResumeSerializer(many=True))
    def get_types_action_proposes(self, rapport):
        return [{"id": v.pk, "libelle": v.libelle} for v in services.types_action(rapport.pays)]

    @extend_schema_field(ActionPrecedenteSerializer(allow_null=True))
    def get_action_precedente(self, rapport):
        action = services.action_precedente(rapport.visite)
        return ActionPrecedenteSerializer(action).data if action else None


class SaisieRapportSerializer(serializers.Serializer):
    presentations = PresentationSerializer(many=True, required=False)
    remises = RemiseSerializer(many=True, required=False)
    resultat = serializers.UUIDField(required=False, allow_null=True)
    resultat_obtenu = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    resume = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    prochaine_action = serializers.CharField(required=False, allow_blank=True, max_length=500)
    prochaine_action_type = serializers.UUIDField(required=False, allow_null=True)
    prochaine_action_echeance = serializers.DateField(required=False, allow_null=True)
    visite_proposee = serializers.BooleanField(required=False)
    champs = serializers.JSONField(required=False)

    def validate_champs(self, valeur):
        if not isinstance(valeur, dict):
            raise serializers.ValidationError("Objet attendu.")
        return valeur


class SoumissionRapportSerializer(serializers.Serializer):
    soumis_le = serializers.DateTimeField()


STATUTS_RAPPORT_VISITE = [("attendu", "Rapport attendu"), *StatutRapport.choices]

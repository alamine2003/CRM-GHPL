from datetime import datetime

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer
from apps.prospects.serializers import ProspectResumeSerializer

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


class RetourPrepareSerializer(serializers.Serializer):
    libelle = serializers.CharField()
    retour = serializers.ChoiceField(choices=RetourPrescripteur.choices)
    date = serializers.DateField()


class EchantillonPrepareSerializer(serializers.Serializer):
    libelle = serializers.CharField()
    quantite = serializers.IntegerField()


class PreparationSerializer(serializers.Serializer):
    """DC-47 : « Préparer ma visite » ; ce que le délégué a noté chez ce prospect."""

    visites = serializers.IntegerField()
    derniere = serializers.DateField()
    retours = RetourPrepareSerializer(many=True)
    echantillons = EchantillonPrepareSerializer(many=True)


class RapportChronologieSerializer(serializers.ModelSerializer):
    """RPT-011 : un rapport dans la chronologie d'un prospect, prêt à lire."""

    date = serializers.DateField(source="visite.date")
    heure = serializers.TimeField(source="visite.heure", allow_null=True, format="%H:%M")
    etablissement = serializers.CharField(source="visite.etablissement.nom", allow_null=True,
                                          default=None)  # fmt: skip
    delegue_nom = serializers.SerializerMethodField()
    #: Écrit par la personne qui lit : son nom n'a pas à se répéter.
    de_moi = serializers.SerializerMethodField()
    resultat = serializers.CharField(source="resultat.libelle", allow_null=True, default=None)
    prochaine_action_type = serializers.CharField(source="prochaine_action_type.libelle",
                                                  allow_null=True, default=None)  # fmt: skip
    presentations = PresentationSerializer(many=True)
    remises = RemiseSerializer(many=True)
    en_retard = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = ["id", "visite", "date", "heure", "etablissement", "delegue", "delegue_nom",
                  "de_moi",
                  "statut", "en_retard", "objectif_prevu", "resultat", "resultat_obtenu",
                  "presentations", "remises", "resume", "prochaine_action_type", "prochaine_action",
                  "prochaine_action_echeance", "soumis_le"]  # fmt: skip
        read_only_fields = fields

    def get_delegue_nom(self, rapport) -> str:
        return f"{rapport.delegue.first_name} {rapport.delegue.last_name}".strip()

    def get_de_moi(self, rapport) -> bool:
        lecteur = self.context.get("lecteur")
        return lecteur is not None and rapport.delegue_id == lecteur.pk

    def get_en_retard(self, rapport) -> bool:
        return services.en_retard(rapport)


class VisiteProposeeSerializer(serializers.Serializer):
    """DC-61 : un prospect pour qui la dernière visite a proposé d'y revenir."""

    prospect = serializers.SerializerMethodField()
    date = serializers.DateField(source="visite.date")
    action = serializers.CharField(source="prochaine_action_type.libelle", allow_null=True,
                                   default=None)  # fmt: skip
    echeance = serializers.DateField(source="prochaine_action_echeance", allow_null=True)

    @extend_schema_field(ProspectResumeSerializer)
    def get_prospect(self, rapport):
        return ProspectResumeSerializer(rapport.visite.prospect).data


class PieceJointeSerializer(serializers.ModelSerializer):
    """Un document PDF joint (RPT-007) ; le fichier se lit par sa propre adresse."""

    #: OFF-005 CA1 : annoncée par le téléphone, son fichier n'est pas encore arrivé.
    en_attente = serializers.SerializerMethodField()

    class Meta:
        model = PieceJointe
        fields = ["id", "nom", "type_mime", "taille", "prise_le", "en_attente"]
        read_only_fields = fields

    def get_en_attente(self, piece) -> bool:
        return piece.recue_le is None


class AnnoncePieceSerializer(serializers.Serializer):
    """OFF-005 (0.8.7) : la pièce choisie sur le téléphone, avant son fichier."""

    id = serializers.UUIDField()
    nom = serializers.CharField(max_length=200)
    taille = serializers.IntegerField(min_value=1)
    prise_le = serializers.DateTimeField()


class SaisiePieceSerializer(serializers.Serializer):
    #: Identifiant tiré par le téléphone : l'envoi se rejoue sans doublon.
    id = serializers.UUIDField()
    fichier = serializers.FileField()
    prise_le = serializers.DateTimeField()


class CorrectionSerializer(serializers.Serializer):
    """RPT-014 : la demande de correction en cours : qui, quand, pourquoi, sur quels champs."""

    le = serializers.DateTimeField(source="correction_le")
    par = serializers.SerializerMethodField()
    commentaire = serializers.CharField(source="correction_commentaire")
    #: Parties du socle (`presentations`, `resultat`…) ou codes des champs du pays.
    champs = serializers.ListField(child=serializers.CharField(), source="correction_champs")

    def get_par(self, rapport) -> str:
        p = rapport.correction_par
        return f"{p.first_name} {p.last_name}".strip() if p else ""


def correction_de(rapport) -> dict | None:
    """La demande en cours tant que le rapport attend sa correction ; sinon rien."""
    if rapport.statut != StatutRapport.A_CORRIGER or rapport.correction_le is None:
        return None
    return CorrectionSerializer(rapport).data


class ReouvertureRapportSerializer(serializers.Serializer):
    """RPT-016 : la réouverture en cours d'un rapport validé : qui, quand, pourquoi."""

    le = serializers.DateTimeField(source="rouvert_le")
    par = serializers.SerializerMethodField()
    motif = serializers.CharField(source="rouvert_motif")

    def get_par(self, rapport) -> str:
        p = rapport.rouvert_par
        return f"{p.first_name} {p.last_name}".strip() if p else ""


def reouverture_de(rapport) -> dict | None:
    """La réouverture tant que le rapport attend sa nouvelle soumission ; sinon rien."""
    if rapport.statut != StatutRapport.ROUVERT or rapport.rouvert_le is None:
        return None
    return ReouvertureRapportSerializer(rapport).data


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
    #: RG-032 : attendu avant cette heure (minuit du jour de la visite, heure du pays).
    echeance = serializers.SerializerMethodField()
    en_retard = serializers.SerializerMethodField()
    #: RPT-014 : ce que le superviseur demande de corriger.
    correction = serializers.SerializerMethodField()
    #: RPT-016 : pourquoi le rapport validé a été rouvert.
    reouverture = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = ["id", "version", "visite", "statut", "correction", "reouverture",
                  "objectif_prevu",
                  "est_imprevue", "justification",
                  "presentations", "resultat", "resultat_obtenu", "resume", "prochaine_action",
                  "prochaine_action_type", "prochaine_action_echeance", "visite_proposee",
                  "remises", "champs", "definitions", "soumis_le", "echeance", "en_retard",
                  "horodatage_douteux", "manquants",
                  "produits_proposes", "produit_autre_autorise", "resultats_proposes",
                  "articles_proposes", "types_action_proposes", "action_precedente",
                  "pieces_jointes"]  # fmt: skip
        read_only_fields = fields

    def get_echeance(self, rapport) -> datetime:
        return services.echeance(rapport)

    @extend_schema_field(CorrectionSerializer(allow_null=True))
    def get_correction(self, rapport):
        return correction_de(rapport)

    @extend_schema_field(ReouvertureRapportSerializer(allow_null=True))
    def get_reouverture(self, rapport):
        return reouverture_de(rapport)

    def get_en_retard(self, rapport) -> bool:
        return services.en_retard(rapport)

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
    #: RG-052 (0.8.4) : la version du rapport sur laquelle la saisie s'appuie ; si le rapport a
    #: changé depuis, l'enregistrement est refusé (conflit) au lieu d'écraser en silence.
    version = serializers.IntegerField(required=False, min_value=0)

    def validate_champs(self, valeur):
        if not isinstance(valeur, dict):
            raise serializers.ValidationError("Objet attendu.")
        return valeur


class SoumissionRapportSerializer(serializers.Serializer):
    #: Le moment où le délégué a soumis, sur le téléphone (peut-être hors connexion).
    soumis_le = serializers.DateTimeField()
    #: L'heure du téléphone au moment de l'envoi : un écart avec le serveur se voit (RPT-010).
    envoye_le = serializers.DateTimeField(required=False, allow_null=True)


STATUTS_RAPPORT_VISITE = [("attendu", "Rapport attendu"), *StatutRapport.choices]


class HistoriqueProspectSerializer(serializers.Serializer):
    """OFF-001 : les derniers rapports d'un prospect de la liste cible."""

    prospect = serializers.UUIDField()
    rapports = RapportChronologieSerializer(many=True)


class HistoriqueSynchroSerializer(serializers.Serializer):
    genere_le = serializers.DateTimeField()
    prospects = HistoriqueProspectSerializer(many=True)


class ModeleRapportSerializer(serializers.Serializer):
    """OFF-002 : la visite et son rapport (existant, ou modèle vierge non enregistré)."""

    visite = serializers.UUIDField()
    rapport = RapportSerializer()


class ModelesRapportSerializer(serializers.Serializer):
    genere_le = serializers.DateTimeField()
    rapports = ModeleRapportSerializer(many=True)

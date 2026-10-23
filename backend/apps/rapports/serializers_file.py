"""Sérialiseurs de la file de travail du superviseur (RPT-012), à part : ils reprennent ceux du
planning, qui dépendent eux-mêmes des rapports."""

from datetime import datetime

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.planning.models import Classement, ModeDecision
from apps.planning.serializers import (
    ActiviteSerializer,
    DelegueSerializer,
    EcartConformiteSerializer,
)

from . import versions as versions_figees
from .models import Rapport
from .serializers import (
    CorrectionSerializer,
    PieceJointeSerializer,
    PresentationSerializer,
    RemiseSerializer,
    ReouvertureRapportSerializer,
    correction_de,
    reouverture_de,
)


class JourneeATraiterSerializer(serializers.Serializer):
    """RPT-012 CA1 : une journée terminée et non validée, son classement et ses écarts, et
    l'état de ses rapports."""

    date = serializers.DateField()
    #: Le planning de la semaine, pour consulter la journée.
    planning = serializers.UUIDField()
    classement = serializers.ChoiceField(choices=Classement.choices)
    ecarts = EcartConformiteSerializer(many=True)
    visites = serializers.IntegerField()
    effectuees = serializers.IntegerField()
    rapports_a_valider = serializers.IntegerField()
    #: Visites effectuées dont le rapport n'est pas encore soumis.
    rapports_attendus = serializers.IntegerField()
    rapports_en_retard = serializers.IntegerField()
    horodatages_douteux = serializers.IntegerField()
    #: RPT-014 : rapports renvoyés au délégué pour correction.
    rapports_a_corriger = serializers.IntegerField()
    #: RPT-016 : rapports validés puis rouverts, qui attendent leur nouvelle soumission.
    rapports_rouverts = serializers.IntegerField()
    #: [H] Ouverte à l'administrateur pays par escalade (0.6.3).
    escalade = serializers.BooleanField()
    #: 23.A : conforme, complète et sans horodatage douteux ; validable avec le lot.
    eligible_lot = serializers.BooleanField()


class DelegueATraiterSerializer(serializers.Serializer):
    delegue = DelegueSerializer()
    journees = JourneeATraiterSerializer(many=True)


class ATraiterSerializer(serializers.Serializer):
    """« À traiter aujourd'hui » (DC-47, engagement 3) : les journées par délégué, et le
    nombre de plannings qui attendent une décision."""

    delegues = DelegueATraiterSerializer(many=True)
    plannings_a_valider = serializers.IntegerField()


class ChampLuSerializer(serializers.Serializer):
    """Un champ du pays (RPT-008) tel que rempli, avec son libellé du jour du rapport."""

    code = serializers.CharField()
    libelle = serializers.CharField()
    type = serializers.CharField()
    valeur = serializers.JSONField(allow_null=True)


class CorrectionFigeeSerializer(serializers.Serializer):
    le = serializers.DateTimeField()
    par = serializers.CharField()
    commentaire = serializers.CharField()
    champs = serializers.ListField(child=serializers.CharField())
    #: RPT-016 : la version répond à une réouverture, non à une demande de correction.
    reouverture = serializers.BooleanField(required=False, default=False)


class VersionLueSerializer(serializers.Serializer):
    """RG-037, RPT-015 : une soumission du rapport, et la correction à laquelle elle répond."""

    numero = serializers.IntegerField()
    soumis_le = serializers.DateTimeField()
    correction = CorrectionFigeeSerializer(allow_null=True)


class ContenuLuSerializer(serializers.Serializer):
    """RPT-015 CA1 : le contenu d'une version précédente, tel que soumis."""

    objectif_prevu = serializers.CharField()
    resultat = serializers.CharField(allow_null=True)
    resultat_obtenu = serializers.CharField()
    presentations = PresentationSerializer(many=True)
    remises = RemiseSerializer(many=True)
    resume = serializers.CharField()
    prochaine_action_type = serializers.CharField(allow_null=True)
    prochaine_action = serializers.CharField()
    prochaine_action_echeance = serializers.DateField(allow_null=True)
    visite_proposee = serializers.BooleanField()
    champs = ChampLuSerializer(many=True)
    #: Noms des documents joints à cette version.
    pieces_jointes = serializers.ListField(child=serializers.CharField())


class RapportLuSerializer(serializers.ModelSerializer):
    """0.6.2 : le rapport soumis, à lire par le superviseur : tout son contenu, ses pièces
    jointes (RPT-007 CA2), son retard et son horodatage (RPT-010 CA1), ses versions (RG-037)."""

    resultat = serializers.CharField(source="resultat.libelle", allow_null=True, default=None)
    prochaine_action_type = serializers.CharField(source="prochaine_action_type.libelle",
                                                  allow_null=True, default=None)  # fmt: skip
    presentations = PresentationSerializer(many=True)
    remises = RemiseSerializer(many=True)
    champs = serializers.SerializerMethodField()
    pieces_jointes = serializers.SerializerMethodField()
    #: Heure donnée par le téléphone et heure de réception de la dernière soumission.
    heure_telephone = serializers.SerializerMethodField()
    recu_le = serializers.SerializerMethodField()
    versions = serializers.SerializerMethodField()
    #: RPT-013 CA2, RG-034 : validateur, date et mode.
    valide_par = serializers.SerializerMethodField()
    #: RPT-014 : la correction demandée, tant qu'elle attend.
    correction = serializers.SerializerMethodField()
    #: RPT-015 : les soumissions successives ; la version d'avant ; ce qui a changé depuis.
    historique = serializers.SerializerMethodField()
    precedente = serializers.SerializerMethodField()
    modifies = serializers.SerializerMethodField()
    #: RPT-016 : la réouverture en cours, tant que le rapport attend sa nouvelle soumission ;
    #: et si la personne qui lit peut le rouvrir.
    reouverture = serializers.SerializerMethodField()
    rouvrable = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = ["id", "statut", "correction", "reouverture", "rouvrable", "historique",
                  "precedente", "modifies",
                  "valide_le", "valide_par", "mode_validation",
                  "soumis_le", "en_retard", "horodatage_douteux",
                  "heure_telephone", "recu_le", "versions", "objectif_prevu", "resultat",
                  "resultat_obtenu", "presentations", "remises", "resume",
                  "prochaine_action_type", "prochaine_action", "prochaine_action_echeance",
                  "visite_proposee", "champs", "pieces_jointes"]  # fmt: skip
        read_only_fields = fields

    @staticmethod
    def _derniere(rapport):
        versions = list(rapport.versions.all())
        return versions[-1] if versions else None

    @extend_schema_field(ChampLuSerializer(many=True))
    def get_champs(self, rapport):
        return [{"code": d["code"], "libelle": d["libelle"], "type": d["type"],
                 "valeur": rapport.champs.get(d["code"])}
                for d in rapport.definitions]  # fmt: skip

    @extend_schema_field(PieceJointeSerializer(many=True))
    def get_pieces_jointes(self, rapport):
        pieces = [p for p in rapport.pieces_jointes.all() if p.archive_le is None]
        return PieceJointeSerializer(pieces, many=True).data

    def get_heure_telephone(self, rapport) -> datetime | None:
        derniere = self._derniere(rapport)
        return derniere.heure_telephone if derniere else None

    def get_recu_le(self, rapport) -> datetime | None:
        derniere = self._derniere(rapport)
        return derniere.recu_le if derniere else None

    @extend_schema_field(CorrectionSerializer(allow_null=True))
    def get_correction(self, rapport):
        return correction_de(rapport)

    def get_valide_par(self, rapport) -> str | None:
        p = rapport.valide_par
        return f"{p.first_name} {p.last_name}".strip() if p else None

    def get_versions(self, rapport) -> int:
        return len(rapport.versions.all())

    @extend_schema_field(ReouvertureRapportSerializer(allow_null=True))
    def get_reouverture(self, rapport):
        return reouverture_de(rapport)

    def get_rouvrable(self, rapport) -> bool:
        return bool(getattr(rapport, "rouvrable", False))

    @extend_schema_field(VersionLueSerializer(many=True))
    def get_historique(self, rapport):
        return [{"numero": v.numero, "soumis_le": v.soumis_le, "correction": v.correction}
                for v in rapport.versions.all()]  # fmt: skip

    @staticmethod
    def _deux_dernieres(rapport):
        versions = list(rapport.versions.all())
        return versions[-2:] if len(versions) > 1 else None

    @extend_schema_field(ContenuLuSerializer(allow_null=True))
    def get_precedente(self, rapport):
        paire = self._deux_dernieres(rapport)
        if not paire:
            return None
        return ContenuLuSerializer(versions_figees.lecture(paire[0].contenu)).data

    def get_modifies(self, rapport) -> list[str]:
        paire = self._deux_dernieres(rapport)
        return versions_figees.modifies(paire[0].contenu, paire[1].contenu) if paire else []


class VisiteJourneeSerializer(serializers.Serializer):
    """Une visite de la journée, ce qui s'est passé et son rapport."""

    id = serializers.UUIDField()
    heure = serializers.TimeField(allow_null=True, format="%H:%M")
    prospect = serializers.SerializerMethodField()
    etablissement = serializers.CharField(source="etablissement.nom", allow_null=True,
                                          default=None)  # fmt: skip
    statut = serializers.CharField()
    objectif = serializers.CharField()
    est_imprevue = serializers.BooleanField()
    justification = serializers.CharField()
    motif_ecart = serializers.CharField(source="motif_ecart.libelle", allow_null=True,
                                        default=None)  # fmt: skip
    commentaire_ecart = serializers.CharField()
    debut_le = serializers.DateTimeField(allow_null=True)
    fin_le = serializers.DateTimeField(allow_null=True)
    distance_debut_m = serializers.IntegerField(allow_null=True)
    distance_fin_m = serializers.IntegerField(allow_null=True)
    sans_gps = serializers.BooleanField()
    rapport_statut = serializers.ChoiceField(
        choices=["attendu", "brouillon", "soumis", "a_corriger", "valide", "rouvert"],
        allow_null=True,
    )  # fmt: skip
    rapport = RapportLuSerializer(source="rapport_lu", allow_null=True)

    def get_prospect(self, visite) -> str | None:
        p = visite.prospect
        return " ".join(x for x in (p.prenom, p.nom) if x) if p else None


class JourneeSerializer(serializers.Serializer):
    """0.6.2 : une journée d'un délégué, à consulter avant de la valider (RPT-013, 0.6.3)."""

    delegue = DelegueSerializer()
    date = serializers.DateField()
    planning = serializers.UUIDField()
    classement = serializers.ChoiceField(choices=Classement.choices)
    ecarts = EcartConformiteSerializer(many=True)
    #: Validée : le classement ne bouge plus (VIS-010 CA3).
    fige = serializers.BooleanField()
    #: À quel titre l'utilisateur valide : `direct`, `remplacement` ou `escalade` ; le DM du
    #: périmètre la lit en `consultation`, pour en rouvrir un rapport (RPT-016).
    mode = serializers.ChoiceField(choices=[*ModeDecision.choices,
                                            ("consultation", "Consultation")])  # fmt: skip
    #: 22.A : visites effectuées dont le rapport n'est pas soumis ; la journée attend.
    rapports_manquants = serializers.IntegerField()
    activites = ActiviteSerializer(many=True)
    visites = VisiteJourneeSerializer(many=True)


class ChoixJourneeSerializer(serializers.Serializer):
    delegue = serializers.UUIDField()
    date = serializers.DateField()


class JourneeChoisieSerializer(serializers.Serializer):
    delegue = serializers.UUIDField()
    date = serializers.DateField()


class ValidationLotSerializer(serializers.Serializer):
    """RPT-013 CA1 : les journées affichées ; seules les éligibles sont validées."""

    journees = JourneeChoisieSerializer(many=True)


class ResultatValidationSerializer(serializers.Serializer):
    journees = serializers.IntegerField()
    rapports = serializers.IntegerField()


class DemandeCorrectionSerializer(serializers.Serializer):
    """RPT-014 CA1 : commentaire obligatoire ; champs concernés facultatifs."""

    commentaire = serializers.CharField(max_length=2000, allow_blank=True)
    champs = serializers.ListField(child=serializers.CharField(max_length=40), required=False,
                                   default=list)  # fmt: skip


class DemandeReouvertureRapportSerializer(serializers.Serializer):
    """RPT-016 : motif obligatoire."""

    motif = serializers.CharField(max_length=2000, allow_blank=True)


class RapportEnRetardSerializer(serializers.Serializer):
    """RPT-017 : une visite effectuée dont le rapport n'est pas soumis après son échéance."""

    visite = serializers.UUIDField(source="pk")
    delegue = DelegueSerializer()
    date = serializers.DateField()
    heure = serializers.TimeField(allow_null=True, format="%H:%M")
    prospect = serializers.SerializerMethodField()
    etablissement = serializers.CharField(source="etablissement.nom", allow_null=True,
                                          default=None)  # fmt: skip
    #: `attendu` (rien d'écrit) ou `brouillon`.
    etat = serializers.ChoiceField(choices=["attendu", "brouillon"])
    jours_de_retard = serializers.IntegerField()

    def get_prospect(self, visite) -> str | None:
        p = visite.prospect
        return " ".join(x for x in (p.prenom, p.nom) if x) if p else None


class JourneeEnRetardSerializer(serializers.Serializer):
    """20.A : une journée de plus de 4 semaines, toujours pas validée."""

    delegue = DelegueSerializer()
    date = serializers.DateField()
    planning = serializers.UUIDField()
    effectuees = serializers.IntegerField()
    rapports_a_valider = serializers.IntegerField()
    rapports_attendus = serializers.IntegerField()


class RetardsSerializer(serializers.Serializer):
    """RPT-017 CA1 : les retards, filtrables par délégué."""

    delegues = DelegueSerializer(many=True)
    rapports = RapportEnRetardSerializer(many=True)
    journees = JourneeEnRetardSerializer(many=True)


class ChoixRetardsSerializer(serializers.Serializer):
    delegue = serializers.UUIDField(required=False)

"""Sérialiseurs de la file de travail du superviseur (RPT-012), à part : ils reprennent ceux du
planning, qui dépendent eux-mêmes des rapports."""

from datetime import datetime

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.planning.models import Classement
from apps.planning.serializers import (
    ActiviteSerializer,
    DelegueSerializer,
    EcartConformiteSerializer,
)

from .models import Rapport
from .serializers import PieceJointeSerializer, PresentationSerializer, RemiseSerializer


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

    libelle = serializers.CharField()
    type = serializers.CharField()
    valeur = serializers.JSONField(allow_null=True)


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

    class Meta:
        model = Rapport
        fields = ["id", "statut", "soumis_le", "en_retard", "horodatage_douteux",
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
        return [{"libelle": d["libelle"], "type": d["type"],
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

    def get_versions(self, rapport) -> int:
        return len(rapport.versions.all())


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
    activites = ActiviteSerializer(many=True)
    visites = VisiteJourneeSerializer(many=True)


class ChoixJourneeSerializer(serializers.Serializer):
    delegue = serializers.UUIDField()
    date = serializers.DateField()

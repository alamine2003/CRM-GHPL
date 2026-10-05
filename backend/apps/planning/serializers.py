from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from .controles import CODES, GRAVITES
from .models import Activite, JourFerie, Passage, Periode, Planning, TypeActivite, Visite
from .services import RAISONS_REPRISE


class JourFerieSerializer(serializers.ModelSerializer):
    #: Faux à partir du jour même : la date est acquise (ORG-012 CA2).
    modifiable = serializers.SerializerMethodField()

    class Meta:
        model = JourFerie
        fields = ["id", "date", "libelle", "variable", "modifiable"]

    def get_modifiable(self, jour) -> bool:
        aujourdhui = self.context.get("aujourdhui")
        return aujourdhui is not None and jour.date > aujourdhui


class SaisieJourFerieSerializer(serializers.Serializer):
    date = serializers.DateField()
    libelle = serializers.CharField(max_length=120)
    variable = serializers.BooleanField(required=False, default=False)


class ModificationJourFerieSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    libelle = serializers.CharField(max_length=120, required=False)
    variable = serializers.BooleanField(required=False)


class PlanningSerializer(serializers.ModelSerializer):
    #: Échéance de soumission du pays (RG-013).
    echeance = serializers.SerializerMethodField()

    class Meta:
        model = Planning
        fields = ["id", "semaine", "statut", "cree_le", "soumis_le", "en_retard", "echeance"]
        read_only_fields = ["statut", "soumis_le", "en_retard"]

    def get_echeance(self, planning) -> str:
        from .services import echeance

        return echeance(planning).isoformat()


class CreationPlanningSerializer(serializers.Serializer):
    semaine = serializers.DateField()


class ProspectVisiteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    civilite = serializers.CharField(allow_blank=True)
    prenom = serializers.CharField(allow_blank=True)
    nom = serializers.CharField()
    specialite_libelle = serializers.CharField(source="specialite.libelle", default=None)
    type_libelle = serializers.CharField(source="type.libelle")
    potentiel = serializers.CharField()


class EtablissementVisiteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField()


class VisiteSerializer(serializers.ModelSerializer):
    prospect = ProspectVisiteSerializer(allow_null=True)
    etablissement = EtablissementVisiteSerializer(allow_null=True)
    reseau = ResumeSerializer(allow_null=True)
    heure = serializers.TimeField(format="%H:%M", allow_null=True)
    #: Champs à compléter avant la soumission (PLN-002 CA1).
    manquants = serializers.SerializerMethodField()

    class Meta:
        model = Visite
        fields = ["id", "date", "heure", "prospect", "etablissement", "reseau", "objectif",
                  "note", "statut", "manquants", "passage", "ordre"]  # fmt: skip

    def get_manquants(self, visite) -> list[str]:
        from .services import champs_manquants

        return champs_manquants(visite)


class SaisieVisiteSerializer(serializers.Serializer):
    #: Identifiant donné par le téléphone : un envoi rejoué ne crée pas de doublon (0.2.7).
    id = serializers.UUIDField(required=False)
    date = serializers.DateField()
    heure = serializers.TimeField(required=False, allow_null=True, input_formats=["%H:%M"])
    prospect = serializers.UUIDField(required=False, allow_null=True)
    etablissement = serializers.UUIDField(required=False, allow_null=True)
    reseau = serializers.UUIDField(required=False, allow_null=True)
    objectif = serializers.CharField(max_length=200, required=False, allow_blank=True)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ModificationVisiteSerializer(SaisieVisiteSerializer):
    id = None
    date = serializers.DateField(required=False)


class OrdreSerializer(serializers.Serializer):
    date = serializers.DateField()
    #: Toutes les visites du jour, dans l'ordre voulu.
    visites = serializers.ListField(child=serializers.UUIDField())


class PoseSerializer(serializers.Serializer):
    """Prospects de la liste cible posés sur un jour (PLN-005 CA1)."""

    date = serializers.DateField()
    prospects = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=30)


class CopieSerializer(serializers.Serializer):
    date = serializers.DateField()


class VisiteIgnoreeSerializer(serializers.Serializer):
    visite = serializers.UUIDField()
    date = serializers.DateField()
    raison = serializers.ChoiceField(choices=RAISONS_REPRISE)


class RepriseSerializer(serializers.Serializer):
    copiees = serializers.IntegerField()
    #: Visites de la semaine précédente qui n'ont pas trouvé de jour.
    ignorees = VisiteIgnoreeSerializer(many=True)


class PassageSerializer(serializers.ModelSerializer):
    """Ligne « Établissement · n prescripteurs » (PLN-003 CA1)."""

    etablissement = EtablissementVisiteSerializer()
    heure = serializers.TimeField(format="%H:%M", allow_null=True)
    visites = serializers.SerializerMethodField()

    class Meta:
        model = Passage
        fields = ["id", "date", "heure", "etablissement", "visites"]

    def get_visites(self, passage) -> list[str]:
        return [str(v.pk) for v in passage.visites.all() if v.archive_le is None]


class RegroupementSerializer(serializers.Serializer):
    visites = serializers.ListField(child=serializers.UUIDField(), min_length=2)


class ActiviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Activite
        fields = ["id", "date", "periode", "type", "commentaire", "demande_superviseur",
                  "avec_visites"]  # fmt: skip
        read_only_fields = ["avec_visites"]

    #: Commando, déplacement ou accompagnement : le délégué y visite (PLN-018).
    avec_visites = serializers.BooleanField(read_only=True)


class SaisieActiviteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    date = serializers.DateField()
    periode = serializers.ChoiceField(choices=Periode.choices, required=False,
                                      default=Periode.JOURNEE)  # fmt: skip
    type = serializers.ChoiceField(choices=TypeActivite.choices)
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)
    demande_superviseur = serializers.BooleanField(required=False, default=False)


class ModificationActiviteSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    periode = serializers.ChoiceField(choices=Periode.choices, required=False)
    type = serializers.ChoiceField(choices=TypeActivite.choices, required=False)
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)
    demande_superviseur = serializers.BooleanField(required=False)


class ProspectOublieSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField()


class ControlePlanningSerializer(serializers.Serializer):
    """Contrôle du planning (PLN-004) : `bloquant` (RG-015) ou `signalement` (RG-016)."""

    code = serializers.ChoiceField(choices=CODES)
    gravite = serializers.ChoiceField(choices=GRAVITES)
    date = serializers.DateField(allow_null=True)
    #: Visites concernées, à ouvrir pour corriger.
    visites = serializers.ListField(child=serializers.UUIDField())
    manquants = serializers.ListField(child=serializers.CharField(), required=False,
                                      allow_null=True)  # fmt: skip
    fiche = serializers.CharField(required=False, allow_null=True)
    heure = serializers.CharField(required=False, allow_null=True)
    nombre = serializers.IntegerField(required=False, allow_null=True)
    min = serializers.IntegerField(required=False, allow_null=True)
    max = serializers.IntegerField(required=False, allow_null=True)
    mois = serializers.CharField(required=False, allow_null=True)
    prospects = ProspectOublieSerializer(many=True, required=False, allow_null=True)


class ObjectifSerializer(serializers.Serializer):
    date = serializers.DateField()
    visites = serializers.IntegerField()
    min = serializers.IntegerField()
    max = serializers.IntegerField()


class ControlesSerializer(serializers.Serializer):
    bloquants = ControlePlanningSerializer(many=True)
    signalements = ControlePlanningSerializer(many=True)
    #: Visites de chaque jour planifiable face à son seuil.
    objectifs = ObjectifSerializer(many=True)


class EtapeSerializer(serializers.Serializer):
    visite = serializers.UUIDField()
    #: Distance depuis l'arrêt précédent ; nulle pour le premier lieu ou un lieu sans coordonnées.
    km = serializers.FloatField(allow_null=True)


class JourKmSerializer(serializers.Serializer):
    date = serializers.DateField()
    km = serializers.FloatField()
    sans_coordonnees = serializers.IntegerField()
    etapes = EtapeSerializer(many=True)


class KilometrageSerializer(serializers.Serializer):
    """Kilométrage estimé à vol d'oiseau, sans montant (PLN-010)."""

    total_km = serializers.FloatField()
    sans_coordonnees = serializers.IntegerField()
    jours = JourKmSerializer(many=True)


class JourSemaineSerializer(serializers.Serializer):
    date = serializers.DateField()
    #: Libellé du jour férié, ou nul.
    ferie = serializers.CharField(allow_null=True)
    planifiable = serializers.BooleanField()


class SemaineSerializer(serializers.Serializer):
    """Semaine du délégué : ses jours ouvrés, ses jours fériés et son planning (PLN-001)."""

    semaine = serializers.DateField()
    precedente = serializers.DateField()
    suivante = serializers.DateField()
    courante = serializers.BooleanField()
    #: Fuseau du pays (IANA) : l'échéance et la soumission s'affichent à l'heure du pays.
    fuseau = serializers.CharField()
    jours = JourSemaineSerializer(many=True)
    planning = PlanningSerializer(allow_null=True)
    #: Faux pour une semaine passée ou sans poste occupé.
    peut_creer = serializers.BooleanField()
    #: Vrai tant que le planning se prépare ou se révise (visites modifiables).
    modifiable = serializers.BooleanField()
    visites = VisiteSerializer(many=True)
    passages = PassageSerializer(many=True)
    activites = ActiviteSerializer(many=True)
    #: Visites de la semaine précédente que la reprise recopierait (PLN-005 CA2) ; 0 sinon.
    reprenables = serializers.IntegerField()
    #: Kilométrage estimé (PLN-010) ; nul sans planning.
    kilometrage = KilometrageSerializer(allow_null=True)
    #: Contrôles du planning (PLN-004) ; nul sans planning.
    controles = ControlesSerializer(allow_null=True)
    #: Réseaux des postes occupés cette semaine, proposés pour chaque visite.
    reseaux = ResumeSerializer(many=True)


class DelegueSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")


class SignalementResumeSerializer(serializers.Serializer):
    code = serializers.CharField()
    nombre = serializers.IntegerField()


class PlanningEnAttenteSerializer(serializers.Serializer):
    """Ligne de la file du superviseur (PLN-011) : le planning, son délégué, ses alertes et
    ses activités connexes, avec leur explication (PLN-018)."""

    planning = PlanningSerializer()
    #: Fuseau du pays : les dates de soumission s'affichent à l'heure du pays.
    fuseau = serializers.CharField()
    delegue = DelegueSerializer()
    postes = serializers.ListField(child=serializers.CharField())
    visites = serializers.IntegerField()
    signalements = SignalementResumeSerializer(many=True)
    activites = serializers.SerializerMethodField()

    @extend_schema_field(ActiviteSerializer(many=True))
    def get_activites(self, ligne) -> list[dict]:
        return ActiviteSerializer(ligne["activites"], many=True).data


class ConsultationSerializer(SemaineSerializer):
    """0.3.2 : un planning soumis consulté par son superviseur ; la semaine telle que le
    délégué l'a préparée, avec le délégué et ses postes de la semaine."""

    delegue = DelegueSerializer()
    postes = serializers.ListField(child=serializers.CharField())

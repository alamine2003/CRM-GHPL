from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from .models import JourFerie, Planning, Visite


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
    class Meta:
        model = Planning
        fields = ["id", "semaine", "statut", "cree_le"]


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
                  "note", "statut", "manquants"]  # fmt: skip

    def get_manquants(self, visite) -> list[str]:
        from .services import champs_manquants

        return champs_manquants(visite)


class SaisieVisiteSerializer(serializers.Serializer):
    date = serializers.DateField()
    heure = serializers.TimeField(required=False, allow_null=True, input_formats=["%H:%M"])
    prospect = serializers.UUIDField(required=False, allow_null=True)
    etablissement = serializers.UUIDField(required=False, allow_null=True)
    reseau = serializers.UUIDField(required=False, allow_null=True)
    objectif = serializers.CharField(max_length=200, required=False, allow_blank=True)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ModificationVisiteSerializer(SaisieVisiteSerializer):
    date = serializers.DateField(required=False)


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
    jours = JourSemaineSerializer(many=True)
    planning = PlanningSerializer(allow_null=True)
    #: Faux pour une semaine passée ou sans poste occupé.
    peut_creer = serializers.BooleanField()
    #: Vrai tant que le planning se prépare ou se révise (visites modifiables).
    modifiable = serializers.BooleanField()
    visites = VisiteSerializer(many=True)
    #: Réseaux des postes occupés cette semaine, proposés pour chaque visite.
    reseaux = ResumeSerializer(many=True)

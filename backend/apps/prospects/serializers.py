from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Activite, Civilite, Etablissement, Exercice, Potentiel, Prospect


class PersonneResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    identifiant = serializers.CharField(source="username")
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")


class LieuSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()


class ProspectSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", read_only=True)
    type = serializers.UUIDField(source="type_id")
    type_libelle = serializers.CharField(source="type.libelle")
    specialite = serializers.UUIDField(source="specialite_id", allow_null=True)
    specialite_libelle = serializers.CharField(
        source="specialite.libelle", allow_null=True, default=None
    )
    grade = serializers.UUIDField(source="grade_id", allow_null=True)
    grade_libelle = serializers.CharField(source="grade.libelle", allow_null=True, default=None)
    secteur = LieuSerializer(allow_null=True)
    localite = LieuSerializer(allow_null=True)
    cree_par = PersonneResumeSerializer()
    modifiable = serializers.SerializerMethodField()
    lieu_principal = serializers.SerializerMethodField()

    class Meta:
        model = Prospect
        fields = [
            "id", "pays", "civilite", "nom", "prenom", "type", "type_libelle", "specialite",
            "specialite_libelle", "numero_ordre", "telephone_mobile", "telephone_pro",
            "courriel", "potentiel", "activite", "grade", "grade_libelle", "secteur", "localite",
            "statut", "cree_par", "cree_le", "valide_le", "modifiable", "lieu_principal",
        ]  # fmt: skip

    def get_modifiable(self, prospect) -> bool:
        decider = self.context.get("peut_modifier")
        return bool(decider and decider(prospect))

    @extend_schema_field(LieuSerializer(allow_null=True))
    def get_lieu_principal(self, prospect):
        """Établissement principal en cours (PRP-004), ou le premier exercice en cours."""
        en_cours = getattr(prospect, "exercices_en_cours", None)
        if en_cours is None:
            en_cours = list(
                prospect.exercices.filter(fin__isnull=True).select_related("etablissement")
            )
        if not en_cours:
            return None
        exercice = next((e for e in en_cours if e.principal), en_cours[0])
        return {"id": exercice.etablissement_id, "libelle": exercice.etablissement.nom}


class ListeProspectsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    limite = serializers.IntegerField()
    resultats = ProspectSerializer(many=True)


class SaisieProspectSerializer(serializers.Serializer):
    civilite = serializers.ChoiceField(choices=Civilite.choices, required=False, allow_blank=True)
    nom = serializers.CharField(max_length=80, required=False, allow_blank=True)
    prenom = serializers.CharField(max_length=80, required=False, allow_blank=True)
    type = serializers.UUIDField(required=False, allow_null=True)
    specialite = serializers.UUIDField(required=False, allow_null=True)
    numero_ordre = serializers.CharField(max_length=40, required=False, allow_blank=True)
    telephone_mobile = serializers.CharField(max_length=30, required=False, allow_blank=True)
    telephone_pro = serializers.CharField(max_length=30, required=False, allow_blank=True)
    courriel = serializers.EmailField(required=False, allow_blank=True)
    potentiel = serializers.ChoiceField(choices=Potentiel.choices, required=False)
    activite = serializers.ChoiceField(choices=Activite.choices, required=False, allow_blank=True)
    grade = serializers.UUIDField(required=False, allow_null=True)
    secteur = serializers.UUIDField(required=False, allow_null=True)
    localite = serializers.UUIDField(required=False, allow_null=True)


class ArchivageProspectSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=200, required=False, allow_blank=True)


class SyntheseProspectsSerializer(serializers.Serializer):
    actifs = serializers.IntegerField()
    a_valider = serializers.IntegerField()
    mes_a_valider = serializers.IntegerField()
    potentiels = serializers.DictField(child=serializers.IntegerField())
    sans_lieu = serializers.IntegerField(help_text="Fiches actives sans lieu d'exercice en cours.")


class SecteurResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()
    zone = serializers.CharField(source="zone.libelle")


class SecteurSaisieSerializer(SecteurResumeSerializer):
    """Secteur et ses localités actives, proposés à la saisie d'une fiche."""

    localites = LieuSerializer(source="localites_actives", many=True)


class EtablissementSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", read_only=True)
    type = serializers.UUIDField(source="type_id")
    type_code = serializers.CharField(source="type.code")
    type_libelle = serializers.CharField(source="type.libelle")
    secteur = SecteurResumeSerializer()
    localite = LieuSerializer(allow_null=True)
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    a_coordonnees = serializers.BooleanField(read_only=True)
    cree_par = PersonneResumeSerializer()
    modifiable = serializers.SerializerMethodField()

    class Meta:
        model = Etablissement
        fields = [
            "id", "pays", "nom", "type", "type_code", "type_libelle", "secteur", "adresse",
            "localite", "activite", "latitude", "longitude", "a_coordonnees", "telephone",
            "statut",
            "cree_par", "cree_le", "valide_le", "modifiable",
        ]  # fmt: skip

    def get_modifiable(self, fiche) -> bool:
        decider = self.context.get("peut_modifier")
        return bool(decider and decider(fiche))


class ListeEtablissementsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    limite = serializers.IntegerField()
    resultats = EtablissementSerializer(many=True)


class SaisieEtablissementSerializer(serializers.Serializer):
    nom = serializers.CharField(max_length=160, required=False, allow_blank=True)
    type = serializers.UUIDField(required=False, allow_null=True)
    secteur = serializers.UUIDField(required=False, allow_null=True)
    adresse = serializers.CharField(max_length=200, required=False, allow_blank=True)
    localite = serializers.UUIDField(required=False, allow_null=True)
    activite = serializers.ChoiceField(choices=Activite.choices, required=False, allow_blank=True)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    telephone = serializers.CharField(max_length=30, required=False, allow_blank=True)


class SyntheseEtablissementsSerializer(serializers.Serializer):
    actifs = serializers.IntegerField()
    a_valider = serializers.IntegerField()
    mes_a_valider = serializers.IntegerField()
    sans_coordonnees = serializers.IntegerField()
    secteurs_couverts = serializers.IntegerField()
    types = serializers.DictField(child=serializers.IntegerField())


# --- Exercices (PRP-004) ---------------------------------------------------------------------


class ProspectResumeSerializer(serializers.ModelSerializer):
    specialite_libelle = serializers.CharField(
        source="specialite.libelle", allow_null=True, default=None
    )
    type_libelle = serializers.CharField(source="type.libelle")

    class Meta:
        model = Prospect
        fields = ["id", "civilite", "prenom", "nom", "type_libelle", "specialite_libelle",
                  "potentiel", "statut"]  # fmt: skip


class EtablissementResumeSerializer(serializers.ModelSerializer):
    type_code = serializers.CharField(source="type.code")
    type_libelle = serializers.CharField(source="type.libelle")
    secteur = serializers.CharField(source="secteur.libelle")
    localite = serializers.CharField(source="localite.libelle", allow_null=True, default=None)
    a_coordonnees = serializers.BooleanField(read_only=True)

    class Meta:
        model = Etablissement
        fields = ["id", "nom", "type_code", "type_libelle", "secteur", "localite",
                  "a_coordonnees", "statut"]  # fmt: skip


class ExerciceSerializer(serializers.ModelSerializer):
    prospect = ProspectResumeSerializer()
    etablissement = EtablissementResumeSerializer()
    actif = serializers.SerializerMethodField()

    class Meta:
        model = Exercice
        fields = ["id", "prospect", "etablissement", "debut", "fin", "actif", "principal",
                  "presence", "cree_le"]  # fmt: skip

    def get_actif(self, exercice) -> bool:
        from apps.socle.services import aujourdhui

        return exercice.actif_le(aujourdhui(exercice.pays))


class SaisieExerciceSerializer(serializers.Serializer):
    etablissement = serializers.UUIDField()
    debut = serializers.DateField(required=False)
    principal = serializers.BooleanField(required=False, allow_null=True, default=None)
    presence = serializers.CharField(max_length=120, required=False, allow_blank=True)


class ModificationExerciceSerializer(serializers.Serializer):
    principal = serializers.BooleanField(required=False)
    presence = serializers.CharField(max_length=120, required=False, allow_blank=True)


class FinExerciceSerializer(serializers.Serializer):
    fin = serializers.DateField(required=False)

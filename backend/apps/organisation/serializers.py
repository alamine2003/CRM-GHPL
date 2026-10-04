from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.socle.services import aujourdhui

from .models import (
    Division,
    Occupation,
    PerimetreReseau,
    Poste,
    Rattachement,
    Reseau,
    Secteur,
    TypePoste,
    Zone,
)


def _actif(lien, jour) -> bool:
    return lien.debut <= jour and (lien.fin is None or lien.fin > jour)


class PersonneSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    identifiant = serializers.CharField(source="username")
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")


class _ElementSerializer(serializers.ModelSerializer):
    archive = serializers.SerializerMethodField()
    pays = serializers.CharField(source="pays.code", read_only=True)

    def get_archive(self, objet) -> bool:
        return objet.est_archive


class DivisionSerializer(_ElementSerializer):
    class Meta:
        model = Division
        fields = ["id", "pays", "code", "libelle", "archive"]


class ReseauSerializer(_ElementSerializer):
    division = serializers.UUIDField(source="division_id")

    class Meta:
        model = Reseau
        fields = ["id", "pays", "code", "libelle", "division", "archive"]


class ZoneSerializer(_ElementSerializer):
    class Meta:
        model = Zone
        fields = ["id", "pays", "libelle", "archive"]


class SecteurSerializer(_ElementSerializer):
    zone = serializers.UUIDField(source="zone_id")
    zone_libelle = serializers.CharField(source="zone.libelle")

    class Meta:
        model = Secteur
        fields = ["id", "pays", "libelle", "zone", "zone_libelle", "archive"]


class ResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()


class OccupationSerializer(serializers.ModelSerializer):
    personne = PersonneSerializer(source="utilisateur")
    poste = ResumeSerializer()
    actif = serializers.SerializerMethodField()

    class Meta:
        model = Occupation
        fields = ["id", "poste", "personne", "debut", "fin", "principal", "actif"]

    def get_actif(self, lien) -> bool:
        return _actif(lien, aujourdhui(lien.pays))


class RattachementSerializer(serializers.ModelSerializer):
    superviseur = PersonneSerializer()
    actif = serializers.SerializerMethodField()

    class Meta:
        model = Rattachement
        fields = ["id", "superviseur", "debut", "fin", "actif"]

    def get_actif(self, lien) -> bool:
        return _actif(lien, aujourdhui(lien.pays))


class PerimetreReseauSerializer(serializers.ModelSerializer):
    reseau = ResumeSerializer()
    actif = serializers.SerializerMethodField()

    class Meta:
        model = PerimetreReseau
        fields = ["id", "reseau", "debut", "fin", "actif"]

    def get_actif(self, lien) -> bool:
        return _actif(lien, aujourdhui(lien.pays))


class PosteSerializer(_ElementSerializer):
    """Un poste avec son occupant et son superviseur du jour ; « vacant » sans occupant."""

    type_libelle = serializers.CharField(source="get_type_poste_display")
    reseaux = ResumeSerializer(many=True)
    secteurs = SecteurSerializer(many=True)
    occupant = serializers.SerializerMethodField()
    superviseur = serializers.SerializerMethodField()
    vacant = serializers.SerializerMethodField()

    class Meta:
        model = Poste
        fields = ["id", "pays", "libelle", "type_poste", "type_libelle", "reseaux", "secteurs",
                  "occupant", "superviseur", "vacant", "archive"]  # fmt: skip

    def _du_jour(self, liens):
        jour = aujourdhui(self.instance_pays)
        return next((lien for lien in liens if _actif(lien, jour)), None)

    def to_representation(self, poste):
        self.instance_pays = poste.pays
        return super().to_representation(poste)

    @extend_schema_field(PersonneSerializer(allow_null=True))
    def get_occupant(self, poste):
        lien = self._du_jour(poste.occupations.all())
        return PersonneSerializer(lien.utilisateur).data if lien else None

    @extend_schema_field(PersonneSerializer(allow_null=True))
    def get_superviseur(self, poste):
        lien = self._du_jour(poste.rattachements.all())
        return PersonneSerializer(lien.superviseur).data if lien else None

    def get_vacant(self, poste) -> bool:
        return self._du_jour(poste.occupations.all()) is None


# --- Écritures --------------------------------------------------------------------------------


class LibelleSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120)


class CreationDivisionSerializer(LibelleSerializer):
    code = serializers.CharField(max_length=20)


class CreationReseauSerializer(CreationDivisionSerializer):
    division = serializers.UUIDField()


class CreationSecteurSerializer(LibelleSerializer):
    zone = serializers.UUIDField()


class CreationPosteSerializer(LibelleSerializer):
    type_poste = serializers.ChoiceField(choices=TypePoste.choices)
    reseaux = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    secteurs = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class ModificationPosteSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120, required=False)
    type_poste = serializers.ChoiceField(choices=TypePoste.choices, required=False)
    reseaux = serializers.ListField(child=serializers.UUIDField(), required=False)
    secteurs = serializers.ListField(child=serializers.UUIDField(), required=False)


class OccupationCreationSerializer(serializers.Serializer):
    utilisateur = serializers.UUIDField()
    debut = serializers.DateField(required=False)


class RattachementCreationSerializer(serializers.Serializer):
    superviseur = serializers.UUIDField()
    debut = serializers.DateField(required=False)


class PerimetreReseauCreationSerializer(serializers.Serializer):
    reseau = serializers.UUIDField()
    debut = serializers.DateField(required=False)


class FinSerializer(serializers.Serializer):
    fin = serializers.DateField(required=False)


class SyntheseSerializer(serializers.Serializer):
    divisions = serializers.IntegerField()
    reseaux = serializers.IntegerField()
    zones = serializers.IntegerField()
    secteurs = serializers.IntegerField()
    postes = serializers.IntegerField()
    postes_vacants = serializers.IntegerField()
    postes_sans_superviseur = serializers.IntegerField()


class MonPosteSerializer(serializers.Serializer):
    occupation = OccupationSerializer()
    type_poste = serializers.CharField()
    type_libelle = serializers.CharField()
    reseaux = ResumeSerializer(many=True)
    secteurs = ResumeSerializer(many=True)
    superviseur = PersonneSerializer(allow_null=True)


class MonOrganisationSerializer(serializers.Serializer):
    postes = MonPosteSerializer(many=True)
    postes_supervises = serializers.IntegerField()
    reseaux = PerimetreReseauSerializer(many=True)
    #: ORG-007 CA1 / RG-010 : sans superviseur actif sur le poste principal, pas de planning.
    superviseur_manquant = serializers.BooleanField()

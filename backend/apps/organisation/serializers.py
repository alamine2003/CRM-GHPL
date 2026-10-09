from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.socle.services import aujourdhui

from .models import (
    Division,
    Localite,
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


class LocaliteSerializer(_ElementSerializer):
    secteur = serializers.UUIDField(source="secteur_id")

    class Meta:
        model = Localite
        fields = ["id", "pays", "libelle", "secteur", "archive"]


class CreationLocaliteSerializer(serializers.Serializer):
    secteur = serializers.UUIDField()
    libelle = serializers.CharField(max_length=120)


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
        # 0.9.4 : l'occupant et le superviseur du jour, cherchés une fois par poste (un pays
        # en compte plus de 500).
        self.instance_pays = poste.pays
        self.occupation = self._du_jour(poste.occupations.all())
        self.rattachement = self._du_jour(poste.rattachements.all())
        return super().to_representation(poste)

    @staticmethod
    def _personne(u) -> dict:
        return {"id": str(u.pk), "identifiant": u.username, "prenom": u.first_name,
                "nom": u.last_name}  # fmt: skip

    @extend_schema_field(PersonneSerializer(allow_null=True))
    def get_occupant(self, poste):
        return self._personne(self.occupation.utilisateur) if self.occupation else None

    @extend_schema_field(PersonneSerializer(allow_null=True))
    def get_superviseur(self, poste):
        return self._personne(self.rattachement.superviseur) if self.rattachement else None

    def get_vacant(self, poste) -> bool:
        return self.occupation is None


# --- Écritures --------------------------------------------------------------------------------


class LibelleSerializer(serializers.Serializer):
    libelle = serializers.CharField(max_length=120)


class ModificationSecteurSerializer(serializers.Serializer):
    """Renommage et/ou rattachement à une autre zone."""

    libelle = serializers.CharField(max_length=120, required=False)
    zone = serializers.UUIDField(required=False)


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


class RemplacementSerializer(serializers.Serializer):
    """Remplaçant daté d'un superviseur (ORG-013)."""

    id = serializers.UUIDField()
    superviseur = PersonneSerializer()
    remplacant = PersonneSerializer()
    debut = serializers.DateField()
    fin = serializers.DateField()
    designe_par = PersonneSerializer(allow_null=True)
    #: `a_venir`, `en_cours` ou `termine`, à la date du pays.
    etat = serializers.SerializerMethodField()
    #: L'utilisateur peut y mettre fin (il a désigné pour ce superviseur, prd.md §6.3).
    terminable = serializers.SerializerMethodField()

    def get_terminable(self, remplacement) -> bool:
        if "portee" not in self.context or self.get_etat(remplacement) == "termine":
            return False
        portee = self.context["portee"]
        return portee is None or remplacement.superviseur_id in portee

    def get_etat(self, remplacement) -> str:
        jour = aujourdhui(remplacement.pays)
        if remplacement.debut > jour:
            return "a_venir"
        return "en_cours" if remplacement.fin >= jour else "termine"


class CreationRemplacementSerializer(serializers.Serializer):
    superviseur = serializers.UUIDField()
    remplacant = serializers.UUIDField()
    debut = serializers.DateField()
    fin = serializers.DateField()


class CandidatsRemplacementSerializer(serializers.Serializer):
    """Qui l'utilisateur peut faire remplacer, et par qui (superviseurs du pays)."""

    superviseurs = PersonneSerializer(many=True)
    remplacants = PersonneSerializer(many=True)

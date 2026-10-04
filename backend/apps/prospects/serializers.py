from rest_framework import serializers

from .models import Civilite, Etablissement, Potentiel, Prospect


class PersonneResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    identifiant = serializers.CharField(source="username")
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")


class ProspectSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", read_only=True)
    type = serializers.UUIDField(source="type_id")
    type_libelle = serializers.CharField(source="type.libelle")
    specialite = serializers.UUIDField(source="specialite_id", allow_null=True)
    specialite_libelle = serializers.CharField(
        source="specialite.libelle", allow_null=True, default=None
    )
    cree_par = PersonneResumeSerializer()
    modifiable = serializers.SerializerMethodField()

    class Meta:
        model = Prospect
        fields = [
            "id", "pays", "civilite", "nom", "prenom", "type", "type_libelle", "specialite",
            "specialite_libelle", "numero_ordre", "telephone_mobile", "telephone_pro",
            "courriel", "potentiel", "statut", "cree_par", "cree_le", "valide_le", "modifiable",
        ]  # fmt: skip

    def get_modifiable(self, prospect) -> bool:
        decider = self.context.get("peut_modifier")
        return bool(decider and decider(prospect))


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


class ArchivageProspectSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=200, required=False, allow_blank=True)


class SyntheseProspectsSerializer(serializers.Serializer):
    actifs = serializers.IntegerField()
    a_valider = serializers.IntegerField()
    mes_a_valider = serializers.IntegerField()
    potentiels = serializers.DictField(child=serializers.IntegerField())


class SecteurResumeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()
    zone = serializers.CharField(source="zone.libelle")


class EtablissementSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", read_only=True)
    type = serializers.UUIDField(source="type_id")
    type_code = serializers.CharField(source="type.code")
    type_libelle = serializers.CharField(source="type.libelle")
    secteur = SecteurResumeSerializer()
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    a_coordonnees = serializers.BooleanField(read_only=True)
    cree_par = PersonneResumeSerializer()
    modifiable = serializers.SerializerMethodField()

    class Meta:
        model = Etablissement
        fields = [
            "id", "pays", "nom", "type", "type_code", "type_libelle", "secteur", "adresse",
            "localite", "latitude", "longitude", "a_coordonnees", "telephone", "statut",
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
    localite = serializers.CharField(max_length=120, required=False, allow_blank=True)
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

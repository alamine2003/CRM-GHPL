from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Activite, Cible, Civilite, Etablissement, Exercice, Potentiel, Prospect


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
    """Une page de résultats (PRP-005 CA3)."""

    total = serializers.IntegerField()
    page = serializers.IntegerField()
    taille = serializers.IntegerField()
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
    """Une page de résultats (PRP-005 CA3)."""

    total = serializers.IntegerField()
    page = serializers.IntegerField()
    taille = serializers.IntegerField()
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


# --- Listes cibles (PRP-011) -----------------------------------------------------------------


class ProspectCibleSerializer(ProspectResumeSerializer):
    lieu_principal = serializers.SerializerMethodField()
    secteur = serializers.CharField(source="secteur.libelle", allow_null=True, default=None)

    class Meta(ProspectResumeSerializer.Meta):
        fields = [*ProspectResumeSerializer.Meta.fields, "lieu_principal", "secteur"]

    @extend_schema_field(LieuSerializer(allow_null=True))
    def get_lieu_principal(self, prospect):
        return ProspectSerializer.get_lieu_principal(self, prospect)


class CibleSerializer(serializers.ModelSerializer):
    poste = serializers.UUIDField(source="poste_id")
    prospect = ProspectCibleSerializer()
    hors_secteur = serializers.SerializerMethodField()
    en_cours = serializers.SerializerMethodField()

    class Meta:
        model = Cible
        fields = ["id", "poste", "prospect", "frequence", "debut", "fin", "en_cours",
                  "hors_secteur"]  # fmt: skip

    def get_hors_secteur(self, cible) -> bool:
        from .ciblage import hors_secteur

        secteurs = self.context.get("secteurs_poste")
        if secteurs is None:
            secteurs = set(cible.poste.secteurs.values_list("pk", flat=True))
        return hors_secteur(cible.prospect, secteurs)

    def get_en_cours(self, cible) -> bool:
        return cible.fin is None


class SyntheseCibleSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    potentiels = serializers.DictField(child=serializers.IntegerField())
    visites_par_cycle = serializers.IntegerField()
    visites_par_jour = serializers.FloatField()
    cycle_semaines = serializers.IntegerField()
    seuil_min = serializers.IntegerField(allow_null=True, required=False)
    seuil_max = serializers.IntegerField(allow_null=True, required=False)


class PosteCibleSerializer(serializers.Serializer):
    """Poste et l'état de sa liste cible, pour le choix du poste."""

    id = serializers.UUIDField()
    libelle = serializers.CharField()
    type_poste = serializers.CharField()
    occupant = serializers.CharField(allow_null=True)
    secteurs = LieuSerializer(many=True)
    gerable = serializers.BooleanField()
    synthese = SyntheseCibleSerializer()


class ListeCibleSerializer(serializers.Serializer):
    poste = PosteCibleSerializer()
    cibles = CibleSerializer(many=True)


class AjoutCiblesSerializer(serializers.Serializer):
    prospects = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=500)
    frequence = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=20)


class ResultatAjoutSerializer(serializers.Serializer):
    ajoutes = serializers.IntegerField()
    deja_presents = serializers.IntegerField()


class FrequenceSerializer(serializers.Serializer):
    frequence = serializers.IntegerField(min_value=1, max_value=20)


class RetraitCibleSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=200, required=False, allow_blank=True)


# --- Doublons, fusions, historique, propositions (0.1.8) -----------------------------------


class ProspectCreeSerializer(ProspectSerializer):
    """Fiche créée et décision du détecteur (PRP-008) : `certain` (fusionnée dans la fiche
    renvoyée), `probable` (en file), `aucun` (commune)."""

    doublon = serializers.ChoiceField(choices=["certain", "probable", "aucun"], read_only=True)

    class Meta(ProspectSerializer.Meta):
        fields = [*ProspectSerializer.Meta.fields, "doublon"]


class RessemblanteSerializer(serializers.Serializer):
    """PRP-007 : fiche ressemblant à la saisie, avec son score et ses critères."""

    prospect = ProspectResumeSerializer()
    lieu_principal = serializers.CharField(allow_null=True)
    score = serializers.IntegerField()
    criteres = serializers.ListField(child=serializers.CharField())


class ComparaisonSerializer(serializers.ModelSerializer):
    """Fiche complète pour la comparaison côte à côte (PRP-009 CA1)."""

    type_libelle = serializers.CharField(source="type.libelle")
    specialite_libelle = serializers.CharField(
        source="specialite.libelle", allow_null=True, default=None
    )
    secteur = serializers.CharField(source="secteur.libelle", allow_null=True, default=None)
    localite = serializers.CharField(source="localite.libelle", allow_null=True, default=None)
    cree_par = PersonneResumeSerializer()
    lieux = serializers.SerializerMethodField()
    cibles = serializers.SerializerMethodField()

    class Meta:
        model = Prospect
        fields = ["id", "civilite", "prenom", "nom", "type_libelle", "specialite_libelle",
                  "numero_ordre", "telephone_mobile", "telephone_pro", "courriel", "potentiel",
                  "secteur", "localite", "statut", "cree_par", "cree_le", "lieux",
                  "cibles"]  # fmt: skip

    def get_lieux(self, prospect) -> list[str]:
        return [
            e.etablissement.nom
            for e in prospect.exercices.filter(fin__isnull=True).select_related("etablissement")
        ]

    def get_cibles(self, prospect) -> int:
        return prospect.cibles.filter(fin__isnull=True).count()


class DoublonSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    fiche = ComparaisonSerializer()
    candidat = ComparaisonSerializer()
    score = serializers.IntegerField()
    criteres = serializers.ListField(child=serializers.CharField())
    statut = serializers.CharField()
    cree_le = serializers.DateTimeField()
    decide_par = PersonneResumeSerializer(allow_null=True)
    decide_le = serializers.DateTimeField(allow_null=True)


class DecisionDoublonSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["fusionner", "separer", "refuser"])
    #: Fiche conservée en cas de fusion (le candidat, déjà commun, par défaut).
    conserver = serializers.UUIDField(required=False)


class FusionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    conservee = ProspectResumeSerializer()
    absorbee = ProspectResumeSerializer()
    automatique = serializers.BooleanField()
    score = serializers.IntegerField()
    criteres = serializers.ListField(child=serializers.CharField())
    par = PersonneResumeSerializer(allow_null=True)
    cree_le = serializers.DateTimeField()
    defaite_le = serializers.DateTimeField(allow_null=True)
    defaite_par = PersonneResumeSerializer(allow_null=True)


class ChangementFicheSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    champ = serializers.CharField()
    ancienne = serializers.CharField()
    nouvelle = serializers.CharField()
    auteur = PersonneResumeSerializer(allow_null=True)
    origine = serializers.CharField()
    le = serializers.DateTimeField(source="cree_le")


class PropositionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    prospect = ProspectResumeSerializer(allow_null=True)
    etablissement = EtablissementResumeSerializer(allow_null=True)
    nouvel_exercice = EtablissementResumeSerializer(allow_null=True)
    changements = serializers.DictField(child=serializers.CharField())
    actuels = serializers.SerializerMethodField()
    commentaire = serializers.CharField()
    auteur = PersonneResumeSerializer()
    statut = serializers.CharField()
    decide_par = PersonneResumeSerializer(allow_null=True)
    decide_le = serializers.DateTimeField(allow_null=True)
    motif = serializers.CharField()
    vue_le = serializers.DateTimeField(allow_null=True)
    cree_le = serializers.DateTimeField()
    decidable = serializers.SerializerMethodField()

    def get_actuels(self, proposition) -> dict[str, str]:
        """Valeurs actuelles de la fiche, pour comparer avant de trancher."""
        fiche = proposition.prospect or proposition.etablissement
        return {c: str(getattr(fiche, c) or "") for c in proposition.changements}

    def get_decidable(self, proposition) -> bool:
        ids = self.context.get("decidables")
        return bool(
            ids is not None and proposition.pk in ids and proposition.statut == "en_attente"
        )


class SaisiePropositionSerializer(serializers.Serializer):
    prospect = serializers.UUIDField(required=False)
    etablissement = serializers.UUIDField(required=False)
    changements = serializers.DictField(child=serializers.CharField(allow_blank=True), default=dict)
    nouvel_exercice = serializers.UUIDField(required=False)
    commentaire = serializers.CharField(required=False, allow_blank=True, max_length=300)

    def validate(self, donnees):
        if bool(donnees.get("prospect")) == bool(donnees.get("etablissement")):
            raise serializers.ValidationError(_("Choisissez un prospect ou un établissement."))
        return donnees


class DecisionPropositionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["accepter", "refuser"])
    motif = serializers.CharField(required=False, allow_blank=True, max_length=300)


class QualiteSerializer(serializers.Serializer):
    """Bilan de qualité des données du pays actif (0.1.9)."""

    prospects = serializers.IntegerField()
    sans_lieu = serializers.IntegerField()
    sans_telephone = serializers.IntegerField()
    sans_specialite = serializers.IntegerField()
    hors_cible = serializers.IntegerField()
    a_valider = serializers.IntegerField()
    etablissements = serializers.IntegerField()
    sans_coordonnees = serializers.IntegerField()
    etablissements_a_valider = serializers.IntegerField()
    doublons = serializers.IntegerField()
    propositions = serializers.IntegerField()

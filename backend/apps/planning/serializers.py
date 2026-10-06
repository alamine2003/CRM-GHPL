from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from .controles import CODES, GRAVITES
from .models import (
    Activite,
    Decision,
    JourFerie,
    ModeDecision,
    MotifVersion,
    Passage,
    Periode,
    Planning,
    TypeActivite,
    Visite,
)
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


class RemarqueSerializer(serializers.Serializer):
    """Remarque de révision sur une visite précise (PLN-013 CA2)."""

    visite = serializers.UUIDField()
    commentaire = serializers.CharField(max_length=500)


class DecisionSerializer(serializers.Serializer):
    """Dernière décision sur le planning (PLN-012, PLN-013) : version, sens, auteur, date,
    mode, commentaire et remarques par visite."""

    numero = serializers.IntegerField()
    decision = serializers.ChoiceField(choices=Decision.choices)
    decide_le = serializers.DateTimeField()
    par = serializers.SerializerMethodField()
    mode = serializers.ChoiceField(choices=ModeDecision.choices)
    commentaire = serializers.CharField()
    remarques = RemarqueSerializer(many=True)

    def get_par(self, version) -> str:
        return " ".join(
            x for x in (version.decide_par.first_name, version.decide_par.last_name) if x
        )


class PlanningSerializer(serializers.ModelSerializer):
    #: Échéance de soumission du pays (RG-013).
    echeance = serializers.SerializerMethodField()
    decision = serializers.SerializerMethodField()
    #: Numéro de la dernière version soumise (RG-037), ou rien avant la première soumission.
    numero_version = serializers.SerializerMethodField()
    #: Pourquoi cette dernière version : soumission, après révision, modification (PLN-015).
    motif_version = serializers.SerializerMethodField()

    class Meta:
        model = Planning
        fields = ["id", "semaine", "statut", "cree_le", "soumis_le", "en_retard", "echeance",
                  "decision", "numero_version", "motif_version"]  # fmt: skip
        read_only_fields = ["statut", "soumis_le", "en_retard"]

    def get_echeance(self, planning) -> str:
        from .services import echeance

        return echeance(planning).isoformat()

    def get_numero_version(self, planning) -> int | None:
        derniere = planning.versions.first()
        return derniere.numero if derniere else None

    @extend_schema_field(serializers.ChoiceField(choices=MotifVersion.choices, allow_null=True))
    def get_motif_version(self, planning):
        derniere = planning.versions.first()
        return derniere.motif if derniere else None

    @extend_schema_field(DecisionSerializer(allow_null=True))
    def get_decision(self, planning):
        from .services import derniere_decision

        version = derniere_decision(planning)
        return DecisionSerializer(version).data if version else None


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


class ReferenceFigeeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField(allow_null=True)


class VisiteFigeeSerializer(serializers.Serializer):
    """Une visite telle que soumise dans une version (RG-037)."""

    id = serializers.UUIDField()
    date = serializers.DateField()
    heure = serializers.CharField(allow_null=True)
    ordre = serializers.IntegerField()
    prospect = ReferenceFigeeSerializer(allow_null=True)
    etablissement = ReferenceFigeeSerializer(allow_null=True)
    objectif = serializers.CharField(allow_blank=True)
    note = serializers.CharField(allow_blank=True)
    passage = serializers.UUIDField(allow_null=True)


class ModificationMineureSerializer(serializers.Serializer):
    """PLN-015 CA1 : l'heure d'une visite changée dans sa journée après l'approbation."""

    visite = serializers.UUIDField()
    prospect = serializers.CharField(allow_null=True)
    date = serializers.DateField()
    avant = serializers.CharField(allow_null=True)
    apres = serializers.CharField(allow_null=True)
    le = serializers.DateTimeField()


class SuiviApprobationSerializer(serializers.Serializer):
    """Un planning déjà approuvé (PLN-015, RG-018) : sa référence d'exécution, ses changements
    mineurs et, pendant une modification majeure, les visites en attente de décision."""

    #: Numéro de la version approuvée qui sert de référence.
    reference = serializers.IntegerField()
    #: Vrai tant que le délégué peut le modifier (approuvé ou en cours).
    modifiable = serializers.BooleanField()
    #: Visites ajoutées, déplacées ou modifiées en attente de décision ; les autres restent
    #: exécutables selon la référence (CA2).
    en_attente = serializers.ListField(child=serializers.UUIDField())
    #: Visites de la référence retirées par la modification en attente.
    retraits = VisiteFigeeSerializer(many=True)
    mineures = ModificationMineureSerializer(many=True)


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
    #: Planning déjà approuvé : référence, changements mineurs, modification en attente.
    approbation = SuiviApprobationSerializer(allow_null=True)


class DelegueSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")


class SignalementResumeSerializer(serializers.Serializer):
    code = serializers.CharField()
    nombre = serializers.IntegerField()


class RevisionSerializer(serializers.Serializer):
    """PLN-013 : commentaire général et/ou remarques sur des visites (RG-017)."""

    commentaire = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    remarques = RemarqueSerializer(many=True, required=False)


class EscaladeSerializer(serializers.Serializer):
    """PLN-016 : le planning est arrivé au DM faute de décision du responsable du poste."""

    le = serializers.DateTimeField()
    responsables = DelegueSerializer(many=True)


class PlanningEnAttenteSerializer(serializers.Serializer):
    """Ligne de la file du superviseur (PLN-011) : le planning, son délégué, ses alertes et
    ses activités connexes, avec leur explication (PLN-018)."""

    planning = PlanningSerializer()
    #: Fuseau du pays : les dates de soumission s'affichent à l'heure du pays.
    fuseau = serializers.CharField()
    delegue = DelegueSerializer()
    #: Superviseur remplacé quand l'utilisateur décide en remplacement (ORG-013).
    remplace = DelegueSerializer(allow_null=True)
    #: Escaladé à ce DM faute de décision (PLN-016) ; nul sinon.
    escalade = EscaladeSerializer(allow_null=True)
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
    #: Superviseur remplacé quand l'utilisateur décide en remplacement (ORG-013).
    remplace = DelegueSerializer(allow_null=True)
    #: Escaladé à ce DM faute de décision (PLN-016) ; nul sinon.
    escalade = EscaladeSerializer(allow_null=True)
    postes = serializers.ListField(child=serializers.CharField())


# --- Historique et comparaison des versions (PLN-014) -----------------------------------------


class ActiviteFigeeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    date = serializers.DateField()
    periode = serializers.ChoiceField(choices=Periode.choices)
    type = serializers.ChoiceField(choices=TypeActivite.choices)
    commentaire = serializers.CharField(allow_blank=True)
    demande_superviseur = serializers.BooleanField()


class MomentSerializer(serializers.Serializer):
    date = serializers.DateField()
    heure = serializers.CharField(allow_null=True)


class DeplacementSerializer(serializers.Serializer):
    visite = VisiteFigeeSerializer()
    avant = MomentSerializer()


class ModificationSerializer(serializers.Serializer):
    visite = VisiteFigeeSerializer()
    champs = serializers.ListField(
        child=serializers.ChoiceField(choices=["prospect", "etablissement", "objectif", "note"])
    )


class ComparaisonVersionsSerializer(serializers.Serializer):
    """PLN-014 CA1 : ce qui a changé depuis la version précédente."""

    ajoutees = VisiteFigeeSerializer(many=True)
    retirees = VisiteFigeeSerializer(many=True)
    deplacees = DeplacementSerializer(many=True)
    modifiees = ModificationSerializer(many=True)


class ResumeComparaisonSerializer(serializers.Serializer):
    ajoutees = serializers.IntegerField()
    retirees = serializers.IntegerField()
    deplacees = serializers.IntegerField()
    modifiees = serializers.IntegerField()


def _resume(comparaison):
    return {cle: len(valeur) for cle, valeur in comparaison.items()} if comparaison else None


class VersionSerializer(serializers.Serializer):
    """Une version figée et sa décision, avec le résumé de ce qui a changé (PLN-014)."""

    numero = serializers.IntegerField()
    soumis_le = serializers.DateTimeField()
    en_retard = serializers.BooleanField()
    decision = serializers.ChoiceField(choices=Decision.choices, allow_null=True)
    decide_le = serializers.DateTimeField(allow_null=True)
    par = serializers.CharField(allow_null=True)
    mode = serializers.ChoiceField(choices=ModeDecision.choices, allow_null=True)
    commentaire = serializers.CharField(allow_blank=True)
    remarques = RemarqueSerializer(many=True)
    visites = serializers.IntegerField()
    changements = ResumeComparaisonSerializer(allow_null=True)
    motif = serializers.ChoiceField(choices=MotifVersion.choices)
    #: Heures changées après l'approbation de cette version (PLN-015 CA1).
    mineures = serializers.IntegerField()

    @staticmethod
    def donnees(version, comparaison) -> dict:
        par = version.decide_par
        return {
            "numero": version.numero,
            "soumis_le": version.soumis_le,
            "en_retard": version.en_retard,
            "decision": version.decision or None,
            "decide_le": version.decide_le,
            "par": " ".join(x for x in (par.first_name, par.last_name) if x) if par else None,
            "mode": version.mode or None,
            "commentaire": version.commentaire,
            "remarques": version.remarques,
            "visites": len(version.contenu.get("visites", [])),
            "changements": _resume(comparaison),
            "motif": version.motif,
            "mineures": len(version.modifications),
        }


class DetailVersionSerializer(VersionSerializer):
    """PLN-014 CA2 : le contenu d'une version, et sa comparaison détaillée à la précédente."""

    contenu_visites = VisiteFigeeSerializer(many=True)
    contenu_activites = ActiviteFigeeSerializer(many=True)
    comparaison = ComparaisonVersionsSerializer(allow_null=True)
    modifications = ModificationMineureSerializer(many=True)

    @staticmethod
    def donnees(version, comparaison) -> dict:
        noms = {v["id"]: (v.get("prospect") or {}).get("nom")
                for v in version.contenu.get("visites", [])}  # fmt: skip
        return VersionSerializer.donnees(version, comparaison) | {
            "modifications": [
                m | {"prospect": noms.get(m["visite"])} for m in version.modifications
            ],  # fmt: skip
            "contenu_visites": version.contenu.get("visites", []),
            "contenu_activites": version.contenu.get("activites", []),
            "comparaison": comparaison,
        }

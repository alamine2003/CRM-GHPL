from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organisation.serializers import ResumeSerializer

from .controles import CODES, GRAVITES
from .models import (
    Activite,
    ConformiteJournee,
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
    #: Fermé le lundi 0 h sans être validé : plus rien ne s'y fait avant sa réouverture.
    ferme = serializers.SerializerMethodField()

    class Meta:
        model = Planning
        fields = ["id", "semaine", "statut", "cree_le", "soumis_le", "en_retard", "echeance",
                  "decision", "numero_version", "motif_version", "ferme",
                  "reouvert_le"]  # fmt: skip
        read_only_fields = ["statut", "soumis_le", "en_retard", "reouvert_le"]

    def get_ferme(self, planning) -> bool:
        from .services import est_ferme

        return est_ferme(planning)

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


class ReportLuSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    date = serializers.DateField()
    heure = serializers.CharField(allow_null=True)


class VisiteSerializer(serializers.ModelSerializer):
    prospect = ProspectVisiteSerializer(allow_null=True)
    etablissement = EtablissementVisiteSerializer(allow_null=True)
    reseau = ResumeSerializer(allow_null=True)
    heure = serializers.TimeField(format="%H:%M", allow_null=True)
    #: Motif d'un écart (prospect absent, annulée…), de la liste du pays (prd.md §12).
    motif_ecart = ResumeSerializer(allow_null=True, read_only=True)
    #: Champs à compléter avant la soumission (PLN-002 CA1).
    manquants = serializers.SerializerMethodField()

    class Meta:
        model = Visite
        fields = ["id", "date", "heure", "prospect", "etablissement", "reseau", "objectif",
                  "note", "statut", "manquants", "passage", "ordre", "debut_le", "sans_gps",
                  "distance_debut_m", "fin_le", "fin_sans_gps", "distance_fin_m",
                  "motif_ecart", "commentaire_ecart", "ecart_le", "reportee_de",
                  "report", "est_imprevue", "justification", "rapport_statut"]  # fmt: skip
        read_only_fields = ["debut_le", "sans_gps", "distance_debut_m", "fin_le", "fin_sans_gps",
                            "distance_fin_m", "commentaire_ecart", "ecart_le",
                            "reportee_de", "est_imprevue", "justification"]  # fmt: skip

    #: La visite qui prend la suite d'une visite reportée (VIS-007).
    report = serializers.SerializerMethodField()
    #: Le rapport d'une visite effectuée (RPT-001) : « attendu » tant qu'il n'est pas écrit.
    rapport_statut = serializers.SerializerMethodField()

    def get_manquants(self, visite) -> list[str]:
        from .services import champs_manquants

        # Une visite imprévue (VIS-008) n'a rien à compléter : elle ne se soumet pas.
        return [] if visite.est_imprevue else champs_manquants(visite)

    @extend_schema_field(
        serializers.ChoiceField(
            choices=["attendu", "brouillon", "soumis", "a_corriger", "valide", "rouvert"],
            allow_null=True,
        )  # fmt: skip
    )
    def get_rapport_statut(self, visite) -> str | None:
        if visite.statut != "effectuee":
            return None
        rapport = getattr(visite, "rapport", None)
        return rapport.statut if rapport is not None else "attendu"

    @extend_schema_field(ReportLuSerializer(allow_null=True))
    def get_report(self, visite) -> dict | None:
        if visite.statut != "reportee":
            return None
        suite = Visite.objects.filter(reportee_de=visite).only("id", "date", "heure").first()
        if suite is None:
            return None
        return {"id": suite.pk, "date": suite.date,
                "heure": suite.heure.strftime("%H:%M") if suite.heure else None}  # fmt: skip


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


CODES_CONFORMITE = ("hors_plage", "distance", "duree_courte", "duree_longue", "imprevue",
                    "a_justifier", "sans_gps")  # fmt: skip


class EcartConformiteSerializer(serializers.Serializer):
    """Un écart de conformité (VIS-010) : la visite en cause et ce qui a été mesuré."""

    code = serializers.ChoiceField(choices=CODES_CONFORMITE)
    visite = serializers.UUIDField(allow_null=True)
    prospect = serializers.CharField(allow_null=True)
    heure = serializers.CharField(allow_null=True)
    debut = serializers.CharField(required=False, allow_null=True)
    fin = serializers.CharField(required=False, allow_null=True)
    distance_m = serializers.IntegerField(required=False)
    seuil_m = serializers.IntegerField(required=False)
    minutes = serializers.IntegerField(required=False)
    seuil = serializers.IntegerField(required=False)
    nombre = serializers.IntegerField(required=False)
    tolerees = serializers.IntegerField(required=False)
    justification = serializers.CharField(required=False, allow_blank=True)


class ConformiteJourneeSerializer(serializers.ModelSerializer):
    """VIS-010 : une journée « conforme » ou « à vérifier », avec ses écarts."""

    ecarts = EcartConformiteSerializer(many=True)
    #: Validée (cycle 0.6) : le classement ne bouge plus, même si les seuils changent (CA3).
    fige = serializers.SerializerMethodField()

    #: La journée est finie ; celle du jour peut encore changer.
    terminee = serializers.SerializerMethodField()

    class Meta:
        model = ConformiteJournee
        fields = ["date", "classement", "ecarts", "fige", "terminee"]

    def get_fige(self, conformite) -> bool:
        return conformite.fige_le is not None

    def get_terminee(self, conformite) -> bool:
        from apps.socle.services import aujourdhui

        return conformite.date < aujourdhui(conformite.pays)


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
    #: Conformité des journées passées ou du jour (VIS-010) ; vide avant l'approbation.
    conformite = ConformiteJourneeSerializer(many=True)
    #: Semaine en cours fermée le lundi 0 h pour ce délégué : seul son superviseur la rouvre.
    fermee = serializers.BooleanField()
    #: La réouverture a déjà été demandée au superviseur.
    demande_envoyee = serializers.BooleanField()


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


class SemaineCibleSerializer(serializers.Serializer):
    semaine = serializers.DateField()


class DemandeReouvertureSerializer(serializers.Serializer):
    #: Responsables prévenus ; 0 quand la demande était déjà faite.
    destinataires = serializers.IntegerField()


class ReouvertureSerializer(serializers.Serializer):
    delegue = serializers.UUIDField()
    semaine = serializers.DateField()


class SemaineFermeeSerializer(serializers.Serializer):
    """Un délégué dont la semaine en cours est fermée, sans planning validé."""

    delegue = DelegueSerializer()
    semaine = serializers.DateField()
    planning = PlanningSerializer(allow_null=True)
    #: Le délégué a demandé la réouverture.
    demande = serializers.BooleanField()


class VisiteProgrammeSerializer(VisiteSerializer):
    """Une visite du programme, à la date et à l'heure approuvées (VIS-001)."""

    #: Une modification majeure la touche et attend la décision du superviseur (RG-018).
    modification_en_attente = serializers.BooleanField()

    class Meta(VisiteSerializer.Meta):
        fields = [*VisiteSerializer.Meta.fields, "modification_en_attente"]


class JourProgrammeSerializer(serializers.Serializer):
    date = serializers.DateField()
    ferie = serializers.CharField(allow_null=True)
    visites = VisiteProgrammeSerializer(many=True)
    activites = ActiviteSerializer(many=True)


class ProgrammeSerializer(serializers.Serializer):
    """VIS-001 : le programme de la semaine, tel qu'approuvé, journée par journée."""

    semaine = serializers.DateField()
    #: Le jour du pays : la journée à montrer en premier.
    aujourdhui = serializers.DateField()
    fuseau = serializers.CharField()
    #: `approuve` : le programme est là ; sinon, pourquoi il n'y en a pas.
    etat = serializers.ChoiceField(choices=["approuve", "non_approuve", "sans_planning",
                                            "sans_poste"])  # fmt: skip
    planning = PlanningSerializer(allow_null=True)
    #: Numéro de la version approuvée que le délégué exécute.
    version = serializers.IntegerField(allow_null=True)
    jours = JourProgrammeSerializer(many=True)
    #: Visites restées prévues après leur journée, à justifier (VIS-009 CA1).
    a_justifier = VisiteProgrammeSerializer(many=True)
    #: La prochaine visite du jour : la première qui n'est pas encore faite.
    prochaine = serializers.UUIDField(allow_null=True)
    #: Le pays enregistre la position au début et à la fin des visites (RG-028).
    geolocalisation = serializers.BooleanField()
    #: Attente de la position avant de continuer « sans GPS » (paramètre du pays).
    attente_gps_secondes = serializers.IntegerField()
    #: Motifs d'écart du pays, gardés par le téléphone pour déclarer sans réseau (prd.md §12).
    motifs_ecart = ResumeSerializer(many=True)


class CoordonneesProspectSerializer(serializers.Serializer):
    telephone_mobile = serializers.CharField(allow_blank=True)
    telephone_pro = serializers.CharField(allow_blank=True)
    courriel = serializers.CharField(allow_blank=True)


class CoordonneesLieuSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField()
    adresse = serializers.CharField(allow_blank=True)
    localite = serializers.CharField(source="localite.libelle", default=None, allow_null=True)
    telephone = serializers.CharField(allow_blank=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True)


class VisitePasseeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    date = serializers.DateField()
    heure = serializers.TimeField(format="%H:%M", allow_null=True)
    statut = serializers.CharField()
    objectif = serializers.CharField(allow_blank=True)
    etablissement = serializers.CharField(source="etablissement.nom", default=None,
                                          allow_null=True)  # fmt: skip


class DetailVisiteSerializer(serializers.Serializer):
    """VIS-002 : la visite, les coordonnées du prospect et du lieu, et l'historique."""

    visite = VisiteSerializer()
    prospect = CoordonneesProspectSerializer(allow_null=True)
    lieu = CoordonneesLieuSerializer(allow_null=True)
    #: Les 3 dernières visites du délégué chez ce prospect, de la plus récente (CA1).
    historique = VisitePasseeSerializer(many=True)


class DemarrageSerializer(serializers.Serializer):
    """VIS-003 : l'heure réelle et la position, prises par le téléphone au démarrage, même
    hors connexion ; sans position, la visite démarre « sans GPS »."""

    debut_le = serializers.DateTimeField()
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90,
                                      max_value=90)  # fmt: skip
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180,
                                       max_value=180)  # fmt: skip
    precision_m = serializers.FloatField(required=False, allow_null=True, min_value=0)


class TerminaisonSerializer(serializers.Serializer):
    """VIS-004 : l'heure réelle de fin et la position, prises par le téléphone."""

    fin_le = serializers.DateTimeField()
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90,
                                      max_value=90)  # fmt: skip
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180,
                                       max_value=180)  # fmt: skip
    precision_m = serializers.FloatField(required=False, allow_null=True, min_value=0)


class ImprevueSerializer(serializers.Serializer):
    """VIS-008 : une visite hors planning, justifiée, prise sur le téléphone au moment où elle
    commence (même hors connexion) ; l'identifiant vient du téléphone (0.2.7)."""

    id = serializers.UUIDField(required=False)
    le = serializers.DateTimeField()
    prospect = serializers.UUIDField()
    etablissement = serializers.UUIDField(required=False, allow_null=True)
    justification = serializers.CharField(max_length=500, required=False, allow_blank=True)
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90,
                                      max_value=90)  # fmt: skip
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180,
                                       max_value=180)  # fmt: skip
    precision_m = serializers.FloatField(required=False, allow_null=True, min_value=0)


class ReportSerializer(serializers.Serializer):
    """VIS-007 : un report, comme un écart, plus le jour et l'heure de la nouvelle visite ;
    l'identifiant de la nouvelle visite vient du téléphone (envoi rejouable, 0.2.7)."""

    le = serializers.DateTimeField()
    motif = serializers.UUIDField(required=False, allow_null=True)
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)
    date = serializers.DateField()
    heure = serializers.TimeField(required=False, allow_null=True, input_formats=["%H:%M"])
    id = serializers.UUIDField(required=False)


class EcartSerializer(serializers.Serializer):
    """Un écart déclaré par le délégué (VIS-005) : le moment, le motif obligatoire de la liste
    du pays, un commentaire facultatif."""

    le = serializers.DateTimeField()
    motif = serializers.UUIDField(required=False, allow_null=True)
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)

"""Indicateurs de pilotage (cycle 0.7) : comptages et taux bornés à 100 % (DSH-012 CA1)."""

from rest_framework import serializers

from apps.planning.serializers import DelegueSerializer


class ComptesVisitesSerializer(serializers.Serializer):
    prevues = serializers.IntegerField()
    echues = serializers.IntegerField()
    a_venir = serializers.IntegerField()
    effectuees_prevues = serializers.IntegerField()
    ecarts = serializers.IntegerField()
    ecarts_justifies = serializers.IntegerField()
    a_justifier = serializers.IntegerField()
    imprevues = serializers.IntegerField()
    effectuees = serializers.IntegerField()
    geolocalisees = serializers.IntegerField()


class ComptesRapportsSerializer(serializers.Serializer):
    soumis = serializers.IntegerField()
    dans_delai = serializers.IntegerField()
    valides = serializers.IntegerField()
    a_soumettre = serializers.IntegerField()
    en_retard = serializers.IntegerField()


class ComptesCouvertureSerializer(serializers.Serializer):
    cibles = serializers.IntegerField()
    visitees = serializers.IntegerField()
    cibles_ab = serializers.IntegerField()
    visitees_ab = serializers.IntegerField()
    frequence_ab = serializers.IntegerField()


class TauxSerializer(serializers.Serializer):
    """Chaque taux entre 0 et 1, vide quand rien ne le fonde."""

    realisation = serializers.FloatField(allow_null=True)
    ecarts_justifies = serializers.FloatField(allow_null=True)
    geolocalisation = serializers.FloatField(allow_null=True)
    rapports_dans_delai = serializers.FloatField(allow_null=True)
    couverture = serializers.FloatField(allow_null=True)
    couverture_ab = serializers.FloatField(allow_null=True)
    frequence_ab = serializers.FloatField(allow_null=True)
    part_planifiee = serializers.FloatField(allow_null=True)


class IndicateursSerializer(serializers.Serializer):
    """Les indicateurs d'une période ; `activite` faux : « Aucune activité » (DSH-012 CA2)."""

    debut = serializers.DateField()
    fin = serializers.DateField()
    activite = serializers.BooleanField()
    visites = ComptesVisitesSerializer()
    rapports = ComptesRapportsSerializer()
    couverture = ComptesCouvertureSerializer()
    taux = TauxSerializer()


class IndicateursCycleSerializer(IndicateursSerializer):
    semaines = serializers.IntegerField()


class JourIndicateursSerializer(serializers.Serializer):
    date = serializers.DateField()
    prevues = serializers.IntegerField()
    effectuees = serializers.IntegerField()


class MesChiffresSerializer(serializers.Serializer):
    """DSH-001 : la semaine, la précédente, le cycle, et la courbe des jours ; `calcule_le`
    s'affiche avec les chiffres gardés sans réseau (CA1)."""

    aujourdhui = serializers.DateField()
    calcule_le = serializers.DateTimeField()
    semaine = IndicateursSerializer()
    precedente = IndicateursSerializer()
    cycle = IndicateursCycleSerializer()
    jours = JourIndicateursSerializer(many=True)


class ChoixSemaineSerializer(serializers.Serializer):
    semaine = serializers.DateField(required=False)


PERIODES = ["semaine", "30j", "90j", "6m", "1a", "dates"]


class ChoixPeriodeSerializer(ChoixSemaineSerializer):
    """§14.18, DSH-005 : la semaine (par défaut), une période glissante, ou des dates
    choisies, d'un an au plus."""

    periode = serializers.ChoiceField(choices=PERIODES, required=False, default="semaine")
    du = serializers.DateField(required=False)
    au = serializers.DateField(required=False)

    def validate(self, attrs):
        from django.utils.translation import gettext as _

        if attrs.get("periode") == "dates":
            du, au = attrs.get("du"), attrs.get("au")
            if not du or not au or du > au:
                raise serializers.ValidationError(
                    {"du": _("Choisissez une date de début et une date de fin, dans l'ordre.")}
                )
            if (au - du).days > 365:
                raise serializers.ValidationError({"au": _("Une période dure un an au plus.")})
        return attrs


class ChoixPilotageSerializer(ChoixPeriodeSerializer):
    par = serializers.ChoiceField(choices=["delegue", "reseau", "zone", "secteur"],
                                  required=False, default="delegue")  # fmt: skip
    zone = serializers.UUIDField(required=False)
    secteur = serializers.UUIDField(required=False)
    division = serializers.UUIDField(required=False)
    reseau = serializers.UUIDField(required=False)
    superviseur = serializers.UUIDField(required=False)
    delegue = serializers.UUIDField(required=False)
    statut = serializers.ChoiceField(choices=["actif", "sans_activite"], required=False)


class ChoixExportSerializer(ChoixPilotageSerializer):
    """RPT-019, DSH-008 : le contenu et le format d'un export du tableau de pilotage."""

    contenu = serializers.ChoiceField(choices=["indicateurs", "rapports"], required=False,
                                      default="indicateurs")  # fmt: skip
    #: « format » est réservé par le cadriciel (choix du rendu) : le fichier se nomme ainsi.
    fichier = serializers.ChoiceField(choices=["csv", "xlsx"], required=False, default="csv")


class IndicateursPeriodeSerializer(serializers.Serializer):
    """Les indicateurs d'une période dont les dates sont portées par le tableau."""

    activite = serializers.BooleanField()
    visites = ComptesVisitesSerializer()
    rapports = ComptesRapportsSerializer()
    couverture = ComptesCouvertureSerializer()
    taux = TauxSerializer()


class PosteEquipeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()


class LigneEquipeSerializer(serializers.Serializer):
    """Un délégué de l'équipe : sa semaine et sa couverture sur le cycle."""

    delegue = DelegueSerializer()
    poste = PosteEquipeSerializer()
    semaine = IndicateursPeriodeSerializer()
    cycle = IndicateursPeriodeSerializer()


class TotalEquipeSerializer(serializers.Serializer):
    semaine = IndicateursPeriodeSerializer()
    cycle = IndicateursPeriodeSerializer()


class CyclePeriodeSerializer(serializers.Serializer):
    debut = serializers.DateField()
    fin = serializers.DateField()
    semaines = serializers.IntegerField()


class GroupeEquipeSerializer(serializers.Serializer):
    """DSH-003 : un réseau, une zone ou un secteur, ses délégués et leur total (CA1)."""

    id = serializers.UUIDField()
    libelle = serializers.CharField()
    delegues = serializers.ListField(child=serializers.UUIDField())
    total = TotalEquipeSerializer()


class OptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()


class OptionsPilotageSerializer(serializers.Serializer):
    """DSH-005 CA1 : les valeurs de filtre proposées, tirées du seul périmètre."""

    zones = OptionSerializer(many=True)
    secteurs = OptionSerializer(many=True)
    divisions = OptionSerializer(many=True)
    reseaux = OptionSerializer(many=True)
    superviseurs = OptionSerializer(many=True)
    delegues = OptionSerializer(many=True)


class DelaiSerializer(serializers.Serializer):
    """DSH-007 : médiane en heures ouvrées, nombre de décisions, celles en moins d'un jour
    ouvré."""

    decisions = serializers.IntegerField()
    mediane = serializers.FloatField(allow_null=True)
    dans_cible = serializers.IntegerField()


class DelaisValidationSerializer(serializers.Serializer):
    """DSH-007 CA1 : délais de validation des plannings (KPI-02) et des rapports (KPI-09),
    en heures ouvrées du pays."""

    cible_heures = serializers.IntegerField()
    plannings = DelaiSerializer()
    rapports = DelaiSerializer()


class TableauEquipeSerializer(serializers.Serializer):
    """DSH-002, DSH-003, DSH-012 : les délégués pilotés côte à côte, par ordre alphabétique,
    regroupés au besoin, et les totaux tirés des sommes (DC-49 : aucun classement)."""

    aujourdhui = serializers.DateField()
    calcule_le = serializers.DateTimeField()
    debut = serializers.DateField()
    fin = serializers.DateField()
    periode = serializers.ChoiceField(choices=PERIODES)
    cycle = CyclePeriodeSerializer()
    par = serializers.ChoiceField(choices=["delegue", "reseau", "zone", "secteur"])
    options = OptionsPilotageSerializer()
    delegues = LigneEquipeSerializer(many=True)
    groupes = GroupeEquipeSerializer(many=True)
    total = TotalEquipeSerializer()
    delais = DelaisValidationSerializer()


class PaysPilotageSerializer(serializers.Serializer):
    code = serializers.CharField()
    nom = serializers.CharField()


class LignePaysSerializer(serializers.Serializer):
    """Un pays : ses totaux seulement, sans aucun nom de délégué (DSH-004)."""

    pays = PaysPilotageSerializer()
    delegues = serializers.IntegerField()
    cycle_semaines = serializers.IntegerField()
    total = TotalEquipeSerializer()
    delais = DelaisValidationSerializer()


class TableauSiegeSerializer(serializers.Serializer):
    """DSH-004 : la consolidation du siège, par pays, et le total de tous les pays."""

    calcule_le = serializers.DateTimeField()
    periode = serializers.ChoiceField(choices=PERIODES)
    debut = serializers.DateField()
    fin = serializers.DateField()
    pays = LignePaysSerializer(many=True)
    delegues = serializers.IntegerField()
    total = TotalEquipeSerializer()
    delais = DelaisValidationSerializer()


class SuiviObjectifReseauSerializer(serializers.Serializer):
    """DSH-009 CA2 : le réalisé, l'attendu à ce jour, l'état."""

    realise = serializers.IntegerField()
    attendu = serializers.IntegerField()
    etat = serializers.ChoiceField(
        choices=["a_venir", "en_avance", "en_retard", "atteint", "non_atteint"]
    )
    taux = serializers.FloatField()
    delegues = serializers.IntegerField()


class ObjectifReseauSerializer(serializers.Serializer):
    """DSH-009 CA1 : une période, un réseau, un indicateur et une cible."""

    id = serializers.UUIDField()
    reseau = OptionSerializer(source="reseau_option")
    indicateur = serializers.ChoiceField(choices=["visites", "couverture_ab", "presentations"])
    produit = OptionSerializer(source="produit_option", allow_null=True)
    debut = serializers.DateField()
    fin = serializers.DateField()
    cible = serializers.IntegerField()
    gerable = serializers.BooleanField()
    suivi = SuiviObjectifReseauSerializer()


class ProduitsReseauSerializer(serializers.Serializer):
    reseau = serializers.UUIDField()
    produits = OptionSerializer(many=True)


class ObjectifsReseauSerializer(serializers.Serializer):
    """Les objectifs des réseaux visibles, et ce qu'il faut pour en fixer un nouveau."""

    aujourdhui = serializers.DateField()
    objectifs = ObjectifReseauSerializer(many=True)
    reseaux_geres = OptionSerializer(many=True)
    portefeuilles = ProduitsReseauSerializer(many=True)


class SaisieObjectifReseauSerializer(serializers.Serializer):
    reseau = serializers.UUIDField()
    indicateur = serializers.ChoiceField(choices=["visites", "couverture_ab", "presentations"])
    produit = serializers.UUIDField(required=False, allow_null=True)
    debut = serializers.DateField()
    fin = serializers.DateField()
    cible = serializers.IntegerField(min_value=1)


class ModificationObjectifReseauSerializer(serializers.Serializer):
    debut = serializers.DateField(required=False)
    fin = serializers.DateField(required=False)
    cible = serializers.IntegerField(min_value=1, required=False)


# --- Tendance de prescription et points d'attention (DC-53, DC-57, 0.7.9) -------------------


class RetoursSerializer(serializers.Serializer):
    non_prescrit = serializers.IntegerField()
    peu = serializers.IntegerField()
    prescrit = serializers.IntegerField()
    tres_bien = serializers.IntegerField()


class TendanceProduitSerializer(serializers.Serializer):
    """DC-53 : les retours sur un produit, agrégés, sans nom de prescripteur."""

    produit = serializers.UUIDField(allow_null=True)
    libelle = serializers.CharField()
    periode = RetoursSerializer()
    precedente = RetoursSerializer()
    favorable_periode = serializers.FloatField(allow_null=True)
    favorable_precedente = serializers.FloatField(allow_null=True)


class VisitePointSerializer(serializers.Serializer):
    visite = serializers.UUIDField()
    date = serializers.DateField()
    delegue = serializers.CharField()
    delegue_id = serializers.UUIDField()
    produit = serializers.CharField(allow_blank=True)
    prospect = serializers.CharField(allow_blank=True)


class PointAttentionSerializer(serializers.Serializer):
    """DC-57 : une phrase calculée par une règle, et les visites qui la fondent."""

    regle = serializers.ChoiceField(
        choices=["actions_en_retard", "passages_prescrit", "retours_en_baisse"]
    )
    nombre = serializers.IntegerField()
    produit = serializers.CharField(allow_blank=True)
    visites = VisitePointSerializer(many=True)


class PrescriptionSerializer(serializers.Serializer):
    debut = serializers.DateField()
    fin = serializers.DateField()
    tendance = TendanceProduitSerializer(many=True)
    points = PointAttentionSerializer(many=True)

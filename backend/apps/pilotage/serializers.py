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


class PaysPilotageSerializer(serializers.Serializer):
    code = serializers.CharField()
    nom = serializers.CharField()


class LignePaysSerializer(serializers.Serializer):
    """Un pays : ses totaux seulement, sans aucun nom de délégué (DSH-004)."""

    pays = PaysPilotageSerializer()
    delegues = serializers.IntegerField()
    cycle_semaines = serializers.IntegerField()
    total = TotalEquipeSerializer()


class TableauSiegeSerializer(serializers.Serializer):
    """DSH-004 : la consolidation du siège, par pays, et le total de tous les pays."""

    calcule_le = serializers.DateTimeField()
    periode = serializers.ChoiceField(choices=PERIODES)
    debut = serializers.DateField()
    fin = serializers.DateField()
    pays = LignePaysSerializer(many=True)
    delegues = serializers.IntegerField()
    total = TotalEquipeSerializer()

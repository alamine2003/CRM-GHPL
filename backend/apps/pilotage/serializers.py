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


class TableauEquipeSerializer(serializers.Serializer):
    """DSH-002, DSH-012 : les délégués de l'équipe côte à côte, par ordre alphabétique, et le
    total de l'équipe tiré des sommes (DC-49 : aucun classement)."""

    aujourdhui = serializers.DateField()
    calcule_le = serializers.DateTimeField()
    debut = serializers.DateField()
    fin = serializers.DateField()
    cycle = CyclePeriodeSerializer()
    delegues = LigneEquipeSerializer(many=True)
    total = TotalEquipeSerializer()

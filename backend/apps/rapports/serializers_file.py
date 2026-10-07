"""Sérialiseurs de la file de travail du superviseur (RPT-012), à part : ils reprennent ceux du
planning, qui dépendent eux-mêmes des rapports."""

from rest_framework import serializers

from apps.planning.serializers import DelegueSerializer, EcartConformiteSerializer


class JourneeATraiterSerializer(serializers.Serializer):
    """RPT-012 CA1 : une journée terminée et non validée, son classement et ses écarts, et
    l'état de ses rapports."""

    date = serializers.DateField()
    #: Le planning de la semaine, pour consulter la journée.
    planning = serializers.UUIDField()
    classement = serializers.ChoiceField(choices=["conforme", "a_verifier"])
    ecarts = EcartConformiteSerializer(many=True)
    visites = serializers.IntegerField()
    effectuees = serializers.IntegerField()
    rapports_a_valider = serializers.IntegerField()
    #: Visites effectuées dont le rapport n'est pas encore soumis.
    rapports_attendus = serializers.IntegerField()
    rapports_en_retard = serializers.IntegerField()
    horodatages_douteux = serializers.IntegerField()


class DelegueATraiterSerializer(serializers.Serializer):
    delegue = DelegueSerializer()
    journees = JourneeATraiterSerializer(many=True)


class ATraiterSerializer(serializers.Serializer):
    """« À traiter aujourd'hui » (DC-47, engagement 3) : les journées par délégué, et le
    nombre de plannings qui attendent une décision."""

    delegues = DelegueATraiterSerializer(many=True)
    plannings_a_valider = serializers.IntegerField()

"""API des indicateurs de pilotage (cycle 0.7)."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.organisation.vues import pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.planning.models import Visite

from . import serializers as s


class MesChiffresVue(VuePerimetre):
    """DSH-001 : les indicateurs du délégué connecté, sur ses propres visites ; le téléphone les
    garde pour les afficher sans réseau (CA1)."""

    actions = {"GET": Action.INDICATEURS_LIRE}
    serializer_class = s.MesChiffresSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Visite.objects.none())

    @extend_schema(
        parameters=[OpenApiParameter("semaine", OpenApiTypes.DATE, required=False,
                                     description="Un jour de la semaine ; par défaut, celle-ci")],
        responses=s.MesChiffresSerializer, operation_id="mes_chiffres",
    )  # fmt: skip
    def get(self, request):
        from .indicateurs import mes_chiffres

        choix = s.ChoixSemaineSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        pays = pays_requis(self.perimetre)
        donnees = mes_chiffres(pays, request.user, choix.validated_data.get("semaine"))
        return Response(s.MesChiffresSerializer(donnees).data)


class EquipeVue(VuePerimetre):
    """DSH-002, DSH-012 : le tableau hebdomadaire de l'équipe du superviseur ; un délégué d'un
    poste qui ne lui est pas rattaché n'y apparaît jamais (CA1)."""

    actions = {"GET": Action.PILOTAGE_LIRE}
    serializer_class = s.TableauEquipeSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Visite.objects.none())

    @extend_schema(
        parameters=[OpenApiParameter("semaine", OpenApiTypes.DATE, required=False,
                                     description="Un jour de la semaine ; par défaut, celle-ci")],
        responses=s.TableauEquipeSerializer, operation_id="pilotage_equipe",
    )  # fmt: skip
    def get(self, request):
        from .indicateurs import tableau_equipe

        choix = s.ChoixSemaineSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        pays = pays_requis(self.perimetre)
        donnees = tableau_equipe(pays, request.user, choix.validated_data.get("semaine"))
        return Response(s.TableauEquipeSerializer(donnees).data)

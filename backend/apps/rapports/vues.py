"""API des rapports de visite (cycle 0.5).

- Rapport d'une visite (RPT-001, RPT-002) : `rapports.rediger`, sur ses propres visites.
- Champs du rapport par pays (RPT-008) : lus avec les paramètres du pays, gérés par qui les
  modifie (administrateur pays, siège).
"""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.organisation.vues import _lire, pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.planning.models import Visite

from . import serializers as s
from . import services
from .models import ChampRapport

REDIGER = Action.RAPPORTS_REDIGER


class VueVisitesDuDelegue(VuePerimetre):
    serializer_class = s.RapportSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Visite.objects.filter(planning__delegue=self.request.user, archive_le__isnull=True)
        ).select_related("planning", "reseau")


class RapportVisiteVue(VueVisitesDuDelegue):
    """RPT-001 : le rapport de la visite effectuée, ouvert en brouillon à la première lecture."""

    actions = {"GET": REDIGER, "PUT": REDIGER}

    @extend_schema(responses=s.RapportSerializer, operation_id="rapport_lire")
    def get(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.RapportSerializer(services.rapport_de(visite)).data)

    @extend_schema(request=s.SaisieRapportSerializer, responses=s.RapportSerializer,
                   operation_id="rapport_enregistrer")  # fmt: skip
    def put(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.SaisieRapportSerializer, request)
        rapport = services.enregistrer(services.rapport_de(visite), **v)
        return Response(s.RapportSerializer(rapport).data)


class SoumissionRapportVue(VueVisitesDuDelegue):
    """RPT-002 CA1 : la soumission exige le socle et les champs obligatoires du pays."""

    actions = {"POST": REDIGER}

    @extend_schema(request=s.SoumissionRapportSerializer, responses=s.RapportSerializer,
                   operation_id="rapport_soumettre")  # fmt: skip
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.SoumissionRapportSerializer, request)
        rapport = services.soumettre(services.rapport_de(visite), v["soumis_le"])
        return Response(s.RapportSerializer(rapport).data)


class VueChamps(VuePerimetre):
    serializer_class = s.ChampRapportSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(ChampRapport.objects.filter(archive_le__isnull=True))


class ChampsRapportVue(VueChamps):
    actions = {"GET": Action.PARAMETRES_LIRE, "POST": Action.PARAMETRES_MODIFIER}

    @extend_schema(responses=s.ChampRapportSerializer(many=True), operation_id="champs_rapport")
    def get(self, request):
        champs = services.champs_actifs(pays_requis(self.perimetre))
        return Response(s.ChampRapportSerializer(champs, many=True).data)

    @extend_schema(request=s.SaisieChampSerializer, responses={201: s.ChampRapportSerializer},
                   operation_id="champ_rapport_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.SaisieChampSerializer, request)
        champ = services.creer_champ(pays_requis(self.perimetre), **v)
        return Response(s.ChampRapportSerializer(champ).data, status=status.HTTP_201_CREATED)


class ChampRapportVue(VueChamps):
    actions = {"PATCH": Action.PARAMETRES_MODIFIER}

    @extend_schema(request=s.ModificationChampSerializer, responses=s.ChampRapportSerializer,
                   operation_id="champ_rapport_modifier")  # fmt: skip
    def patch(self, request, id):
        champ = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationChampSerializer, request)
        return Response(s.ChampRapportSerializer(services.modifier_champ(champ, **v)).data)


class ChampRapportArchivageVue(VueChamps):
    actions = {"POST": Action.PARAMETRES_MODIFIER}

    @extend_schema(request=None, responses=s.ChampRapportSerializer,
                   operation_id="champ_rapport_archiver")  # fmt: skip
    def post(self, request, id):
        champ = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.ChampRapportSerializer(services.archiver_champ(champ)).data)

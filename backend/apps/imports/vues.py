"""API des imports (PRP-013) : simuler puis importer un export BirdNotes, consulter les lots
et télécharger leur rapport d'anomalies (CA2). Réservé à l'administrateur pays."""

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.organisation.vues import pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre

from . import serializers as s
from .birdnotes import importer, rapport_csv
from .models import LotImport


class VueLots(VuePerimetre):
    serializer_class = s.LotImportSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(LotImport.objects.select_related("pays", "lance_par"))


class LotsVue(VueLots):
    actions = {"GET": Action.IMPORTS_GERER}

    @extend_schema(responses=s.LotImportSerializer(many=True), operation_id="imports_liste")
    def get(self, request):
        return Response(s.LotImportSerializer(self.get_queryset()[:50], many=True).data)


class ImportBirdNotesVue(VueLots):
    actions = {"POST": Action.IMPORTS_GERER}
    parser_classes = [MultiPartParser]

    @extend_schema(request={"multipart/form-data": s.ImportBirdNotesSerializer},
                   responses={201: s.DetailLotSerializer},
                   operation_id="import_birdnotes")  # fmt: skip
    def post(self, request):
        donnees = s.ImportBirdNotesSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        fichier = donnees.validated_data["fichier"]
        lot = importer(
            pays_requis(self.perimetre), request.user, fichier.read(), fichier.name,
            simulation=donnees.validated_data["simulation"],
        )  # fmt: skip
        return Response(s.DetailLotSerializer(lot).data, status=status.HTTP_201_CREATED)


class LotVue(VueLots):
    actions = {"GET": Action.IMPORTS_GERER}

    @extend_schema(responses=s.DetailLotSerializer, operation_id="import_detail")
    def get(self, request, id):
        return Response(s.DetailLotSerializer(get_object_or_404(self.get_queryset(), pk=id)).data)


class RapportLotVue(VueLots):
    actions = {"GET": Action.IMPORTS_GERER}

    @extend_schema(responses={(200, "text/csv"): OpenApiTypes.STR}, operation_id="import_rapport")
    def get(self, request, id):
        lot = get_object_or_404(self.get_queryset(), pk=id)
        reponse = HttpResponse(rapport_csv(lot), content_type="text/csv; charset=utf-8")
        reponse["Content-Disposition"] = f'attachment; filename="rapport-import-{lot.pk}.csv"'
        return reponse

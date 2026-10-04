"""API des pays et de leurs paramètres (ORG-001, ORG-011), limitée au périmètre."""

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre

from . import services
from .erreurs import ErreurMetier
from .models import ParametrePays, Pays
from .parametres import CATALOGUE
from .serializers_pays import (
    CreationPaysSerializer,
    ModificationParametreSerializer,
    ParametreSerializer,
    PaysSerializer,
    StatutPaysSerializer,
)


def _erreur_validation(erreur: ValidationError) -> ErreurMetier:
    return ErreurMetier("donnees_invalides", " ".join(erreur.messages))


class VuePays(VuePerimetre):
    """Le siège en vue consolidée voit tous les pays ; sinon, seulement le pays actif."""

    serializer_class = PaysSerializer
    lookup_field = "code"

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Pays.objects.order_by("nom"), champ="pk")

    def pays_vise(self) -> Pays:
        return get_object_or_404(self.get_queryset(), code=self.kwargs["code"].upper())


class PaysListeVue(VuePays):
    actions = {"GET": Action.PAYS_LIRE, "POST": Action.PAYS_CREER}

    @extend_schema(responses=PaysSerializer(many=True), operation_id="pays_liste")
    def get(self, request):
        return Response(PaysSerializer(self.get_queryset(), many=True).data)

    @extend_schema(
        request=CreationPaysSerializer, responses={201: PaysSerializer}, operation_id="pays_creer"
    )
    def post(self, request):
        donnees = CreationPaysSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        try:
            pays = services.creer_pays(donnees.validated_data["code"])
        except ValidationError as erreur:
            raise _erreur_validation(erreur) from erreur
        return Response(PaysSerializer(pays).data, status=status.HTTP_201_CREATED)


class PaysDetailVue(VuePays):
    actions = {"GET": Action.PAYS_LIRE}

    @extend_schema(responses=PaysSerializer, operation_id="pays_detail")
    def get(self, request, code):
        return Response(PaysSerializer(self.pays_vise()).data)


class PaysStatutVue(VuePays):
    actions = {"POST": Action.PAYS_CHANGER_STATUT}

    @extend_schema(
        request=StatutPaysSerializer, responses=PaysSerializer, operation_id="pays_statut"
    )
    def post(self, request, code):
        donnees = StatutPaysSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        try:
            pays = services.changer_statut_pays(self.pays_vise(), donnees.validated_data["statut"])
        except ValidationError as erreur:
            raise _erreur_validation(erreur) from erreur
        return Response(PaysSerializer(pays).data)


def _parametres(pays: Pays) -> list[dict]:
    personnalises = set(
        ParametrePays.objects.filter(pays=pays).values_list("cle", flat=True).distinct()
    )
    valeurs = services.parametres_en_vigueur(pays)
    return [
        {
            "cle": cle,
            "description": definition.description,
            "valeur": valeurs[cle],
            "defaut": definition.defaut,
            "personnalise": cle in personnalises,
            "hypothese": definition.hypothese,
        }
        for cle, definition in CATALOGUE.items()
    ]


class ParametresVue(VuePays):
    actions = {"GET": Action.PARAMETRES_LIRE}

    @extend_schema(responses=ParametreSerializer(many=True), operation_id="parametres_liste")
    def get(self, request, code):
        return Response(ParametreSerializer(_parametres(self.pays_vise()), many=True).data)


class ParametreVue(VuePays):
    actions = {"PUT": Action.PARAMETRES_MODIFIER}

    @extend_schema(
        request=ModificationParametreSerializer,
        responses=ParametreSerializer,
        operation_id="parametre_modifier",
    )
    def put(self, request, code, cle):
        pays = self.pays_vise()
        if cle not in CATALOGUE:
            raise ErreurMetier("parametre_inconnu", f"Paramètre inconnu : {cle}.", 404)
        donnees = ModificationParametreSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        try:
            services.definir_parametre(pays, cle, donnees.validated_data["valeur"])
        except ValidationError as erreur:
            raise _erreur_validation(erreur) from erreur
        ligne = next(p for p in _parametres(pays) if p["cle"] == cle)
        return Response(ParametreSerializer(ligne).data)

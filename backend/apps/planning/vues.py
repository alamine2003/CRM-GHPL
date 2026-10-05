"""API du calendrier et du planning (cycle 0.2).

- Jours fériés (ORG-012) : `jours_feries.gerer` (administrateur pays), pays actif requis.
- Semaine et planning (PLN-001) : `plannings.preparer` (délégué, superviseur qui occupe un
  poste), sur ses propres plannings uniquement.
"""

from datetime import date, timedelta

from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.organisation.vues import _lire, pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from . import serializers as s
from . import services
from .calendrier import jours_de_la_semaine, lundi
from .models import JourFerie, Planning

GERER = Action.JOURS_FERIES_GERER
PREPARER = Action.PLANNINGS_PREPARER


class VueJoursFeries(VuePerimetre):
    serializer_class = s.JourFerieSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(JourFerie.objects.filter(archive_le__isnull=True))

    def get_serializer_context(self):
        pays = self.perimetre.pays_actif
        return {**super().get_serializer_context(),
                "aujourdhui": aujourdhui(pays) if pays else None}  # fmt: skip


class JoursFeriesVue(VueJoursFeries):
    actions = {"GET": GERER, "POST": GERER}

    @extend_schema(
        parameters=[OpenApiParameter("annee", int, required=False)],
        responses=s.JourFerieSerializer(many=True),
        operation_id="jours_feries_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        if annee := request.query_params.get("annee"):
            if not annee.isdigit():
                raise ErreurMetier("annee_invalide", _("Année invalide."), champ="annee")
            qs = qs.filter(date__year=int(annee))
        return Response(self.get_serializer(qs, many=True).data)

    @extend_schema(request=s.SaisieJourFerieSerializer, responses={201: s.JourFerieSerializer},
                   operation_id="jour_ferie_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.SaisieJourFerieSerializer, request)
        jour = services.creer_jour_ferie(pays_requis(self.perimetre), **v)
        return Response(self.get_serializer(jour).data, status=status.HTTP_201_CREATED)


class JourFerieVue(VueJoursFeries):
    actions = {"PATCH": GERER}

    @extend_schema(request=s.ModificationJourFerieSerializer, responses=s.JourFerieSerializer,
                   operation_id="jour_ferie_modifier")  # fmt: skip
    def patch(self, request, id):
        jour = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationJourFerieSerializer, request)
        return Response(self.get_serializer(services.modifier_jour_ferie(jour, **v)).data)


class JourFerieRetraitVue(VueJoursFeries):
    actions = {"POST": GERER}

    @extend_schema(request=None, responses=s.JourFerieSerializer, operation_id="jour_ferie_retirer")
    def post(self, request, id):
        jour = get_object_or_404(self.get_queryset(), pk=id)
        return Response(self.get_serializer(services.retirer_jour_ferie(jour)).data)


class VuePlannings(VuePerimetre):
    serializer_class = s.PlanningSerializer

    def selection(self, perimetre):
        # Chacun ne voit ici que ses propres plannings ; la validation (cycle 0.3) aura sa vue.
        return perimetre.filtrer_par_pays(Planning.objects.filter(delegue=self.request.user))


class SemaineVue(VuePlannings):
    actions = {"GET": PREPARER}

    @extend_schema(
        parameters=[OpenApiParameter("semaine", date, required=False,
                                     description="Un jour de la semaine ; par défaut, celle-ci")],
        responses=s.SemaineSerializer,
        operation_id="planning_semaine",
    )  # fmt: skip
    def get(self, request):
        pays = pays_requis(self.perimetre)
        brute = request.query_params.get("semaine")
        try:
            jour = date.fromisoformat(brute) if brute else aujourdhui(pays)
        except ValueError as erreur:
            raise ErreurMetier(
                "semaine_invalide", _("Date invalide : format AAAA-MM-JJ attendu."), champ="semaine"
            ) from erreur
        debut = lundi(jour)
        courante = lundi(aujourdhui(pays))
        planning = self.get_queryset().filter(semaine=debut).first()
        donnees = {
            "semaine": debut,
            "precedente": debut - timedelta(days=7),
            "suivante": debut + timedelta(days=7),
            "courante": debut == courante,
            "jours": [
                {
                    "date": j.date,
                    "ferie": j.ferie.libelle if j.ferie else None,
                    "planifiable": j.planifiable,
                }
                for j in jours_de_la_semaine(pays, debut)
            ],  # fmt: skip
            "planning": s.PlanningSerializer(planning).data if planning else None,
            "peut_creer": planning is None
            and debut >= courante
            and services.occupe_un_poste(request.user, pays, debut),
        }
        return Response(s.SemaineSerializer(donnees).data)


class PlanningsVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.CreationPlanningSerializer, responses={201: s.PlanningSerializer},
                   operation_id="planning_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationPlanningSerializer, request)
        planning = services.creer_planning(pays_requis(self.perimetre), request.user, v["semaine"])
        return Response(s.PlanningSerializer(planning).data, status=status.HTTP_201_CREATED)

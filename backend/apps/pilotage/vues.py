"""API des indicateurs de pilotage (cycle 0.7)."""

from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.organisation.vues import pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.planning.models import Visite

from . import serializers as s

#: §14.18, DSH-005 : la période du tableau.
PARAMETRES_PERIODE = [
    OpenApiParameter("periode", OpenApiTypes.STR, required=False,
                     enum=["semaine", "30j", "90j", "6m", "1a", "dates"]),
    OpenApiParameter("du", OpenApiTypes.DATE, required=False),
    OpenApiParameter("au", OpenApiTypes.DATE, required=False),
]  # fmt: skip


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
    """DSH-002, DSH-003, DSH-012 : le tableau hebdomadaire des délégués pilotés (superviseur :
    postes rattachés ; DM et DF : leurs réseaux ; responsable pays : tout le pays), regroupé par
    réseau, zone ou secteur au besoin (`?par=`). Un délégué hors périmètre n'y apparaît jamais
    (DSH-002 CA1)."""

    actions = {"GET": Action.PILOTAGE_LIRE}
    serializer_class = s.TableauEquipeSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Visite.objects.none())

    @extend_schema(
        parameters=[
            OpenApiParameter("semaine", OpenApiTypes.DATE, required=False,
                             description="Un jour de la semaine ; par défaut, celle-ci"),
            OpenApiParameter("par", OpenApiTypes.STR, required=False,
                             enum=["delegue", "reseau", "zone", "secteur"]),
            *PARAMETRES_PERIODE,
            *[OpenApiParameter(f, OpenApiTypes.UUID, required=False)
              for f in ("zone", "secteur", "division", "reseau", "superviseur", "delegue")],
            OpenApiParameter("statut", OpenApiTypes.STR, required=False,
                             enum=["actif", "sans_activite"]),
        ],
        responses=s.TableauEquipeSerializer, operation_id="pilotage_equipe",
    )  # fmt: skip
    def get(self, request):
        from .indicateurs import FILTRES, tableau_pilotage

        choix = s.ChoixPilotageSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        pays = pays_requis(self.perimetre)
        v = choix.validated_data
        filtres = {k: v[k] for k in (*FILTRES, "statut") if v.get(k)}
        donnees = tableau_pilotage(self.perimetre, v.get("semaine"), v["par"], v["periode"],
                                   v.get("du"), v.get("au"), filtres)  # fmt: skip
        if self.perimetre.est_siege:
            # DSH-004 CA1 : chaque consultation nominative par le siège est auditée.
            from apps.audit.services import enregistrer

            enregistrer("pilotage.consultation_nominative", pays=pays, details={
                "semaine": donnees["debut"].isoformat(), "fin": donnees["fin"].isoformat(),
                "par": v["par"], "delegues": len(donnees["delegues"]),
                "filtres": {k: str(x) for k, x in filtres.items()},
            })  # fmt: skip
        return Response(s.TableauEquipeSerializer(donnees).data)


class SiegeVue(VuePerimetre):
    """DSH-004 : la consolidation du siège, agrégée par pays, sans aucun nom. Réservée au
    siège ; la descente au nominatif passe par le choix d'un pays (`pilotage/equipe/`)."""

    actions = {"GET": Action.PILOTAGE_LIRE}
    serializer_class = s.TableauSiegeSerializer

    def selection(self, perimetre):
        return Visite.objects.none()

    @extend_schema(
        parameters=[OpenApiParameter("semaine", OpenApiTypes.DATE, required=False,
                                     description="Un jour de la semaine ; par défaut, celle-ci"),
                    *PARAMETRES_PERIODE],
        responses=s.TableauSiegeSerializer, operation_id="pilotage_siege",
    )  # fmt: skip
    def get(self, request):
        from rest_framework import status

        from apps.socle.erreurs import ErreurMetier

        from .indicateurs import tableau_siege

        if not self.perimetre.est_siege:
            raise ErreurMetier("reserve_au_siege", _("Vue réservée au siège."),
                               status.HTTP_403_FORBIDDEN)  # fmt: skip
        choix = s.ChoixPeriodeSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        v = choix.validated_data
        donnees = tableau_siege(self.perimetre, v.get("semaine"), v["periode"], v.get("du"),
                                v.get("au"))  # fmt: skip
        return Response(s.TableauSiegeSerializer(donnees).data)

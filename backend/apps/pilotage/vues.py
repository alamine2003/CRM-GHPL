"""API des indicateurs de pilotage (cycle 0.7)."""

from django.db.models import Q
from django.http import Http404
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


# --- Objectifs par réseau (DSH-009, 0.7.6) --------------------------------------------------


class VueObjectifs(VuePerimetre):
    def selection(self, perimetre):
        from .models import Objectif

        return perimetre.filtrer_par_pays(Objectif.objects.filter(archive_le__isnull=True))

    def representer(self, objectifs) -> list[dict]:
        from . import objectifs as o

        geres = set(o.reseaux_geres(self.perimetre).values_list("pk", flat=True))
        return [
            {"id": x.pk, "reseau_option": {"id": x.reseau_id, "libelle": x.reseau.libelle},
             "indicateur": x.indicateur,
             "produit_option": {"id": x.produit_id, "libelle": x.produit.libelle}
             if x.produit_id else None,
             "debut": x.debut, "fin": x.fin, "cible": x.cible,
             "gerable": x.reseau_id in geres, "suivi": o.suivi(x)}
            for x in objectifs
        ]  # fmt: skip

    def objet(self, id):
        from . import objectifs as o

        objectif = o.objectifs_visibles(self.perimetre, en_cours=False).filter(pk=id).first()
        if objectif is None:
            raise Http404
        return objectif


class ObjectifsVue(VueObjectifs):
    """DSH-009 : les objectifs des réseaux visibles avec leur suivi (CA2) ; le DM du réseau et
    l'administrateur pays en fixent (CA1)."""

    actions = {"GET": Action.OBJECTIFS_LIRE, "POST": Action.OBJECTIFS_GERER}
    serializer_class = s.ObjectifsReseauSerializer

    @extend_schema(
        parameters=[OpenApiParameter("tous", OpenApiTypes.BOOL, required=False)],
        responses=s.ObjectifsReseauSerializer, operation_id="objectifs",
    )  # fmt: skip
    def get(self, request):
        from apps.referentiel.models import Portefeuille
        from apps.socle.services import aujourdhui

        from . import objectifs as o

        pays = pays_requis(self.perimetre)
        today = aujourdhui(pays)
        tous = request.query_params.get("tous") in ("1", "true")
        geres = list(o.reseaux_geres(self.perimetre).order_by("libelle"))
        liens = Portefeuille.objects.filter(
            Q(fin__isnull=True) | Q(fin__gt=today), reseau__in=geres,
        ).select_related("produit").order_by("produit__libelle")  # fmt: skip
        portefeuilles: dict = {r.pk: [] for r in geres}
        for lien in liens:
            portefeuilles[lien.reseau_id].append(
                {"id": lien.produit_id, "libelle": lien.produit.libelle}
            )
        donnees = {
            "aujourdhui": today,
            "objectifs": self.representer(o.objectifs_visibles(self.perimetre, not tous)),
            "reseaux_geres": [{"id": r.pk, "libelle": r.libelle} for r in geres],
            "portefeuilles": [{"reseau": k, "produits": v} for k, v in portefeuilles.items()],
        }
        return Response(s.ObjectifsReseauSerializer(donnees).data)

    @extend_schema(
        request=s.SaisieObjectifReseauSerializer,
        responses={201: s.ObjectifReseauSerializer},
        operation_id="objectif_creer",
    )
    def post(self, request):
        from apps.organisation.models import Reseau
        from apps.organisation.vues import _lire
        from apps.referentiel.models import Produit

        from . import objectifs as o

        pays = pays_requis(self.perimetre)
        v = _lire(s.SaisieObjectifReseauSerializer, request)
        reseau = Reseau.objects.filter(pays=pays, pk=v["reseau"]).first()
        if reseau is None:
            raise Http404
        produit = Produit.objects.filter(pays=pays, pk=v.get("produit")).first() if v.get(
            "produit") else None  # fmt: skip
        objectif = o.creer(self.perimetre, reseau=reseau, indicateur=v["indicateur"],
                           produit=produit, debut=v["debut"], fin=v["fin"],
                           cible=v["cible"])  # fmt: skip
        (donnee,) = self.representer([objectif])
        return Response(s.ObjectifReseauSerializer(donnee).data, status=201)


class ObjectifVue(VueObjectifs):
    actions = {"PATCH": Action.OBJECTIFS_GERER}
    serializer_class = s.ObjectifReseauSerializer

    @extend_schema(
        request=s.ModificationObjectifReseauSerializer,
        responses=s.ObjectifReseauSerializer,
        operation_id="objectif_modifier",
    )
    def patch(self, request, id):
        from apps.organisation.vues import _lire

        from . import objectifs as o

        pays_requis(self.perimetre)
        objectif = self.objet(id)
        v = _lire(s.ModificationObjectifReseauSerializer, request)
        if v:
            o.modifier(self.perimetre, objectif, **v)
        (donnee,) = self.representer([objectif])
        return Response(s.ObjectifReseauSerializer(donnee).data)


class ArchivageObjectifVue(VueObjectifs):
    actions = {"POST": Action.OBJECTIFS_GERER}
    serializer_class = s.ObjectifReseauSerializer

    @extend_schema(request=None, responses={204: None}, operation_id="objectif_archiver")
    def post(self, request, id):
        from . import objectifs as o

        pays_requis(self.perimetre)
        o.archiver(self.perimetre, self.objet(id))
        return Response(status=204)

"""API du référentiel d'un pays (PRP-001) et des portefeuilles de produits (ORG-004).

Lecture : `referentiels.lire` (tous les rôles métier du pays) ; écriture :
`referentiels.gerer` (siège, administrateur pays). Une écriture exige un pays actif.
"""

from datetime import date

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.identite.models import Role
from apps.organisation.models import Occupation, PerimetreReseau, Reseau, actif_le
from apps.organisation.vues import _lire, _reference, _references, pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from . import serializers as s
from . import services
from .models import Liste, Portefeuille, Produit, Valeur

LIRE_GERER = {"GET": Action.REFERENTIELS_LIRE, "POST": Action.REFERENTIELS_GERER}
GERER = Action.REFERENTIELS_GERER


def _jour(perimetre) -> date:
    return aujourdhui(perimetre.pays_actif) if perimetre.pays_actif else timezone.localdate()


def _valeur(perimetre, identifiant, liste: str, code: str):
    """Valeur du pays actif appartenant à la liste attendue ; sinon refusée."""
    if identifiant is None:
        return None
    objet = _reference(Valeur, perimetre, identifiant, code)
    if objet.liste != liste:
        raise ErreurMetier(code, _("Élément inconnu ou archivé dans ce pays."))
    return objet


# --- Listes de valeurs (PRP-001) ------------------------------------------------------------


class VueValeurs(VuePerimetre):
    serializer_class = s.ValeurSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Valeur.objects.select_related("pays").annotate(
                utilisations=Count("enfants", distinct=True)
                + Count("produits", distinct=True)
                + Count("prospects_du_type", distinct=True)
                + Count("prospects_de_la_specialite", distinct=True)
            )
        )

    def detail(self, valeur):
        return s.ValeurSerializer(self.selection(self.perimetre).get(pk=valeur.pk)).data


class ValeursVue(VueValeurs):
    actions = LIRE_GERER

    @extend_schema(
        parameters=[
            OpenApiParameter("liste", enum=Liste.values, required=False),
            OpenApiParameter("actifs", str, required=False, description="1 : sans les archivées"),
        ],
        responses=s.ValeurSerializer(many=True),
        operation_id="valeurs_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        if liste := request.query_params.get("liste"):
            qs = qs.filter(liste=liste)
        if request.query_params.get("actifs") == "1":
            qs = qs.filter(archive_le__isnull=True)
        return Response(s.ValeurSerializer(qs, many=True).data)

    @extend_schema(request=s.CreationValeurSerializer, responses={201: s.ValeurSerializer},
                   operation_id="valeur_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationValeurSerializer, request)
        pays = pays_requis(self.perimetre)
        parent = (
            _reference(Valeur, self.perimetre, v["parent"], "parent_invalide")
            if v.get("parent")
            else None
        )
        valeur = services.creer_valeur(
            pays, v["liste"], v["libelle"], v.get("code"), v.get("ordre"), parent
        )
        return Response(self.detail(valeur), status=status.HTTP_201_CREATED)


class ValeurVue(VueValeurs):
    actions = {"PATCH": GERER}

    @extend_schema(request=s.ModificationValeurSerializer, responses=s.ValeurSerializer,
                   operation_id="valeur_modifier")  # fmt: skip
    def patch(self, request, id):
        valeur = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationValeurSerializer, request)
        if "parent" in v:
            v["parent"] = (
                _reference(Valeur, self.perimetre, v["parent"], "parent_invalide")
                if v["parent"]
                else None
            )
        return Response(self.detail(services.modifier_valeur(valeur, **v)))


class ValeurArchivageVue(VueValeurs):
    actions = {"POST": GERER}

    @extend_schema(request=None, responses=s.ValeurSerializer, operation_id="valeur_archiver")
    def post(self, request, id):
        valeur = get_object_or_404(self.get_queryset(), pk=id)
        return Response(self.detail(services.archiver(valeur)))


class ValeurReactivationVue(VueValeurs):
    actions = {"POST": GERER}

    @extend_schema(request=None, responses=s.ValeurSerializer, operation_id="valeur_reactiver")
    def post(self, request, id):
        valeur = get_object_or_404(self.get_queryset(), pk=id)
        return Response(self.detail(services.reactiver(valeur)))


# --- Produits ------------------------------------------------------------------------------


class VueProduits(VuePerimetre):
    serializer_class = s.ProduitSerializer

    def selection(self, perimetre):
        liens = Portefeuille.objects.filter(actif_le(_jour(perimetre))).select_related("reseau")
        return perimetre.filtrer_par_pays(
            Produit.objects.select_related("pays", "classe").prefetch_related(
                Prefetch("portefeuilles", queryset=liens, to_attr="liens_actifs")
            )
        )

    def detail(self, produit):
        return s.ProduitSerializer(self.selection(self.perimetre).get(pk=produit.pk)).data

    def reseaux(self, ids):
        return _references(Reseau, self.perimetre, ids, "reseau_invalide")


class ProduitsVue(VueProduits):
    actions = LIRE_GERER

    @extend_schema(
        parameters=[
            OpenApiParameter("actifs", str, required=False),
            OpenApiParameter("classe", str, required=False),
            OpenApiParameter("reseau", str, required=False),
        ],
        responses=s.ProduitSerializer(many=True),
        operation_id="produits_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        if request.query_params.get("actifs") == "1":
            qs = qs.filter(archive_le__isnull=True)
        if classe := request.query_params.get("classe"):
            qs = qs.filter(classe_id=classe)
        if reseau := request.query_params.get("reseau"):
            qs = qs.filter(
                portefeuilles__in=Portefeuille.objects.filter(
                    actif_le(_jour(self.perimetre)), reseau_id=reseau
                )
            ).distinct()
        return Response(s.ProduitSerializer(qs, many=True).data)

    @extend_schema(request=s.CreationProduitSerializer, responses={201: s.ProduitSerializer},
                   operation_id="produit_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationProduitSerializer, request)
        pays = pays_requis(self.perimetre)
        classe = _valeur(self.perimetre, v.get("classe"), Liste.CLASSE_THERAPEUTIQUE,
                         "classe_invalide")  # fmt: skip
        produit = services.creer_produit(pays, v["libelle"], v.get("code"), classe)
        if v["reseaux"]:
            services.definir_reseaux_du_produit(produit, self.reseaux(v["reseaux"]))
        return Response(self.detail(produit), status=status.HTTP_201_CREATED)


class ProduitVue(VueProduits):
    actions = {"PATCH": GERER}

    @extend_schema(request=s.ModificationProduitSerializer, responses=s.ProduitSerializer,
                   operation_id="produit_modifier")  # fmt: skip
    def patch(self, request, id):
        produit = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationProduitSerializer, request)
        champs = {}
        if "libelle" in v:
            champs["libelle"] = v["libelle"]
        if "classe" in v:
            champs["classe"] = _valeur(self.perimetre, v["classe"], Liste.CLASSE_THERAPEUTIQUE,
                                       "classe_invalide")  # fmt: skip
        if champs:
            services.modifier_produit(produit, **champs)
        if "reseaux" in v:
            services.definir_reseaux_du_produit(produit, self.reseaux(v["reseaux"]))
        return Response(self.detail(produit))


class ProduitArchivageVue(VueProduits):
    actions = {"POST": GERER}

    @extend_schema(request=None, responses=s.ProduitSerializer, operation_id="produit_archiver")
    def post(self, request, id):
        produit = get_object_or_404(self.get_queryset(), pk=id)
        return Response(self.detail(services.archiver(produit)))


class ProduitReactivationVue(VueProduits):
    actions = {"POST": GERER}

    @extend_schema(request=None, responses=s.ProduitSerializer, operation_id="produit_reactiver")
    def post(self, request, id):
        produit = get_object_or_404(self.get_queryset(), pk=id)
        return Response(self.detail(services.reactiver(produit)))


# --- Portefeuilles (ORG-004) ----------------------------------------------------------------


def _portefeuilles(reseaux, jour: date) -> list[dict]:
    liens = services.portefeuille_actif(reseaux, jour).filter(produit__archive_le__isnull=True)
    par_reseau: dict = {r.pk: [] for r in reseaux}
    for lien in liens.order_by("produit__libelle"):
        par_reseau[lien.reseau_id].append(lien.produit)
    return [
        {"reseau": r, "division": r.division.libelle, "produits": par_reseau[r.pk]} for r in reseaux
    ]


class VueReseaux(VuePerimetre):
    serializer_class = s.PortefeuilleSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Reseau.objects.filter(archive_le__isnull=True).select_related("division")
        ).order_by("division__libelle", "libelle")


class PortefeuillesVue(VueReseaux):
    actions = {"GET": Action.REFERENTIELS_LIRE}

    @extend_schema(responses=s.PortefeuilleSerializer(many=True), operation_id="portefeuilles")
    def get(self, request):
        reseaux = list(self.get_queryset())
        return Response(s.PortefeuilleSerializer(_portefeuilles(reseaux, _jour(self.perimetre)),
                                                 many=True).data)  # fmt: skip


class PortefeuilleReseauVue(VueReseaux):
    actions = {"PUT": GERER}

    @extend_schema(request=s.DefinitionPortefeuilleSerializer, responses=s.PortefeuilleSerializer,
                   operation_id="portefeuille_definir")  # fmt: skip
    def put(self, request, id):
        reseau = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.DefinitionPortefeuilleSerializer, request)
        produits = _references(Produit, self.perimetre, v["produits"], "produit_invalide")
        services.definir_portefeuille(reseau, produits)
        portefeuille = _portefeuilles([reseau], _jour(self.perimetre))[0]
        return Response(s.PortefeuilleSerializer(portefeuille).data)


class MonPortefeuilleVue(VuePerimetre):
    """Produits que l'utilisateur présente : réseaux de ses postes (délégué, superviseur-visiteur)
    et de son périmètre (DF, DM). Le rapport de visite n'en proposera pas d'autres (ORG-004 CA3)."""

    actions = {"GET": Action.REFERENTIELS_LIRE}
    serializer_class = s.PortefeuilleSerializer

    def selection(self, perimetre):
        if perimetre.pays_actif is None:
            return Reseau.objects.none()
        jour = _jour(perimetre)
        moi = perimetre.utilisateur
        occupes = Occupation.objects.filter(actif_le(jour), utilisateur=moi)
        visibles = Q(postes__occupations__in=occupes)
        if perimetre.roles & {Role.DF, Role.DM}:
            visibles |= Q(pk__in=PerimetreReseau.objects.filter(actif_le(jour), utilisateur=moi)
                          .values("reseau_id"))  # fmt: skip
        return (
            Reseau.objects.filter(visibles, pays=perimetre.pays_actif, archive_le__isnull=True)
            .select_related("division")
            .distinct()
            .order_by("libelle")
        )

    @extend_schema(responses=s.PortefeuilleSerializer(many=True), operation_id="mon_portefeuille")
    def get(self, request):
        reseaux = list(self.get_queryset())
        return Response(s.PortefeuilleSerializer(_portefeuilles(reseaux, _jour(self.perimetre)),
                                                 many=True).data)  # fmt: skip

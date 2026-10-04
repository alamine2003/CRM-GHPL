"""API des fiches prospects (PRP-002, PRP-006).

Lecture : `prospects.lire` ; création : `prospects.creer` (administrateur pays, délégué) ;
validation, modification de toute fiche, archivage : `prospects.gerer` (administrateur pays).
"""

from django.db.models import Count, Prefetch, Q
from django.db.models.functions import Lower
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.identite.models import Role
from apps.organisation.models import Localite, Secteur
from apps.organisation.vues import _lire, _reference, pays_requis
from apps.perimetre.matrice import SIEGE, Action
from apps.perimetre.vues import VuePerimetre
from apps.referentiel.models import Valeur
from apps.socle.erreurs import ErreurMetier

from . import serializers as s
from . import services
from .models import Etablissement, Potentiel, StatutFiche

#: Résultats renvoyés par une recherche ; pagination complète en 0.1.7 (PRP-005).
LIMITE = 100


class VueProspects(VuePerimetre):
    serializer_class = s.ProspectSerializer

    def selection(self, perimetre):
        return services.prospects_visibles(perimetre).select_related(
            "pays", "type", "specialite", "grade", "secteur", "localite", "cree_par"
        )

    def get_serializer_context(self):
        contexte = super().get_serializer_context()
        contexte["peut_modifier"] = lambda p: services.peut_modifier(self.perimetre, p)
        return contexte

    def detail(self, prospect, statut=status.HTTP_200_OK):
        prospect = self.selection(self.perimetre).get(pk=prospect.pk)
        return Response(self.get_serializer(prospect).data, status=statut)

    def references(self, v: dict) -> dict:
        """Identifiants du formulaire → objets du pays actif (référentiel, secteur, localité)."""
        for champ in ("type", "specialite", "grade"):
            if v.get(champ):
                v[champ] = _reference(Valeur, self.perimetre, v[champ], "valeur_invalide")
        if v.get("secteur"):
            v["secteur"] = _reference(Secteur, self.perimetre, v["secteur"], "secteur_invalide")
        if v.get("localite"):
            v["localite"] = _reference(Localite, self.perimetre, v["localite"], "localite_invalide")
        return v


class ProspectsVue(VueProspects):
    actions = {"GET": Action.PROSPECTS_LIRE, "POST": Action.PROSPECTS_CREER}

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False, description="Nom, téléphone, n° d'ordre"),
            OpenApiParameter("statut", enum=StatutFiche.values, required=False),
            OpenApiParameter("type", str, required=False),
            OpenApiParameter("potentiel", enum=Potentiel.values, required=False),
        ],
        responses=s.ListeProspectsSerializer,
        operation_id="prospects_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        p = request.query_params
        statut = p.get("statut")
        qs = qs.filter(statut=statut) if statut else qs.exclude(
            statut__in=[StatutFiche.ARCHIVE, StatutFiche.FUSIONNE]
        )  # fmt: skip
        if p.get("type"):
            qs = qs.filter(type_id=p["type"])
        if p.get("potentiel"):
            qs = qs.filter(potentiel=p["potentiel"])
        qs = services.rechercher(qs, p.get("q", ""))
        resultats = list(qs.order_by(Lower("nom"), Lower("prenom"))[:LIMITE])
        return Response(
            {
                "total": qs.count(),
                "limite": LIMITE,
                "resultats": self.get_serializer(resultats, many=True).data,
            }
        )

    @extend_schema(request=s.SaisieProspectSerializer, responses={201: s.ProspectSerializer},
                   operation_id="prospect_creer")  # fmt: skip
    def post(self, request):
        v = self.references(_lire(s.SaisieProspectSerializer, request))
        pays = pays_requis(self.perimetre)
        actif = Role.ADMIN_PAYS in self.perimetre.roles
        prospect = services.creer_prospect(pays, request.user, actif=actif, **v)
        return self.detail(prospect, status.HTTP_201_CREATED)


class ProspectVue(VueProspects):
    actions = {"GET": Action.PROSPECTS_LIRE, "PATCH": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.ProspectSerializer, operation_id="prospect_detail")
    def get(self, request, id):
        prospect = get_object_or_404(self.get_queryset(), pk=id)
        if self.perimetre.roles & SIEGE:
            # AUD-001 : consultation nominative d'une fiche par le siège.
            services._auditer("consultation", prospect)
        return self.detail(prospect)

    @extend_schema(request=s.SaisieProspectSerializer, responses=s.ProspectSerializer,
                   operation_id="prospect_modifier")  # fmt: skip
    def patch(self, request, id):
        prospect = get_object_or_404(self.get_queryset(), pk=id)
        if not services.peut_modifier(self.perimetre, prospect):
            raise ErreurMetier(
                "modification_interdite",
                _("Seul l'administrateur pays modifie une fiche commune."),
                status.HTTP_403_FORBIDDEN,
            )
        v = self.references(_lire(s.SaisieProspectSerializer, request))
        return self.detail(services.modifier_prospect(prospect, **v))


class ProspectValidationVue(VueProspects):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=None, responses=s.ProspectSerializer, operation_id="prospect_valider")
    def post(self, request, id):
        prospect = get_object_or_404(self.get_queryset(), pk=id)
        return self.detail(services.valider(prospect, request.user))


class ProspectArchivageVue(VueProspects):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=s.ArchivageProspectSerializer, responses=s.ProspectSerializer,
                   operation_id="prospect_archiver")  # fmt: skip
    def post(self, request, id):
        prospect = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ArchivageProspectSerializer, request)
        return self.detail(services.archiver(prospect, v.get("motif", "")))


class SyntheseProspectsVue(VueProspects):
    actions = {"GET": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.SyntheseProspectsSerializer, operation_id="prospects_synthese")
    def get(self, request):
        qs = self.get_queryset()
        moi = request.user
        chiffres = qs.aggregate(
            actifs=Count("id", filter=Q(statut=StatutFiche.ACTIF)),
            a_valider=Count("id", filter=Q(statut=StatutFiche.A_VALIDER)),
            mes_a_valider=Count("id", filter=Q(statut=StatutFiche.A_VALIDER, cree_par=moi)),
        )
        potentiels = dict(
            qs.filter(statut=StatutFiche.ACTIF)
            .values_list("potentiel")
            .annotate(n=Count("id"))
            .values_list("potentiel", "n")
        )
        chiffres["potentiels"] = {p: potentiels.get(p, 0) for p in Potentiel.values}
        return Response(chiffres)


# --- Établissements (PRP-003) -------------------------------------------------------------


class VueEtablissements(VueProspects):
    serializer_class = s.EtablissementSerializer

    def selection(self, perimetre):
        return services.fiches_visibles(Etablissement, perimetre).select_related(
            "pays", "type", "secteur__zone", "localite", "cree_par"
        )


class EtablissementsVue(VueEtablissements):
    actions = {"GET": Action.PROSPECTS_LIRE, "POST": Action.PROSPECTS_CREER}

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False, description="Nom, localité, téléphone"),
            OpenApiParameter("statut", enum=StatutFiche.values, required=False),
            OpenApiParameter("type", str, required=False),
            OpenApiParameter("secteur", str, required=False),
            OpenApiParameter("sans_coordonnees", str, required=False, description="1"),
        ],
        responses=s.ListeEtablissementsSerializer,
        operation_id="etablissements_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        p = request.query_params
        statut = p.get("statut")
        qs = qs.filter(statut=statut) if statut else qs.exclude(
            statut__in=[StatutFiche.ARCHIVE, StatutFiche.FUSIONNE]
        )  # fmt: skip
        if p.get("type"):
            qs = qs.filter(type_id=p["type"])
        if p.get("secteur"):
            qs = qs.filter(secteur_id=p["secteur"])
        if p.get("sans_coordonnees") == "1":
            qs = qs.filter(latitude__isnull=True)
        qs = services.rechercher_etablissements(qs, p.get("q", ""))
        resultats = list(qs.order_by(Lower("nom"))[:LIMITE])
        return Response(
            {
                "total": qs.count(),
                "limite": LIMITE,
                "resultats": self.get_serializer(resultats, many=True).data,
            }
        )

    @extend_schema(request=s.SaisieEtablissementSerializer,
                   responses={201: s.EtablissementSerializer},
                   operation_id="etablissement_creer")  # fmt: skip
    def post(self, request):
        v = self.references(_lire(s.SaisieEtablissementSerializer, request))
        pays = pays_requis(self.perimetre)
        actif = Role.ADMIN_PAYS in self.perimetre.roles
        fiche = services.creer_etablissement(pays, request.user, actif=actif, **v)
        return self.detail(fiche, status.HTTP_201_CREATED)


class EtablissementVue(VueEtablissements):
    actions = {"GET": Action.PROSPECTS_LIRE, "PATCH": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.EtablissementSerializer, operation_id="etablissement_detail")
    def get(self, request, id):
        return self.detail(get_object_or_404(self.get_queryset(), pk=id))

    @extend_schema(request=s.SaisieEtablissementSerializer, responses=s.EtablissementSerializer,
                   operation_id="etablissement_modifier")  # fmt: skip
    def patch(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        if not services.peut_modifier(self.perimetre, fiche):
            raise ErreurMetier(
                "modification_interdite",
                _("Seul l'administrateur pays modifie une fiche commune."),
                status.HTTP_403_FORBIDDEN,
            )
        v = self.references(_lire(s.SaisieEtablissementSerializer, request))
        return self.detail(services.modifier_etablissement(fiche, **v))


class EtablissementValidationVue(VueEtablissements):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=None, responses=s.EtablissementSerializer,
                   operation_id="etablissement_valider")  # fmt: skip
    def post(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        return self.detail(services.valider(fiche, request.user))


class EtablissementArchivageVue(VueEtablissements):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=s.ArchivageProspectSerializer, responses=s.EtablissementSerializer,
                   operation_id="etablissement_archiver")  # fmt: skip
    def post(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ArchivageProspectSerializer, request)
        return self.detail(services.archiver(fiche, v.get("motif", "")))


class SyntheseEtablissementsVue(VueEtablissements):
    actions = {"GET": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.SyntheseEtablissementsSerializer,
                   operation_id="etablissements_synthese")  # fmt: skip
    def get(self, request):
        qs = self.get_queryset()
        actifs = qs.filter(statut=StatutFiche.ACTIF)
        chiffres = qs.aggregate(
            actifs=Count("id", filter=Q(statut=StatutFiche.ACTIF)),
            a_valider=Count("id", filter=Q(statut=StatutFiche.A_VALIDER)),
            mes_a_valider=Count(
                "id", filter=Q(statut=StatutFiche.A_VALIDER, cree_par=request.user)
            ),
        )
        chiffres["sans_coordonnees"] = actifs.filter(latitude__isnull=True).count()
        chiffres["secteurs_couverts"] = actifs.values("secteur").distinct().count()
        chiffres["types"] = dict(
            actifs.values_list("type__code").annotate(n=Count("id")).values_list("type__code", "n")
        )
        return Response(chiffres)


class SecteursEtablissementsVue(VuePerimetre):
    """Secteurs actifs du pays proposés à la saisie d'un établissement (PRP-003 CA1) ; le
    délégué, qui ne lit pas l'organisation, en a besoin pour créer une fiche."""

    actions = {"GET": Action.PROSPECTS_LIRE}
    serializer_class = s.SecteurSaisieSerializer

    def selection(self, perimetre):
        localites = Localite.objects.filter(archive_le__isnull=True).order_by("libelle")
        return (
            perimetre.filtrer_par_pays(Secteur.objects.filter(archive_le__isnull=True))
            .select_related("zone")
            .prefetch_related(Prefetch("localites", localites, to_attr="localites_actives"))
            .order_by("zone__libelle", "libelle")
        )

    @extend_schema(responses=s.SecteurSaisieSerializer(many=True),
                   operation_id="etablissements_secteurs")  # fmt: skip
    def get(self, request):
        return Response(s.SecteurSaisieSerializer(self.get_queryset(), many=True).data)

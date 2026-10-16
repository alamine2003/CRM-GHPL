"""API des fiches prospects (PRP-002, PRP-006).

Lecture : `prospects.lire` ; création : `prospects.creer` (administrateur pays, délégué) ;
validation, modification de toute fiche, archivage : `prospects.gerer` (administrateur pays).
"""

from django.db.models import Count, Prefetch, Q
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

from . import positions, services
from . import recherche as rch
from . import serializers as s
from .models import Activite, Etablissement, Exercice, Potentiel, StatutFiche


class VueProspects(VuePerimetre):
    serializer_class = s.ProspectSerializer

    def selection(self, perimetre):
        en_cours = Exercice.objects.filter(fin__isnull=True).select_related("etablissement")
        return (
            services.prospects_visibles(perimetre)
            .select_related(
                "pays", "type", "specialite", "grade", "secteur", "localite", "cree_par"
            )
            .prefetch_related(
                Prefetch("exercices", queryset=en_cours, to_attr="exercices_en_cours")
            )
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
            OpenApiParameter(
                "q",
                str,
                required=False,
                description="Nom, téléphone, n° d'ordre, lieu d'exercice",
            ),
            OpenApiParameter("statut", enum=StatutFiche.values, required=False),
            OpenApiParameter("type", str, required=False),
            OpenApiParameter("specialite", str, required=False),
            OpenApiParameter("potentiel", enum=Potentiel.values, required=False),
            OpenApiParameter("activite", enum=Activite.values, required=False),
            OpenApiParameter("secteur", str, required=False),
            OpenApiParameter("localite", str, required=False),
            OpenApiParameter("poste", str, required=False, description="Liste cible du poste"),
            OpenApiParameter("sans_lieu", str, required=False, description="1"),
            OpenApiParameter("sans_telephone", str, required=False, description="1"),
            OpenApiParameter("sans_specialite", str, required=False, description="1"),
            OpenApiParameter("hors_cible", str, required=False, description="1"),
            OpenApiParameter("portee", enum=["perimetre", "pays"], required=False),
            OpenApiParameter("tri", enum=list(rch.TRIS_PROSPECTS), required=False),
            OpenApiParameter("page", int, required=False),
            OpenApiParameter(
                "taille", int, required=False, description="20 par défaut, 100 au plus"
            ),
        ],
        responses=s.ListeProspectsSerializer,
        operation_id="prospects_liste",
    )
    def get(self, request):
        """PRP-005 : recherche tolérante, filtres, tri et pagination, dans le périmètre."""
        p = request.query_params
        qs = rch.dans_portee(self.get_queryset(), p, self.perimetre, rch.prospects_du_perimetre)
        qs = rch.filtrer_prospects(rch.statut(qs, p.get("statut")), p)
        qs = rch.trier(services.rechercher(qs, p.get("q", "")), p.get("tri"), rch.TRIS_PROSPECTS)
        resultats, pagination = rch.paginer(qs, p)
        return Response({**pagination, "resultats": self.get_serializer(resultats, many=True).data})

    @extend_schema(request=s.SaisieProspectSerializer, responses={201: s.ProspectCreeSerializer},
                   operation_id="prospect_creer")  # fmt: skip
    def post(self, request):
        v = self.references(_lire(s.SaisieProspectSerializer, request))
        pays = pays_requis(self.perimetre)
        actif = Role.ADMIN_PAYS in self.perimetre.roles
        fiche, decision = services.saisir_prospect(pays, request.user, actif=actif, **v)
        reponse = self.detail(fiche, status.HTTP_201_CREATED)
        # PRP-008 : la décision du détecteur accompagne la fiche (fusionnée, en file, commune).
        reponse.data["doublon"] = decision.niveau
        return reponse


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
        return self.detail(services.modifier_prospect(prospect, auteur=request.user, **v))


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
        return self.detail(services.archiver(prospect, v.get("motif", ""), request.user))


class SyntheseProspectsVue(VueProspects):
    actions = {"GET": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.SyntheseProspectsSerializer, operation_id="prospects_synthese")
    def get(self, request):
        qs = rch.prospects_du_perimetre(self.get_queryset(), self.perimetre)
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
        # Qualité des données (PRP-004) : fiches actives sans lieu d'exercice en cours.
        en_cours = Exercice.objects.filter(fin__isnull=True).values("prospect_id")
        chiffres["sans_lieu"] = qs.filter(statut=StatutFiche.ACTIF).exclude(pk__in=en_cours).count()
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
            OpenApiParameter("localite", str, required=False),
            OpenApiParameter("activite", enum=Activite.values, required=False),
            OpenApiParameter("sans_coordonnees", str, required=False, description="1"),
            OpenApiParameter("position_proposee", str, required=False, description="1"),
            OpenApiParameter("portee", enum=["perimetre", "pays"], required=False),
            OpenApiParameter("tri", enum=list(rch.TRIS_ETABLISSEMENTS), required=False),
            OpenApiParameter("page", int, required=False),
            OpenApiParameter("taille", int, required=False),
        ],
        responses=s.ListeEtablissementsSerializer,
        operation_id="etablissements_liste",
    )
    def get(self, request):
        p = request.query_params
        qs = rch.dans_portee(
            self.get_queryset(), p, self.perimetre, rch.etablissements_du_perimetre
        )
        qs = rch.filtrer_etablissements(rch.statut(qs, p.get("statut")), p)
        if p.get("position_proposee") == "1":
            qs = positions.a_valider(qs, pays_requis(self.perimetre))
        qs = rch.trier(
            services.rechercher_etablissements(qs, p.get("q", "")), p.get("tri"),
            rch.TRIS_ETABLISSEMENTS,
        )  # fmt: skip
        resultats, pagination = rch.paginer(qs, p)
        return Response({**pagination, "resultats": self.get_serializer(resultats, many=True).data})

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
        return self.detail(services.modifier_etablissement(fiche, auteur=request.user, **v))


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
        return self.detail(services.archiver(fiche, v.get("motif", ""), request.user))


class SyntheseEtablissementsVue(VueEtablissements):
    actions = {"GET": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.SyntheseEtablissementsSerializer,
                   operation_id="etablissements_synthese")  # fmt: skip
    def get(self, request):
        qs = rch.etablissements_du_perimetre(self.get_queryset(), self.perimetre)
        actifs = qs.filter(statut=StatutFiche.ACTIF)
        chiffres = qs.aggregate(
            actifs=Count("id", filter=Q(statut=StatutFiche.ACTIF)),
            a_valider=Count("id", filter=Q(statut=StatutFiche.A_VALIDER)),
            mes_a_valider=Count(
                "id", filter=Q(statut=StatutFiche.A_VALIDER, cree_par=request.user)
            ),
        )
        chiffres["sans_coordonnees"] = actifs.filter(latitude__isnull=True).count()
        pays = self.perimetre.pays_actif
        chiffres["positions_proposees"] = positions.a_valider(actifs, pays).count() if pays else 0
        chiffres["secteurs_couverts"] = actifs.values("secteur").distinct().count()
        chiffres["types"] = dict(
            actifs.values_list("type__code").annotate(n=Count("id")).values_list("type__code", "n")
        )
        return Response(chiffres)


class PositionProposeeVue(VueEtablissements):
    """DC-52 : la position proposée d'un établissement, et sa validation sur la carte."""

    actions = {"GET": Action.PROSPECTS_GERER}

    @extend_schema(responses=s.PositionProposeeSerializer,
                   operation_id="etablissement_position_proposee")  # fmt: skip
    def get(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.PositionProposeeSerializer(positions.proposition(fiche)).data)


class ValidationPositionVue(VueEtablissements):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=s.ValidationPositionSerializer, responses=s.EtablissementSerializer,
                   operation_id="etablissement_valider_position")  # fmt: skip
    def post(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ValidationPositionSerializer, request)
        return self.detail(positions.valider(fiche, request.user, v.get("latitude"),
                                             v.get("longitude")))  # fmt: skip


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


# --- Exercices (PRP-004) ---------------------------------------------------------------------


class VueExercices(VuePerimetre):
    """Lieux d'exercice des fiches visibles. Les gère qui peut modifier la fiche prospect :
    l'administrateur pays, ou le délégué sur sa fiche encore à valider (RG-041). Sur une
    fiche commune, le délégué proposera un nouvel exercice (PRP-014, 0.1.8)."""

    serializer_class = s.ExerciceSerializer

    def selection(self, perimetre):
        return Exercice.objects.filter(
            prospect__in=services.prospects_visibles(perimetre)
        ).select_related(
            "pays", "prospect__type", "prospect__specialite", "etablissement__type",
            "etablissement__secteur", "etablissement__localite",
        )  # fmt: skip

    def exiger_modification(self, prospect):
        if not services.peut_modifier(self.perimetre, prospect):
            raise ErreurMetier(
                "modification_interdite",
                _("Seul l'administrateur pays modifie une fiche commune."),
                status.HTTP_403_FORBIDDEN,
            )

    def rendu(self, exercice, statut=status.HTTP_200_OK):
        exercice = self.selection(self.perimetre).get(pk=exercice.pk)
        return Response(self.get_serializer(exercice).data, status=statut)


class ExercicesProspectVue(VueExercices):
    actions = {"GET": Action.PROSPECTS_LIRE, "POST": Action.PROSPECTS_LIRE}

    @extend_schema(responses=s.ExerciceSerializer(many=True), operation_id="prospect_exercices")
    def get(self, request, id):
        prospect = get_object_or_404(services.prospects_visibles(self.perimetre), pk=id)
        exercices = sorted(
            self.get_queryset().filter(prospect=prospect),
            key=lambda e: (e.fin is not None, not e.principal, e.debut),
        )
        return Response(self.get_serializer(exercices, many=True).data)

    @extend_schema(request=s.SaisieExerciceSerializer, responses={201: s.ExerciceSerializer},
                   operation_id="prospect_exercice_creer")  # fmt: skip
    def post(self, request, id):
        prospect = get_object_or_404(services.prospects_visibles(self.perimetre), pk=id)
        self.exiger_modification(prospect)
        v = _lire(s.SaisieExerciceSerializer, request)
        etablissement = (
            services.fiches_visibles(Etablissement, self.perimetre)
            .filter(pk=v["etablissement"])
            .first()
        )
        if etablissement is None:
            raise ErreurMetier(
                "etablissement_invalide",
                _("Établissement inconnu dans ce pays."),
                champ="etablissement",
            )
        exercice = services.creer_exercice(
            prospect, etablissement, request.user, debut=v.get("debut"),
            principal=v.get("principal"), presence=v.get("presence", ""),
        )  # fmt: skip
        return self.rendu(exercice, status.HTTP_201_CREATED)


class ExerciceVue(VueExercices):
    actions = {"PATCH": Action.PROSPECTS_LIRE}

    @extend_schema(request=s.ModificationExerciceSerializer, responses=s.ExerciceSerializer,
                   operation_id="exercice_modifier")  # fmt: skip
    def patch(self, request, id):
        exercice = get_object_or_404(self.get_queryset(), pk=id)
        self.exiger_modification(exercice.prospect)
        v = _lire(s.ModificationExerciceSerializer, request)
        return self.rendu(services.modifier_exercice(exercice, **v))


class ExerciceFinVue(VueExercices):
    actions = {"POST": Action.PROSPECTS_LIRE}

    @extend_schema(request=s.FinExerciceSerializer, responses=s.ExerciceSerializer,
                   operation_id="exercice_terminer")  # fmt: skip
    def post(self, request, id):
        exercice = get_object_or_404(self.get_queryset(), pk=id)
        self.exiger_modification(exercice.prospect)
        v = _lire(s.FinExerciceSerializer, request)
        return self.rendu(services.terminer_exercice(exercice, v.get("fin")))


class ExercicesEtablissementVue(VueExercices):
    actions = {"GET": Action.PROSPECTS_LIRE}

    @extend_schema(
        responses=s.ExerciceSerializer(many=True), operation_id="etablissement_exercices"
    )
    def get(self, request, id):
        etablissement = get_object_or_404(
            services.fiches_visibles(Etablissement, self.perimetre), pk=id
        )
        exercices = self.get_queryset().filter(etablissement=etablissement)
        exercices = sorted(
            exercices, key=lambda e: (e.fin is not None, e.prospect.nom, e.prospect.prenom)
        )
        contexte = {
            **self.get_serializer_context(),
            "dernieres_visites": _dernieres_visites(
                request.user, [e.prospect_id for e in exercices]
            ),
        }
        return Response(s.ExerciceSerializer(exercices, many=True, context=contexte).data)


def _dernieres_visites(utilisateur, prospects: list) -> dict:
    """La dernière visite effectuée par l'utilisateur chez chacun de ces prospects."""
    from django.db.models import Max

    from apps.planning.etats import StatutVisite
    from apps.planning.models import Visite

    lignes = (
        Visite.objects.filter(
            planning__delegue=utilisateur,
            prospect_id__in=prospects,
            archive_le__isnull=True,
            statut=StatutVisite.EFFECTUEE,
        )
        .values("prospect_id")
        .annotate(derniere=Max("date"))
    )
    return {ligne["prospect_id"]: ligne["derniere"] for ligne in lignes}

"""API du calendrier et du planning (cycle 0.2).

- Jours fériés (ORG-012) : `jours_feries.gerer` (administrateur pays), pays actif requis.
- Semaine, planning (PLN-001) et visites planifiées (PLN-002) : `plannings.preparer`
  (délégué, superviseur qui occupe un poste), sur ses propres plannings uniquement.
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

from . import controles, kilometrage, services
from . import serializers as s
from .calendrier import jours_de_la_semaine, lundi
from .etats import MODIFIABLES
from .models import Activite, JourFerie, Passage, Planning, Visite

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
            "fuseau": pays.fuseau,
            "jours": [
                {
                    "date": j.date,
                    "ferie": j.ferie.libelle if j.ferie else None,
                    "planifiable": j.planifiable,
                }
                for j in jours_de_la_semaine(pays, debut)
            ],  # fmt: skip
            "planning": planning,
            "peut_creer": planning is None
            and debut >= courante
            and services.occupe_un_poste(request.user, pays, debut),
            "modifiable": bool(planning) and planning.statut in MODIFIABLES,
            "visites": _visites(planning) if planning else [],
            "passages": _passages(planning) if planning else [],
            "activites": list(planning.activites.filter(archive_le__isnull=True))
            if planning
            else [],
            "controles": controles.bilan(planning) if planning else None,
            "kilometrage": kilometrage.estimer(planning) if planning else None,
            "reprenables": _reprenables(planning),
            "reseaux": _reseaux(planning) if planning else [],
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


# --- Visites planifiées (PLN-002) ------------------------------------------------------------


def _visites(planning: Planning) -> list:
    return list(
        planning.visites.filter(archive_le__isnull=True).select_related(
            "prospect__type", "prospect__specialite", "etablissement", "reseau"
        )
    )


def _reprenables(planning: Planning | None) -> int:
    """Une semaine en préparation encore vide peut reprendre la précédente (PLN-005 CA2)."""
    if planning is None or planning.statut not in MODIFIABLES:
        return 0
    if planning.visites.filter(archive_le__isnull=True).exists():
        return 0
    source = services.precedente(planning)
    return source.visites.filter(archive_le__isnull=True).count() if source else 0


def _passages(planning: Planning) -> list:
    return list(planning.passages.filter(archive_le__isnull=True)
                .select_related("etablissement").prefetch_related("visites"))  # fmt: skip


def _reseaux(planning: Planning) -> list:
    reseaux = {r.pk: r for p in services.postes_de_la_semaine(planning) for r in p.reseaux.all()}
    return [{"id": r.pk, "libelle": r.libelle} for r in sorted(reseaux.values(),
                                                              key=lambda r: r.libelle)]  # fmt: skip


def _fiche(modele, perimetre, identifiant, code: str):
    """RG-025 : une fiche active du pays, ou une fiche que le délégué a créée et qui attend sa
    validation (PRP-006 : utilisable aussitôt par lui seul)."""
    from django.db.models import Q

    from apps.prospects.models import StatutFiche
    from apps.prospects.services import fiches_visibles

    if identifiant is None:
        return None
    fiche = (
        fiches_visibles(modele, perimetre)
        .filter(archive_le__isnull=True)
        .filter(Q(statut=StatutFiche.ACTIF)
                | Q(statut=StatutFiche.A_VALIDER, cree_par=perimetre.utilisateur))
        .filter(pk=identifiant)
        .first()
    )  # fmt: skip
    if fiche is None:
        raise ErreurMetier(code, _("Fiche inconnue ou inactive dans ce pays."), champ=code[:-9])
    return fiche


def _references(perimetre, v: dict) -> dict:
    from apps.organisation.models import Reseau
    from apps.prospects.models import Etablissement, Prospect

    if "prospect" in v:
        v["prospect"] = _fiche(Prospect, perimetre, v["prospect"], "prospect_invalide")
    if "etablissement" in v:
        v["etablissement"] = _fiche(
            Etablissement, perimetre, v["etablissement"], "etablissement_invalide"
        )
    if v.get("reseau") is not None:
        reseau = perimetre.filtrer_par_pays(Reseau.objects.all()).filter(pk=v["reseau"]).first()
        if reseau is None:
            raise ErreurMetier("reseau_invalide", _("Réseau inconnu."), champ="reseau")
        v["reseau"] = reseau
    return v


class VueVisites(VuePerimetre):
    serializer_class = s.VisiteSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Visite.objects.filter(planning__delegue=self.request.user, archive_le__isnull=True)
        ).select_related("planning")


class VisitesPlanningVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.SaisieVisiteSerializer, responses={201: s.VisiteSerializer},
                   operation_id="visite_planifier")  # fmt: skip
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        v = _references(self.perimetre, _lire(s.SaisieVisiteSerializer, request))
        visite = services.ajouter_visite(planning, **v)
        return Response(s.VisiteSerializer(visite).data, status=status.HTTP_201_CREATED)


class VisiteVue(VueVisites):
    actions = {"PATCH": PREPARER}

    @extend_schema(request=s.ModificationVisiteSerializer, responses=s.VisiteSerializer,
                   operation_id="visite_modifier")  # fmt: skip
    def patch(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _references(self.perimetre, _lire(s.ModificationVisiteSerializer, request))
        return Response(s.VisiteSerializer(services.modifier_visite(visite, **v)).data)


class VisiteRetraitVue(VueVisites):
    actions = {"POST": PREPARER}

    @extend_schema(request=None, responses=s.VisiteSerializer, operation_id="visite_retirer")
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.VisiteSerializer(services.retirer_visite(visite)).data)


class OrdreVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.OrdreSerializer, responses=s.VisiteSerializer(many=True),
                   operation_id="planning_ordonner")  # fmt: skip
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.OrdreSerializer, request)
        services.ordonner(planning, v["date"], v["visites"])
        visites = [x for x in _visites(planning) if x.date == v["date"]]
        return Response(s.VisiteSerializer(visites, many=True).data)


# --- Passages (PLN-003) -----------------------------------------------------------------------


class PassagesPlanningVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.RegroupementSerializer, responses={201: s.PassageSerializer},
                   operation_id="passage_regrouper")  # fmt: skip
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.RegroupementSerializer, request)
        visites = list(planning.visites.filter(archive_le__isnull=True, pk__in=v["visites"]))
        if len(visites) != len(set(v["visites"])):
            raise ErreurMetier("visite_inconnue", _("Visite inconnue dans ce planning."),
                               champ="visites")  # fmt: skip
        passage = services.regrouper(planning, visites)
        return Response(s.PassageSerializer(passage).data, status=status.HTTP_201_CREATED)


class PassageDissociationVue(VuePerimetre):
    serializer_class = s.PassageSerializer
    actions = {"POST": PREPARER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Passage.objects.filter(planning__delegue=self.request.user, archive_le__isnull=True)
        ).select_related("planning")

    @extend_schema(request=None, responses=s.PassageSerializer, operation_id="passage_dissocier")
    def post(self, request, id):
        passage = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.PassageSerializer(services.dissocier(passage)).data)


# --- Activités connexes (PLN-009, PLN-018) ---------------------------------------------------


class ActivitesPlanningVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.SaisieActiviteSerializer, responses={201: s.ActiviteSerializer},
                   operation_id="activite_declarer")  # fmt: skip
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        activite = services.declarer_activite(
            planning, **_lire(s.SaisieActiviteSerializer, request)
        )
        return Response(s.ActiviteSerializer(activite).data, status=status.HTTP_201_CREATED)


class VueActivites(VuePerimetre):
    serializer_class = s.ActiviteSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Activite.objects.filter(planning__delegue=self.request.user, archive_le__isnull=True)
        ).select_related("planning")


class ActiviteVue(VueActivites):
    actions = {"PATCH": PREPARER}

    @extend_schema(request=s.ModificationActiviteSerializer, responses=s.ActiviteSerializer,
                   operation_id="activite_modifier")  # fmt: skip
    def patch(self, request, id):
        activite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationActiviteSerializer, request)
        return Response(s.ActiviteSerializer(services.modifier_activite(activite, **v)).data)


class ActiviteRetraitVue(VueActivites):
    actions = {"POST": PREPARER}

    @extend_schema(request=None, responses=s.ActiviteSerializer, operation_id="activite_retirer")
    def post(self, request, id):
        activite = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.ActiviteSerializer(services.retirer_activite(activite)).data)


# --- Soumission (PLN-008) ---------------------------------------------------------------------


class FileValidationVue(VuePerimetre):
    """PLN-011 : file des plannings en attente du superviseur, triée par ancienneté (CA1)."""

    actions = {"GET": Action.PLANNINGS_VALIDER}
    serializer_class = s.PlanningEnAttenteSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Planning.objects.none())

    @extend_schema(responses=s.PlanningEnAttenteSerializer(many=True),
                   operation_id="plannings_a_valider")  # fmt: skip
    def get(self, request):
        from collections import Counter

        pays = pays_requis(self.perimetre)
        lignes = []
        for planning in services.plannings_a_valider(request.user, pays):
            compte = Counter(a.code for a in controles.signalements(planning))
            lignes.append({
                "planning": planning,
                "fuseau": pays.fuseau,
                "delegue": planning.delegue,
                "postes": [p.libelle for p in services.postes_de_la_semaine(planning)],
                "visites": planning.visites.filter(archive_le__isnull=True).count(),
                "signalements": [{"code": c, "nombre": n} for c, n in compte.items()],
                "activites": list(planning.activites.filter(archive_le__isnull=True)),
            })  # fmt: skip
        return Response(s.PlanningEnAttenteSerializer(lignes, many=True).data)


class SoumissionVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=None, responses=s.PlanningSerializer, operation_id="planning_soumettre")
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.PlanningSerializer(services.soumettre(planning)).data)


# --- Copier, reprendre, poser depuis la liste cible (PLN-005) ---------------------------------


class PoseVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.PoseSerializer, responses={201: s.VisiteSerializer(many=True)},
                   operation_id="planning_poser")  # fmt: skip
    def post(self, request, id):
        from apps.prospects.models import Prospect

        planning = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.PoseSerializer, request)
        prospects = [_fiche(Prospect, self.perimetre, p, "prospect_invalide")
                     for p in dict.fromkeys(v["prospects"])]  # fmt: skip
        visites = services.poser_depuis_cible(planning, v["date"], prospects)
        return Response(s.VisiteSerializer(visites, many=True).data,
                        status=status.HTTP_201_CREATED)  # fmt: skip


class RepriseVue(VuePlannings):
    actions = {"POST": PREPARER}

    @extend_schema(request=None, responses=s.RepriseSerializer, operation_id="planning_reprendre")
    def post(self, request, id):
        planning = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.RepriseSerializer(services.reprendre_semaine_precedente(planning)).data)


class VisiteCopieVue(VueVisites):
    actions = {"POST": PREPARER}

    @extend_schema(request=s.CopieSerializer, responses={201: s.VisiteSerializer},
                   operation_id="visite_copier")  # fmt: skip
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.CopieSerializer, request)
        copie = services.copier_visite(visite, v["date"])
        return Response(s.VisiteSerializer(copie).data, status=status.HTTP_201_CREATED)

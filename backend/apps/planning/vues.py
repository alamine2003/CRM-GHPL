"""API du calendrier et du planning (cycle 0.2).

- Jours fériés (ORG-012) : `jours_feries.gerer` (administrateur pays), pays actif requis.
- Semaine, planning (PLN-001) et visites planifiées (PLN-002) : `plannings.preparer`
  (délégué, superviseur qui occupe un poste), sur ses propres plannings uniquement.
"""

from datetime import date, timedelta

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
from .etats import MODIFIABLES, StatutPlanning
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
        planning = self.get_queryset().filter(semaine=debut).first()
        fermee = services.semaine_fermee(pays, request.user, debut, planning)
        donnees = _semaine(pays, debut, planning) | {
            "peut_creer": planning is None
            and debut >= lundi(aujourdhui(pays))
            and not fermee
            and timezone.now() < services.fermeture(pays, debut)
            and services.occupe_un_poste(request.user, pays, debut),
            "modifiable": bool(planning)
            and planning.statut in MODIFIABLES
            and not services.est_ferme(planning),
            "reprenables": _reprenables(planning),
            "fermee": fermee,
            "demande_envoyee": fermee and services.reouverture_demandee(request.user, debut),
        }
        return Response(s.SemaineSerializer(donnees).data)


def _semaine(pays, debut: date, planning: Planning | None) -> dict:
    """La semaine et son planning : jours, visites, passages, activités, contrôles, kilomètres.
    Le délégué la prépare (PLN-006) ; le superviseur la consulte (0.3.2)."""
    return {
        "semaine": debut,
        "precedente": debut - timedelta(days=7),
        "suivante": debut + timedelta(days=7),
        "courante": debut == lundi(aujourdhui(pays)),
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
        "peut_creer": False,
        "modifiable": False,
        "reprenables": 0,
        "fermee": False,
        "demande_envoyee": False,
        "visites": _visites(planning) if planning else [],
        "passages": _passages(planning) if planning else [],
        "activites": list(planning.activites.filter(archive_le__isnull=True)) if planning else [],
        "controles": controles.bilan(planning) if planning else None,
        "kilometrage": kilometrage.estimer(planning) if planning else None,
        "reseaux": _reseaux(planning) if planning else [],
        "approbation": services.suivi_apres_approbation(planning) if planning else None,
    }


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


def _escalade(utilisateur, planning):
    """PLN-016 : pour le DM qui décide par escalade, depuis quand et à la place de qui."""
    from apps.identite.models import Utilisateur

    from .models import ModeDecision

    if services.mode_de_decision(utilisateur, planning) != ModeDecision.ESCALADE:
        return None
    version = planning.versions.first()
    return {
        "le": version.escalade_le,
        "responsables": list(Utilisateur.objects.filter(pk__in=services.responsables(planning))),
    }


def _remplace(utilisateur, planning):
    """Le superviseur titulaire quand l'utilisateur décide en remplacement (ORG-013)."""
    from apps.identite.models import Utilisateur

    from .models import ModeDecision

    if services.mode_de_decision(utilisateur, planning) != ModeDecision.REMPLACEMENT:
        return None
    return Utilisateur.objects.filter(pk__in=services.responsables(planning)).first()


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
                "remplace": _remplace(request.user, planning),
                "escalade": _escalade(request.user, planning),
                "postes": [p.libelle for p in services.postes_de_la_semaine(planning)],
                "visites": planning.visites.filter(archive_le__isnull=True).count(),
                "signalements": [{"code": c, "nombre": n} for c, n in compte.items()],
                "activites": list(planning.activites.filter(archive_le__isnull=True)),
            })  # fmt: skip
        return Response(s.PlanningEnAttenteSerializer(lignes, many=True).data)


class VueSupervision(VuePerimetre):
    """Plannings soumis (ou décidés) d'un délégué que l'utilisateur supervise cette semaine-là :
    superviseur du poste, ou DM du poste d'un superviseur-visiteur (RG-023). Un planning en
    préparation, ou hors supervision, n'existe pas pour lui (404)."""

    serializer_class = s.PlanningSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Planning.objects.exclude(statut=StatutPlanning.BROUILLON).select_related("delegue")
        )

    def planning_supervise(self, id) -> Planning:
        pays = pays_requis(self.perimetre)
        planning = get_object_or_404(self.get_queryset().filter(pays=pays), pk=id)
        if not services.supervise(self.request.user, planning):
            raise Http404
        return planning


class ConsultationVue(VueSupervision):
    """0.3.2 : le responsable consulte un planning soumis : la semaine, ses visites, activités,
    contrôles et kilomètres, et la dernière décision, sans rien y modifier."""

    actions = {"GET": Action.PLANNINGS_VALIDER}
    serializer_class = s.ConsultationSerializer

    @extend_schema(responses=s.ConsultationSerializer, operation_id="planning_consulter")
    def get(self, request, id):
        planning = self.planning_supervise(id)
        donnees = _semaine(planning.pays, planning.semaine, planning) | {
            "delegue": planning.delegue,
            "remplace": _remplace(request.user, planning),
            "escalade": _escalade(request.user, planning),
            "postes": [p.libelle for p in services.postes_de_la_semaine(planning)],
        }
        return Response(s.ConsultationSerializer(donnees).data)


class ApprobationVue(VueSupervision):
    """PLN-012 : le responsable du poste approuve un planning soumis ; PLN-017 : le DM pour un
    superviseur-visiteur."""

    actions = {"POST": Action.PLANNINGS_VALIDER}

    @extend_schema(request=None, responses=s.PlanningSerializer, operation_id="planning_approuver")
    def post(self, request, id):
        planning = self.planning_supervise(id)
        return Response(s.PlanningSerializer(services.approuver(planning, request.user)).data)


class RevisionVue(VueSupervision):
    """PLN-013 : le responsable du poste demande une révision, commentée (RG-017)."""

    actions = {"POST": Action.PLANNINGS_VALIDER}

    @extend_schema(request=s.RevisionSerializer, responses=s.PlanningSerializer,
                   operation_id="planning_reviser")  # fmt: skip
    def post(self, request, id):
        planning = self.planning_supervise(id)
        v = _lire(s.RevisionSerializer, request)
        planning = services.demander_revision(
            planning, request.user, v.get("commentaire", ""), v.get("remarques", [])
        )
        return Response(s.PlanningSerializer(planning).data)


class VueVersions(VuePerimetre):
    """PLN-014 CA2, RG-037 : les versions figées se consultent par le délégué (les siennes) et
    par ceux qui décident du planning (responsable du poste, remplaçant)."""

    serializer_class = s.VersionSerializer

    @property
    def actions(self):
        lecture = (Action.PLANNINGS_VALIDER if self.perimetre.peut(Action.PLANNINGS_VALIDER)
                   else Action.PLANNINGS_PREPARER)  # fmt: skip
        return {"GET": lecture}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Planning.objects.select_related("delegue"))

    def planning_visible(self, id) -> Planning:
        planning = get_object_or_404(self.get_queryset(), pk=id)
        if planning.delegue_id != self.request.user.pk and not services.supervise(
            self.request.user, planning
        ):
            raise Http404
        return planning


class VersionsVue(VueVersions):
    @extend_schema(responses=s.VersionSerializer(many=True), operation_id="planning_versions")
    def get(self, request, id):
        planning = self.planning_visible(id)
        lignes = [s.VersionSerializer.donnees(v, c)
                  for v, c in services.versions_avec_comparaison(planning)]  # fmt: skip
        return Response(s.VersionSerializer(lignes, many=True).data)


class VersionVue(VueVersions):
    @extend_schema(responses=s.DetailVersionSerializer, operation_id="planning_version")
    def get(self, request, id, numero):
        planning = self.planning_visible(id)
        for version, comparaison in services.versions_avec_comparaison(planning):
            if version.numero == numero:
                donnees = s.DetailVersionSerializer.donnees(version, comparaison)
                return Response(s.DetailVersionSerializer(donnees).data)
        raise Http404


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


# --- Fermeture de la semaine (décision du 6 octobre 2026) ------------------------------------


class DemandeReouvertureVue(VuePlannings):
    """Le délégué dont la semaine est fermée demande à son superviseur d'en rouvrir la
    rédaction ; une seule demande par semaine."""

    actions = {"POST": PREPARER}

    @extend_schema(request=s.SemaineCibleSerializer, responses=s.DemandeReouvertureSerializer,
                   operation_id="planning_demander_reouverture")  # fmt: skip
    def post(self, request):
        pays = pays_requis(self.perimetre)
        v = _lire(s.SemaineCibleSerializer, request)
        nombre = services.demander_reouverture(pays, request.user, v["semaine"])
        return Response(s.DemandeReouvertureSerializer({"destinataires": nombre}).data)


class SemainesFermeesVue(VuePerimetre):
    """Les délégués supervisés dont la semaine en cours est fermée : le superviseur peut rouvrir
    leur rédaction ; la réouverture reste inscrite."""

    actions = {"GET": Action.PLANNINGS_VALIDER}
    serializer_class = s.SemaineFermeeSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Planning.objects.none())

    @extend_schema(responses=s.SemaineFermeeSerializer(many=True),
                   operation_id="plannings_fermes")  # fmt: skip
    def get(self, request):
        pays = pays_requis(self.perimetre)
        lignes = services.semaines_fermees(request.user, pays)
        return Response(s.SemaineFermeeSerializer(lignes, many=True).data)


class ReouvertureVue(VuePerimetre):
    """Le superviseur du poste (ou son remplaçant) rouvre la rédaction d'un planning fermé."""

    actions = {"POST": Action.PLANNINGS_VALIDER}
    serializer_class = s.PlanningSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Planning.objects.none())

    @extend_schema(request=s.ReouvertureSerializer, responses=s.PlanningSerializer,
                   operation_id="planning_rouvrir")  # fmt: skip
    def post(self, request):
        from apps.identite.models import Utilisateur

        pays = pays_requis(self.perimetre)
        v = _lire(s.ReouvertureSerializer, request)
        delegue = Utilisateur.objects.filter(pk=v["delegue"]).first()
        if delegue is None:
            raise Http404
        planning = services.rouvrir(pays, delegue, v["semaine"], request.user)
        return Response(s.PlanningSerializer(planning).data)


# --- Programme du délégué (VIS-001, cycle 0.4) ---------------------------------------------


class ProgrammeVue(VuePlannings):
    """VIS-001 : le programme de la semaine, tel qu'approuvé ; le téléphone le garde pour
    l'afficher sans réseau (CA1)."""

    actions = {"GET": PREPARER}

    @extend_schema(
        parameters=[OpenApiParameter("semaine", date, required=False,
                                     description="Un jour de la semaine ; par défaut, celle-ci")],
        responses=s.ProgrammeSerializer,
        operation_id="programme",
    )  # fmt: skip
    def get(self, request):
        from .programme import programme

        pays = pays_requis(self.perimetre)
        brute = request.query_params.get("semaine")
        try:
            jour = date.fromisoformat(brute) if brute else None
        except ValueError as erreur:
            raise ErreurMetier(
                "semaine_invalide", _("Date invalide : format AAAA-MM-JJ attendu."), champ="semaine"
            ) from erreur
        return Response(s.ProgrammeSerializer(programme(pays, request.user, jour)).data)


class VisiteDetailVue(VuePerimetre):
    """VIS-002 : détail d'une visite du délégué, avec les coordonnées et son historique récent.
    Une visite retirée par une modification encore en attente reste au programme : elle se lit
    aussi."""

    actions = {"GET": PREPARER}
    serializer_class = s.DetailVisiteSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Visite.objects.filter(planning__delegue=self.request.user)
        ).select_related("planning", "prospect__type", "prospect__specialite",
                         "etablissement__localite", "reseau")  # fmt: skip

    @extend_schema(responses=s.DetailVisiteSerializer, operation_id="visite_detail")
    def get(self, request, id):
        from .programme import historique

        visite = get_object_or_404(self.get_queryset(), pk=id)
        donnees = {"visite": visite, "prospect": visite.prospect, "lieu": visite.etablissement,
                   "historique": historique(visite)}  # fmt: skip
        return Response(s.DetailVisiteSerializer(donnees).data)


class DemarrageVue(VueVisites):
    """VIS-003 : le délégué démarre une visite de son programme ; l'envoi peut partir plus tard,
    depuis la file du téléphone, sans rien changer s'il est rejoué."""

    actions = {"POST": PREPARER}

    @extend_schema(request=s.DemarrageSerializer, responses=s.VisiteSerializer,
                   operation_id="visite_demarrer")  # fmt: skip
    def post(self, request, id):
        from .execution import demarrer

        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.DemarrageSerializer, request)
        visite = demarrer(visite, v["debut_le"], v.get("latitude"), v.get("longitude"),
                          v.get("precision_m"))  # fmt: skip
        return Response(s.VisiteSerializer(visite).data)


class TerminaisonVue(VueVisites):
    """VIS-004 : le délégué termine une visite en cours ; rejouable depuis la file."""

    actions = {"POST": PREPARER}

    @extend_schema(request=s.TerminaisonSerializer, responses=s.VisiteSerializer,
                   operation_id="visite_terminer")  # fmt: skip
    def post(self, request, id):
        from .execution import terminer

        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.TerminaisonSerializer, request)
        visite = terminer(visite, v["fin_le"], v.get("latitude"), v.get("longitude"),
                          v.get("precision_m"))  # fmt: skip
        return Response(s.VisiteSerializer(visite).data)

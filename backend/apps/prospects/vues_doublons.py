"""API des doublons, fusions, historique et propositions (PRP-007 à PRP-014).

- Suggestions pendant la saisie (PRP-007) et historique d'une fiche (PRP-012) :
  `prospects.lire`, sur les fiches visibles.
- File des doublons, fusions et défusions (PRP-008 à PRP-010) : `prospects.gerer`
  (administrateur pays).
- Propositions (PRP-014) : le délégué propose (`propositions.creer`) ; l'administrateur pays
  ou le superviseur des postes de l'auteur tranche (`propositions.trancher`).
"""

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.organisation.vues import _lire, pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.socle.erreurs import ErreurMetier

from . import doublons, propositions, qualite, services
from . import serializers as s
from .models import (
    Changement,
    DoublonProbable,
    Etablissement,
    Exercice,
    Fusion,
    Proposition,
    Prospect,
    StatutDoublon,
    StatutProposition,
)


class RessemblantsVue(VuePerimetre):
    """PRP-007 CA1 : fiches qui ressemblent à la saisie en cours."""

    actions = {"GET": Action.PROSPECTS_LIRE}

    def selection(self, perimetre):
        return services.prospects_visibles(perimetre).select_related("type", "specialite")

    @extend_schema(
        parameters=[
            OpenApiParameter("nom", str, required=False),
            OpenApiParameter("prenom", str, required=False),
            OpenApiParameter("numero_ordre", str, required=False),
            OpenApiParameter("telephone_mobile", str, required=False),
        ],
        responses=s.RessemblanteSerializer(many=True),
        operation_id="prospects_ressemblants",
    )
    def get(self, request):
        p = request.query_params
        pays = pays_requis(self.perimetre)
        champs = {k: (p.get(k) or "").strip() for k in
                  ("nom", "prenom", "numero_ordre", "telephone_mobile")}  # fmt: skip
        try:
            champs["telephone_mobile"] = services.normaliser_telephone(
                champs["telephone_mobile"], pays, "telephone_mobile"
            )
        except ErreurMetier:
            champs["telephone_mobile"] = ""
        champs["numero_ordre"] = champs["numero_ordre"].replace(" ", "").upper()
        en_cours = Exercice.objects.filter(fin__isnull=True).select_related("etablissement")
        qs = self.get_queryset().prefetch_related(
            Prefetch("exercices", queryset=en_cours, to_attr="exercices_en_cours")
        )
        resultats = []
        for prospect, score, criteres in doublons.ressemblantes(qs, pays, champs):
            lieux = getattr(prospect, "exercices_en_cours", [])
            principal = next((e for e in lieux if e.principal), lieux[0] if lieux else None)
            resultats.append({
                "prospect": prospect,
                "lieu_principal": principal.etablissement.nom if principal else None,
                "score": score,
                "criteres": criteres,
            })  # fmt: skip
        return Response(s.RessemblanteSerializer(resultats, many=True).data)


class HistoriqueVue(VuePerimetre):
    """PRP-012 CA1 : changements champ par champ d'une fiche visible."""

    actions = {"GET": Action.PROSPECTS_LIRE}
    modele = None

    def selection(self, perimetre):
        return services.fiches_visibles(self.modele, perimetre)

    def get(self, request, id):
        fiche = get_object_or_404(self.get_queryset(), pk=id)
        objet = (
            Changement.Objet.ETABLISSEMENT
            if self.modele is Etablissement
            else Changement.Objet.PROSPECT
        )
        lignes = Changement.objects.filter(
            pays=fiche.pays, objet=objet, objet_id=fiche.pk
        ).select_related("auteur")
        if objet == Changement.Objet.PROSPECT:
            from .confidentialite import mobile_visible

            # DC-58 : l'historique ne révèle pas un mobile que la fiche masque.
            if not mobile_visible(fiche):
                lignes = lignes.exclude(champ="telephone_mobile")
        return Response(s.ChangementFicheSerializer(lignes, many=True).data)


class HistoriqueProspectVue(HistoriqueVue):
    modele = Prospect

    @extend_schema(responses=s.ChangementFicheSerializer(many=True),
                   operation_id="prospect_historique")  # fmt: skip
    def get(self, request, id):
        return super().get(request, id)


class HistoriqueEtablissementVue(HistoriqueVue):
    modele = Etablissement

    @extend_schema(responses=s.ChangementFicheSerializer(many=True),
                   operation_id="etablissement_historique")  # fmt: skip
    def get(self, request, id):
        return super().get(request, id)


class VueDoublons(VuePerimetre):
    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(DoublonProbable.objects.all()).select_related(
            "fiche__type", "fiche__specialite", "fiche__secteur", "fiche__localite",
            "fiche__cree_par", "candidat__type", "candidat__specialite", "candidat__secteur",
            "candidat__localite", "candidat__cree_par", "decide_par",
        )  # fmt: skip


class DoublonsVue(VueDoublons):
    """PRP-009 : file des doublons probables du pays actif."""

    actions = {"GET": Action.PROSPECTS_GERER}

    @extend_schema(
        parameters=[OpenApiParameter("statut", enum=StatutDoublon.values, required=False)],
        responses=s.DoublonSerializer(many=True),
        operation_id="doublons_liste",
    )
    def get(self, request):
        statut = request.query_params.get("statut") or StatutDoublon.EN_ATTENTE
        qs = self.get_queryset().filter(statut=statut)[:100]
        return Response(s.DoublonSerializer(qs, many=True).data)


class DoublonDecisionVue(VueDoublons):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=s.DecisionDoublonSerializer, responses=s.DoublonSerializer,
                   operation_id="doublon_trancher")  # fmt: skip
    def post(self, request, id):
        doublon = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.DecisionDoublonSerializer, request)
        conserver = str(v["conserver"]) if v.get("conserver") else None
        doublons.trancher(doublon, v["decision"], request.user, conserver=conserver)
        doublon.refresh_from_db()
        return Response(s.DoublonSerializer(doublon).data)


class VueFusions(VuePerimetre):
    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Fusion.objects.all()).select_related(
            "conservee__type", "conservee__specialite", "absorbee__type",
            "absorbee__specialite", "par", "defaite_par",
        )  # fmt: skip


class FusionsVue(VueFusions):
    """PRP-010 : fusions du pays (automatiques et manuelles), les plus récentes d'abord."""

    actions = {"GET": Action.PROSPECTS_GERER}

    @extend_schema(responses=s.FusionSerializer(many=True), operation_id="fusions_liste")
    def get(self, request):
        return Response(s.FusionSerializer(self.get_queryset()[:100], many=True).data)


class DefusionVue(VueFusions):
    actions = {"POST": Action.PROSPECTS_GERER}

    @extend_schema(request=None, responses=s.FusionSerializer, operation_id="fusion_defaire")
    def post(self, request, id):
        fusion = get_object_or_404(self.get_queryset(), pk=id)
        doublons.defusionner(fusion, request.user)
        fusion.refresh_from_db()
        return Response(s.FusionSerializer(fusion).data)


class VuePropositions(VuePerimetre):
    def selection(self, perimetre):
        return propositions.visibles(perimetre).select_related(
            "prospect__type", "prospect__specialite", "etablissement__type",
            "etablissement__secteur", "etablissement__localite", "nouvel_exercice__type",
            "nouvel_exercice__secteur", "nouvel_exercice__localite", "auteur", "decide_par",
        )  # fmt: skip

    def contexte(self):
        return {
            "decidables": set(propositions.decidables(self.perimetre).values_list("pk", flat=True))
        }


class PropositionsVue(VuePropositions):
    actions = {"GET": Action.PROSPECTS_LIRE, "POST": Action.PROPOSITIONS_CREER}

    @extend_schema(
        parameters=[OpenApiParameter("statut", enum=StatutProposition.values, required=False)],
        responses=s.PropositionSerializer(many=True),
        operation_id="propositions_liste",
    )
    def get(self, request):
        """Les propositions de l'utilisateur et celles qu'il peut trancher."""
        qs = self.get_queryset()
        if request.query_params.get("statut"):
            qs = qs.filter(statut=request.query_params["statut"])
        return Response(s.PropositionSerializer(qs[:200], many=True,
                                                context=self.contexte()).data)  # fmt: skip

    @extend_schema(request=s.SaisiePropositionSerializer,
                   responses={201: s.PropositionSerializer},
                   operation_id="proposition_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.SaisiePropositionSerializer, request)
        if v.get("prospect"):
            fiche = get_object_or_404(services.prospects_visibles(self.perimetre),
                                      pk=v["prospect"])  # fmt: skip
        else:
            fiche = get_object_or_404(
                services.fiches_visibles(Etablissement, self.perimetre), pk=v["etablissement"]
            )
        lieu = None
        if v.get("nouvel_exercice"):
            lieu = get_object_or_404(
                services.fiches_visibles(Etablissement, self.perimetre), pk=v["nouvel_exercice"]
            )
        proposition = propositions.proposer(
            request.user, fiche, v.get("changements", {}), nouvel_exercice=lieu,
            commentaire=v.get("commentaire", ""), ident=v.get("id"),
        )  # fmt: skip
        donnees = s.PropositionSerializer(proposition, context=self.contexte()).data
        return Response(donnees, status=status.HTTP_201_CREATED)


class PropositionDecisionVue(VuePropositions):
    actions = {"POST": Action.PROPOSITIONS_TRANCHER}

    def selection(self, perimetre):
        return propositions.decidables(perimetre)

    @extend_schema(request=s.DecisionPropositionSerializer, responses=s.PropositionSerializer,
                   operation_id="proposition_trancher")  # fmt: skip
    def post(self, request, id):
        proposition = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.DecisionPropositionSerializer, request)
        if v["decision"] == "accepter":
            propositions.accepter(proposition, request.user)
        else:
            propositions.refuser(proposition, request.user, v.get("motif", ""))
        proposition = Proposition.objects.get(pk=proposition.pk)
        return Response(s.PropositionSerializer(proposition, context=self.contexte()).data)


class PropositionsVuesVue(VuePerimetre):
    """PRP-014 CA2 : le délégué a lu les décisions sur ses propositions."""

    actions = {"POST": Action.PROSPECTS_LIRE}

    def selection(self, perimetre):
        return propositions.visibles(perimetre)

    @extend_schema(request=None, responses={204: None}, operation_id="propositions_marquer_vues")
    def post(self, request):
        propositions.marquer_vues(request.user, pays_requis(self.perimetre))
        return Response(status=status.HTTP_204_NO_CONTENT)


class QualiteVue(VuePerimetre):
    """Qualité des données du pays actif (0.1.9) : l'administrateur pays, qui tient le
    référentiel et tranche la file des doublons."""

    actions = {"GET": Action.PROSPECTS_GERER}

    def selection(self, perimetre):
        return services.prospects_visibles(perimetre)

    @extend_schema(responses=s.QualiteSerializer, operation_id="qualite_bilan")
    def get(self, request):
        pays = pays_requis(self.perimetre)
        etablissements = services.fiches_visibles(Etablissement, self.perimetre)
        return Response(qualite.bilan(self.get_queryset(), etablissements, pays))

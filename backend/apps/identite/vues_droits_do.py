"""API du réglage des droits du DO (1.6.1, prd.md §14.85) : réservée à l'administrateur du siège.

Toutes ces vues héritent de VuePerimetre ; un compte hors du périmètre ou qui n'a pas le rôle DF
répond 404.
"""

from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.socle.erreurs import ErreurMetier

from . import droits_do
from .serializers_comptes import CompteDOSerializer, ModificationDroitsDOSerializer
from .vues_comptes import _comptes_du_perimetre


def _representer(compte) -> dict:
    pays = compte.pays_principal
    return {
        "id": compte.pk,
        "identifiant": compte.username,
        "prenom": compte.first_name,
        "nom": compte.last_name,
        "pays": pays and {"code": pays.code, "nom": pays.nom, "fuseau": pays.fuseau},
        "droits": droits_do.droits_de(compte),
    }


class VueDroitsDO(VuePerimetre):
    serializer_class = CompteDOSerializer

    def selection(self, perimetre):
        return _comptes_du_perimetre(perimetre).filter(
            pk__in=droits_do.comptes_df_actifs().values("pk")
        )


class DroitsDOVue(VueDroitsDO):
    """Les comptes DF (les DO) avec leurs droits ; le siège sans pays choisi les voit tous."""

    actions = {"GET": Action.DROITS_DO_REGLER}

    @extend_schema(responses=CompteDOSerializer(many=True), operation_id="droits_do_liste")
    def get(self, request):
        comptes = [_representer(c) for c in self.get_queryset()]
        return Response(CompteDOSerializer(comptes, many=True).data)


class DroitsDOCompteVue(VueDroitsDO):
    actions = {"GET": Action.DROITS_DO_REGLER, "PATCH": Action.DROITS_DO_REGLER}

    @extend_schema(responses=CompteDOSerializer, operation_id="droits_do_detail")
    def get(self, request, id):
        compte = get_object_or_404(self.get_queryset(), pk=id)
        return Response(CompteDOSerializer(_representer(compte)).data)

    @extend_schema(
        request=ModificationDroitsDOSerializer, responses=CompteDOSerializer,
        operation_id="droits_do_regler",
    )  # fmt: skip
    def patch(self, request, id):
        compte = get_object_or_404(self.get_queryset(), pk=id)
        donnees = ModificationDroitsDOSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        if not donnees.validated_data:
            raise ErreurMetier("droits_requis", _("Aucun droit à régler."), champ="droits")
        droits_do.regler(compte, dict(donnees.validated_data), request.user)
        return Response(CompteDOSerializer(_representer(compte)).data)

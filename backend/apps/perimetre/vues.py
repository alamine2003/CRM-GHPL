"""Classe de base de toutes les vues d'API métier (architecture §12, couche 1).

Une vue métier hérite de `VuePerimetre` :
- elle déclare l'action requise par méthode HTTP (`actions`) ;
- ses objets viennent de `selection(perimetre)`, déjà filtrée par le périmètre ;
- un objet hors périmètre répond 404, jamais 403 (USR-002 CA2) ;
- la base n'accepte, pour la durée de la requête, que les lignes du pays actif (ADR-003).

Un test parcourt toutes les routes et échoue si une vue métier n'en hérite pas.
"""

from functools import cached_property

from django.db import transaction
from django.db.models import QuerySet
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated

from apps.socle import journalisation

from . import isolation
from .matrice import Action
from .perimetre import Perimetre, calculer_perimetre

ENTETE_PAYS = "HTTP_X_PAYS"


class ExigeAction(BasePermission):
    def has_permission(self, request, view) -> bool:
        action = view.actions.get(request.method)
        if action is None:
            return request.method == "OPTIONS"
        view.perimetre.exiger(action)
        return True


class VuePerimetre(GenericAPIView):
    permission_classes = [IsAuthenticated, ExigeAction]
    #: Action exigée par méthode HTTP, par exemple {"GET": Action.PAYS_LIRE}.
    actions: dict[str, Action] = {}

    def dispatch(self, request, *args, **kwargs):
        # Une transaction par requête métier : l'isolation fixée dans la base ne vaut
        # que pour elle (couche 2, ADR-003).
        with transaction.atomic():
            return super().dispatch(request, *args, **kwargs)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        isolation.appliquer(self.perimetre)
        journalisation.pays.set(
            self.perimetre.pays_actif.code if self.perimetre.pays_actif else "consolide"
        )

    @cached_property
    def perimetre(self) -> Perimetre:
        return calculer_perimetre(self.request.user, self.request.META.get(ENTETE_PAYS))

    def selection(self, perimetre: Perimetre) -> QuerySet:
        raise NotImplementedError("Une vue métier définit sa sélection filtrée par périmètre.")

    def get_queryset(self) -> QuerySet:
        return self.selection(self.perimetre)

"""Mobile personnel des prescripteurs (DC-58, décision du 7 octobre 2026).

Le numéro reste enregistré : il sert à repérer les doublons. Il ne s'affiche qu'à
l'administration, qui tient les fiches, et aux délégués qui ont le prescripteur dans la liste
cible d'un poste qu'ils occupent, à condition qu'il ait accepté d'être contacté sur ce numéro.

Le lecteur est fixé pour la durée d'une requête par `VuePerimetre` ; hors requête (services,
commandes), rien n'est masqué.
"""

from contextvars import ContextVar

from apps.identite.models import Role
from apps.perimetre.matrice import SIEGE

lecteur: ContextVar = ContextVar("lecteur_prospects", default=None)
#: Prospects des listes cibles du lecteur, calculés une fois par requête.
_listes: ContextVar = ContextVar("listes_du_lecteur", default=None)

GESTION = frozenset({Role.ADMIN_PAYS} | SIEGE)


def _mes_listes(perimetre) -> set:
    memoire = _listes.get()
    if memoire is not None and memoire[0] is perimetre:
        return memoire[1]
    from .ciblage import postes_occupes
    from .models import Cible

    ids = set()
    if perimetre.pays_actif is not None:
        postes = postes_occupes(perimetre.utilisateur, perimetre.pays_actif)
        ids = set(Cible.objects.filter(poste__in=postes, fin__isnull=True)
                  .values_list("prospect_id", flat=True))  # fmt: skip
    _listes.set((perimetre, ids))
    return ids


def mobile_visible(prospect) -> bool:
    perimetre = lecteur.get()
    if perimetre is None or perimetre.roles & GESTION:
        return True
    if not getattr(prospect, "contact_mobile_accepte", False):
        return False
    return prospect.pk in _mes_listes(perimetre)


def masquer(donnees: dict, prospect) -> dict:
    if donnees.get("telephone_mobile") and not mobile_visible(prospect):
        donnees["telephone_mobile"] = ""
    return donnees

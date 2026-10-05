"""Machine à états du planning (prd.md §17.1, ADR-011).

Une seule source de vérité : ce module. Les clients lisent la même table dans
`packages/domaine/src/etats.json`, régénéré par `make schema` ; un test vérifie que
le fichier est à jour. Les commandes qui font passer d'un état à l'autre (soumettre,
approuver…) arrivent avec leurs versions (0.2.8, cycle 0.3) et passent toutes par
`exiger_transition`.
"""

from django.db import models
from django.utils.translation import gettext as _

from apps.socle.erreurs import ErreurMetier


class StatutPlanning(models.TextChoices):
    BROUILLON = "brouillon", "En préparation"
    SOUMIS = "soumis", "Soumis"
    A_REVISER = "a_reviser", "À réviser"
    APPROUVE = "approuve", "Approuvé"
    EN_COURS = "en_cours", "En cours"
    TERMINE = "termine", "Terminé"
    ANNULE = "annule", "Annulé"


S = StatutPlanning

#: Transitions autorisées (prd.md §17.1) ; un état absent n'a plus de suite.
TRANSITIONS_PLANNING: dict[str, tuple[str, ...]] = {
    S.BROUILLON: (S.SOUMIS,),
    S.SOUMIS: (S.APPROUVE, S.A_REVISER),
    S.A_REVISER: (S.SOUMIS,),
    S.APPROUVE: (S.EN_COURS, S.SOUMIS, S.ANNULE),
    S.EN_COURS: (S.TERMINE, S.SOUMIS),
    S.TERMINE: (),
    S.ANNULE: (),
}


def peut_passer(de: str, vers: str) -> bool:
    return vers in TRANSITIONS_PLANNING.get(de, ())


def exiger_transition(de: str, vers: str) -> None:
    if not peut_passer(de, vers):
        raise ErreurMetier(
            "transition_interdite",
            _("Ce planning ne peut pas passer de « %(de)s » à « %(vers)s ».")
            % {"de": S(de).label, "vers": S(vers).label},
            409,
        )


def exporter() -> dict:
    """Table partagée avec les clients (miroir TypeScript, ADR-011)."""
    return {
        "planning": {
            "statuts": list(S.values),
            "transitions": {de: list(vers) for de, vers in TRANSITIONS_PLANNING.items()},
        }
    }

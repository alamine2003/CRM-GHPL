"""Préférences de notification (NOT-005, 0.8.6).

Chacun choisit les notifications qu'il reçoit en push sur son téléphone ; le centre de
notifications les garde toutes, pour la traçabilité. Certaines ne se coupent jamais : la
révision et la correction demandées, et les escalades (prd.md NOT-005) ; le pays peut en ajouter
(paramètre `notifications_obligatoires`).
"""

from django.utils.translation import gettext as _

from apps.identite.models import Role
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import valeur_parametre

from .models import TypeNotification as T

#: NOT-005 : obligatoires partout, quel que soit le pays.
TOUJOURS = frozenset({T.REVISION_DEMANDEE, T.CORRECTION_DEMANDEE, T.ESCALADE, T.JOURNEE_ESCALADEE})

#: Ce que chaque rôle reçoit (prd.md §18), dans l'ordre où l'écran les présente.
#: [D, 9 octobre 2026, délégation] Les rôles du siège et l'administration ne reçoivent rien.
PAR_ROLE: dict[str, tuple[str, ...]] = {
    Role.DELEGUE: (
        T.PLANNING_APPROUVE, T.REVISION_DEMANDEE, T.REDACTION_ROUVERTE, T.RAPPEL_PLANNING,
        T.CORRECTION_DEMANDEE, T.RAPPORT_ROUVERT, T.RAPPORTS_VALIDES, T.RAPPEL_RAPPORT,
        T.RAPPORT_EN_RETARD,
    ),
    Role.SUPERVISEUR: (
        T.PLANNING_SOUMIS, T.REOUVERTURE_DEMANDEE, T.REMPLACEMENT_ATTRIBUE, T.RAPPORTS_SOUMIS,
        T.RAPPORT_CORRIGE, T.RAPPORT_ROUVERT, T.RAPPORT_EN_RETARD,
    ),
    Role.DM: (T.ESCALADE, T.PLANNINGS_NON_APPROUVES, T.JOURNEE_ESCALADEE),
    Role.DF: (T.ESCALADE, T.PLANNINGS_NON_APPROUVES, T.JOURNEE_ESCALADEE),
}  # fmt: skip


def obligatoires(pays) -> set[str]:
    supplement = set(valeur_parametre(pays, "notifications_obligatoires") or []) if pays else set()
    return set(TOUJOURS) | supplement


def types_recus(utilisateur) -> list[str]:
    from apps.perimetre.perimetre import roles_actifs

    roles = {r.role for r in roles_actifs(utilisateur)}
    vus: list[str] = []
    for role, types in PAR_ROLE.items():
        if role in roles:
            vus += [t for t in types if t not in vus]
    return vus


def preferences(utilisateur) -> list[dict]:
    imposees = obligatoires(utilisateur.pays_principal)
    coupes = set(utilisateur.push_coupes or [])
    return [
        {"type": t, "obligatoire": t in imposees, "push": t in imposees or t not in coupes}
        for t in types_recus(utilisateur)
    ]


def changer(utilisateur, coupes: list[str]):
    """NOT-005 CA1 : une notification obligatoire ne se coupe pas."""
    recus = set(types_recus(utilisateur))
    inconnus = set(coupes) - recus
    if inconnus:
        raise ErreurMetier(
            "notification_inconnue",
            _("Vous ne recevez pas cette notification."),
            champ=sorted(inconnus)[0],
        )
    imposees = set(coupes) & obligatoires(utilisateur.pays_principal)
    if imposees:
        raise ErreurMetier(
            "notification_obligatoire",
            _("Cette notification est obligatoire : elle ne peut pas être coupée."),
            champ=sorted(imposees)[0],
        )
    utilisateur.push_coupes = sorted(set(coupes))
    utilisateur.save(update_fields=["push_coupes"])
    from apps.audit.services import enregistrer

    enregistrer("notifications.preferences", objet=utilisateur, pays=None,
                details={"push_coupes": utilisateur.push_coupes})  # fmt: skip
    return utilisateur


def push_coupe(utilisateur, type_: str, pays) -> bool:
    return type_ in (utilisateur.push_coupes or []) and type_ not in obligatoires(pays)

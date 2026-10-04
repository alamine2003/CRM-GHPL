"""Matrice des autorisations, traduction exacte de prd.md §6.3 (USR-002).

Toute modification commence par prd.md §6.3, puis cette table, puis les tests
d'isolation (architecture-essentials §6). Chaque action liste les rôles qui
peuvent l'exécuter ; le périmètre (pays, réseaux, postes) limite ensuite les
objets visés.

Les actions des cycles suivants (prospects, plannings, visites, rapports…)
seront ajoutées avec leurs fonctionnalités.
"""

from enum import StrEnum

from apps.identite.models import Role


class Action(StrEnum):
    PAYS_LIRE = "pays.lire"
    PAYS_CREER = "pays.creer"
    PAYS_CHANGER_STATUT = "pays.changer_statut"
    DESIGNER_RESPONSABLES_PAYS = "pays.designer_responsables"
    PARAMETRES_LIRE = "parametres.lire"
    PARAMETRES_MODIFIER = "parametres.modifier"
    UTILISATEURS_LIRE = "utilisateurs.lire"
    UTILISATEURS_GERER = "utilisateurs.gerer"
    ROLES_ATTRIBUER = "roles.attribuer"
    ORGANISATION_LIRE = "organisation.lire"
    ORGANISATION_GERER = "organisation.gerer"
    AFFECTATIONS_GERER = "affectations.gerer"


SIEGE = {Role.ADMIN_SIEGE, Role.DIRECTION_SIEGE}
PAYS_CONSULTATION = {Role.RESPONSABLE_PAYS, Role.ADMIN_PAYS}

MATRICE: dict[Action, frozenset[str]] = {
    # « Créer un pays », « Désigner responsable / admin pays » : siège uniquement.
    Action.PAYS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
    Action.PAYS_CREER: frozenset({Role.ADMIN_SIEGE}),
    Action.PAYS_CHANGER_STATUT: frozenset({Role.ADMIN_SIEGE}),
    Action.DESIGNER_RESPONSABLES_PAYS: frozenset({Role.ADMIN_SIEGE}),
    # Paramètres du pays (§7.5) : l'administrateur pays les gère ; le siège aussi.
    Action.PARAMETRES_LIRE: frozenset(SIEGE | PAYS_CONSULTATION),
    Action.PARAMETRES_MODIFIER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # « Gérer les utilisateurs d'un pays » : siège et administrateur pays.
    Action.UTILISATEURS_LIRE: frozenset(SIEGE | PAYS_CONSULTATION),
    Action.UTILISATEURS_GERER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # Rôles terrain (df, dm, superviseur, délégué) : administrateur pays et siège.
    Action.ROLES_ATTRIBUER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # « Gérer l'organisation (zones, secteurs, réseaux, postes) » : siège et administrateur pays.
    Action.ORGANISATION_GERER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # Consultation de l'organisation [H] : le PRD ne la liste pas ; elle suit les périmètres
    # d'architecture §11.2 (DF et DM : postes de leurs réseaux ; superviseur : postes rattachés).
    # Le délégué ne voit que son propre poste (« Mon organisation »).
    Action.ORGANISATION_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    # « Accorder une affectation multi-pays ou un transfert » : administrateur du siège.
    Action.AFFECTATIONS_GERER: frozenset({Role.ADMIN_SIEGE}),
}

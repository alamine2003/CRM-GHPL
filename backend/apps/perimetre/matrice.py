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
    APPAREILS_REVOQUER = "appareils.revoquer"
    EXPLOITATION_LIRE = "exploitation.lire"
    REFERENTIELS_LIRE = "referentiels.lire"
    REFERENTIELS_GERER = "referentiels.gerer"
    PROSPECTS_LIRE = "prospects.lire"
    PROSPECTS_CREER = "prospects.creer"
    PROSPECTS_GERER = "prospects.gerer"
    IMPORTS_GERER = "imports.gerer"
    CIBLES_LIRE = "cibles.lire"
    CIBLES_GERER = "cibles.gerer"
    PROPOSITIONS_CREER = "propositions.creer"
    PROPOSITIONS_TRANCHER = "propositions.trancher"
    JOURS_FERIES_GERER = "jours_feries.gerer"
    PLANNINGS_PREPARER = "plannings.preparer"
    PLANNINGS_VALIDER = "plannings.valider"
    NOTIFICATIONS_LIRE = "notifications.lire"
    REMPLACEMENTS_GERER = "remplacements.gerer"
    RAPPORTS_REDIGER = "rapports.rediger"
    RAPPORTS_LIRE = "rapports.lire"
    RAPPORTS_VALIDER = "rapports.valider"
    INDICATEURS_LIRE = "indicateurs.lire"
    PILOTAGE_LIRE = "pilotage.lire"
    PILOTAGE_EXPORTER = "pilotage.exporter"
    OBJECTIFS_LIRE = "objectifs.lire"
    OBJECTIFS_GERER = "objectifs.gerer"
    AUDIT_LIRE = "audit.lire"
    VENTES_LIRE = "ventes.lire"
    VENTES_GERER = "ventes.gerer"
    VENTES_EXPORTER = "ventes.exporter"
    VENTES_OBJECTIFS_LIRE = "ventes.objectifs_lire"
    VENTES_OBJECTIFS_GERER = "ventes.objectifs_gerer"
    DROITS_DO_REGLER = "droits_do.regler"


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
    # « Effacer à distance un appareil » : siège et administrateur pays. La révocation
    # (USR-006 CA2) en est la première étape ; l'effacement des données locales suit en 0.8.
    Action.APPAREILS_REVOQUER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # État technique du service [H] : l'administrateur technique « exploite et surveille »
    # (prd.md §6.1) ; l'administrateur du siège le consulte aussi. Aucune donnée métier.
    Action.EXPLOITATION_LIRE: frozenset({Role.ADMIN_TECHNIQUE, Role.ADMIN_SIEGE}),
    # « Gérer les référentiels (produits, spécialités, types) » : siège et administrateur pays,
    # y compris le portefeuille de produits de chaque réseau (ORG-004).
    Action.REFERENTIELS_GERER: frozenset({Role.ADMIN_SIEGE, Role.ADMIN_PAYS}),
    # Consultation [H] : tous les rôles métier du pays s'en servent (listes de valeurs, produits
    # de leur portefeuille pour les rapports, RG-033).
    Action.REFERENTIELS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
    # Fiches prospects (§14.4) : fiche commune à tout le pays ; la consultation nominative
    # par le siège est auditée (AUD-001).
    Action.PROSPECTS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
    # « Créer un prospect ou un établissement » : administrateur pays et délégué (`a_valider`).
    # Le superviseur « selon délégation de l'administrateur pays » [H] : pas encore ouvert.
    Action.PROSPECTS_CREER: frozenset({Role.ADMIN_PAYS, Role.DELEGUE}),
    # Valider, modifier toute fiche, archiver : l'administrateur pays, qui tranche aussi les
    # doublons (§6.3).
    Action.PROSPECTS_GERER: frozenset({Role.ADMIN_PAYS}),
    # Imports (ORG-014, PRP-013) : l'administrateur pays « importe l'organisation et le
    # référentiel » (prd.md §5).
    Action.IMPORTS_GERER: frozenset({Role.ADMIN_PAYS}),
    # « Tenir une liste cible » (§6.3, RG-043) : administrateur pays, superviseur sur les postes
    # qui lui sont rattachés. La consultation suit la visibilité des postes (architecture §11.2) ;
    # le délégué lit la liste de son poste.
    Action.CIBLES_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
    Action.CIBLES_GERER: frozenset({Role.ADMIN_PAYS, Role.SUPERVISEUR}),
    # PRP-014 : le délégué propose une modification d'une fiche commune ; l'administrateur pays
    # ou le superviseur des postes de l'auteur (périmètre) l'accepte ou la refuse.
    Action.PROPOSITIONS_CREER: frozenset({Role.DELEGUE}),
    Action.PROPOSITIONS_TRANCHER: frozenset({Role.ADMIN_PAYS, Role.SUPERVISEUR}),
    # « Tenir le calendrier des jours fériés » (ORG-012).
    Action.JOURS_FERIES_GERER: frozenset({Role.ADMIN_PAYS}),
    # « Créer et soumettre un planning » : le délégué, le superviseur s'il occupe un poste
    # (vérifié par le service, PLN-001).
    Action.PLANNINGS_PREPARER: frozenset({Role.SUPERVISEUR, Role.DELEGUE}),
    # « Approuver ou faire réviser un planning » : le superviseur, sur les postes qui lui sont
    # rattachés (PLN-011) ; 1.3.0 [D] : l'administrateur pays (le siège au Sénégal) à la place
    # du DM, sur le poste d'un superviseur-visiteur (PLN-017, RG-023) et en escalade (PLN-016).
    # Le DM, comme le DF, ne fait plus que lire. Remplacement en 0.3.8.
    Action.PLANNINGS_VALIDER: frozenset({Role.ADMIN_PAYS, Role.SUPERVISEUR}),
    # « Désigner un remplaçant de superviseur » (ORG-013) : l'administrateur pays, le
    # superviseur pour lui-même (périmètre dans la vue).
    Action.REMPLACEMENTS_GERER: frozenset({Role.ADMIN_PAYS, Role.SUPERVISEUR}),
    # « Réaliser une visite, rédiger un rapport » : le délégué, le superviseur s'il occupe un
    # poste ; chacun ses propres visites (RPT-001).
    Action.RAPPORTS_REDIGER: frozenset({Role.SUPERVISEUR, Role.DELEGUE}),
    # RPT-011 : lire les rapports soumis de son périmètre [H] : le délégué les siens (CA1), le
    # superviseur ceux des postes rattachés, DM et DF ceux de leurs réseaux, le responsable
    # pays tout le pays. Ni l'administration (pays, siège), qui n'encadre pas le terrain, ni
    # la lecture nominative au siège (indicateurs agrégés, prd.md §6.3).
    Action.RAPPORTS_LIRE: frozenset(
        {Role.RESPONSABLE_PAYS, Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
    # « Valider un rapport ou demander une correction » (RPT-012 à RPT-014) : le superviseur
    # sur les postes rattachés, l'administrateur pays (1.3.0, à la place du DM) pour un
    # superviseur-visiteur (RG-023) et en escalade ; le remplaçant ; le périmètre est vérifié
    # par le service.
    Action.RAPPORTS_VALIDER: frozenset({Role.ADMIN_PAYS, Role.SUPERVISEUR}),
    # Indicateurs de pilotage (cycle 0.7) : en 0.7.1, chacun les siens (DSH-001), le délégué
    # et le superviseur qui occupe un poste ; l'encadrement s'ajoute avec ses vues (0.7.2 à
    # 0.7.4).
    Action.INDICATEURS_LIRE: frozenset({Role.SUPERVISEUR, Role.DELEGUE}),
    # « Pilotage » au portail (DSH-002 à DSH-004, DSH-012) : le superviseur pour les postes qui
    # lui sont rattachés, DM et DF pour leurs réseaux, le responsable pays pour tout le pays ;
    # le siège en agrégé par pays, et au nominatif d'un pays choisi, consultation auditée.
    Action.PILOTAGE_LIRE: frozenset(
        SIEGE | {Role.RESPONSABLE_PAYS, Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    # RPT-019, DSH-008 : exports du tableau de pilotage, dans le périmètre, audités ; le texte
    # libre des rapports n'est exportable que par le superviseur et au-dessus (prd.md §19).
    Action.PILOTAGE_EXPORTER: frozenset(
        SIEGE | {Role.RESPONSABLE_PAYS, Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    # DSH-009 : objectifs par réseau, fixés par l'administrateur pays (1.3.0 : plus le DM)
    # (périmètre vérifié par le service) ; lus par l'encadrement de ces réseaux et le pays.
    Action.OBJECTIFS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    Action.OBJECTIFS_GERER: frozenset({Role.ADMIN_PAYS}),
    # AUD-002 : « Consulter le journal d'audit » (prd.md §6.3) : le siège, tous les pays ; le
    # responsable et l'administrateur pays, leur pays seulement (filtre de la vue).
    Action.AUDIT_LIRE: frozenset(SIEGE | PAYS_CONSULTATION),
    # 1.6.0 [D, 20 octobre 2026] Suivi des ventes : le siège, le pays, le DF (qui porte le rôle du
    # DO), le DM et le superviseur les observent dans leur périmètre ; l'administrateur pays les
    # importe ou les saisit. Le délégué ne voit pas cette plateforme.
    Action.VENTES_LIRE: frozenset(SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR}),
    Action.VENTES_GERER: frozenset({Role.ADMIN_PAYS}),
    # 1.6.2 [D, 22 octobre 2026] : l'export des ventes suit celui du pilotage (§14.58) : le siège,
    # le responsable pays, le DF (le DO), le DM et le superviseur dans leur périmètre, tout
    # export audité ; pas l'administrateur pays.
    Action.VENTES_EXPORTER: frozenset(
        SIEGE | {Role.RESPONSABLE_PAYS, Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    # 1.7.0 [D, 23 octobre 2026] : objectifs de ventes par réseau, lus par le siège, le pays, le
    # DF (le DO) et le DM dans leurs réseaux ; 1.8.0 : le superviseur lit ceux des délégués qui
    # lui sont rattachés. [D, 25 octobre 2026] Fixés par l'administrateur pays (et le siège dans
    # un pays choisi) et par le DM pour les réseaux de son périmètre (périmètre vérifié par le
    # service).
    Action.VENTES_OBJECTIFS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR}
    ),
    Action.VENTES_OBJECTIFS_GERER: frozenset({Role.ADMIN_PAYS, Role.DM}),
    # 1.6.1 [D, 18 octobre 2026] : le siège seul règle les droits du DO (compte au rôle DF). Ni
    # l'administrateur pays (même quand l'administrateur du siège entre dans un pays) ni la
    # direction du siège.
    Action.DROITS_DO_REGLER: frozenset({Role.ADMIN_SIEGE}),
    # « Recevoir et lire ses notifications » (prd.md §18) : chacun les siennes.
    Action.NOTIFICATIONS_LIRE: frozenset(
        SIEGE | PAYS_CONSULTATION | {Role.DF, Role.DM, Role.SUPERVISEUR, Role.DELEGUE}
    ),
}

#: Actions techniques, sans donnée métier : seules permises à l'administrateur technique.
ACTIONS_TECHNIQUES = frozenset({Action.EXPLOITATION_LIRE})

#: Les droits que le siège ouvre ou ferme pour un compte DF (le DO), par groupe : ce que le
#: groupe donne. Tout est ouvert par défaut ; le reste du rôle (pays, organisation,
#: notifications) ne se règle pas, l'application en a besoin pour fonctionner.
GROUPES_DROITS_DO: dict[str, frozenset[Action]] = {
    "ventes": frozenset({Action.VENTES_LIRE, Action.VENTES_EXPORTER, Action.VENTES_OBJECTIFS_LIRE}),
    "pilotage": frozenset({Action.PILOTAGE_LIRE, Action.PILOTAGE_EXPORTER, Action.OBJECTIFS_LIRE}),
    "rapports": frozenset({Action.RAPPORTS_LIRE}),
    "prospects": frozenset({Action.PROSPECTS_LIRE, Action.CIBLES_LIRE}),
}

# Recette du cycle 0.0 — Fondations

Version de clôture : **0.0.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.0.x` est relié au test automatisé qui le prouve. Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée n'est citée par aucun test.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (planning, visites, rapports, synchronisation) et sera testé avec elle.
- **Reporté** : écart décidé et consigné dans `CHANGELOG.md`.

Abréviations : `B/` = `backend/apps/`, `P` = `portail/src/App.test.tsx`, `M` = `mobile/__tests__/session.test.tsx`.

## Pays et organisation

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| ORG-001 | CA1 | Pays créé, listé `actif` chez le siège | `B/socle/tests/test_pays_api.py::test_un_pays_cree_apparait_actif_dans_la_liste_du_siege` | Couvert |
| ORG-001 | CA2 | Pays suspendu : connexion refusée, message explicite | `B/identite/tests/test_connexion.py::test_pays_suspendu_refuse_la_connexion_avec_message_explicite` | Couvert |
| ORG-001 | CA3 | Pays archivé, lecture seule pour le siège | `B/socle/tests/test_pays_api.py::test_un_pays_archive_reste_lisible_par_le_siege` | Couvert |
| ORG-001 | CA4 | Changement de statut audité | `B/audit/tests/test_audit.py::test_le_changement_de_statut_d_un_pays_est_audite` | Couvert |
| ORG-002 | CA1 | Désignation datée | `B/perimetre/tests/test_comptes_et_roles.py::test_le_siege_designe_un_responsable_et_garde_l_historique` | Couvert |
| ORG-002 | CA2 | Historique avec auteur et dates | même test (auteur, retrait, dates de début et de fin) | Couvert |
| ORG-003 | CA1 | Un secteur dans une seule zone | `B/organisation/tests/test_organisation.py::test_un_secteur_appartient_a_une_seule_zone_du_meme_pays` | Couvert |
| ORG-003 | CA2 | Secteur archivé non proposé, visible dans l'historique | `::test_un_secteur_archive_reste_visible_mais_n_est_plus_propose` | Partiel (cycle 0.2 : planification) |
| ORG-005 | CA1, CA2 | Poste vacant ; plusieurs secteurs | `::test_un_poste_sans_occupant_est_vacant_et_peut_couvrir_plusieurs_secteurs` ; `P` « voit les vacants » | Couvert |
| ORG-006 | CA1 | Occupation datée, fin facultative | `::test_occupation_datee_avec_fin_facultative` | Couvert |
| ORG-006 | CA2 | Deux réseaux, deux occupations, deux portefeuilles | `::test_une_personne_sur_deux_reseaux_a_deux_occupations_actives` ; `M` (ORG-006) | Partiel (0.1.1 : portefeuilles) |
| ORG-007 | CA1 | Sans superviseur : planning bloqué | `::test_un_delegue_sans_superviseur_est_signale` ; `P` et `M` (alerte) | Reporté à 0.2 (signal livré) |
| ORG-007 | CA2 | Changement de superviseur daté | `::test_le_changement_de_superviseur_prend_effet_a_la_date_indiquee` | Couvert |
| ORG-008 | CA1 | Le DM ne voit que ses réseaux | `::test_un_dm_ne_voit_que_les_postes_de_ses_reseaux` | Partiel (cycles 0.2 à 0.5 : plannings, visites, rapports) |
| ORG-008 | CA2 | Retrait daté d'un réseau | même test | Couvert |
| ORG-009 | CA1 | Pays actif choisi, ses seules données | `B/organisation/tests/test_affectations_transferts.py::test_l_affecte_choisit_le_pays_et_ne_voit_que_ses_donnees` ; `B/perimetre/tests/test_isolation_routes.py` | Couvert |
| ORG-009 | CA2 | Accès retiré à la date de fin | `::test_a_la_fin_de_l_affectation_l_acces_est_retire` | Couvert |
| ORG-009 | CA3 | Octroi et retrait audités | `B/audit/tests/test_audit.py::test_les_affectations_et_transferts_sont_audites` | Couvert |
| ORG-010 | CA1 | Après transfert, plus rien de l'ancien pays | `::test_transfert_l_utilisateur_ne_voit_plus_l_ancien_pays` | Couvert |
| ORG-010 | CA2 | L'historique reste dans l'ancien pays | même test (occupations) | Partiel (cycles 0.2 à 0.5) |
| ORG-011 | CA1 | Valeur par défaut pour chaque paramètre | `B/socle/tests/test_parametres.py::test_chaque_parametre_a_un_defaut_valide` | Couvert |
| ORG-011 | CA2 | Modification auditée (ancienne et nouvelle valeur) | `B/audit/tests/test_audit.py::test_les_actions_d_administration_sont_auditees_avec_les_roles` | Couvert |
| ORG-011 | CA3 | Pas d'effet rétroactif | `::test_modification_datee_sans_effet_retroactif` | Partiel (objets validés : cycles 0.3 et 0.6) |

## Comptes et permissions

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| USR-001 | CA1 | Aucun compte partagé ou générique | `B/identite/tests/test_comptes.py::test_comptes_generiques_ou_non_nominatifs_refuses` | Couvert |
| USR-001 | CA2 | Sans rôle actif, rien de visible | `B/perimetre/tests/test_isolation.py::test_un_utilisateur_sans_role_ne_voit_rien` ; `P` ; `M` | Couvert |
| USR-002 | CA1 | Chaque cellule rôle × action testée | `B/perimetre/tests/test_matrice.py::test_chaque_role_chaque_action` (9 rôles × 14 actions) ; `::test_chaque_action_a_sa_requete` | Couvert |
| USR-002 | CA2 | Hors périmètre : introuvable, sans révéler l'objet | `B/perimetre/tests/test_isolation_routes.py` ; `B/perimetre/tests/test_securite_lignes.py` | Couvert |
| USR-003 | CA1 | Compte suspendu : ni connexion ni synchronisation | `B/identite/tests/test_comptes.py::test_suspension_ferme_les_sessions_et_garde_les_donnees` | Couvert (synchronisation : sessions fermées ; vraie synchronisation au cycle 0.8) |
| USR-003 | CA2 | Données intactes et attribuées | même test ; `B/identite/tests/test_utilisateur.py::test_un_utilisateur_n_est_jamais_supprime` | Partiel (données métier : cycles 0.2 à 0.5) |
| USR-004 | CA1 | Écrans, erreurs, notifications en `fr` et `en` | `backend/tests/test_traductions.py` ; `packages/i18n/src/index.test.ts` (mêmes clés ; clés utilisées présentes) | Couvert |
| USR-004 | CA2 | Aucun texte codé en dur | Règle ESLint `no-restricted-syntax` (`eslint.config.mjs`), bloquante en CI | Couvert |
| USR-005 | CA1 | Lien de 30 minutes à usage unique | `B/identite/tests/test_recuperation.py::test_lien_expire_apres_trente_minutes`, `::test_lien_a_usage_unique` | Couvert |
| USR-005 | CA2 | Réinitialisation auditée | `B/audit/tests/test_audit.py::test_la_reinitialisation_par_l_administrateur_est_auditee` | Couvert |
| USR-006 | CA1 | Appareil, système, version, dernière synchronisation | `B/identite/tests/test_appareils_langue.py::test_l_administrateur_pays_voit_les_appareils` ; `P` (USR-006) | Reporté au cycle 0.8 (« dernier contact » à la place de la synchronisation) |
| USR-006 | CA2 | Appareil révoqué : plus de synchronisation | `::test_un_appareil_revoque_ne_peut_plus_se_connecter_ni_rafraichir` | Couvert (connexion et rafraîchissement refusés) |

## Sécurité, audit et démonstration

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| SEC-001 | CA1 | 11 caractères refusés | `B/identite/tests/test_comptes.py::test_politique_de_mot_de_passe` ; `B/identite/tests/test_mots_de_passe.py` | Couvert |
| SEC-002 | CA1 | 6ᵉ essai refusé pendant 15 minutes | `B/identite/tests/test_connexion.py::test_verrouillage_apres_cinq_echecs` | Couvert |
| SEC-003 | CA1 | Rôle sensible sans double authentification : aucune donnée | `B/identite/tests/test_double_auth.py::test_chaque_role_sensible_est_bloque_sans_double_auth` (les 9 rôles) ; `P` ; `M` | Couvert |
| SEC-004 | CA1 | Session révoquée : échec à l'appel suivant | `::test_mes_sessions_et_revocation_a_distance` ; `P` (SEC-004) ; `M` (verrouillage local) | Couvert |
| SEC-007 | CA1 | L'analyse de secrets de la CI ne trouve rien | job `secrets` (gitleaks, tout l'historique) ; `backend/tests/test_securite_transport.py` | Couvert |
| AUD-001 | CA1 | Auteur, rôle, pays, action, objet, date, contexte, résultat | `B/audit/tests/test_audit.py` (connexions, échecs, verrouillage, comptes, rôles, affectations, transferts, mots de passe, appareils, sessions, paramètres, pays, organisation) | Couvert |
| AUD-001 | CA2 | Aucun rôle ne modifie ni ne supprime | `::test_aucun_role_ne_peut_modifier_ni_supprimer_un_evenement` ; `::test_l_orm_refuse_aussi` | Couvert |
| DEM-001 | CA1 | Réinitialisation par une commande | `B/demonstration/tests/test_demonstration.py::test_la_demonstration_se_reinitialise_par_une_commande` | Couvert |
| DEM-001 | CA2 | Aucune donnée réelle | `::test_aucune_donnee_reelle` ; bandeau « Démonstration » (`P`, `M`) | Couvert |

## Contrôles transverses ajoutés en 0.0.9

- Accessibilité : analyse axe-core (WCAG 2.1 A et AA) de la connexion, de l'accueil, d'Équipe, de Mon profil et d'Organisation (`P`).
- Traductions : chaque clé littérale `t('…')` du portail et du mobile existe dans le catalogue.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

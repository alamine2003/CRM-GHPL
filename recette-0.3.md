# Recette du cycle 0.3 — Validation des plannings

Version de clôture : **0.3.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.3.x` est relié au test automatisé qui le prouve. S'y ajoutent les décisions du 6 octobre 2026 sur la fermeture de la semaine (prd.md §14.21, livrées en 0.3.9), les règles de gestion du cycle (RG-013, RG-016 à RG-021, RG-023, RG-034, RG-037) et les deux critères laissés « Partiel » par le cycle 0.2 en attendant la revue du superviseur. Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée (version du PRD inférieure ou égale à `VERSION`) n'est citée par aucun test du serveur, du portail, du mobile ou des paquets.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (programme du jour, rapports de visite) et sera testé avec elle.
- **Non couvert** : aucun test ne prouve encore le critère, ou une partie livrée de ce critère. Chaque cas figure dans la section « Écarts ».

Abréviations : `B/` = `backend/apps/`, `T/` = `backend/apps/planning/tests/`, `PV` = `portail/src/pages/Validation.test.tsx`, `PC` = `portail/src/pages/ConsultationPlanning.test.tsx`, `PP` = `portail/src/pages/Planning.test.tsx`, `PH` = `portail/src/composants/HistoriqueVersions.test.tsx`, `PN` = `portail/src/pages/Notifications.test.tsx`, `PR` = `portail/src/pages/Remplacements.test.tsx`, `PT` = `portail/src/composants/textesNotifications.test.tsx`, `M` = `mobile/__tests__/semaine.test.tsx`, `MF` = `mobile/__tests__/fermeture.test.tsx`, `MA` = `mobile/__tests__/apresApprobation.test.tsx`, `MV` = `mobile/__tests__/versions.test.tsx`, `MN` = `mobile/__tests__/notifications.test.tsx`, `MC` = `mobile/__tests__/centreNotifications.test.tsx`, `MT` = `mobile/__tests__/textesNotifications.test.ts`.

## File, consultation et activités connexes (0.3.1, 0.3.2)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-011 | CA1 | La file est triée par ancienneté de soumission et affiche les alertes | `T/test_file_validation.py::test_pln011_ca1_la_file_suit_l_anciennete_et_dit_les_alertes` ; `::test_seuls_les_postes_rattaches_entrent_dans_la_file` ; `PV` « CA1 : chaque planning dit son délégué, sa soumission et ses alertes », « sans planning en attente, la file le dit » | Couvert |
| PLN-011 | CA2 | Le superviseur ouvre un planning de la file : semaine, activités, contrôles, kilométrage, détail de chaque visite avec ses alertes | `T/test_consultation.py::test_le_superviseur_lit_la_semaine_soumise_avec_ses_alertes` ; `::test_une_alerte_nomme_ses_visites` ; `PC` « le superviseur lit la semaine, ses alertes et ses activités, sans rien modifier », « le détail d'une visite dit le prospect et ses alertes, sans action » | Couvert |
| PLN-011 | CA2 | … sans rien pouvoir modifier ; un planning en préparation ou d'un délégué qu'il ne supervise pas lui est introuvable | `T/test_consultation.py::test_il_consulte_sans_rien_modifier` ; `::test_un_planning_en_preparation_n_existe_pas_pour_lui` ; `::test_seul_son_superviseur_le_consulte` | Couvert |
| PLN-018 | CA1 | Une activité avec visites exige une explication | `T/test_activites_connexes.py::test_ca1_un_commando_s_explique` ; `M` « PLN-018 CA1 : un déplacement s'explique et dit qui l'a demandé » | Couvert |
| PLN-018 | CA1 | Ses visites hors secteur ou hors liste cible ne sont pas des anomalies (hors de ces journées, elles restent signalées) | `T/test_activites_connexes.py::test_ca1_les_visites_d_un_jour_de_deplacement_ne_sont_pas_des_anomalies` ; `::test_seul_un_deplacement_se_dit_demande_par_le_superviseur` ; le superviseur lit l'activité et son explication : `T/test_file_validation.py::test_pln011_ca1_…`, `PV` « CA1 : chaque planning dit son délégué… » | Couvert |
| PLN-018 | CA2 | Une activité avec visites ne réduit pas l'objectif du jour ; une absence le réduit | `T/test_activites_connexes.py::test_ca2_une_activite_avec_visites_ne_reduit_pas_l_objectif` ; `M` « PLN-018 CA2 : un jour de commando garde ses visites et se lit comme du travail » | Couvert |

## Approbation et révision (0.3.3, 0.3.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-012 | CA1 | L'approbation fige la version | `T/test_approbation.py::test_pln012_ca1_l_approbation_fige_la_version` ; `::test_un_planning_soumis_avant_les_versions_est_fige_a_la_decision` ; `::test_un_point_bloquant_apparu_depuis_la_soumission_empeche_l_approbation` ; `::test_seul_le_responsable_du_poste_decide` ; `::test_un_planning_en_preparation_ne_s_approuve_pas` ; `PC` « « Approuver » demande confirmation, approuve, puis dit le succès », « CA1 : un planning décidé dit qui l'a approuvé, quand et quelle version » | Couvert |
| PLN-012 | CA2 | Le délégué reçoit une notification | `T/test_approbation.py::test_pln012_ca2_le_delegue_est_notifie` ; `MN` « PLN-012 CA2 : le délégué voit l'approbation, l'ouvre, et elle passe en lue » | Couvert |
| PLN-017 | CA1 | Le planning d'un superviseur qui occupe un poste de délégué n'apparaît pas dans sa propre file ; son DM l'approuve | `T/test_approbation.py::test_pln017_le_dm_approuve_le_planning_du_superviseur_visiteur` | Couvert |
| PLN-013 | CA1 | Une demande de révision sans commentaire est refusée (RG-017) | `T/test_revision.py::test_ca1_une_demande_sans_commentaire_est_refusee` ; `PC` « CA1 : la demande exige un commentaire ; une remarque sur une visite suffit » | Couvert |
| PLN-013 | CA2 | Le délégué voit le commentaire sur la visite concernée | `T/test_revision.py::test_ca2_le_delegue_lit_le_commentaire_sur_la_visite` ; `::test_une_visite_seule_suffit_et_le_delegue_soumet_la_version_suivante` ; `M` « PLN-013 CA2 : le délégué lit la révision et la remarque sur la visite concernée » | Couvert |
| ORG-013 | CA1 | Pendant la période, le remplaçant voit et décide les plannings concernés | `T/test_remplacements.py::test_ca1_ca2_le_remplacant_decide_en_remplacement` (file, consultation, approbation) ; `::test_le_superviseur_designe_son_remplacant_qui_est_notifie` ; `::test_perimetre_de_la_designation` ; `::test_regles_de_la_periode` ; `PR` « liste les remplacements et permet d'y mettre fin », « le superviseur désigne son remplaçant : il est le remplacé, sans avoir à le choisir » | Couvert |
| ORG-013 | CA1 | … et les rapports concernés | — | Partiel (cycle 0.5 : rapports de visite) |
| ORG-013 | CA2 | Toute décision porte le mode `remplacement` et l'identité du remplaçant | Approbation : `T/test_remplacements.py::test_ca1_ca2_le_remplacant_decide_en_remplacement` ; révision : `::test_ca2_la_revision_du_remplacant_porte_le_mode_remplacement` ; affichage : `MV` « PLN-014 CA2 : une version décidée dit qui, quand et pourquoi » | Couvert |
| ORG-013 | CA3 | À la fin de la période, l'accès cesse | `T/test_remplacements.py::test_ca3_a_la_fin_de_la_periode_l_acces_cesse` ; `::test_terminer_avant_la_fin_coupe_l_acces` | Couvert |

## Versions et resoumission (0.3.5, 0.3.6)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-014 | — | Après révision, le délégué corrige et soumet une nouvelle version, qui revient dans la file | `T/test_revision.py::test_une_visite_seule_suffit_et_le_delegue_soumet_la_version_suivante` ; `T/test_resoumission.py::test_une_resoumission_apres_revision_n_est_pas_en_retard` ; `PC` « le responsable retrouve ce qu'il avait demandé, visite par visite » | Couvert |
| PLN-014 | CA1 | La comparaison montre les visites ajoutées, retirées, déplacées | `T/test_versions.py::test_ca1_la_comparaison_montre_ajoutees_retirees_deplacees` ; `PH` « CA1 : la comparaison montre les visites ajoutées, retirées, déplacées » ; `MV` « PLN-014 : le délégué relit ses versions et ce qui a changé » | Couvert |
| PLN-014 | CA2 | Toutes les versions restent consultables | `T/test_versions.py::test_ca2_toutes_les_versions_restent_consultables` ; `::test_seuls_le_delegue_et_ceux_qui_decident_consultent` ; `PH` « CA2 : chaque version se lit, avec sa décision et ses changements », « CA2 : la version décidée dit qui, quand et pourquoi » ; `MV` « PLN-014 CA2 : une version décidée dit qui, quand et pourquoi » | Couvert |
| AUD-003 | CA1 | Chaque version de planning est consultable dans son état exact au moment de sa soumission | `T/test_versions.py::test_ca2_toutes_les_versions_restent_consultables` (la version 1 se relit telle que soumise, après les corrections) ; `T/test_approbation.py::test_rg037_la_soumission_fige_une_version` | Couvert (rapports : cycle 0.5) |
| PLN-008 | CA2 | Une nouvelle soumission après révision n'est jamais en retard ; seul compte le retard de la première soumission | `T/test_resoumission.py::test_une_resoumission_apres_revision_n_est_pas_en_retard` ; `::test_un_premier_retard_reste_apres_la_revision` ; `M` « PLN-008 CA2 : après révision, la nouvelle soumission ne compte pas de retard » | Couvert |
| §18 | — | Chaque soumission notifie le superviseur du poste et son remplaçant actif (« Planning soumis ») | `T/test_resoumission.py::test_la_soumission_notifie_le_superviseur_et_son_remplacant` | Couvert |

## Planning approuvé : verrouillage et modifications (0.3.7)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-015 | CA1 | Changer l'heure d'une visite dans la même journée ne change pas le statut (modification mineure, tracée) | `T/test_modifications_approuve.py::test_ca1_l_heure_changee_dans_la_journee_reste_approuvee_et_tracee` ; `MA` « PLN-015 CA1 : changer l'heure reste libre, le planning reste approuvé » ; `PC` « CA1 : les heures changées depuis l'approbation se lisent, le planning reste approuvé » | Couvert |
| PLN-015 | CA2 | Ajouter une visite crée une version soumise ; tout autre changement est majeur | `T/test_modifications_approuve.py::test_ca2_ajouter_une_visite_cree_une_version_soumise` ; `::test_tout_autre_changement_est_majeur` ; `::test_le_retrait_attend_la_decision_et_la_suite_aussi` ; `::test_un_changement_majeur_bloque_est_refuse_sans_rien_changer` ; `::test_poser_depuis_la_liste_cible_demande_des_visites_completes` ; `::test_la_modification_approuvee_devient_la_reference` ; `MA` « PLN-015 CA2 : tout autre changement se dit soumis au superviseur » | Couvert |
| PLN-015 | CA2 | Les autres visites restent prévues selon la version approuvée | `T/test_modifications_approuve.py::test_ca2_ajouter_une_visite_cree_une_version_soumise` (seule la visite ajoutée attend) ; `MA` « PLN-015 CA2 : pendant la décision, la visite concernée est « en attente » » ; `PC` « CA2 : la modification soumise dit ce qui attend, le reste reste prévu » | Couvert |
| PLN-015 | CA2 | … et restent exécutables | — | Partiel (cycle 0.4 : programme du jour et exécution des visites) |

## Centre de notifications, rappel et escalade (0.3.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| NOT-001 | — | Centre de notifications, lues et non lues, dans l'application et le portail | `T/test_approbation.py::test_pln012_ca2_le_delegue_est_notifie` (centre, compte des non lues, « lue », personne d'autre ne la marque) ; `PN` « lues et non lues, avec leur texte : escalade, rappel, alerte du lundi » ; `MC` « NOT-001 : le centre liste lues et non lues ; une notification ouvre sa semaine » | Couvert |
| NOT-001 | CA1 | Chaque notification ouvre directement l'écran de l'action attendue (les neuf types, dont la réouverture demandée et la rédaction rouverte de 0.3.9) | Destination de chaque type : `PT` « NOT-001 CA1 : destinations » (« %s mène à %s », un cas par type) ; `MT` « %s ouvre %s » (un cas par type reçu au téléphone) ; parcours complet : `PN` « CA1 : une notification ouvre l'écran de l'action attendue et passe en lue », `MC` « NOT-001 : le centre liste lues et non lues… », `MN` « PLN-012 CA2 : le délégué voit l'approbation, l'ouvre… » ; textes de 0.3.9 : `PT` « la demande et la réouverture se disent avec le nom et la semaine », `MT` « 0.3.9 : la réouverture se dit au délégué » | Couvert |
| NOT-006 | — | Rappel du planning non soumis le vendredi 9 h (décision du 6 octobre 2026), une seule fois, jusqu'à la fermeture du lundi 0 h | `T/test_echeances.py::test_not006_rappel_du_planning_non_soumis_le_vendredi` ; `::test_not006_un_planning_soumis_n_est_pas_rappele` ; `::test_la_tache_du_worker_fait_la_meme_passe` | Couvert |
| NOT-006 | CA1 | Les heures suivent le fuseau du pays | `T/test_echeances.py::test_not006_ca1_l_heure_est_celle_du_pays` ; texte de l'échéance à l'heure du pays : `PN` « lues et non lues… », `MC` « NOT-001 : le centre liste… » | Couvert |
| NOT-006 | — | Rappels « visite proche », « rapport non soumis », « délégué non synchronisé depuis 48 h » | — | Partiel (cycles 0.5 et 0.8 : rapports, synchronisation et push) |
| PLN-016 | CA1 | Sans décision 24 h ouvrées après la soumission, l'escalade notifie le DM du périmètre, qui le trouve dans sa file | `T/test_echeances.py::test_pln016_ca1_sans_decision_24_h_ouvrees_le_dm_est_notifie` ; `::test_heures_ouvrees_sans_le_week_end` ; `::test_avant_l_escalade_le_dm_ne_decide_pas_et_le_superviseur_garde_la_main` ; `PV` « CA1 : le DM voit le planning escaladé et qui n'a pas décidé » | Couvert |
| PLN-016 | CA2 | La décision du DM porte le mode `escalade` | `T/test_echeances.py::test_pln016_ca2_la_decision_du_dm_porte_le_mode_escalade` | Couvert |
| PLN-016 | — | Alerte au DM si rien n'est approuvé à la fermeture du lundi 0 h (0.3.9) | `T/test_echeances.py::test_rg019_a_la_fermeture_le_dm_apprend_les_plannings_non_approuves` ; `::test_un_planning_approuve_n_alerte_pas_le_dm` ; texte : `PN` « lues et non lues… » | Couvert |
| PLN-016 | — | … plannings absents compris (prd.md §14.20) | `T/test_echeances.py::test_rg019_un_delegue_sans_planning_compte_dans_l_alerte` | Couvert |

## Fermeture de la semaine (décisions du 6 octobre 2026, 0.3.9)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RG-013 | — | Date limite : soumettre avant le lundi 0 h de la semaine (heure du pays), paramétrable par pays | `T/test_fermeture.py::test_l_echeance_est_le_lundi_0_h_de_la_semaine` ; `T/test_soumission.py::test_l_echeance_est_le_lundi_0_h_de_la_semaine` (paramètre du pays : lundi 8 h) | Couvert |
| §14.21 | — | Fermeture le lundi 0 h d'un planning en préparation : plus de modification ni de soumission | `T/test_fermeture.py::test_un_brouillon_est_ferme_le_lundi_0_h` ; `MF` « planning fermé en préparation : rien ne se modifie, la demande reste possible » | Couvert |
| §14.21 | — | Sans planning, la semaine ne se crée plus ; la suivante se prépare normalement | `T/test_fermeture.py::test_sans_planning_la_semaine_ne_se_cree_plus_apres_la_fermeture` ; `PP` « 0.3.9 : la semaine fermée sans planning se fait rouvrir sur demande » ; `MF` « semaine fermée sans planning : le délégué demande la réouverture, une fois » | Couvert |
| §14.21 | — | Un planning soumis et fermé ne se décide plus et quitte la file pour « Semaines fermées » | `T/test_fermeture.py::test_un_planning_soumis_sans_decision_est_ferme_aussi` ; `PC` « la décision cède la place à la réouverture, après confirmation » | Couvert |
| §14.21 | — | Un planning « à réviser » est fermé aussi | `T/test_fermeture.py::test_un_planning_a_reviser_est_ferme_aussi` | Couvert |
| §14.21 | — | Le délégué demande la réouverture, une seule fois, et pas avant la fermeture ; le superviseur est notifié | `T/test_fermeture.py::test_le_delegue_demande_la_reouverture_une_seule_fois` ; `::test_pas_de_demande_avant_la_fermeture` ; `PP` « 0.3.9 : la semaine fermée sans planning se fait rouvrir sur demande » ; `MF` « semaine fermée sans planning : le délégué demande la réouverture, une fois » | Couvert |
| §14.21 | — | … la demande part aussi au remplaçant actif du superviseur | `T/test_fermeture.py::test_le_remplacant_recoit_la_demande_et_rouvre` | Couvert |
| §14.21 | — | Seul le superviseur du poste rouvre, seulement la semaine en cours ; la réouverture crée le planning s'il n'existait pas | `T/test_fermeture.py::test_le_superviseur_rouvre_la_redaction_et_la_reouverture_reste_inscrite` ; `::test_sans_planning_la_reouverture_le_cree` ; `::test_seul_le_superviseur_du_poste_rouvre` (ni le DM, ni le délégué) ; `::test_rien_a_rouvrir_avant_la_fermeture_ni_une_semaine_passee` ; `PV` « le superviseur voit qui est fermé, qui a demandé, et rouvre après confirmation » ; `PC` « la décision cède la place à la réouverture, après confirmation » | Couvert |
| §14.21 | — | … ou son remplaçant actif | `T/test_fermeture.py::test_le_remplacant_recoit_la_demande_et_rouvre` | Couvert |
| §14.21 | — | La réouverture reste inscrite (date, auteur, journal d'audit `planning.reouverture`) et le délégué est prévenu | `T/test_fermeture.py::test_le_superviseur_rouvre_la_redaction_et_la_reouverture_reste_inscrite` ; `PP` « 0.3.9 : rouvert par le superviseur, la réouverture reste dite » ; `MF` « rouvert par le superviseur : la réouverture se lit, la soumission sera en retard » | Couvert |
| PLN-008 | CA1 | Après le lundi 0 h, le planning est fermé ; une fois rouvert, sa soumission est acceptée et marquée « en retard » ; le superviseur décide normalement | `T/test_soumission.py::test_ca1_apres_l_echeance_la_soumission_est_acceptee_et_marquee_en_retard` ; `::test_ca1_soumis_a_temps_puis_plus_modifiable` ; `T/test_fermeture.py::test_le_superviseur_rouvre_la_redaction_et_la_reouverture_reste_inscrite` ; `T/test_resoumission.py::test_un_premier_retard_reste_apres_la_revision` ; `PP` « PLN-008 CA1, RG-016 : après confirmation, le planning part, en retard si l'échéance est passée » ; `M` « RG-016 : après l'échéance, la soumission reste possible et se dit en retard » | Couvert |
| RG-018 | — | Planning validé : modifiable selon RG-018 jusqu'au lundi 0 h, plus du tout ensuite (`semaine_commencee`, `approbation.modifiable` faux dès la fermeture) | `T/test_fermeture.py::test_un_planning_valide_ne_se_modifie_plus_des_le_lundi_0_h` ; `T/test_modifications_approuve.py::test_des_le_lundi_0_h_plus_rien_ne_change` | Couvert |
| RG-018 | — | … le téléphone le dit : « La semaine a commencé : ce planning validé ne se modifie plus. » et ne propose plus d'ajout | `MF` « validé, le planning ne se modifie plus dès le lundi 0 h (RG-018) » | Couvert |
| RG-019 | — | Escalade inchangée ; un planning fermé n'est plus escaladé, sauf après sa réouverture | `T/test_echeances.py::test_un_planning_ferme_n_escalade_pas_avant_sa_reouverture` ; `::test_heures_ouvrees_sans_le_week_end` (week-end et jours fériés exclus) | Couvert |
| NOT-006 | — | Rappel du vendredi 9 h | Voir la section 0.3.8 : `T/test_echeances.py::test_not006_rappel_du_planning_non_soumis_le_vendredi` | Couvert |
| RG-019 | — | Alerte au DM à 0 h le lundi | Voir la section 0.3.8 : `T/test_echeances.py::test_rg019_a_la_fermeture_le_dm_apprend_les_plannings_non_approuves` | Couvert |

## Règles de gestion du cycle

| Règle | Énoncé | Test(s) | Statut |
|---|---|---|---|
| RG-016 | Signalement non bloquant de la soumission en retard, que voit le superviseur | `T/test_soumission.py::test_ca1_apres_l_echeance_la_soumission_est_acceptee_et_marquee_en_retard` (`soumis_en_retard`) ; `PV` « CA1 : chaque planning dit son délégué… » (« En retard ») | Couvert |
| RG-017 | Commentaire obligatoire d'une demande de révision | Voir PLN-013 CA1 | Couvert |
| RG-018 | Mineure libre et tracée, majeure à nouvelle approbation | Voir PLN-015 et la fermeture | Couvert |
| RG-019 | Escalade au DM et alerte à la fermeture | Voir PLN-016 | Couvert |
| RG-020 | Le remplaçant décide pendant sa période, en mode `remplacement` | Voir ORG-013 | Couvert |
| RG-021 | Aucune approbation automatique | Après la passe des échéances, le planning attend toujours une décision : `T/test_echeances.py::test_avant_l_escalade_le_dm_ne_decide_pas_et_le_superviseur_garde_la_main`, `::test_pln016_ca2_la_decision_du_dm_porte_le_mode_escalade` | Couvert |
| RG-023 | Le planning d'un superviseur-visiteur est approuvé par son DM | Voir PLN-017 | Couvert |
| RG-034 | Toute décision porte son auteur, sa date et son mode (`direct`, `escalade`, `remplacement`) | `T/test_approbation.py::test_pln012_ca1_l_approbation_fige_la_version` ; `T/test_echeances.py::test_pln016_ca2_…` ; `T/test_remplacements.py::test_ca1_ca2_…` | Couvert |
| RG-037 | Chaque soumission de planning crée une version figée et consultable, visites, passages et activités compris | `T/test_approbation.py::test_rg037_la_soumission_fige_une_version` ; `::test_rg037_la_version_figee_garde_passages_et_activites` ; `T/test_versions.py::test_ca2_toutes_les_versions_restent_consultables` | Couvert |

## Critères partiels du cycle 0.2, repris en 0.3

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-004 | CA2 | Un seuil dépassé apparaît au superviseur | `T/test_consultation.py::test_le_superviseur_lit_la_semaine_soumise_avec_ses_alertes` ; `::test_une_alerte_nomme_ses_visites` ; `T/test_file_validation.py::test_pln011_ca1_…` ; `PC` « le superviseur lit la semaine, ses alertes et ses activités, sans rien modifier » ; `PV` « CA1 : chaque planning dit son délégué… » | Couvert |
| PLN-009 | CA2 | L'absence est validée par le superviseur avec le planning | Le superviseur la lit : `T/test_consultation.py::test_le_superviseur_lit_la_semaine_soumise_avec_ses_alertes` ; il décide le planning : `T/test_approbation.py::test_pln012_ca1_…` ; l'activité est figée dans la version : `::test_rg037_la_version_figee_garde_passages_et_activites` | Couvert |
| PLN-003 | CA2 | Chaque visite du passage garde son rapport | — | Partiel (cycle 0.5 : rapports de visite) |

## Contrôles transverses du cycle 0.3

- Isolation : les routes du cycle (file, consultation, approuver, réviser, versions, notifications, remplacements, semaines fermées, réouverture, demande de réouverture) passent par `B/perimetre/tests/test_couverture_routes.py` ; celles qui ouvrent un objet par son identifiant, par `B/perimetre/tests/test_isolation_routes.py` ; les actions `plannings.valider`, `notifications.lire` et `remplacements.gerer` par la matrice `B/perimetre/tests/test_matrice.py`. Un autre superviseur, un autre pays ou le délégué ne consultent ni ne décident (`T/test_consultation.py::test_seul_son_superviseur_le_consulte`, `T/test_approbation.py::test_seul_le_responsable_du_poste_decide`, `T/test_versions.py::test_seuls_le_delegue_et_ceux_qui_decident_consultent`).
- États : les transitions du planning suivent le PRD et le miroir TypeScript est à jour (`T/test_etats.py`).
- Échéances : une passe toutes les 15 minutes, idempotente, à l'heure de chaque pays (`T/test_echeances.py::test_la_tache_du_worker_fait_la_meme_passe` et les appels répétés de `echeances.executer()`).
- Accessibilité : analyse axe-core de la file et des semaines fermées (`PV`), de la consultation (`PC`) et, depuis 0.3.9, de la semaine fermée du délégué (`PP` « 0.3.9 : la semaine fermée sans planning se fait rouvrir sur demande »).
- Démonstration : `B/demonstration/tests/test_demonstration.py::test_la_demonstration_se_reinitialise_par_une_commande` vérifie, depuis 0.3.9, la semaine en cours approuvée avant la fermeture et la suivante en préparation du premier délégué, la semaine suivante soumise et la semaine en cours fermée avec une demande de réouverture du second.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Aucun écart : aucun critère « Non couvert ».

Trous comblés pendant la recette (0.3.9) :
- NOT-001 CA1 : destination de chacun des neuf types de notification, au portail et au téléphone, et textes de la réouverture demandée et de la rédaction rouverte.
- ORG-013 CA2 / RG-020 : une révision faite par le remplaçant porte le mode `remplacement` et son nom.
- Fermeture (§14.21) : un planning « à réviser » est fermé le lundi 0 h ; la demande de réouverture part aussi au remplaçant actif, qui peut rouvrir.
- RG-018 : le serveur renvoie `approbation.modifiable` faux dès le lundi 0 h, et le téléphone le dit.
- PLN-016 / RG-019 : un délégué sans planning compte dans l'alerte du DM.
- RG-037 : la version figée garde les passages et les activités.

Les critères « Partiel » attendent le programme du jour (cycle 0.4), les rapports de visite (cycle 0.5) et la synchronisation avec le push (cycle 0.8), et seront testés avec eux.

Remarque : les données d'exemple des tests du centre de notifications (`PN`, `MC`) gardent une échéance de rappel au jeudi 18 h. Le texte reste juste, puisqu'il suit l'échéance envoyée par le serveur (le lundi 0 h depuis 0.3.9, prouvé par `T/test_echeances.py::test_not006_rappel_du_planning_non_soumis_le_vendredi`). Mais il vaudrait mieux aligner ces exemples sur la nouvelle règle.

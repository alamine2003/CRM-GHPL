# Recette du cycle 0.6 — Validation des rapports

Version de clôture : **0.6.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.6.x` (RPT-012 à RPT-018) est relié au test automatisé qui le prouve. S'y ajoutent les règles de gestion du cycle (RG-032 pour l'alerte à 48 h, RG-034, RG-035, RG-036, RG-037), les sections de mise en œuvre (prd.md §14.42 à §14.49) et chacune de leurs décisions [D] (18.A, 20.A, 22.A, 23.A, 25.A, 28.A, 29.A, 31.A, 32.A, 34.A, 35.A, 37.A, 38.A), avec les tests ajoutés à la recette (`R/test_recette_06.py`), le scénario de recette REC-08 (prd.md §21.1) et les critères que la recette 0.5 avait laissés « Partiel » en attendant la validation (RPT-007 CA2, RPT-010 CA1, RG-032, RG-037), ainsi que ORG-013 CA1. Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée (version du PRD inférieure ou égale à `VERSION`) n'est citée par aucun test du serveur, du portail, du mobile ou des paquets.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel** : une partie du critère est prouvée par un test. Le reste attend soit un test (il figure alors dans la section « Écarts »), soit une fonction d'un cycle suivant (le cycle est indiqué entre parenthèses).
- **Non couvert** : aucun test ne prouve encore le critère. Chaque cas figure dans la section « Écarts ».

Abréviations : `B/` = `backend/apps/`, `R/` = `backend/apps/rapports/tests/`, `T/` = `backend/apps/planning/tests/`, `PAT` = `portail/src/pages/ATraiter.test.tsx`, `PJR` = `portail/src/pages/JourneeRapports.test.tsx`, `PC` = `portail/src/composants/Conformite.test.tsx`, `PRP` = `portail/src/composants/RapportsProspect.test.tsx`, `PTN` = `portail/src/composants/textesNotifications.test.tsx`, `MRA` = `mobile/__tests__/rapport.test.tsx`, `MP` = `mobile/__tests__/programme.test.tsx`, `MTN` = `mobile/__tests__/textesNotifications.test.ts`. Les tests ajoutés pour la recette sont dans `R/test_recette_06.py`.

## File « À traiter » du superviseur (0.6.1)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-012 | — | « À traiter » : en tête, journées à vérifier, rapports à valider, rapports attendus, plannings à valider, avec un lien vers « Plannings à valider » ; rien à traiter, la page le dit | `R/test_a_traiter.py::test_rpt012_les_plannings_a_valider_sont_comptes` ; `PAT` « RPT-012 : les chiffres du jour, dont les plannings à valider », « RPT-012 : rien à traiter, la page le dit » | Couvert |
| RPT-012 | — | Par délégué, ses journées terminées et non validées ; la journée du jour n'y est pas ; validée, la journée quitte la file | `R/test_a_traiter.py::test_rpt012_ca1_la_journee_conforme_et_ses_rapports` ; `::test_rpt012_la_journee_du_jour_n_est_pas_encore_a_traiter` ; `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` (file vide après validation) | Couvert |
| RPT-012 | CA1 | Chaque journée affiche « Conforme » ou « À vérifier · n écarts » et le détail de chaque écart, avec les textes de la conformité ; nombre de visites et d'effectuées, rapports à valider, attendus, en retard | `R/test_a_traiter.py::test_rpt012_ca1_la_journee_conforme_et_ses_rapports` (attendu, puis à valider et en retard) ; `::test_rpt012_ca1_une_journee_a_verifier_detaille_ses_ecarts` (imprévue, justification) ; `PAT` « RPT-012 CA1 : chaque journée dit « conforme » ou « à vérifier », avec ses écarts » | Couvert |
| RPT-012 | — | Qui voit quoi : le responsable du poste et le superviseur qui le remplace (ORG-013) ; ni le délégué, ni l'administration, ni le responsable pays, ni un autre superviseur ; droit « valider les rapports » au superviseur et au DM | `R/test_a_traiter.py::test_rpt012_seul_le_responsable_du_poste` ; `::test_rpt012_le_remplacant_voit_les_journees_du_remplace` ; `B/perimetre/tests/test_matrice.py::test_la_matrice_suit_le_prd` ; `::test_chaque_role_chaque_action` (`rapports.valider`, rôle par rôle) | Couvert |
| RPT-012 | — | … le DM voit les journées d'un superviseur-visiteur (RG-023) ; personne ne voit ses propres journées | La même règle est prouvée pour la file des plannings : `T/test_approbation.py::test_pln017_le_dm_approuve_le_planning_du_superviseur_visiteur` (le DM voit le planning du superviseur-visiteur, qui ne le voit pas dans sa propre file). Pour « À traiter », seul le cas négatif est vérifié (`R/test_a_traiter.py::test_rpt012_seul_le_responsable_du_poste` : un DM sans superviseur-visiteur ne voit rien) | Partiel (écart 2) |
| RPT-012 · 20.A | — | [D] La file remonte sur 4 semaines ; au-delà, la journée non validée quitte « Journées » et passe aux retards | `R/test_retards.py::test_20a_une_journee_de_plus_de_4_semaines_non_validee_passe_aux_retards` | Couvert |
| 18.A | — | [D] Démonstration : le prospect du dernier rapport soumis, qui proposait une nouvelle visite, n'est pas replanifié la semaine suivante et apparaît sous « Proposées à votre dernière visite » | `B/demonstration/tests/test_demonstration.py` ne vérifie aucune visite proposée (`liberer_une_proposee` sans test) | Non couvert (écart 1) |

## Consultation d'une journée (0.6.2)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-012 | — | « Ouvrir la journée » : en tête, ses contrôles (« À vérifier » et chaque écart) et « Consulter la semaine » ; chaque visite dans l'ordre, avec prospect, état, heure, motif d'un écart | `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` ; `PJR` « 0.6.2 : les contrôles de la journée, avec leurs écarts », « 0.6.2 : un brouillon reste au délégué ; un écart montre son motif » (« Motif : Cabinet fermé — Revenir jeudi ») | Couvert |
| RPT-012 | — | Le rapport soumis en entier : produits et retours, échantillons, résultat obtenu, résumé, prochaine action, visite proposée, champs du pays, pièces jointes | `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` ; `PJR` « RPT-010 CA1 : le rapport soumis se lit en entier, horodatage douteux compris » | Couvert |
| RPT-010 | CA1 | « Horodatage douteux » visible du superviseur, avec l'heure du téléphone et l'heure de réception rendues par l'API | `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` (`horodatage_douteux`, `heure_telephone`, `recu_le`) ; `PJR` « RPT-010 CA1 : le rapport soumis se lit en entier, horodatage douteux compris » | Couvert |
| RPT-010 | CA1 | … la journée affiche « Soumis en retard », l'heure du téléphone et l'heure de réception retenue | `PJR` « RPT-010 CA1 : le rapport soumis se lit en entier, horodatage douteux compris » (« Soumis en retard », « Heure du téléphone : … ; reçu par le serveur à … ») | Couvert |
| RG-037 | — | Le nombre de versions du rapport s'affiche quand il y en a plus d'une | `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` (`versions` = 1) ; `R/test_resoumission.py::test_rpt015_ca1_la_version_precedente_reste_consultable` (`versions` = 2) ; `PJR` « RPT-015 CA1 : le rapport corrigé dit ce qui a changé ; la version 1 reste lisible » (« Version 2, soumise le … après correction ») | Couvert |
| RPT-012 | — | Le brouillon reste au délégué : le superviseur lit seulement « Rapport en brouillon », sans son contenu ni sa pièce | `R/test_journee.py::test_un_brouillon_reste_au_delegue` ; `PJR` « 0.6.2 : un brouillon reste au délégué ; un écart montre son motif » | Couvert |
| RPT-012 | — | Qui : le responsable du poste ou son remplaçant ; sinon la journée n'existe pas ; le délégué n'a pas ce droit | `R/test_journee.py::test_hors_supervision_la_journee_n_existe_pas` (autre superviseur 404, délégué 403, jour sans visite 404) | Couvert |

## Validation des rapports (0.6.3)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-013 | — | « Valider ce rapport » sous chaque rapport soumis (mode `unitaire`) ; une seconde validation est refusée | `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` ; `PJR` « 22.A : la journée ne se valide pas tant qu’un rapport n’est pas soumis » (« Valider ce rapport ») | Couvert |
| RPT-013 | — | « Valider la journée », après confirmation, valide tous ses rapports soumis (mode `journee`) | `R/test_validation.py::test_rpt013_la_journee_se_valide_d_un_geste` ; `PJR` « RPT-013 : la journée complète se valide après confirmation » | Couvert |
| RPT-013 · 22.A | — | [D] La journée se valide quand tous ses rapports sont soumis ; sinon le bouton est inactif, la page dit combien il en manque, et les rapports soumis se valident déjà un par un | `R/test_validation.py::test_22a_une_journee_incomplete_ne_se_valide_pas` (409 `rapports_non_soumis`, `rapports_manquants` = 1) ; `PJR` « 22.A : la journée ne se valide pas tant qu’un rapport n’est pas soumis » | Couvert |
| RPT-013 | CA1 | « Valider les n journées conformes » ne valide que les journées classées `conforme` (RG-035), après confirmation | `R/test_validation.py::test_rpt013_ca1_le_lot_ne_prend_que_les_journees_conformes` ; `::test_rpt013_le_lot_valide_les_journees_conformes` (mode `lot`) ; `PAT` « RPT-013 CA1, 23.A : « Valider les n conformes » n’envoie que les journées éligibles » | Couvert |
| RPT-013 · 23.A | — | [D] Le lot écarte une journée dont un rapport a un horodatage douteux ; sans journée éligible, pas de bouton | `R/test_validation.py::test_23a_le_lot_ecarte_l_horodatage_douteux` ; `PAT` « 23.A : sans journée éligible, pas de bouton de lot » | Couvert |
| RPT-013 · 23.A | — | [D] … et une journée conforme dont un rapport n'est pas soumis (brouillon ou absent) | `R/test_recette_06.py::test_23a_le_lot_ecarte_une_journee_dont_un_rapport_n_est_pas_soumis` (journée avec un rapport en brouillon : le lot répond 0 journée, 0 rapport) | Couvert |
| RPT-013 | CA2 | Chaque rapport validé porte validateur, date et mode ; la journée l'affiche (« Validé … le … par … ») | `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` ; `PJR` « RPT-013 CA2, RPT-018 CA1 : un rapport validé dit par qui, quand et comment » | Couvert |
| RPT-013 | — | Tous ses rapports validés, la journée est validée : classement figé (VIS-010 CA3), elle quitte « À traiter » | `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` ; `::test_rpt013_la_journee_se_valide_d_un_geste` (`fige_le` renseigné) | Couvert |
| RPT-013 | — | Une journée sans visite effectuée se valide aussi, avec le lot ou d'un geste | Aucun test : toutes les journées validées dans `R/test_validation.py` et `R/test_recette_06.py` ont au moins une visite effectuée | Non couvert (écart 3) |
| RPT-013 | — | Un brouillon ne se valide pas ; le délégué ne valide rien | `R/test_validation.py::test_un_brouillon_ne_se_valide_pas_et_le_delegue_ne_valide_rien` | Couvert |
| RPT-018 | — | Le remplaçant d'un superviseur valide en mode `remplacement` | `R/test_validation.py::test_rpt018_le_remplacant_valide_en_mode_remplacement` ; `PJR` « RPT-013 CA2, RPT-018 CA1 : un rapport validé dit par qui, quand et comment » (« Validé en remplacement le … par Awa FICTIVE ») | Couvert |
| RPT-018 · 25.A | — | [D] Passé 24 heures ouvrées, la journée s'ouvre au DM du périmètre, marquée en escalade, qui valide en mode `escalade` ; avant, il ne la voit ni ne la valide | `R/test_validation.py::test_rpt018_le_dm_valide_par_escalade_apres_le_delai` (404 avant le délai, `escalade` = vrai puis mode `escalade`) | Couvert |
| RPT-018 · 25.A | — | [D] … l'étiquette « Escaladée » s'affiche dans la file du DM ; le superviseur garde la main après l'escalade | `PAT` « RPT-018, 25.A : une journée passée au DM est marquée « Escaladée » » ; `R/test_recette_06.py::test_25a_apres_l_escalade_le_superviseur_garde_la_main` (journée escaladée chez le DM, le superviseur valide en mode `unitaire`) | Couvert |
| RPT-018 | CA1 | Le mode est visible dans l'historique, sous chaque rapport validé | `PJR` « RPT-013 CA2, RPT-018 CA1 : un rapport validé dit par qui, quand et comment » ; `mode_validation` rendu par l'API : `R/test_validation.py::test_rpt018_le_remplacant_valide_en_mode_remplacement`, `::test_rpt018_le_dm_valide_par_escalade_apres_le_delai` | Couvert |

## Demande de correction (0.6.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-014 | — | « Demander une correction » sous un rapport soumis : commentaire et parties à revoir ; « Renvoyer au délégué » le passe « à corriger » | `R/test_correction.py::test_rpt014_la_correction_part_au_delegue` ; `PJR` « RPT-014 CA1 : sans commentaire, la correction ne part pas ; avec, elle vise ses champs », « RPT-014 : la correction en attente s’affiche sur le rapport » | Couvert |
| RPT-014 | CA1 | Sans commentaire, le bouton reste inactif et le serveur refuse (`commentaire_requis`) | `R/test_correction.py::test_rpt014_ca1_sans_commentaire_rien_ne_part` ; `PJR` « RPT-014 CA1 : sans commentaire, la correction ne part pas ; avec, elle vise ses champs » | Couvert |
| RPT-014 | CA2 | Les autres rapports de la journée se valident un par un ; la journée attend le rapport corrigé (22.A) ; « À traiter » compte les rapports renvoyés | `R/test_correction.py::test_rpt014_ca2_les_autres_rapports_se_valident` ; `::test_rpt014_la_correction_part_au_delegue` (`rapports_a_corriger`, `rapports_manquants`) ; `PJR` « RPT-014 : un rapport renvoyé n’est pas « pas encore soumis » » | Couvert |
| RPT-014 · DC-60 | — | Sans échéance : le rapport renvoyé n'est pas « en retard » | `R/test_retards.py::test_rpt017_soumis_ou_renvoye_n_est_pas_en_retard` ; `MRA` « RPT-014 : le rapport à corriger dit qui demande quoi et les parties à revoir » (pas de « En retard ») | Couvert |
| RPT-014 | — | Le délégué est notifié (sans nom de prospect), la notification ouvre le rapport ; la demande s'affiche en tête du rapport | `R/test_correction.py::test_rpt014_la_correction_part_au_delegue` ; `MTN` « RPT-014 : la correction demandée ouvre le rapport, sans nom de prospect » ; `MRA` « RPT-014 : le rapport à corriger dit qui demande quoi et les parties à revoir » | Couvert |
| RPT-014 | — | La Tournée liste les rapports à corriger à part des rapports en retard | `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » | Couvert |
| RPT-014 | — | Demande inscrite au journal ; seul un rapport soumis se renvoie, pas deux fois ; parties inconnues refusées ; le délégué n'a pas ce droit | `R/test_correction.py::test_rpt014_la_correction_part_au_delegue` (audit) ; `::test_rpt014_champs_inconnus_et_brouillon_refuses` | Couvert |
| RPT-014 | — | Resoumis, le rapport redevient « soumis », en version 2, et la demande s'efface | `R/test_correction.py::test_rpt014_corrige_et_resoumis_le_rapport_revient` | Couvert |

## Correction et nouvelle soumission (0.6.5)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-015 | — | Le délégué ouvre le rapport depuis la liste « Rapports à corriger », le corrige et le soumet à nouveau ; version suivante (RG-037) | `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » (ouvre le rapport) ; `R/test_correction.py::test_rpt014_corrige_et_resoumis_le_rapport_revient` | Couvert |
| RPT-015 | CA1 | La version précédente reste consultable : version, demande à laquelle elle répond, ce qui a changé ; « Modifié » sur la version actuelle seulement ; « Voir la version 1 » | `R/test_resoumission.py::test_rpt015_ca1_la_version_precedente_reste_consultable` ; `::test_rpt015_un_rapport_soumis_une_fois_n_a_pas_de_precedente` ; `PJR` « RPT-015 CA1 : le rapport corrigé dit ce qui a changé ; la version 1 reste lisible » | Couvert |
| RPT-015 | — | Chaque version garde la demande de correction à laquelle elle répond | `R/test_resoumission.py::test_rpt015_ca1_la_version_precedente_reste_consultable` (`historique`) | Couvert |
| RPT-015 · 28.A | — | [D] Qui a demandé la correction est prévenu du rapport corrigé ; la notification ouvre la journée | `R/test_resoumission.py::test_28a_le_superviseur_est_prevenu_du_rapport_corrige` ; `PTN` « RPT-015, 28.A : rapport corrigé » › « se dit avec le nom et le jour, et ouvre la journée » | Couvert |
| RPT-015 · 29.A | — | [D] La liste « Rapports à corriger » montre ceux de toutes les semaines ; un rapport resoumis en sort | `R/test_resoumission.py::test_29a_le_rapport_a_corriger_suit_le_delegue_d_une_semaine_a_l_autre` ; `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » | Couvert |
| RPT-015 · 29.A | — | [D] … même sans réseau : la soumission hors connexion retire aussitôt le rapport de la liste | Le filtre est prouvé : `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » (cas commenté « Déjà resoumis (sur ce téléphone) : il sort de la liste »). Mais le test part d'un programme où le rapport est déjà `soumis` : la mise à jour du programme gardé lors d'une soumission hors connexion (`changerVisite`) n'est pas exercée | Partiel (écart 4) |

## Réouverture d'un rapport validé (0.6.6)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-016 | — | « Rouvrir le rapport » sous un rapport validé ; motif obligatoire (`motif_requis`) ; seul un rapport validé se rouvre ; le rapport passe « rouvert » | `R/test_reouverture.py::test_rpt016_ca1_le_superviseur_rouvre_jusqu_a_30_jours` ; `::test_rpt016_motif_obligatoire_et_rapport_valide_seulement` ; `PJR` « RPT-016 : un rapport validé se rouvre, avec un motif obligatoire » | Couvert |
| RPT-016 | CA1 | Un superviseur ne rouvre pas un rapport validé il y a 31 jours (`delai_reouverture`), le bouton ne lui est plus proposé ; à 30 jours, il rouvre | `R/test_reouverture.py::test_rpt016_ca1_a_31_jours_seul_le_dm_rouvre` ; `::test_rpt016_ca1_le_superviseur_rouvre_jusqu_a_30_jours` ; `PJR` « RPT-013 CA2, RPT-018 CA1 : un rapport validé dit par qui, quand et comment » (pas de « Rouvrir le rapport » sans `rouvrable`) | Couvert |
| RPT-016 | CA1 | Le DM du périmètre rouvre à tout moment ; il lit la journée en consultation, sans valider | `R/test_reouverture.py::test_rpt016_ca1_a_31_jours_seul_le_dm_rouvre` (mode `consultation`) ; `PJR` « RPT-016 : le rapport rouvert affiche le motif ; le DM consulte sans valider » | Couvert |
| RPT-016 | — | Un rapport validé se retrouve depuis la conformité de la semaine et depuis la fiche du prospect (« Ouvrir la journée », pour l'encadrement) | `PC` « RPT-016 : « Ouvrir la journée » mène à la journée du délégué » ; `PRP` « RPT-016 : l’encadrement ouvre la journée du rapport, pour le relire ou le rouvrir », « RPT-016 : sans le droit de valider, pas de lien vers la journée » | Couvert |
| RPT-016 | CA2 | La réouverture est inscrite au journal, avec le motif, et notifiée au délégué | `R/test_reouverture.py::test_rpt016_ca2_auditee_et_notifiee` ; `MTN` « RPT-016 : la réouverture ouvre le rapport à reprendre » | Couvert |
| RPT-016 · 31.A | CA2 | [D] Quand le DM rouvre, le superviseur est prévenu aussi ; la notification ouvre la journée | `R/test_reouverture.py::test_31a_quand_le_dm_rouvre_le_superviseur_est_prevenu` ; `PTN` « RPT-016, 31.A : rapport rouvert par le DM » › « le superviseur l’apprend, et la notification ouvre la journée » | Couvert |
| RPT-016 · 32.A | — | [D] La journée revient dans « À traiter » (« 1 rapport rouvert ») jusqu'à la nouvelle validation ; son classement reste figé | `R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` (même `fige_le` avant et après) ; `PAT` « RPT-016 : un rapport rouvert se compte à part des rapports attendus » | Couvert |
| RPT-016 · 32.A | — | [D] … même au-delà des 4 semaines de la file | `R/test_recette_06.py::test_32a_rouvert_au_dela_de_4_semaines_la_journee_revient_dans_la_file` (rouvert par le DM cinq semaines après, la journée revient chez le superviseur) | Couvert |
| RPT-016 · 32.A | — | [D] La semaine dit « Classement figé » ; la version suivante dit « soumise après réouverture » | Serveur : `R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` (même `fige_le`, version 2 avec `reouverture`) ; `PC` « 32.A : « Classement figé » » ; `PJR` « RPT-016 : la version resoumise après une réouverture le dit et rappelle le motif » | Couvert |
| RPT-016 | — | Le délégué reprend le rapport depuis « Rapports à corriger », motif en tête ; qui a rouvert est prévenu du retour, puis valide | `R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` ; `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » (« Rapport rouvert ») ; `MRA` « RPT-016 : le rapport rouvert dit qui l’a rouvert et pourquoi » | Couvert |

## Rapports en retard (0.6.7)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-017 · 35.A | — | [D] Onglet « Retards » dans « À traiter », avec leur nombre : rapports non soumis après l'échéance (rien d'écrit ou brouillon, jours de retard, prospect, lieu) et journées de plus de 4 semaines non validées ; chaque ligne ouvre la journée | `R/test_retards.py::test_rpt017_ca1_le_rapport_non_soumis_est_liste_et_filtrable` ; `::test_20a_une_journee_de_plus_de_4_semaines_non_validee_passe_aux_retards` ; `PAT` « RPT-017, 35.A : l’onglet « Retards » liste les rapports non soumis et les journées anciennes » | Couvert |
| RPT-017 | — | Un rapport soumis, renvoyé pour correction ou rouvert n'est pas en retard | `R/test_retards.py::test_rpt017_soumis_ou_renvoye_n_est_pas_en_retard` (soumis et renvoyé ; le rouvert n'est pas essayé) | Couvert |
| RPT-017 | CA1 | La liste des retards est filtrable par délégué (« Tous les délégués » par défaut) | `R/test_retards.py::test_rpt017_ca1_le_rapport_non_soumis_est_liste_et_filtrable` ; `PAT` « RPT-017 CA1 : la liste se filtre par délégué » | Couvert |
| RPT-017 | — | Qui voit quoi : le responsable du poste ou son remplaçant, et le DM du périmètre ; jamais le délégué | `R/test_retards.py::test_rpt017_ca1_le_rapport_non_soumis_est_liste_et_filtrable` (superviseur ; délégué refusé, 403) ; `R/test_recette_06.py::test_rpt017_le_remplacant_et_le_dm_lisent_les_retards` | Couvert |
| RG-032 · 34.A | — | [D] 48 heures après la visite, un rapport toujours pas soumis alerte le superviseur, une seule fois ; une alerte par délégué et par jour, avec le nombre ; la notification ouvre les retards du délégué | `R/test_retards.py::test_34a_l_alerte_part_48_h_apres_la_visite_une_seule_fois` ; `::test_34a_les_visites_d_un_meme_jour_font_une_seule_alerte` ; `PTN` « RPT-017, 34.A : rapport en retard » › « le superviseur est alerté, et la notification ouvre les retards du délégué » | Couvert |

## Notifications du workflow de rapport (0.6.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| §18 | — | « n rapports à valider » au superviseur, regroupés tant que la notification n'est pas lue ; elle ouvre « À traiter » | `R/test_notifications_rapports.py::test_rapports_soumis_regroupes_pour_le_superviseur` ; `PTN` « 0.6.8 : notifications du workflow de rapport » › « rapports soumis et journée escaladée : textes et destinations » | Couvert |
| §18 | — | « n rapports validés » au délégué, regroupés de la même façon | `R/test_notifications_rapports.py::test_rapports_valides_regroupes_pour_le_delegue` ; `MTN` « 0.6.8, 37.A : le rappel de 18 h et les rapports validés se lisent au téléphone » | Couvert |
| NOT-006 · 37.A | — | [D] À 18 h, heure du pays, le jour de la visite, le délégué dont un rapport du jour n'est pas soumis reçoit un rappel, une fois ; rien si le rapport est soumis | `R/test_notifications_rapports.py::test_37a_rappel_a_18_h_le_jour_de_la_visite` ; `::test_37a_pas_de_rappel_si_le_rapport_est_soumis` ; `MTN` « 0.6.8, 37.A : le rappel de 18 h et les rapports validés se lisent au téléphone » | Couvert |
| PLN-016 · 38.A | — | [D] Chaque DM reçoit une notification par journée escaladée, qui ouvre la journée ; [H] seulement pour les 7 derniers jours | `R/test_notifications_rapports.py::test_38a_le_dm_est_prevenu_une_fois_par_journee_escaladee` ; `::test_38a_pas_d_escalade_notifiee_pour_une_journee_de_plus_de_7_jours` ; `PTN` « rapports soumis et journée escaladée : textes et destinations » | Couvert |
| §14.49 | — | Rappels, alertes de retard et escalades des journées partent avec la tâche périodique (`executer_echeances`) | `R/test_recette_06.py::test_la_tache_periodique_declenche_rappels_alertes_et_escalades` (`rappels_rapport`, `rapports`, `journees_escaladees` du bilan de `executer`) | Couvert |
| NOT-003 | CA1 | 20 rapports soumis en 10 minutes produisent une seule notification « 20 rapports à valider » | Le regroupement au centre est testé (`R/test_notifications_rapports.py::test_rapports_soumis_regroupes_pour_le_superviseur`) ; le push arrive en 0.8.5 | Partiel (cycle 0.8 : NOT-003) |

## Règles de gestion du cycle

| Règle | Énoncé | Test(s) | Statut |
|---|---|---|---|
| RG-032 | … alerte au superviseur à 48 h (resté « Partiel » en 0.5) | Voir 34.A : `R/test_retards.py::test_34a_l_alerte_part_48_h_apres_la_visite_une_seule_fois` ; `::test_34a_pas_d_alerte_au_dela_de_7_jours` | Couvert |
| RG-032 | Un rapport resoumis (après correction ou réouverture) n'est jamais « en retard » : seule la première soumission compte (§14.38, §14.46) | Serveur : `R/test_recette_06.py::test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige` (resoumis trois jours après la visite, `en_retard` faux) ; téléphone : `MRA` « RPT-014 : le rapport à corriger dit qui demande quoi et les parties à revoir », « RPT-016 : le rapport rouvert dit qui l’a rouvert et pourquoi » | Couvert |
| RG-034 | Toute validation porte le validateur, la date et le mode (`unitaire`, `journee`, `lot`, `escalade`, `remplacement`) | `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` (unitaire) ; `::test_rpt013_la_journee_se_valide_d_un_geste` (journee) ; `::test_rpt013_le_lot_valide_les_journees_conformes` (lot) ; `::test_rpt018_le_dm_valide_par_escalade_apres_le_delai` (escalade) ; `::test_rpt018_le_remplacant_valide_en_mode_remplacement` (remplacement) | Couvert |
| RG-034 | … chaque validation est inscrite au journal d'audit avec son auteur et son mode (REC-12) | `R/test_recette_06.py::test_rg034_validations_par_journee_et_par_lot_auditees_avec_auteur_et_mode` (`rapport.validation` et `rapport.validation_journee`, auteur et mode `lot`) ; validation unitaire : `R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode` | Couvert |
| RG-035 | La validation par lot ne concerne que les journées `conforme` | Voir RPT-013 CA1 : `R/test_validation.py::test_rpt013_ca1_le_lot_ne_prend_que_les_journees_conformes` | Couvert |
| RG-035 | Aucune validation automatique d'un rapport | `R/test_recette_06.py::test_rg035_aucune_validation_automatique` (passes périodiques jusqu'à deux semaines après, bien au-delà de l'escalade : le rapport reste `soumis`, la journée n'est pas figée) | Couvert |
| RG-036 | Un rapport validé ne se modifie pas sans réouverture | `R/test_recette_06.py::test_rg036_un_rapport_valide_ne_se_modifie_pas` (409 `rapport_non_modifiable`) ; après réouverture, la modification passe : `R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` | Couvert |
| RG-036 | Réouverture motivée : superviseur jusqu'à 30 jours après validation, DM au-delà | Voir RPT-016 CA1 : `R/test_reouverture.py::test_rpt016_ca1_le_superviseur_rouvre_jusqu_a_30_jours` ; `::test_rpt016_ca1_a_31_jours_seul_le_dm_rouvre` ; `::test_rpt016_motif_obligatoire_et_rapport_valide_seulement` | Couvert |
| RG-037 | Les versions sont consultables par le superviseur et au-dessus (resté « Partiel » en 0.5) | Superviseur : `R/test_resoumission.py::test_rpt015_ca1_la_version_precedente_reste_consultable` ; `PJR` « RPT-015 CA1 : le rapport corrigé dit ce qui a changé ; la version 1 reste lisible » ; DM, en consultation : `R/test_reouverture.py::test_rpt016_ca1_a_31_jours_seul_le_dm_rouvre` | Couvert |

## Critères partiels des cycles précédents, repris en 0.6

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-007 | CA2 | Le superviseur lit la pièce du rapport soumis qu'il valide (sans cache) ; jamais celle d'un brouillon ; pas un délégué d'un autre pays | `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` (200, `Cache-Control: private, no-store`, délégué du Togo refusé) ; `::test_un_brouillon_reste_au_delegue` (404) ; `PJR` « RPT-007 CA2 : la pièce jointe du rapport soumis s’ouvre pour le superviseur » | Couvert |
| RPT-007 | CA2 | … et l'encadrement de son périmètre (DM, DF, responsable pays) lit aussi la pièce du rapport soumis (§14.43) | `R/test_recette_06.py::test_rpt007_ca2_l_encadrement_du_perimetre_lit_la_piece_du_rapport_soumis` (DM, DF et responsable pays : 200 ; responsable pays du Togo refusé) | Couvert |
| RPT-010 | CA1 | La mention « horodatage douteux » est visible du superviseur | Voir la consultation (0.6.2) : `R/test_journee.py::test_le_superviseur_lit_la_journee_et_le_rapport_soumis` ; `PJR` « RPT-010 CA1 : le rapport soumis se lit en entier, horodatage douteux compris » | Couvert |
| ORG-013 | CA1 | Pendant la période, le remplaçant voit et décide les rapports concernés | `R/test_a_traiter.py::test_rpt012_le_remplacant_voit_les_journees_du_remplace` ; `R/test_validation.py::test_rpt018_le_remplacant_valide_en_mode_remplacement` | Couvert |

PLN-003 CA2 (chaque visite d'un passage garde son rapport) reste sans test dédié au passage ; il découle de RG-030.

## Scénario de recette REC-08

| Scénario | Énoncé | Test(s) | Statut |
|---|---|---|---|
| REC-08 | Le superviseur demande une correction sur une visite, valide le reste de la journée, puis valide le rapport corrigé (RPT-013, RPT-014, RPT-015) | `R/test_recette_06.py::test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige` : deux rapports soumis ; correction demandée sur l'un ; l'autre validé seul, la journée refusée (409 `rapports_non_soumis`) ; le délégué corrige et soumet (version 2, `modifies` = `resume`, pas en retard) ; le superviseur valide le rapport corrigé ; la journée est figée et quitte « À traiter » ; correction, soumission et validation sont au journal | Couvert |

## Décisions et hypothèses du cycle

| Réf. | Décision ou hypothèse | Nature | Preuve |
|---|---|---|---|
| 18.A (CHANGELOG 0.6.1) | Démonstration : la visite proposée au dernier rapport n'est pas replanifiée la semaine suivante | [D] | Sans test (écart 1) |
| §14.42, §14.43, 20.A | La file « À traiter » remonte sur 4 semaines ; au-delà, retards | [D] 7 octobre 2026 | `R/test_retards.py::test_20a_une_journee_de_plus_de_4_semaines_non_validee_passe_aux_retards` |
| §14.44, 22.A | Une journée se valide quand tous ses rapports sont soumis | [D] 7 octobre 2026 | `R/test_validation.py::test_22a_une_journee_incomplete_ne_se_valide_pas` ; `PJR` « 22.A : la journée ne se valide pas tant qu’un rapport n’est pas soumis » |
| §14.44, 23.A | Le lot : journées conformes, tous leurs rapports soumis, aucun horodatage douteux | [D] 7 octobre 2026 | `R/test_validation.py::test_23a_le_lot_ecarte_l_horodatage_douteux` ; `R/test_recette_06.py::test_23a_le_lot_ecarte_une_journee_dont_un_rapport_n_est_pas_soumis` |
| §14.44, 25.A | Escalade au DM après 24 heures ouvrées (paramètre des plannings, PLN-016) ; le superviseur garde la main | [D] 7 octobre 2026 | `R/test_validation.py::test_rpt018_le_dm_valide_par_escalade_apres_le_delai` ; `R/test_recette_06.py::test_25a_apres_l_escalade_le_superviseur_garde_la_main` |
| §14.46, 28.A | Qui a demandé la correction est prévenu du retour du rapport | [D] 8 octobre 2026 | `R/test_resoumission.py::test_28a_le_superviseur_est_prevenu_du_rapport_corrige` |
| §14.46, 29.A | « Rapports à corriger » de toutes les semaines ; resoumis, il en sort, même sans réseau | [D] 8 octobre 2026 | `R/test_resoumission.py::test_29a_le_rapport_a_corriger_suit_le_delegue_d_une_semaine_a_l_autre` ; `MP` « RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste » ; hors connexion, en partie (écart 4) |
| §14.47, 31.A | Quand le DM rouvre, le superviseur est prévenu | [D] 8 octobre 2026 | `R/test_reouverture.py::test_31a_quand_le_dm_rouvre_le_superviseur_est_prevenu` |
| §14.47, 32.A | La journée rouverte revient dans « À traiter », classement figé | [D] 8 octobre 2026 | `R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` ; `R/test_recette_06.py::test_32a_rouvert_au_dela_de_4_semaines_la_journee_revient_dans_la_file` ; libellés : `PC` « 32.A : « Classement figé » », `PJR` « RPT-016 : la version resoumise après une réouverture le dit et rappelle le motif » |
| §14.48, 34.A | Alerte au superviseur 48 h après la visite, une par délégué et par jour | [D] 8 octobre 2026 | `R/test_retards.py::test_34a_l_alerte_part_48_h_apres_la_visite_une_seule_fois` ; `::test_34a_les_visites_d_un_meme_jour_font_une_seule_alerte` |
| §14.48, 35.A | Onglet « Retards » dans « À traiter » | [D] 8 octobre 2026 | `PAT` « RPT-017, 35.A : l’onglet « Retards » liste les rapports non soumis et les journées anciennes » |
| §14.49, 37.A | Rappel au délégué à 18 h le jour de la visite | [D] 8 octobre 2026 | `R/test_notifications_rapports.py::test_37a_rappel_a_18_h_le_jour_de_la_visite` |
| §14.49, 38.A | Une notification d'escalade par journée au DM | [D] 8 octobre 2026 | `R/test_notifications_rapports.py::test_38a_le_dm_est_prevenu_une_fois_par_journee_escaladee` |
| §14.45, DC-60 | Pas d'échéance sur une demande de correction | [D] 7 octobre 2026 | `R/test_retards.py::test_rpt017_soumis_ou_renvoye_n_est_pas_en_retard` |
| §14.38 | Seule la première soumission peut être en retard | [H] | `R/test_recette_06.py::test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige` (après une correction) ; téléphone : voir RG-032 |
| §14.48 | La liste des retards remonte sur 13 semaines | [H] | Sans test (`SEMAINES_RETARDS` dans `B/rapports/retards.py`) |
| §14.48 | Seules les visites des 7 derniers jours déclenchent une alerte | [H] | `R/test_retards.py::test_34a_pas_d_alerte_au_dela_de_7_jours` |
| §14.49 | L'escalade n'est notifiée que pour les journées des 7 derniers jours | [H] | `R/test_notifications_rapports.py::test_38a_pas_d_escalade_notifiee_pour_une_journee_de_plus_de_7_jours` |

Les numéros 27.A, 30.A, 33.A et 36.A désignent des choix de la version suivante (feuille de route), pas des règles produit : ils n'ont pas de ligne dans cette recette.

## Contrôles transverses du cycle 0.6

- Isolation : toutes les routes du cycle passent par le périmètre (`B/perimetre/tests/test_couverture_routes.py::test_toute_route_metier_herite_de_vue_perimetre`, `::test_chaque_vue_metier_declare_ses_actions`). Celles qui ouvrent un objet par son identifiant (`rapport-piece-lue`, `rapport-valider`, `rapport-correction`, `rapport-rouvrir`) sont essayées depuis un autre pays (`B/perimetre/tests/test_isolation_routes.py::test_aucune_route_n_ouvre_un_objet_d_un_autre_pays`). Celles qui reçoivent le délégué en paramètre (`rapports-journee`, `journee-valider`, `lot-valider`, `rapports-retards`) n'entrent pas dans ce test générique : un autre superviseur du même pays est refusé (`R/test_journee.py::test_hors_supervision_la_journee_n_existe_pas`), un délégué d'un autre pays n'est pas essayé.
- Droits : `rapports.valider` suit la matrice du PRD, rôle par rôle (`B/perimetre/tests/test_matrice.py::test_la_matrice_suit_le_prd`, `::test_chaque_role_chaque_action`).
- Journal d'audit : demande de correction (`R/test_correction.py::test_rpt014_la_correction_part_au_delegue`), réouverture avec son motif (`R/test_reouverture.py::test_rpt016_ca2_auditee_et_notifiee`), validation unitaire (`R/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode`), validation par lot avec son auteur et son mode (`R/test_recette_06.py::test_rg034_validations_par_journee_et_par_lot_auditees_avec_auteur_et_mode`), parcours REC-08 (`R/test_recette_06.py::test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige`).
- Hors connexion : le rapport à corriger ou rouvert se reprend sur le téléphone (`MRA`, `MP`) ; la soumission hors connexion d'un rapport à corriger n'est pas suivie jusqu'à la liste (écart 4).
- Démonstration : `B/demonstration/tests/test_demonstration.py` ne vérifie ni la visite proposée (18.A, écart 1), ni rapport validé, à corriger, rouvert ou en retard.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Les 16 écarts relevés à la première passe de la recette ont reçu, pour onze d'entre eux, un test complet : 10 dans `R/test_recette_06.py`, et 1 au portail (« Soumis en retard » et les heures, dans `PJR`). Le test de l'étiquette « Escaladée » ajouté à `PAT` complète celui de 25.A, qui se trouve aussi dans `R/test_recette_06.py`. Ces critères figurent comme « Couvert » dans les tableaux ci-dessus. Il reste :

1. **18.A, démonstration** (Non couvert) — `B/demonstration/tests/test_demonstration.py::test_18a_la_visite_proposee_n_est_pas_replanifiee`. Après génération, le dernier rapport soumis a `visite_proposee`, son prospect n'a aucune visite la semaine suivante, et `rapports/visites-proposees/` le rend au délégué.
2. **RPT-012, superviseur-visiteur et propres journées** (Partiel) — la règle est prouvée pour la file des plannings (PLN-017), pas pour « À traiter ». Test à écrire : `R/test_a_traiter.py::test_rpt012_le_dm_voit_le_superviseur_visiteur_jamais_ses_journees`. Un superviseur occupe un poste rattaché au DM et y fait une visite effectuée ; le lendemain, le DM voit cette journée dans « À traiter », et le superviseur ne la voit pas dans sa propre file.
3. **Journée sans visite effectuée** (Non couvert) — `R/test_validation.py::test_rpt013_une_journee_sans_visite_effectuee_se_valide`. Une seule visite, restée prévue puis justifiée (ou annulée avec motif). Validée une fois par le lot, une fois d'un geste (`journee/valider/`), elle est figée et quitte « À traiter ».
4. **29.A, hors connexion** (Partiel) — le filtre de la liste est prouvé, pas la mise à jour hors connexion. Test à écrire : `MP` « 29.A : soumis sans réseau, le rapport sort aussitôt de « Rapports à corriger » ». Le programme gardé contient un rapport `a_corriger` ; sans réseau, le rapport est soumis (la soumission attend dans la file) ; sans recharger, « Rapports à corriger » disparaît de la Tournée.

Le critère NOT-003 CA1 reste « Partiel » jusqu'au push (cycle 0.8.5) ; ce n'est pas un écart du cycle.

Remarques :
- RG-032 : côté serveur, la resoumission « jamais en retard » est vérifiée après une correction (REC-08), pas après une réouverture (`R/test_reouverture.py::test_32a_la_journee_revient_puis_se_valide_a_nouveau` ne lit pas `en_retard`).
- RG-036 : l'ajout d'une pièce jointe à un rapport validé n'est pas essayé ; la modification du contenu l'est.
- REC-08 : la notification « n rapports validés » au délégué n'est pas vérifiée dans le parcours (elle l'est à part : `R/test_notifications_rapports.py::test_rapports_valides_regroupes_pour_le_delegue`).
- 37.A : le Sénégal et le Togo sont tous deux à UTC+0 ; « heure du pays » (NOT-006 CA1) n'est donc pas distinguée de l'UTC par `test_37a…`.
- Sans test dédié : l'ordre des délégués (« celui qui attend depuis le plus longtemps d'abord ») et l'intertitre par semaine de « À traiter » ; le nombre d'horodatages douteux dans la file ; « Rapport pas encore rédigé » et les activités de la journée à la consultation ; un rapport rouvert absent des retards ; le délégué choisi gardé dans l'adresse de « Retards » ; la fin de la journée comme repère des 48 h quand la visite n'a pas de fin.
- Le test `R/test_correction.py::test_rpt014_champs_inconnus_et_brouillon_refuses` vérifie un rapport déjà renvoyé, pas un brouillon : son nom est à corriger.
- Le libellé de la journée est « … renvoyé au délégué : la journée se validera… » depuis 0.6.6 (il couvre aussi les rapports rouverts) ; le PRD (§14.46) est aligné.

## Bilan

| Statut | Lignes |
|---|---|
| Couvert | 72 |
| Partiel | 3 |
| Non couvert | 2 |

Sur 77 lignes de critères (exigences RPT-012 à RPT-018 et leurs décisions, notifications, règles de gestion, critères repris des cycles précédents et REC-08), on compte 72 lignes couvertes. Les 3 lignes partielles sont NOT-003 CA1 (en attente du push, cycle 0.8.5) et les écarts 2 et 4 ; les 2 lignes non couvertes sont les écarts 1 et 3. Le tableau des décisions et hypothèses n'entre pas dans ce compte.

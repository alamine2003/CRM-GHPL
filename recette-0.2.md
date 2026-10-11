# Recette du cycle 0.2 — Planning

Version de clôture : **0.2.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.2.x` est relié au test automatisé qui le prouve. S'y ajoute ORG-007 CA1, reporté du cycle 0.0 à la soumission du planning. Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée n'est citée par aucun test.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (revue du superviseur, rapports de visite) et sera testé avec elle.
- **Non couvert** : aucun test ne prouve encore le critère, ou une partie livrée de ce critère. Chaque cas figure dans la section « Écarts ».

Abréviations : `B/` = `backend/apps/`, `T/` = `backend/apps/planning/tests/`, `P` = `portail/src/App.test.tsx`, `PP` = `portail/src/pages/Planning.test.tsx`, `M` = `mobile/__tests__/semaine.test.tsx`.

## Calendrier et semaine

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| ORG-012 | CA1 | Un jour férié est exclu des contrôles « semaine complète » et des seuils | `T/test_jours_feries.py::test_un_jour_ferie_sort_des_jours_comptes_de_la_semaine` ; `T/test_controles.py::test_un_jour_ferie_ou_une_journee_d_absence_sort_des_seuils` | Couvert |
| ORG-012 | CA2 | Une date variable se modifie jusqu'à la veille | `T/test_jours_feries.py::test_une_date_variable_se_modifie_jusqu_a_la_veille` ; `::test_seul_l_administrateur_pays_tient_le_calendrier` ; `P` « tient le calendrier des jours fériés : ajout, date variable, date acquise (ORG-012) » | Couvert |
| PLN-001 | CA1 | Un seul planning par délégué et par semaine (RG-012) | `T/test_planning.py::test_un_seul_planning_par_delegue_et_par_semaine` ; `::test_chacun_ne_voit_que_son_planning` ; `M` « PLN-001 CA1 : le délégué prépare sa semaine, une seule fois » | Couvert |
| PLN-001 | CA2 | Jours fériés affichés et non planifiables | `T/test_planning.py::test_la_semaine_montre_les_jours_ouvres_et_les_jours_feries` ; `T/test_visites.py::test_une_visite_se_pose_sur_un_jour_ouvre_non_ferie_de_la_semaine` ; jour devenu férié après la pose : `T/test_stabilisation.py::test_pln001_ca2_une_visite_sur_un_jour_devenu_ferie_bloque_la_soumission` ; `M` « PLN-001 CA2 : la semaine affiche ses jours ouvrés et le jour férié, non planifiable » ; `PP` « une visite glissée sur un autre jour y est déplacée ; le jour férié la refuse » | Couvert |

## Visites, passages et absences

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-002 | CA1 | Visite incomplète refusée à la soumission, avec la liste des champs manquants | `T/test_visites.py::test_ca1_une_visite_incomplete_est_refusee_a_la_soumission` (par la route de soumission, depuis 0.2.9) ; `T/test_soumission.py::test_un_planning_vide_ou_bloque_n_est_pas_soumis` ; `M` « PLN-002 CA1 : une visite incomplète montre ce qui reste à compléter » | Couvert |
| PLN-003 | CA1 | Un passage affiche « Établissement · n prescripteurs » | `T/test_passages_activites.py::test_pln003_ca1_ca2_un_passage_regroupe_les_visites_d_un_lieu` ; `M` « PLN-003 CA1 : un passage s'affiche « Établissement · n prescripteurs » » | Couvert |
| PLN-003 | CA2 | Chaque visite du passage garde son prospect | `T/test_passages_activites.py::test_pln003_ca1_ca2_un_passage_regroupe_les_visites_d_un_lieu` ; `::test_dissocier_un_passage` | Couvert |
| PLN-003 | CA2 | … et son rapport | — | Partiel (cycle 0.5 : rapports de visite) |
| PLN-009 | CA1 | Une demi-journée d'absence réduit de moitié les seuils du jour | `T/test_passages_activites.py::test_pln009_ca1_une_demi_journee_reduit_de_moitie_les_seuils` ; `T/test_controles.py::test_ca2_les_seuils_du_jour_sont_signales_au_prorata_des_absences` ; `M` « PLN-009 : le délégué déclare une demi-journée de formation » | Couvert |
| PLN-009 | CA2 | L'absence part et se fige avec le planning | `T/test_soumission.py::test_une_semaine_toute_d_absence_se_soumet_sans_visite` ; `T/test_passages_activites.py::test_un_planning_soumis_ne_change_plus` | Couvert |
| PLN-009 | CA2 | … et elle est validée par le superviseur | — | Partiel (cycle 0.3 : validation des plannings) |

## Contrôles, préparation et vues

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-004 | CA1 | Deux visites à la même heure refusées | `T/test_controles.py::test_ca1_deux_visites_a_la_meme_heure_sont_bloquantes` (par la route de soumission, depuis 0.2.9 ; un passage partage son heure sans conflit) ; `M` « PLN-004 CA1 : deux visites à la même heure sont à corriger avant de soumettre », « PLN-004 CA1 : un point bloquant remplace le bouton de soumission » ; `PP` « PLN-008 : la soumission attend la correction des points bloquants » | Couvert |
| PLN-004 | CA2 | Un seuil dépassé n'empêche pas la soumission | `T/test_controles.py::test_ca2_les_seuils_du_jour_sont_signales_au_prorata_des_absences` (soumission acceptée, depuis 0.2.9) ; `M` « PLN-004 CA2 : les signalements sont dits, sans rien bloquer » | Couvert |
| PLN-004 | CA2 | … mais apparaît au superviseur | Le signalement reste calculé sur le planning soumis (`T/test_controles.py::test_ca2_…`, `T/test_soumission.py::test_ca1_apres_l_echeance_…`) | Partiel (cycle 0.3 : écran de revue du superviseur) |
| PLN-005 | CA1 | Un glisser-déposer crée une visite pré-remplie (prospect, établissement principal) | `T/test_copie_reprise.py::test_ca1_poser_depuis_la_liste_cible_preremplit_le_lieu_principal` ; `::test_poser_refuse_une_fiche_d_un_autre_pays` ; `PP` « PLN-005 CA1 : un prospect glissé sur un jour devient une visite », « au clavier, « Poser » propose les jours planifiables » ; `M` « PLN-005 CA1 : des prospects de la liste cible se posent sur un jour » | Couvert |
| PLN-005 | CA2 | Copier la semaine précédente | `T/test_copie_reprise.py::test_ca2_reprendre_la_semaine_precedente` ; `::test_sans_semaine_precedente_rien_a_reprendre` ; `M` « PLN-005 CA2 : une semaine vide reprend la précédente » | Couvert |
| PLN-005 | — | Déplacer, copier, supprimer avant soumission | `T/test_visites.py::test_modifier_et_retirer_tant_que_le_planning_se_prepare` ; `T/test_copie_reprise.py::test_copier_une_visite_sur_un_autre_jour` ; `M` « PLN-005 : une visite se copie sur un autre jour », « PLN-002 : une visite se retire tant que le planning est en préparation » ; `PP` « une visite glissée sur un autre jour y est déplacée… » | Couvert |
| PLN-006 | CA1 | La vue semaine affiche le nombre de visites par jour et le statut du planning | `PP` « CA1 : chaque jour montre son nombre de visites ; le statut et les kilomètres sont dits » ; `M` « PLN-006 : la vue jour suit l'itinéraire, arrêt par arrêt », « PLN-006 : le détail d'une visite mène à ses fiches et à sa modification », « PLN-006 : un planning soumis s'ouvre en détail, pas en saisie » | Couvert |
| PLN-010 | CA1 | Kilométrage calculé à partir des coordonnées, à vol d'oiseau | `T/test_kilometrage.py::test_la_distance_a_vol_d_oiseau` ; `::test_ca1_le_kilometrage_suit_l_ordre_de_la_journee` ; `::test_un_passage_compte_pour_un_seul_arret` | Couvert |
| PLN-010 | CA2 | Aucun montant affiché | `T/test_kilometrage.py::test_ca2_la_semaine_donne_des_kilometres_jamais_un_montant` ; `M` « PLN-010 : la semaine donne ses kilomètres estimés, sans montant » | Couvert |

## Brouillons et soumission

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-007 | CA1 | Fermer l'application en cours de saisie ne perd aucune visite | `M` « PLN-007 CA1 : la saisie en cours est gardée sur le téléphone », « PLN-007 CA1 : une saisie interrompue se retrouve à la réouverture », « PLN-007 : sans réseau, la visite attend sur le téléphone puis part une seule fois » ; `T/test_passages_activites.py::test_une_visite_renvoyee_avec_son_identifiant_n_est_creee_qu_une_fois`, `::test_une_absence_renvoyee_n_est_declaree_qu_une_fois`, `::test_un_identifiant_deja_pris_ailleurs_est_refuse` ; file d'attente : `mobile/__tests__/attente.test.ts` (envoi ajouté pendant un rejeu, deux rejeux simultanés, refus et panne) ; `M` « PLN-007 : la saisie d'une visite retirée depuis ne se reprend pas », « PLN-007 : sans réseau, la journée et le détail restent lisibles » | Couvert (synchronisation complète : cycle 0.8) |
| PLN-008 | CA1 | Après jeudi 18 h (heure du pays), soumission acceptée et marquée « en retard » | `T/test_soumission.py::test_l_echeance_est_jeudi_18_h_de_la_semaine_precedente` ; `::test_ca1_apres_l_echeance_la_soumission_est_acceptee_et_marquee_en_retard` ; `::test_ca1_soumis_a_temps_puis_plus_modifiable` ; `::test_un_planning_approuve_ne_se_resoumet_pas_ici` ; `M` « PLN-008 CA1 : soumettre avant l'échéance, après confirmation », « RG-016 : après l'échéance, la soumission reste possible et se dit en retard » ; `PP` « PLN-008 CA1, RG-016 : après confirmation, le planning part, en retard si l'échéance est passée » | Couvert |
| ORG-007 | CA1 | Sans superviseur actif, pas de soumission (message explicite) | `T/test_soumission.py::test_org007_ca1_sans_superviseur_pas_de_soumission` ; `M` « ORG-007 CA1 : le refus du serveur se lit sur la carte de soumission » | Couvert (reporté du cycle 0.0) |

## Contrôles transverses du cycle 0.2

- Isolation : les routes du cycle (semaine, plannings, visites, ordre, passages, absences, poser, reprendre, copier, soumettre, jours fériés) passent par `B/perimetre/tests/test_couverture_routes.py`, `B/perimetre/tests/test_isolation_routes.py` et la matrice `B/perimetre/tests/test_matrice.py` ; un délégué ne touche pas au planning d'un autre (`T/test_visites.py::test_personne_d_autre_ne_touche_aux_visites_du_delegue`, `T/test_passages_activites.py::test_un_autre_delegue_ne_touche_ni_passage_ni_absence`).
- Sécurité au niveau des lignes : `B/perimetre/tests/test_securite_lignes.py::test_toute_table_rattachee_a_un_pays_est_protegee` couvre plannings, visites, passages, absences et jours fériés.
- Robustesse (0.2.9) : statut relu sous verrou, version et journal des changements gardés par l'ordre et les passages, modifications auditées, lieu « à valider » d'un autre écarté, fuseau du pays (`T/test_stabilisation.py`).
- États : les transitions du planning suivent le PRD et le miroir TypeScript est à jour (`T/test_etats.py`).
- Accessibilité : analyse axe-core de la page Jours fériés (`P`) et, depuis 0.2.9, de la page Planning et du dialogue de soumission (`PP` « accessibilité : la semaine en préparation et la confirmation de soumission »).
- Démonstration : `B/demonstration/tests/test_demonstration.py::test_la_demonstration_se_reinitialise_par_une_commande` vérifie la semaine en préparation (visites, passage, absence) et, depuis 0.2.9, la semaine précédente soumise.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Aucun critère « Non couvert ». Les critères « Partiel » attendent la validation des plannings (cycle 0.3) et les rapports de visite (cycle 0.5), et seront testés avec eux.

Trous comblés pendant la recette (0.2.9) :
- PLN-002 CA1 : le refus de soumission ne donnait que le code et la date de chaque point ; il donne désormais les champs manquants (et la fiche, l'heure en cause pour les autres points). L'ancienne garde `exiger_complet`, que la soumission n'appelait pas, est retirée.
- PLN-004 CA1 et CA2 : prouvés par la route de soumission, plus seulement par le calcul des contrôles.
- Accessibilité de la page Planning.
- Revue du code du cycle (0.2.9) : défauts corrigés et testés, voir `CHANGELOG.md` (0.2.9).

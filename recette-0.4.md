# Recette du cycle 0.4 — Exécution des visites

Version de clôture : **0.4.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.4.x` (VIS-001 à VIS-010) est relié au test automatisé qui le prouve. S'y ajoutent les règles de gestion du cycle (RG-026 à RG-029, RG-031), la recette REC-11, les décisions et hypothèses prises pendant le cycle (prd.md §14.22 à §14.30) et le critère que le cycle 0.3 avait laissé « Partiel » en attendant le programme du jour (PLN-015 CA2). Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée (version du PRD inférieure ou égale à `VERSION`) n'est citée par aucun test du serveur, du portail, du mobile ou des paquets.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (rapports de visite, validation des journées) et sera testé avec elle.
- **Non couvert** : aucun test ne prouve encore le critère, ou une partie livrée de ce critère. Chaque cas figure dans la section « Écarts ».

Abréviations : `B/` = `backend/apps/`, `T/` = `backend/apps/planning/tests/`, `PC` = `portail/src/pages/ConsultationPlanning.test.tsx`, `PA` = `portail/src/App.test.tsx`, `MP` = `mobile/__tests__/programme.test.tsx`, `MD` = `mobile/__tests__/detailVisite.test.tsx`, `MS` = `mobile/__tests__/demarrage.test.tsx` (démarrer et terminer), `MAB` = `mobile/__tests__/absent.test.tsx`, `ME` = `mobile/__tests__/ecarts.test.tsx` (annuler, non réalisée), `MR` = `mobile/__tests__/report.test.tsx`, `MI` = `mobile/__tests__/imprevue.test.tsx`.

## Programme du jour et détail d'une visite (0.4.1, 0.4.2)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-001 | — | Programme du jour ordonné des visites approuvées, la prochaine visite en tête, puis le reste de la semaine jour par jour ; chacun ne voit que le sien | `T/test_programme.py::test_vis001_le_programme_du_jour_est_ordonne_avec_la_prochaine_en_tete` ; `::test_un_jour_sans_visite_a_faire_n_a_pas_de_prochaine` ; `::test_chacun_ne_voit_que_son_programme` ; `MP` « VIS-001 : le programme du jour, la prochaine visite en tête, puis la semaine », « toutes les visites du jour faites : plus de prochaine » | Couvert |
| VIS-001 | — | Le programme suit la version approuvée (RG-018) : une modification qui attend la décision n'y entre pas, la visite touchée reste à sa place, « Modification en attente » ; sans version approuvée, il le dit | `T/test_programme.py::test_le_programme_suit_la_version_approuvee` ; `::test_sans_version_approuvee_le_programme_le_dit` ; `::test_sans_planning_ni_poste` ; `MP` « sans version approuvée, le programme le dit » | Couvert |
| VIS-001 | CA1 | En mode avion, le programme du jour et de la semaine s'affiche (« Hors ligne : programme tel qu'au … ») | `MP` « VIS-001 CA1 : en mode avion, le dernier programme lu s’affiche » ; le programme est gardé sur le téléphone : `MP` « VIS-001 : le programme du jour, la prochaine visite en tête, puis la semaine » ; le détail aussi : `MD` « VIS-002 : sans réseau, le détail gardé s’affiche » | Couvert |
| §17.1 | — | Le premier jour de sa semaine, un planning approuvé passe « en cours » ; la semaine finie, « terminé » (tâche périodique, journal d'audit) | `T/test_programme.py::test_approuve_en_cours_le_premier_jour_puis_termine` ; `::test_une_semaine_passee_approuvee_finit_terminee_en_une_passe` | Couvert |
| VIS-002 | — | Détail d'une visite : prospect, lieu, objectif, coordonnées, trois dernières visites du délégué chez ce prospect, de la plus récente | `T/test_detail_visite.py::test_vis002_le_detail_dit_le_prospect_le_lieu_et_les_coordonnees` ; `::test_vis002_les_trois_dernieres_visites_de_la_plus_recente` ; `MD` « VIS-002 : coordonnées et trois dernières visites, de la plus récente » | Couvert |
| VIS-002 | CA1 | L'historique ne montre que les visites du délégué, dans des plannings validés ; un collègue ne lit pas la visite | `T/test_detail_visite.py::test_vis002_ca1_l_historique_ne_montre_que_les_visites_du_delegue` ; `::test_un_planning_non_approuve_n_entre_pas_dans_l_historique` | Couvert |
| VIS-002 | — | Hors connexion, le détail s'affiche tel qu'au dernier passage | `MD` « VIS-002 : sans réseau, le détail gardé s’affiche » | Couvert |

## Démarrer et terminer une visite (0.4.3, 0.4.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-003 | — | Démarrer : `en_cours`, heure réelle, position si le pays l'active ; seule une visite approuvée du jour se démarre, une fois ; inscrit au journal ; personne d'autre ne la démarre | `T/test_demarrage.py::test_vis003_la_visite_demarre_a_l_heure_reelle_avec_sa_position` ; `::test_seule_une_visite_approuvee_du_jour_se_demarre` ; `::test_le_programme_dit_la_visite_en_cours_et_la_geolocalisation` ; `::test_un_collegue_ne_demarre_pas_la_visite_d_un_autre` ; `MS` « VIS-003 : la visite démarre à l’heure réelle, avec sa position et la distance au lieu », « un refus du serveur se dit et rien ne part dans la file » | Couvert |
| VIS-003 | CA1 | La position est capturée hors connexion ; l'envoi part au retour du réseau, rejoué sans effet, avec l'heure réelle du téléphone | `T/test_demarrage.py::test_vis003_ca1_demarree_hors_connexion_l_envoi_arrive_plus_tard` ; `MS` « VIS-003 CA1 : sans réseau, la position est prise et l’envoi attend dans la file » | Couvert |
| VIS-003 | CA2 | Sans GPS disponible, la visite démarre quand même et est marquée « sans GPS » | `T/test_demarrage.py::test_vis003_ca2_sans_gps_la_visite_demarre_et_est_marquee` ; `MS` « VIS-003 CA2 : sans GPS, la visite démarre quand même, « sans GPS » » | Couvert |
| VIS-003 | CA3 | La distance à l'établissement est affichée (« En cours depuis 09:02 · À 110 m du lieu ») et gardée par le serveur | `T/test_demarrage.py::test_vis003_la_visite_demarre_a_l_heure_reelle_avec_sa_position` (`distance_debut_m`) ; `MS` « VIS-003 : la visite démarre à l’heure réelle, avec sa position et la distance au lieu », « la distance se calcule comme sur le serveur (haversine) » | Couvert |
| VIS-004 | — | Terminer : `effectuee`, heure réelle de fin, position ; la visite laisse la place à la suivante et se lit dans l'historique | `T/test_fin_visite.py::test_vis004_la_visite_est_effectuee_a_l_heure_reelle_avec_sa_position` ; `::test_seule_une_visite_en_cours_se_termine` ; `::test_effectuee_elle_n_est_plus_la_prochaine_et_se_lit_dans_l_historique` ; `MS` « VIS-004 : la visite en cours se termine, effectuée, avec sa durée » | Couvert |
| VIS-004 | CA1 | L'heure de fin est postérieure à l'heure de début (`fin_avant_debut`) ; une heure future est refusée | `T/test_fin_visite.py::test_vis004_ca1_la_fin_suit_le_debut` | Couvert |
| VIS-004 | — | Terminée sans réseau, la fin attend derrière le démarrage et les deux partent dans l'ordre | `T/test_fin_visite.py::test_vis004_terminee_hors_connexion_l_envoi_arrive_plus_tard` ; `MS` « VIS-004 : démarrée puis terminée sans réseau, les deux envois attendent dans l’ordre » | Couvert |
| VIS-004 | — | La fin de la visite ouvre son rapport | — | Partiel (cycle 0.5 : rapports de visite) |

## Écarts de visite : absent, annulée, non réalisée, reportée (0.4.5 à 0.4.7)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-005 | — | « Prospect absent » avec motif, sur une visite prévue du jour ou en cours ; le programme annonce l'absence et passe à la suivante | `T/test_prospect_absent.py::test_vis005_le_prospect_absent_se_declare_avec_son_motif` ; `::test_vis005_une_visite_en_cours_peut_finir_prospect_absent` ; `::test_le_programme_donne_les_motifs_et_passe_a_la_suivante` ; `::test_une_visite_prevue_ne_se_declare_que_le_jour_prevu` ; `MAB` « VIS-005 : avec un motif, la visite passe « prospect absent » et le programme l’annonce », « VIS-005 : une visite en cours peut aussi finir « prospect absent » » | Couvert |
| VIS-005 | CA1 | Impossible sans motif (bouton inactif, `motif_requis`) ; un motif archivé ou d'une autre liste est refusé | `T/test_prospect_absent.py::test_vis005_ca1_impossible_sans_motif` ; `MAB` « VIS-005 CA1 : sans motif, l’absence ne se confirme pas » | Couvert |
| VIS-005 | — | Sans réseau, la déclaration attend dans la file ; rejouée, sans effet | `T/test_prospect_absent.py::test_vis005_declare_sans_reseau_rejoue_sans_effet` ; `MAB` « VIS-005 : sans réseau, la déclaration attend dans la file et la visite change déjà » | Couvert |
| VIS-006 | — | « Annulée » avec motif, le jour même, à l'avance ou en cours ; une journée passée ne s'annule plus (`journee_passee`) | `T/test_annulation_non_realisation.py::test_vis006_une_visite_s_annule_a_l_avance_avec_son_motif` ; `::test_vis006_une_visite_en_cours_s_annule` ; `::test_vis006_une_journee_passee_ne_s_annule_plus` ; `ME` « VIS-006 : une visite d’un autre jour ne se démarre pas mais s’annule à l’avance » | Couvert |
| VIS-006 | CA1 | Impossible sans motif | `T/test_annulation_non_realisation.py::test_vis006_ca1_impossible_sans_motif` ; `ME` « VIS-006 : la visite s’annule avec son motif ; sans motif, impossible (CA1) » | Couvert |
| VIS-009 | — | « Non réalisée » avec motif pour une visite prévue non faite ; pas avant la fin de la journée (`journee_pas_finie`), ni pour une visite en cours ; sans réseau, attend dans la file | `T/test_annulation_non_realisation.py::test_vis009_justifiee_non_realisee_elle_quitte_la_liste` ; `::test_vis009_ca1_sans_motif_impossible` ; `::test_vis009_une_journee_pas_finie_ne_se_dit_pas_non_realisee` ; `::test_vis009_une_visite_en_cours_ne_se_dit_pas_non_realisee` ; `ME` « VIS-009 : sans réseau, la non-réalisation attend dans la file » | Couvert |
| VIS-009 | CA1 | Une visite encore `prevue` après la fin de sa journée apparaît « à justifier » au délégué, même pendant une modification soumise | `T/test_annulation_non_realisation.py::test_vis009_ca1_la_visite_restee_prevue_est_a_justifier` ; `T/test_report.py::test_vis007_une_modification_soumise_garde_les_visites_a_justifier` ; `ME` « VIS-009 CA1 : restée prévue après sa journée, la visite est « à justifier » » | Couvert |
| VIS-007 | — | « Reportée » avec motif, vers un jour après le jour prévu (`report_avant`) ; une visite en cours ne se reporte pas ; rien ne part sans motif ni jour | `T/test_report.py::test_vis007_impossible_sans_motif` ; `::test_vis007_le_nouveau_jour_suit_le_jour_prevu` ; `::test_vis007_une_visite_en_cours_ne_se_reporte_pas` ; `MR` « VIS-007 : reportée à un nouveau jour, avec son motif ; la semaine approuvée attend le superviseur », « VIS-007 : une heure mal écrite ne part pas » | Couvert |
| VIS-007 | CA1 | La nouvelle visite reprend prospect, lieu, réseau et objectif et référence la visite d'origine (`reportee_de`) ; la reportée dit son nouveau jour | `T/test_report.py::test_vis007_ca1_la_nouvelle_visite_reference_l_originale` ; `MR` « VIS-007 CA1 : la visite reportée dit son motif et son nouveau jour » | Couvert |
| VIS-007 | CA2 | Dans une semaine déjà approuvée, même commencée, c'est une modification majeure : version soumise, la nouvelle visite n'entre au programme qu'une fois approuvée ; dans une semaine en préparation, elle s'ajoute au planning | `T/test_report.py::test_vis007_ca2_dans_la_semaine_approuvee_c_est_une_modification_majeure` ; `::test_vis007_dans_une_semaine_a_preparer_elle_s_ajoute_au_planning` ; `MR` « VIS-007 : reportée à un nouveau jour, avec son motif ; la semaine approuvée attend le superviseur » (« Le nouveau jour attend l'accord de votre superviseur. ») | Couvert |
| VIS-007 | CA2 | … le superviseur trouve cette modification dans sa file « Plannings à valider » et l'approuve, la semaine commencée comprise (§14.28 [H]) ; approuvée, la nouvelle visite entre au programme | `T/test_report.py::test_vis007_ca2_le_superviseur_trouve_et_approuve_le_report_de_la_semaine` | Couvert |
| VIS-007 | — | Sans réseau, le report attend dans la file avec l'identifiant de la nouvelle visite ; rejoué, il ne crée rien de plus | `T/test_report.py::test_vis007_rejoue_depuis_la_file_sans_doublon` ; `MR` « VIS-007 : sans réseau, le report attend dans la file avec son nouveau jour » | Couvert |

## Visite imprévue (0.4.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-008 | — | Visite imprévue justifiée, rattachée au jour réel, démarrée aussitôt avec l'heure et la position ; sans approbation, hors des versions, des contrôles du planning et du kilométrage ; elle se termine comme les autres | `T/test_imprevue.py::test_vis008_la_visite_imprevue_demarre_au_jour_reel_sans_approbation` ; `::test_l_imprevue_n_entre_dans_aucune_version_ni_controle` ; `MI` « VIS-008 : justifiée, elle démarre, passe en tête et se lit « Imprévue » (CA2) » | Couvert |
| VIS-008 | CA1 | Impossible sans justification (`justification_requise`) | `T/test_imprevue.py::test_vis008_ca1_impossible_sans_justification` ; `MI` « VIS-008 CA1 : sans justification, la visite imprévue ne démarre pas » | Couvert |
| VIS-008 | CA2 | Marquée « imprévue » sur le programme du jour du téléphone, en tête quand elle est la dernière démarrée, et dans la conformité vue par le superviseur | `T/test_imprevue.py::test_vis008_ca2_imprevue_dans_le_programme_et_la_semaine` ; `MI` « VIS-008 : justifiée, elle démarre, passe en tête et se lit « Imprévue » (CA2) », « VIS-008 : sans réseau, la visite imprévue attend dans la file et apparaît déjà » ; `PC` « chaque journée dit « conforme » ou « à vérifier », écart par écart » (« visite imprévue, « Croisé en ville » ») | Couvert |
| VIS-008 | CA2 | … sur la semaine et le détail du téléphone (avec la justification), et sur la semaine du planning au portail, où elle ne compte pas parmi les visites planifiées | Téléphone : `mobile/__tests__/semaine.test.tsx` « VIS-008 CA2 : la visite imprévue se lit « Imprévue » dans la semaine et le détail » ; portail : `PC` « la journée du jour sans écart reste « en cours » ; l’imprévue est marquée et hors compte » (la justification au survol n'est pas vérifiée) | Couvert |
| VIS-008 | — | Sans réseau, elle démarre avec un identifiant donné par le téléphone ; rejouée, elle n'est créée qu'une fois | `T/test_imprevue.py::test_vis008_rejoue_sans_doublon` ; `MI` « VIS-008 : sans réseau, la visite imprévue attend dans la file et apparaît déjà » | Couvert |

## Contrôles de conformité (0.4.9)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-010 | CA1 | Une journée sans aucun écart est `conforme` | `T/test_conformite.py::test_vis010_ca1_une_journee_sans_ecart_est_conforme` ; `PC` « chaque journée dit « conforme » ou « à vérifier », écart par écart » | Couvert |
| VIS-010 | CA1 | … la journée du jour, sans écart, se lit « Journée en cours : aucun écart pour l'instant » tant qu'elle n'est pas finie (champ `terminee`) | `T/test_conformite.py::test_vis010_ca1_la_journee_du_jour_n_est_pas_terminee` ; `PC` « la journée du jour sans écart reste « en cours » ; l’imprévue est marquée et hors compte » | Couvert |
| VIS-010 | — | Chaque écart est relevé, visite par visite : hors plage, distance, durée trop courte ou trop longue, imprévue, restée prévue (à justifier) ; pour la journée, sans GPS au-delà de la tolérance | `T/test_conformite.py::test_vis010_chaque_ecart_est_releve` ; `::test_vis010_une_visite_imprevue_est_a_verifier` ; `::test_vis010_une_visite_restee_prevue_est_a_justifier` ; `::test_vis010_sans_gps_au_dela_de_la_tolerance` | Couvert |
| VIS-010 | — | Calculés par le serveur à la réception de chaque action du téléphone, et relus à chaque consultation | `T/test_conformite.py::test_vis010_calculee_a_la_reception` ; `::test_vis010_ca2_les_seuils_viennent_du_pays` (relecture par la consultation) | Couvert |
| VIS-010 | — | Le superviseur lit, sur le planning consulté, la carte « Conformité des journées » : résumé, « Conforme » ou « À vérifier · n écarts », chaque écart en clair | `PC` « chaque journée dit « conforme » ou « à vérifier », écart par écart » ; le serveur la renvoie dans la consultation : `T/test_conformite.py::test_vis010_chaque_ecart_est_releve` | Couvert |
| VIS-010 | CA2 | Les seuils viennent des paramètres du pays, modifiables dans « Paramètres » | `T/test_conformite.py::test_vis010_ca2_les_seuils_viennent_du_pays` (distance de pointage) ; `::test_vis010_sans_gps_au_dela_de_la_tolerance` (visites sans GPS tolérées) ; `PA` « modifie un paramètre du pays (ORG-011) » (distance de pointage) | Couvert |
| VIS-010 | CA3 | Le résultat est recalculé si les paramètres changent avant validation | `T/test_conformite.py::test_vis010_ca2_les_seuils_viennent_du_pays` ; `::test_vis010_sans_gps_au_dela_de_la_tolerance` | Couvert |
| VIS-010 | CA3 | … jamais après : une journée validée est figée avec ses seuils | La règle : `T/test_conformite.py::test_vis010_ca3_figee_a_la_validation_elle_ne_change_plus` (`conformite.figer`) ; la validation des journées qui l'appellera, et « Validée : figée » au portail, n'existent pas encore | Partiel (cycle 0.6 : validation des journées et des rapports, RPT-012, RPT-013) |

## Règles de gestion et recette du cycle

| Règle | Énoncé | Test(s) | Statut |
|---|---|---|---|
| RG-026 | Une visite reportée crée une nouvelle occurrence liée à la visite d'origine | Voir VIS-007 CA1 : `T/test_report.py::test_vis007_ca1_la_nouvelle_visite_reference_l_originale` ; une seule, même rejouée : `::test_vis007_rejoue_depuis_la_file_sans_doublon` | Couvert |
| RG-027 | Une visite imprévue est justifiée et rattachée au jour réel de réalisation | Voir VIS-008 : `T/test_imprevue.py::test_vis008_la_visite_imprevue_demarre_au_jour_reel_sans_approbation` ; `::test_vis008_ca1_impossible_sans_justification` | Couvert |
| RG-028 | Positions capturées au démarrage et à la fin seulement, et seulement si le pays active la géolocalisation | `T/test_demarrage.py::test_rg028_un_pays_sans_geolocalisation_ne_garde_aucune_position` ; `T/test_fin_visite.py::test_rg028_sans_geolocalisation_aucune_position_a_la_fin` ; `T/test_demarrage.py::test_le_programme_dit_la_visite_en_cours_et_la_geolocalisation` | Couvert |
| RG-028 | … le délégué en est informé à l'installation | — | Non couvert |
| RG-029 | Les contrôles de conformité ne bloquent pas la saisie ; ils classent la journée `conforme` ou `a_verifier` | Un démarrage hors plage est accepté et classe la journée : `T/test_conformite.py::test_vis010_calculee_a_la_reception` ; des visites trop tôt, trop loin, trop courtes ou trop longues sont enregistrées puis classées : `::test_vis010_chaque_ecart_est_releve` | Couvert |
| RG-031 | Annulations, reports, absences du prospect et non-réalisations exigent un motif | `T/test_prospect_absent.py::test_vis005_ca1_impossible_sans_motif` ; `T/test_annulation_non_realisation.py::test_vis006_ca1_impossible_sans_motif` ; `::test_vis009_ca1_sans_motif_impossible` ; `T/test_report.py::test_vis007_impossible_sans_motif` ; au téléphone : `MAB` « VIS-005 CA1 : … », `ME` « VIS-006 : … sans motif, impossible (CA1) », `MR` « VIS-007 : reportée à un nouveau jour… » | Couvert |
| REC-11 | Une visite annulée, reportée, prospect absent ou non réalisée exige un motif ; le report crée une visite liée | Voir RG-031 et RG-026 | Couvert |

## Critère partiel du cycle 0.3, repris en 0.4

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PLN-015 | CA2 | Pendant la décision d'une modification, les autres visites restent au programme selon la version approuvée | `T/test_programme.py::test_le_programme_suit_la_version_approuvee` ; `T/test_report.py::test_vis007_ca2_dans_la_semaine_approuvee_c_est_une_modification_majeure` ; `::test_vis007_une_modification_soumise_garde_les_visites_a_justifier` | Couvert |
| PLN-015 | CA2 | … et restent exécutables pendant cette décision ; seule la visite qui attend ne se démarre pas | Une autre visite approuvée démarre pendant qu'un report attend la décision : `T/test_report.py::test_pln015_ca2_les_autres_visites_restent_executables` ; la visite qui attend ne se démarre pas : `T/test_demarrage.py::test_seule_une_visite_approuvee_du_jour_se_demarre` (`visite_non_approuvee`) | Couvert |

Les autres critères « Partiel » du cycle 0.3 (ORG-013 CA1 pour les rapports, PLN-003 CA2, rappels de NOT-006) attendent les rapports de visite (cycle 0.5) et la synchronisation avec le push (cycle 0.8).

## Décisions et hypothèses du cycle

| Réf. | Décision ou hypothèse | Nature | Preuve |
|---|---|---|---|
| §14.22 | La prochaine visite est la première non faite dans l'ordre de la journée, même si son heure est passée | [D] 6 octobre 2026 | Ordre et prochaine : `T/test_programme.py::test_vis001_le_programme_du_jour_est_ordonne_avec_la_prochaine_en_tete` (consulté avant l'heure de la première visite ; le cas « heure passée » n'a pas de test dédié) |
| §14.22 | Le programme vit sur le téléphone ; le portail garde la vue semaine | [D] 6 octobre 2026 | Choix d'écran, sans test |
| §14.23 | « Prévue » n'est pas affiché pour une visite passée ; seul un résultat se dit | [D] 6 octobre 2026 | Sans test dédié |
| §14.24 | Plusieurs visites peuvent être « en cours » en même temps (un passage) | [D] 6 octobre 2026 | Une imprévue démarre pendant qu'une visite prévue attend : `T/test_imprevue.py::test_vis008_ca2_imprevue_dans_le_programme_et_la_semaine` ; deux visites en cours à la fois : sans test dédié |
| §14.24 | Attente de la position : 1 minute, paramètre du pays `attente_gps_secondes` | [D] 6 octobre 2026 | `T/test_fin_visite.py::test_effectuee_elle_n_est_plus_la_prochaine_et_se_lit_dans_l_historique` (le programme dit 60 s) |
| §14.24 | Une visite démarrée sans réseau garde sa date et son heure réelles, même envoyée le lendemain | [D] 6 octobre 2026 | `T/test_demarrage.py::test_vis003_ca1_demarree_hors_connexion_l_envoi_arrive_plus_tard` |
| §14.27 | Annulation possible à l'avance sur toute la semaine approuvée | [H] | `T/test_annulation_non_realisation.py::test_vis006_une_visite_s_annule_a_l_avance_avec_son_motif` ; `ME` « VIS-006 : une visite d’un autre jour ne se démarre pas mais s’annule à l’avance » |
| §14.27 | « À justifier » limité à la semaine en cours et à la précédente | [H] | Sans test de la limite (une visite d'il y a deux semaines n'apparaît pas) |
| §14.28 | Un report dans la semaine commencée est permis malgré la fermeture du lundi 0 h ; la modification soumise n'est pas fermée et se décide normalement | [H] | `T/test_report.py::test_vis007_ca2_dans_la_semaine_approuvee_c_est_une_modification_majeure` (semaine commencée) ; `::test_vis007_ca2_le_superviseur_trouve_et_approuve_le_report_de_la_semaine` |
| §14.28 | Pendant qu'une modification attend la décision, un second report de la même semaine est refusé (`modification_en_attente`) | [H] | La règle générale : `T/test_modifications_approuve.py::test_le_retrait_attend_la_decision_et_la_suite_aussi` ; pas de test avec un second report |
| §14.29 | Une visite imprévue exige un planning approuvé pour la semaine (`semaine_non_approuvee`) | [H] | `T/test_imprevue.py::test_sans_planning_approuve_pas_de_visite_imprevue` |
| §14.29 | La visite en cours la plus récemment démarrée passe en tête du programme | — | `T/test_imprevue.py::test_vis008_ca2_imprevue_dans_le_programme_et_la_semaine` ; `MI` « VIS-008 : justifiée, elle démarre, passe en tête… » |
| §14.30 | La tolérance « sans GPS » s'entend par journée, au-delà de 3 visites | [H] | `T/test_conformite.py::test_vis010_sans_gps_au_dela_de_la_tolerance` |
| §14.30 | La durée anormale est en deçà de 3 minutes ou au-delà de 3 heures | [H] | `T/test_conformite.py::test_vis010_chaque_ecart_est_releve` (`duree_courte`, `duree_longue`) |
| §14.30 | Une visite restée prévue après sa journée compte comme écart | [H] | `T/test_conformite.py::test_vis010_une_visite_restee_prevue_est_a_justifier` |
| §14.30 | Une visite déclarée en écart sans avoir démarré (absent, annulée, reportée, non réalisée) n'a que son motif : pas d'écart de conformité | — | Sans test dédié (le cas est exclu dans `B/planning/conformite.py`) |

## Contrôles transverses du cycle 0.4

- Isolation : les routes du cycle (programme, détail, démarrer, terminer, absent, annuler, reporter, non réalisée, visite imprévue) passent par `B/perimetre/tests/test_couverture_routes.py` ; celles qui ouvrent une visite par son identifiant (`visite-detail`, `visite-demarrer`, `visite-terminer`, `visite-absent`, `visite-annuler`, `visite-reporter`, `visite-non-realisee`), par `B/perimetre/tests/test_isolation_routes.py`. Chacun ne lit que son programme et un collègue n'agit pas sur la visite d'un autre (`T/test_programme.py::test_chacun_ne_voit_que_son_programme`, `T/test_demarrage.py::test_un_collegue_ne_demarre_pas_la_visite_d_un_autre`, `T/test_detail_visite.py::test_vis002_ca1_l_historique_ne_montre_que_les_visites_du_delegue`).
- États : les transitions du planning, dont `en_cours` → `soumis` pour une modification, suivent le PRD et le miroir TypeScript est à jour (`T/test_etats.py`).
- Hors connexion : chaque action du téléphone (démarrer, terminer, absent, annuler, non réalisée, reporter, imprévue) attend dans la file sans réseau et, rejouée, ne s'applique qu'une fois (voir les lignes « sans réseau » ci-dessus).
- Journal d'audit : démarrage, report et visite imprévue sont inscrits (`T/test_demarrage.py::test_vis003_la_visite_demarre_a_l_heure_reelle_avec_sa_position`, `T/test_report.py::test_vis007_ca1_la_nouvelle_visite_reference_l_originale`, `T/test_imprevue.py::test_vis008_la_visite_imprevue_demarre_au_jour_reel_sans_approbation`).
- Démonstration : `B/demonstration/tests/test_demonstration.py::test_la_demonstration_se_reinitialise_par_une_commande` vérifie les deux semaines précédentes du premier délégué « terminées » avec leurs visites (historique, VIS-002) et sa semaine en cours « en cours ». Les journées exécutées (visites effectuées, prospects absents, visite annulée, visite restée prévue) ne sont pas vérifiées par ce test.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Critère « Non couvert » :

1. **RG-028 — information à l'installation.** Aucun écran ni test n'informe le délégué que sa position est prise au début et à la fin de chaque visite. Le seul texte, celui de l'autorisation de position (`mobile/app.config.ts`, `locationWhenInUsePermission`), dit seulement : « INNOV CRM enregistre la position d'un établissement quand vous le demandez. » Un texte validé reste à écrire, puis à tester.

Trous comblés pendant la recette (0.4.9) :
- VIS-007 CA2 : un report dans la semaine commencée fermait aussitôt la modification soumise (`services.est_ferme`). Elle n'entrait pas dans la file, et l'approbation était refusée (`semaine_fermee`). Corrigé : un planning qui a une version approuvée n'est plus fermé. Le superviseur trouve la modification dans sa file et l'approuve.
- PLN-015 CA2 : une autre visite approuvée se démarre pendant qu'un report attend la décision.
- VIS-008 CA2 : le repère « Imprévue » est testé sur la semaine et le détail du téléphone et sur la semaine du planning au portail, hors du compte des visites planifiées.
- VIS-010 CA1 : la journée du jour reste « en cours » (champ `terminee`), au serveur et au portail.
- Le libellé de l'écart « sans GPS » suit le nombre (« 1 visite sans GPS (tolérance : 0) »), testé au portail.

Critères « Partiel » : l'ouverture du rapport à la fin de la visite (VIS-004, cycle 0.5) et la conformité figée à la validation des journées (VIS-010 CA3, cycle 0.6). Ils seront testés avec ces fonctions.

Remarques :
- La carte « Conformité des journées » n'est visible que sur un planning ouvert depuis la file ou une notification. La semaine en cours d'un délégué, approuvée et sans modification, n'est dans aucune liste du superviseur : il ne voit sa conformité qu'en suivant un lien. La file de travail des journées arrive avec la validation des rapports (cycle 0.6, §14.30).

## Bilan

| Statut | Lignes |
|---|---|
| Couvert | 46 |
| Partiel (cycle futur) | 2 |
| Non couvert (écarts) | 1 |

Sur 49 lignes de critères (exigences, règles de gestion, REC-11 et le critère repris du cycle 0.3) : 46 couvertes, 2 partielles, 1 écart. Le tableau des décisions et hypothèses n'entre pas dans ce compte.

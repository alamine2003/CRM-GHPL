# Recette du cycle 0.5 — Rapports de visite

Version de clôture : **0.5.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.5.x` (RPT-001 à RPT-011 ; RPT-007 dans sa version modifiée, PDF seul, DC-48) est relié au test automatisé qui le prouve. S'y ajoutent les règles de gestion du cycle (RG-030, RG-032, RG-033, RG-037, RG-038), les sections de mise en œuvre (prd.md §14.31 à §14.39), les décisions de la relecture appliquées en 0.5.9 (§14.40 : DC-51, DC-55, DC-58, DC-59, DC-61, DC-62), l'engagement 5 de DC-47 (« Préparer ma visite », §14.35) et le critère que la recette 0.4 avait laissé « Partiel » en attendant les rapports (VIS-004, « La fin de la visite ouvre son rapport »). Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée (version du PRD inférieure ou égale à `VERSION`) n'est citée par aucun test du serveur, du portail, du mobile ou des paquets.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (lecture et validation des rapports par le superviseur, alerte à 48 h, corrections) et sera testé avec elle.
- **Non couvert** : aucun test ne prouve encore le critère, ou une partie livrée de ce critère. Chaque cas figure dans la section « Écarts ».

Abréviations : `B/` = `backend/apps/`, `R/` = `backend/apps/rapports/tests/`, `T/` = `backend/apps/planning/tests/`, `PCR` = `portail/src/composants/ChampsRapport.test.tsx`, `MRA` = `mobile/__tests__/rapport.test.tsx`, `MPJ` = `mobile/__tests__/pieces.test.tsx`, `MP` = `mobile/__tests__/programme.test.tsx`, `MD` = `mobile/__tests__/detailVisite.test.tsx`, `MF` = `mobile/__tests__/fiches.test.tsx`, `MSE` = `mobile/__tests__/semaine.test.tsx`, `MSS` = `mobile/__tests__/session.test.tsx`, `MS` = `mobile/__tests__/demarrage.test.tsx`.

## Rapport de visite : ouverture, socle et champs du pays (0.5.1)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-001 | — | Une visite effectuée a un seul rapport, ouvert en brouillon à la première lecture ; avant la fin de la visite, il ne s'ouvre pas (`visite_non_effectuee`) | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` ; `::test_pas_de_rapport_avant_la_fin_de_la_visite` | Couvert |
| RPT-001 | — | Sur le téléphone, la visite effectuée propose « Rédiger le rapport », « Reprendre le rapport » (brouillon) ou « Voir le rapport » (soumis), qui ouvre le rapport | `MRA` « RPT-001 : visite effectuée, rapport %s → « %s » » (trois cas : `attendu`, `brouillon`, `soumis`) | Couvert |
| RPT-001 | CA1 | Une visite effectuée sans rapport soumis est « rapport attendu » : le programme donne `rapport_statut` `attendu`, puis `soumis` une fois le rapport soumis | `R/test_rapport.py::test_rpt001_ca1_une_visite_effectuee_sans_rapport_est_attendue` ; `::test_rpt002_ca1_impossible_de_soumettre_sans_le_socle` (`soumis` au programme) | Couvert |
| RPT-001 | CA1 | … et le programme du jour l'écrit « Rapport à rédiger » ou « Rapport en brouillon » | `MP` « RPT-001 CA1 : sous une visite effectuée du jour, rapport %s → « %s » » (attendu, brouillon) ; « RPT-001 CA1 : soumis, le rapport ne s’affiche plus sous la visite effectuée » | Couvert |
| RPT-002 | — | Socle : produits présentés du portefeuille du réseau, touchés dans l'ordre (rang affiché), résultat de la liste « Résultats de visite », résumé, prochaine action | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` (produits et résultats proposés, manquants) ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« 1. Produit Beta », « 2. Produit Alpha ») | Couvert |
| RPT-002 | CA1 | Impossible de soumettre sans le socle et les champs obligatoires du pays : « Soumettre le rapport » ne part pas, l'écran dit ce qui manque, le serveur refuse (`rapport_incomplet`) | `R/test_rapport.py::test_rpt002_ca1_impossible_de_soumettre_sans_le_socle` ; `::test_rpt008_les_champs_du_pays_et_leur_caractere_obligatoire` ; `MRA` « RPT-002 CA1 : le calcul local des manquants suit le socle puis les champs du pays », « RPT-002 : incomplet, le rapport ne se soumet pas et dit ce qui manque » | Couvert |
| RPT-002 | — | Soumis, le rapport se lit sans se modifier (`rapport_non_modifiable`) ; la soumission est inscrite au journal | `R/test_rapport.py::test_rpt002_ca1_impossible_de_soumettre_sans_le_socle` ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« Soumettre le rapport » disparaît, le rapport se relit) | Couvert |
| RPT-008 | — | Champs du pays obligatoires ou facultatifs, valeur contrôlée selon le type (`champ_invalide`) ; une liste exige au moins deux choix ; gérés par l'administration du pays dans « Paramètres », jamais par le délégué ; « Retirer » | `R/test_rapport.py::test_rpt008_les_champs_du_pays_et_leur_caractere_obligatoire` ; `::test_rpt008_l_administrateur_pays_gere_les_champs` ; `PCR` « liste les champs du pays ; en lecture seule, sans bouton », « une liste exige au moins deux choix, puis le champ se crée », « retire un champ des prochains rapports » | Couvert |
| RPT-008 | CA1 | Un champ ajouté ne vaut que pour les rapports ouverts ensuite : le rapport garde les champs de son ouverture | `R/test_rapport.py::test_rpt008_ca1_un_champ_ajoute_ne_vaut_que_pour_les_nouveaux` | Couvert |

## Objectif prévu et résultat obtenu (0.5.2)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-003 | CA1 | L'objectif planifié s'affiche en tête du rapport ; relevé à l'ouverture, il ne change plus si la visite est modifiée | `R/test_objectif.py::test_rpt003_ca1_l_objectif_planifie_en_tete_du_rapport` ; `MRA` « RPT-003 CA1 : l’objectif prévu en tête du rapport » | Couvert |
| RPT-003 | — | Résultat obtenu : le choix de la liste et une précision facultative, gardée à la soumission | `R/test_objectif.py::test_rpt003_le_resultat_obtenu_se_saisit_et_se_soumet` ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« Objectif atteint », « Essai sur 5 patients ») | Couvert |
| RPT-003 | — | Une visite imprévue rappelle sa justification à la place de l'objectif | `MRA` « RPT-003 : une visite imprévue rappelle sa justification à la place » ; serveur : `R/test_objectif.py::test_rpt003_une_visite_imprevue_rend_sa_justification` | Couvert |
| RPT-003 | — | Une visite planifiée sans objectif affiche « Aucun objectif n'était prévu pour cette visite » | `MRA` « RPT-003 : une visite planifiée sans objectif le dit en tête du rapport » | Couvert |

## Produits présentés, retour du prescripteur, échantillons et cadeaux (0.5.3)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-004 | CA1 | L'ordre saisi est conservé, jusque dans le rapport soumis ; un produit ne se présente qu'une fois (`produit_en_double`) | `R/test_presentations.py::test_rpt004_ca1_ordre_et_retour_par_produit` ; `::test_rpt004_un_produit_ne_se_presente_qu_une_fois` ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » | Couvert |
| RPT-004 | — | Le retour du prescripteur (`non_prescrit`, `peu`, `prescrit`, `tres_bien`) est obligatoire sur chaque produit présenté | `R/test_presentations.py::test_rpt004_ca1_ordre_et_retour_par_produit` (`retours` manquant) ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« retour du prescripteur sur chaque produit », « Prescrit très bien ») | Couvert |
| RPT-004 | CA2 | Seuls les produits du portefeuille du réseau sont proposés ; un produit « autre », en clair, seulement si le pays l'autorise (désactivé par défaut) | `R/test_presentations.py::test_rpt004_ca2_autre_produit_si_le_pays_l_autorise` ; `R/test_rapport.py::test_rg033_un_produit_hors_portefeuille_est_refuse` ; `MRA` « RPT-004 CA2 : sans autorisation du pays, pas de produit « autre » », « RPT-004 CA2 : un produit « autre » si le pays l’autorise » | Couvert |
| RPT-005 | — | Échantillons (produits du portefeuille) et cadeaux (liste « Articles promotionnels ») remis, quantité réglée par « − » et « + » ; un échantillon hors portefeuille ou une quantité nulle sont refusés | `R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` ; `MRA` « RPT-005 CA1 : un cadeau se remet sans stock, la quantité se règle et revient à zéro », « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« Échantillon · Produit Beta × 2 ») | Couvert |
| RPT-005 | CA1 | Aucune notion de solde ni de dotation ; les remises sont facultatives | `R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` ; `MRA` « RPT-005 CA1 : un cadeau se remet sans stock, la quantité se règle et revient à zéro » | Couvert |

## Prochaine action (0.5.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-006 | — | Type (liste du pays) et précision obligatoires ; échéance facultative, jamais avant la visite (`echeance_passee`) ; « Proposer une nouvelle visite » | `R/test_prochaine_action.py::test_rpt006_le_type_est_obligatoire_et_l_echeance_suit_la_visite` ; `::test_rpt006_ca1_rappelee_a_la_visite_suivante` (`visite_proposee`) ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« Dans 1 semaine » → 20 octobre, « Proposer une nouvelle visite ») | Couvert |
| RPT-006 | CA1 | Rappelée à la visite suivante du même prospect par le même délégué, sur le détail de la visite et en tête du rapport ; seule l'action d'un rapport soumis, jamais celle d'un collègue | `R/test_prochaine_action.py::test_rpt006_ca1_rappelee_a_la_visite_suivante` ; `MD` « RPT-006 CA1 : la prochaine action notée la dernière fois est rappelée » ; `MRA` « RPT-006 CA1 : le rapport rappelle l’action notée à la visite précédente » ; le détail gardé se lit sans réseau : `MD` « VIS-002 : sans réseau, le détail gardé s’affiche » | Couvert |

## Pièces jointes, PDF seul (0.5.5, DC-48 en 0.5.7)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-007 | — | « Joindre un PDF » : la pièce part avec son identifiant et son heure de prise ; rejouée, elle n'est créée qu'une fois ; elle se lit par une adresse contrôlée, jamais gardée en cache ; l'ajout est inscrit au journal | `R/test_pieces.py::test_rpt007_joindre_relire_et_rejouer_sans_doublon` ; `MPJ` « RPT-007 : un PDF part avec son identifiant et son heure » | Couvert |
| RPT-007 | — | Pas de photo (DC-48) : ni « Prendre une photo » ni « Galerie » ; le serveur refuse une image | `MPJ` « DC-48 : aucune photo, ni appareil photo ni galerie » ; `R/test_pieces.py::test_rpt007_ca1_type_taille_et_nombre` (JPEG refusé, `type_de_fichier`) | Couvert |
| RPT-007 | CA1 | 10 Mo au plus par fichier, vérifié sur le téléphone puis par le serveur ; 3 pièces au plus par rapport ; type reconnu au contenu, pas au nom | `R/test_pieces.py::test_rpt007_ca1_type_taille_et_nombre` ; `MPJ` « RPT-007 CA1 : plus de 10 Mo, le PDF ne part pas », « RPT-007 CA1 : trois pièces, on ne peut plus en ajouter » | Couvert |
| RPT-007 | CA2 | Une pièce ne se lit que par qui voit le rapport : ni le superviseur tant que le rapport est en brouillon, ni l'administration, ni un autre pays | `R/test_pieces.py::test_rpt007_ca2_seul_qui_voit_le_rapport_lit_la_piece` | Couvert |
| RPT-007 | CA2 | … le superviseur lit la pièce du rapport soumis qu'il valide | La règle d'accès existe ; la lecture du rapport par le superviseur, pièces comprises, arrive avec la validation | Partiel (cycle 0.6 : lecture et validation des rapports, RPT-012, RPT-013) |
| RPT-007 | — | Téléversement différé : sans réseau, la pièce attend (« En attente du réseau ») ; prise avant la soumission, elle rejoint le rapport ; prise après, elle est refusée | `R/test_pieces.py::test_rpt007_retrait_et_televersement_differe` ; `MPJ` « RPT-007 : sans réseau, le PDF attend dans la file et se voit « En attente » » | Couvert |
| RPT-007 | — | « Retirer » tant que le rapport n'est pas soumis ; la pièce retirée est archivée, jamais effacée (RG-005) | `R/test_pieces.py::test_rpt007_retrait_et_televersement_differe` | Couvert |

## Brouillon automatique (0.5.6)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-009 | — | Chaque saisie s'enregistre toute seule, sans bouton ; l'en-tête dit « Enregistré automatiquement à … » | `MRA` « chaque saisie s’enregistre toute seule, sans bouton » | Couvert |
| RPT-009 | — | Sans réseau, la saisie reste sur le téléphone (« Gardé sur le téléphone à … ») et attend dans la file ; un rapport déjà ouvert se complète sans réseau | `MRA` « sans réseau, la saisie reste sur le téléphone et attend dans la file », « sans réseau, un rapport déjà ouvert se complète sur le téléphone » | Couvert |
| RPT-009 | CA1 | Le brouillon survit à la fermeture de l'application et au redémarrage du téléphone ; « Brouillon repris » | `MRA` « CA1 : après un redémarrage, la saisie non envoyée est reprise » | Couvert |
| RPT-009 | — | Au retour du réseau, la file rejoue la saisie, la soumission et les pièces du rapport, dans l'ordre et une seule fois | `mobile/__tests__/attente.test.ts` « RPT-009 : saisie, soumission puis pièce partent dans l’ordre, une fois, avec l’heure du geste » ; serveur : `R/test_soumission.py::test_rpt010_rejeu_du_meme_envoi_sans_seconde_version`, `R/test_pieces.py::test_rpt007_joindre_relire_et_rejouer_sans_doublon` | Couvert |
| RPT-009 | — | Les documents en attente sont copiés dans l'espace de l'application, survivent au redémarrage et sont effacés une fois envoyés | `mobile/__tests__/attente.test.ts` « RPT-009 : la pièce en attente est copiée dans pieces-en-attente/, puis effacée après l’envoi » | Couvert |

## Soumission et retard (0.5.7)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-010 | — | Le délai est rappelé (« À soumettre aujourd'hui avant minuit ») ; passé minuit, « En retard » ; soumis en retard, il le dit | `MRA` « à l’heure, le délai du jour s’affiche », « RG-032 : passé minuit, le rapport non soumis est signalé en retard », « soumis en retard, il le dit » ; `R/test_soumission.py::test_rg032_soumis_apres_minuit_en_retard` (`en_retard` du brouillon) | Couvert |
| RPT-010 | — | Carte « Rapports en retard » en tête de la Tournée : les rapports non soumis des jours précédents, ouverts d'un appui | `MP` « RG-032 : un rapport de la veille non soumis remonte en tête, « en retard » » | Couvert |
| RPT-010 | — | Soumis le jour même : à l'heure, version figée, inscrit au journal avec son retard | `R/test_soumission.py::test_rpt010_soumis_le_jour_meme_a_l_heure_et_fige` | Couvert |
| RPT-010 | CA1 | Rédigé et soumis le jour J sans réseau, reçu le jour J+1 : à l'heure, l'heure du geste fait foi ; le rapport passe en lecture sur le téléphone (« Soumis sur le téléphone à … ») | `R/test_soumission.py::test_rpt010_ca1_redige_hors_connexion_le_jour_j_envoye_a_j1_reste_a_l_heure` ; `MRA` « CA1 : sans réseau, la soumission attend dans la file avec l’heure du geste », « CA1 : rouvert avant l’envoi, le rapport reste soumis sur le téléphone » | Couvert |
| RPT-010 | CA1 | Horodatage incohérent (horloge décalée de plus de 15 minutes, heure avant la fin de la visite) : l'heure de réception est retenue, le rapport est « horodatage douteux » | `R/test_soumission.py::test_rpt010_ca1_horloge_incoherente_signalee_et_heure_du_serveur_retenue` ; `::test_rpt010_soumission_avant_la_fin_de_visite_douteuse` | Couvert |
| RPT-010 | CA1 | … la mention « horodatage douteux » est visible du superviseur | Le champ `horodatage_douteux` est rendu par l'API (tests ci-dessus) ; l'écran du superviseur arrive avec la validation | Partiel (cycle 0.6 : validation des rapports) |

## Chronologie des rapports d'un prospect (0.5.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| RPT-011 | — | Téléphone : carte « Visites précédentes » de la fiche du prospect (résultat, produits et retours, résumé, « Suite : »), trois visites puis « Voir les visites plus anciennes » | `MF` « RPT-011 : les visites précédentes, la plus récente d’abord, puis « voir plus » » ; le serveur rend ces champs : `R/test_chronologie.py::test_rpt011_le_delegue_lit_ses_rapports_du_plus_recent` | Couvert |
| RPT-011 | — | … du plus récent au plus ancien | `R/test_chronologie.py::test_rpt011_du_plus_recent_au_plus_ancien` (deux rapports, le 13 et le 15) | Couvert |
| RPT-011 | — | Sans réseau, la dernière liste lue reste visible | `MF` « RPT-011 : sans réseau, la dernière liste lue s’affiche, la plus récente d’abord » | Couvert |
| RPT-011 | CA1 | Un délégué ne voit que ses propres rapports, brouillons compris ; jamais ceux d'un collègue | `R/test_chronologie.py::test_rpt011_ca1_un_autre_delegue_ne_voit_rien` ; `::test_rpt011_superviseur_jamais_un_brouillon` (le délégué voit son brouillon) | Couvert |
| RPT-011 | — | Portail : section « Rapports de visite » dans la fiche d'un prospect, avec le nom du délégué | `portail/src/composants/RapportsProspect.test.tsx` « RPT-011 : la liste, du plus récent au plus ancien, avec le nom du délégué » ; « … sans rapport, la section le dit » ; « … une erreur de chargement s’affiche, avec « Réessayer » » | Couvert |

## Décisions appliquées en 0.5.9

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| DC-62 | — | Le superviseur lit les rapports soumis des délégués des postes rattachés, le responsable pays tout le pays ; jamais le brouillon d'un autre ; un autre pays n'a pas la fiche | `R/test_chronologie.py::test_rpt011_superviseur_et_responsable_pays_lisent_le_soumis` ; `::test_rpt011_superviseur_jamais_un_brouillon` ; `::test_rpt011_hors_perimetre` | Couvert |
| DC-62 | — | Ni l'administration du pays ni le siège ne lisent les rapports : le droit « lire les rapports » suit la matrice | `R/test_chronologie.py::test_rpt011_hors_perimetre` (administrateur pays : 403) ; `B/perimetre/tests/test_matrice.py::test_la_matrice_suit_le_prd` ; `::test_chaque_role_chaque_action` (`rapports.lire`, rôle par rôle) | Couvert |
| DC-62 | — | Le DM et le DF lisent les rapports soumis des postes de leurs réseaux | `R/test_chronologie.py::test_dc62_dm_et_df_lisent_les_rapports_soumis_de_leurs_reseaux` (rien sans réseau, le rapport soumis une fois le réseau ajouté) ; `::test_rpt011_hors_perimetre` | Couvert |
| DC-47 | — | « Préparer ma visite » (engagement 5) sur le détail de la visite : nombre de visites rapportées et date de la dernière, dernier retour par produit, échantillons déjà remis, action promise | `R/test_prochaine_action.py::test_dc47_preparer_ma_visite` ; `MD` « DC-47 : « Préparer ma visite » rappelle les derniers retours et les échantillons » ; l'action promise : voir RPT-006 CA1 | Couvert |
| DC-51 | — | « Maladie » retirée : l'indisponibilité ne se pose pas au planning à l'avance ; elle se déclare le jour même, sans motif, semaine approuvée comprise, une fois par période ; rejouée, sans effet | `T/test_indisponibilite.py::test_dc51_maladie_ne_se_planifie_plus` ; `::test_dc51_le_matin_justifie_ses_visites_semaine_fermee` ; `::test_dc51_une_seule_fois_par_periode` ; `MP` « DC-51 : « Je suis indisponible aujourd’hui » justifie la journée sans motif » | Couvert |
| DC-51 | — | Elle justifie les visites de la période : elles quittent le programme (la prochaine passe à la suivante) et la liste « à justifier » | `T/test_indisponibilite.py::test_dc51_le_matin_justifie_ses_visites_semaine_fermee` ; `MP` « DC-51 : « Je suis indisponible aujourd’hui » justifie la journée sans motif » | Couvert |
| DC-51 | — | … et ne comptent pas comme écart « restée prévue » dans la conformité de la journée | `T/test_indisponibilite.py::test_dc51_une_visite_couverte_n_est_pas_un_ecart_de_conformite` | Couvert |
| DC-51 | — | Sans réseau, la déclaration attend dans la file du téléphone | `MP` « DC-51 : sans réseau, l’indisponibilité déclarée attend dans la file » | Couvert |
| DC-55 | — | Une position dont la précision annoncée dépasse le seuil est « imprécise » (comptée sans GPS, dans la tolérance), pas « loin du lieu » ; la précision est envoyée par le téléphone et gardée | `T/test_conformite.py::test_dc55_une_position_imprecise_n_est_pas_loin_du_lieu` ; `T/test_demarrage.py::test_vis003_la_visite_demarre_a_l_heure_reelle_avec_sa_position` (`debut_precision_m`) ; `MS` « VIS-003 : la visite démarre à l’heure réelle, avec sa position et la distance au lieu » (`precision_m`) | Couvert |
| DC-55 | — | Le rayon de pointage propre à l'établissement remplace la distance du pays | `T/test_conformite.py::test_dc55_le_rayon_propre_de_l_etablissement_remplace_celui_du_pays` | Couvert |
| DC-55 | — | Le rayon se saisit au portail, sur la fiche de l'établissement ; la carte « Conformité des journées » ajoute « dont n à la position trop imprécise » | `portail/src/pages/Etablissements.test.tsx` « DC-55 : la fiche donne le rayon de pointage », « … se saisit au formulaire et part à l’enregistrement », « … vidé, le rayon part à null » ; `portail/src/composants/Conformite.test.tsx` « DC-55 : les visites sans GPS disent « dont n à la position trop imprécise » » ; serveur : `backend/apps/prospects/tests/test_etablissements.py::test_dc55_le_rayon_de_pointage_s_ecrit_par_l_api` | Couvert |
| DC-58 | — | Le mobile personnel n'est rendu qu'aux délégués qui ont le prospect dans leur liste cible, et seulement avec l'accord du médecin ; l'administration le voit ; ni le superviseur, ni « ma liste » sans accord, ni l'historique, ni le détail de la visite ne le révèlent | `T/test_mobile_prospect.py::test_dc58_le_mobile_suit_la_liste_cible_et_l_accord` ; `T/test_detail_visite.py::test_vis002_le_detail_dit_le_prospect_le_lieu_et_les_coordonnees` | Couvert |
| DC-58 | — | Il sert toujours à repérer les doublons | `B/prospects/tests/test_doublons.py::test_meme_mobile_et_nom_similaire_fusionnent` | Couvert |
| DC-58 | — | « Accepte d'être contacté sur ce numéro » se coche au portail, sur la fiche du prospect | `portail/src/pages/Prospects.test.tsx` « DC-58 : la case « accepte d’être contacté sur ce numéro » part à l’enregistrement » ; serveur : `T/test_mobile_prospect.py::test_dc58_l_accord_s_ecrit_par_l_api` | Couvert |
| DC-59 | — | Le téléphone se verrouille après le délai du pays, 15 minutes par défaut ; à 30 minutes, 20 minutes en arrière-plan ne verrouillent pas | `B/socle/tests/test_parametres.py::test_valeurs_par_defaut_du_cadrage` (`verrouillage_minutes` = 15) ; `MSS` « se verrouille après 5 minutes en arrière-plan et se déverrouille par biométrie » (délai par défaut), « DC-59 : le pays règle le délai ; 20 minutes dehors ne verrouillent pas à 30 » | Couvert |
| DC-59 | — | Le délai se règle de 5 à 30 minutes dans « Paramètres » ; hors de ces bornes, il est refusé | `backend/apps/socle/tests/test_parametres.py::test_valeurs_invalides_refusees` (4 et 31 refusés) ; `portail/src/pages/Parametres.test.tsx` « DC-59 : la carte « Téléphone » affiche le délai de verrouillage », « DC-59 : le délai de verrouillage se règle et s’enregistre pour le pays » | Couvert |
| DC-61 | — | Le paramètre `echeance_approbation_planning` est retiré | `B/socle/tests/test_parametres.py::test_valeurs_par_defaut_du_cadrage` | Couvert |
| DC-61 | — | La visite proposée au dernier rapport apparaît dans la préparation de la semaine suivante ; replanifiée, elle ne se propose plus ; chacun ne voit que les siennes | `R/test_chronologie.py::test_dc61_la_visite_proposee_revient_a_la_preparation` ; `MSE` « DC-61 : la visite proposée au dernier rapport se place d’un appui » | Couvert |

## Règles de gestion du cycle

| Règle | Énoncé | Test(s) | Statut |
|---|---|---|---|
| RG-030 | Une visite `effectuee` a exactement un rapport | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` (un seul rapport après deux lectures) ; pas de rapport avant la fin : `::test_pas_de_rapport_avant_la_fin_de_la_visite` | Couvert |
| RG-032 | Le rapport est attendu le jour de la visite avant 23 h 59, heure du pays ; au-delà, `en_retard` | `R/test_soumission.py::test_rg032_soumis_apres_minuit_en_retard` ; `::test_rpt010_soumis_le_jour_meme_a_l_heure_et_fige` (`echeance`) ; `MRA` « RG-032 : passé minuit, le rapport non soumis est signalé en retard » ; `MP` « RG-032 : un rapport de la veille non soumis remonte en tête, « en retard » » | Couvert |
| RG-032 | … alerte au superviseur à 48 h | — | Partiel (cycle 0.6 : RPT-017) |
| RG-033 | Seuls les produits du portefeuille du réseau de la visite sont proposés dans le rapport | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` ; `::test_rg033_un_produit_hors_portefeuille_est_refuse` ; échantillon hors portefeuille : `R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` | Couvert |
| RG-033 | … tel qu'au jour de la visite (§14.31) | `R/test_presentations.py::test_rg033_portefeuille_du_jour_de_la_visite` (produit retiré le lendemain, toujours proposé et accepté) | Couvert |
| RG-037 | Chaque soumission de rapport crée une version figée ; un envoi rejoué n'en crée pas d'autre | `R/test_soumission.py::test_rpt010_soumis_le_jour_meme_a_l_heure_et_fige` ; `::test_rpt010_rejeu_du_meme_envoi_sans_seconde_version` | Couvert |
| RG-037 | … consultable par le superviseur et au-dessus | — | Partiel (cycle 0.6 : RPT-015) |
| RG-038 | Échantillons et cadeaux remis enregistrés sans gestion de stock | Voir RPT-005 CA1 : `R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` | Couvert |

## Critère partiel du cycle 0.4, repris en 0.5

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| VIS-004 | — | La fin de la visite ouvre son rapport : effectuée, la visite propose « Rédiger le rapport », qui ouvre le rapport en brouillon ; avant la fin, il ne s'ouvre pas | `MRA` « RPT-001 : visite effectuée, rapport %s → « %s » » (cas `attendu` → « Rédiger le rapport ») ; `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` ; `::test_pas_de_rapport_avant_la_fin_de_la_visite` | Couvert |
| VIS-004 | — | … dès « Terminer la visite », l'annonce « Visite … terminée » propose « Rédiger le rapport », et le rapport est gardé sur le téléphone pour s'écrire sans réseau | `MS` « VIS-004 : la visite en cours se termine, effectuée, avec sa durée » (« Rédiger le rapport » sous l'annonce, rapport gardé sur le téléphone) | Couvert |

Les autres critères « Partiel » des cycles précédents qui attendaient les rapports restent ouverts : ORG-013 CA1 (le remplaçant voit les rapports concernés) dépend de la lecture des rapports par le superviseur (cycle 0.6) ; PLN-003 CA2 (chaque visite d'un passage garde son rapport) découle de RG-030, sans test dédié au passage.

## Décisions et hypothèses du cycle

| Réf. | Décision ou hypothèse | Nature | Preuve |
|---|---|---|---|
| §14.31 | Liste « Résultats de visite » : objectif atteint, partiellement atteint, non atteint, à relancer | [H] | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` (« Objectif atteint » ; les autres valeurs sans test) |
| §14.31 | En 0.5.1, le rapport s'ouvre et s'envoie avec du réseau ; remplacé en 0.5.6 et 0.5.7 | [H] | Un rapport jamais ouvert ne s'ouvre pas sans réseau : `MRA` « Sans réseau, le rapport ne s’ouvre pas et le dit » |
| §14.32 | La précision du résultat reste facultative | [H] | `R/test_rapport.py::test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois` (absente des `manquants`) |
| §14.33 | « Échantillon » ne propose que les produits déjà présentés à la visite | [H] | Téléphone : `MRA` « RPT-005 CA1 : un cadeau se remet sans stock, la quantité se règle et revient à zéro » (« leurs échantillons apparaîtront ici ») ; le serveur ne l'exige pas (`R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` remet un échantillon sans présentation) |
| §14.33 | « Autre produit présenté (hors portefeuille) » désactivé par défaut | [H] | `R/test_presentations.py::test_rpt004_ca2_autre_produit_si_le_pays_l_autorise` |
| §14.33 | Articles promotionnels initiaux : stylo, bloc-notes, calendrier, agenda | [H] | `R/test_presentations.py::test_rpt005_echantillons_et_cadeaux_remis` (« Stylo ») |
| §14.34 | Types de prochaine action initiaux ; échéance « 1 semaine », « 2 semaines », « 1 mois », comptée du jour de la visite | [H] | `R/test_prochaine_action.py::test_rpt006_le_type_est_obligatoire_et_l_echeance_suit_la_visite` ; `MRA` « RPT-001 : produits dans l’ordre de présentation, puis soumission » (« Dans 1 semaine » → 20 octobre) |
| §14.36, DC-48 | Pas de photo ; PDF seul, reconnu au contenu | [D] 7 octobre 2026 | Voir RPT-007 |
| §14.36 | 10 Mo par fichier, 3 pièces par rapport | [H] | Voir RPT-007 CA1 |
| §14.36 | Pièces sur le disque du serveur en développement, stockage objet (R2) au déploiement | [H] | Sans test (choix d'hébergement) |
| §14.37 | Saisie sur deux appareils : la dernière envoyée l'emporte | [H] | Sans test dédié |
| §14.38 | L'heure du téléphone fait foi, sauf heure dans le futur, avant la fin de la visite ou horloge décalée de plus de 15 minutes | [H] | `R/test_soumission.py::test_rpt010_ca1_horloge_incoherente_signalee_et_heure_du_serveur_retenue` ; `::test_rpt010_soumission_avant_la_fin_de_visite_douteuse` ; l'heure dans le futur n'a pas de test dédié |
| §14.38 | Seule la première soumission peut être en retard | — | Sans objet tant que la correction n'existe pas (cycle 0.6) |
| §14.39, DC-62 | Lecture des rapports : le délégué les siens, l'encadrement dans son périmètre, ni l'administration ni le siège | [D] 7 octobre 2026 | Voir DC-62 |
| §14.39 | Les 30 derniers rapports au plus | [H] | Sans test (`LIMITE` dans `B/rapports/chronologie.py`) |
| §14.39 | Le superviseur voit les délégués qui occupent aujourd'hui un poste de son périmètre | [H] | L'occupant actuel : `R/test_chronologie.py::test_rpt011_superviseur_et_responsable_pays_lisent_le_soumis` ; un ancien occupant : sans test |
| §14.35, DC-47 | Engagement 5 « Préparer ma visite », lisible en 10 secondes | [D] 7 octobre 2026 | Voir DC-47 ; les autres engagements relèvent des cycles 0.6 à 0.9 |
| §14.40, DC-55 | Seuil de précision et rayons à mesurer au pilote | [D] 7 octobre 2026 | Règle testée (voir DC-55) ; valeurs à fixer au pilote |

## Contrôles transverses du cycle 0.5

- Isolation : toutes les routes du cycle passent par le périmètre (`B/perimetre/tests/test_couverture_routes.py::test_toute_route_metier_herite_de_vue_perimetre`, `::test_chaque_vue_metier_declare_ses_actions`). Celles qui ouvrent un objet par son identifiant (`visite-rapport`, `visite-rapport-soumettre`, `visite-rapport-pieces`, `visite-rapport-piece`, `champ-rapport`, `champ-rapport-archiver`, `prospect-rapports`) sont essayées depuis un autre pays (`B/perimetre/tests/test_isolation_routes.py::test_aucune_route_n_ouvre_un_objet_d_un_autre_pays`).
- Droits : `rapports.rediger` et `rapports.lire` suivent la matrice du PRD, rôle par rôle (`B/perimetre/tests/test_matrice.py::test_la_matrice_suit_le_prd`, `::test_chaque_role_chaque_action`).
- Hors connexion : brouillon, soumission et pièce jointe attendent dans la file du téléphone (voir RPT-009, RPT-010 CA1, RPT-007) ; le serveur reçoit un envoi rejoué sans effet. Le rejeu par le téléphone n'est pas testé pour le rapport (écart 3).
- Journal d'audit : soumission et pièce jointe sont inscrites (`R/test_rapport.py::test_rpt002_ca1_impossible_de_soumettre_sans_le_socle`, `R/test_soumission.py::test_rpt010_soumis_le_jour_meme_a_l_heure_et_fige`, `R/test_pieces.py::test_rpt007_joindre_relire_et_rejouer_sans_doublon`).
- Démonstration : `B/demonstration/tests/test_demonstration.py` ne vérifie aucun rapport (soumis, brouillon, en retard, pièce jointe fictive).
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Les 15 critères « Non couvert » relevés à la première passe de la recette ont tous reçu un test en 0.5.9 (serveur, téléphone et portail) ; ils figurent comme « Couvert » dans les tableaux ci-dessus.

Critères « Partiel » : la lecture de la pièce jointe par le superviseur (RPT-007 CA2), la mention « horodatage douteux » vue par le superviseur (RPT-010 CA1), l'alerte à 48 h (RG-032) et les versions consultées par l'encadrement (RG-037). Ils seront testés avec la lecture, la validation et la correction des rapports (cycle 0.6).

Remarques :
- Le test `MSS` du verrouillage porte désormais le délai par défaut de 15 minutes (DC-59) ; `MSE` « DC-61 » vérifie que la visite proposée se pose réellement.
- RPT-008 : les types « texte » et « oui / non » ne sont pas exercés au serveur, et la règle « le type ne change plus une fois le champ créé » n'a pas de test.
- RPT-006 CA1 : le détail gardé se lit sans réseau (VIS-002), mais le cadre « Action prévue à la visite du … » n'est pas vérifié hors connexion.

## Bilan

| Statut | Lignes |
|---|---|
| Couvert | 67 |
| Partiel (cycle futur) | 4 |
| Non couvert (écarts) | 0 |

Sur 71 lignes de critères (exigences RPT-001 à RPT-011, décisions appliquées en 0.5.9, règles de gestion et le critère repris du cycle 0.4) : 67 couvertes, 4 partielles, aucun écart. Le tableau des décisions et hypothèses n'entre pas dans ce compte.

# Recette du cycle 0.8 — Mobilité

Version de clôture : **0.8.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.8.x` (OFF-001 à OFF-007, NOT-002 à NOT-005, SEC-005, SEC-006) est relié au test automatisé qui le prouve. S'y ajoutent DC-52 et DC-54, les sections de mise en œuvre (prd.md §14.60 à §14.67) avec leurs décisions [D] prises par délégation, et les scénarios REC-06, REC-07 et REC-17 (prd.md §21.1). Ce qui ne se prouve que sur un vrai téléphone et un vrai réseau est marqué « Terrain » : le protocole est dans `docs/essais-terrain.md`.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel** : une partie est prouvée ; le reste figure dans « Écarts » (essai de terrain ou cycle suivant).
- **Terrain** : se vérifie seulement sur un téléphone réel (`docs/essais-terrain.md`).

Abréviations : `R/` = `backend/apps/rapports/tests/`, `I/` = `backend/apps/identite/tests/`, `S/` = `backend/apps/socle/tests/`, `MHL` = `mobile/__tests__/horsLigne.test.tsx`, `MC` = `mobile/__tests__/conflits.test.tsx`, `MA` = `mobile/__tests__/attente.test.ts`, `MP` = `mobile/__tests__/push.test.tsx`, `PE` = `portail/src/pages/Etablissements.test.tsx`.

## Données du téléphone et saisie sans réseau (0.8.1, 0.8.2)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| OFF-001 · REC-06 | CA1 | Après une synchronisation, 7 jours de travail en mode avion : programme, semaines, détails, liste cible, trois dernières visites par prospect, chiffres | `R/test_synchro.py::test_off001_les_trois_derniers_rapports_de_la_liste_cible` ; `::test_off001_hors_liste_cible_rien_et_rpt011_ca1` ; `mobile/__tests__/synchro.test.tsx` « une partie qui échoue est comptée et ne vide rien » | Partiel (écart 1) |
| SEC-005 | CA1 | Base locale chiffrée, clé de 256 bits dans le magasin sécurisé, appliquée avant toute lecture | `mobile/__tests__/baseLocale.test.ts` « SEC-005 CA1 : clé de 256 bits dans le magasin sécurisé, appliquée en premier » | Partiel (écart 2) |
| OFF-002 | CA1 | Chaque objet créé sans réseau a un identifiant fait sur le téléphone ; rejoué, il n'est créé qu'une fois | `R/test_synchro.py::test_off002_proposition_faite_sans_reseau_rejouee_sans_doublon` ; `mobile/__tests__/proposition.test.tsx` « OFF-002 CA1 : sans réseau, la proposition attend avec son identifiant » | Couvert |
| OFF-002 | — | Le rapport (ou son modèle vierge, version 0) de chaque visite de la semaine et de la suivante, gardé sur le téléphone ; une saisie locale n'est pas écrasée | `R/test_synchro.py::test_off002_un_modele_de_rapport_pour_chaque_visite_de_la_semaine` ; `::test_off002_le_modele_vierge_part_de_la_version_0` ; `mobile/__tests__/synchro.test.tsx` « OFF-002 : le modèle reçu ne remplace pas une saisie faite sur le téléphone » | Couvert |

## File, délai sans synchronisation, effacement (0.8.3)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| OFF-003 | CA1 | « Synchronisé à … · n envois en attente » sur chaque écran, même jamais synchronisé | `MHL` « OFF-003 CA1 : sur chaque écran, la dernière synchronisation et la file en attente » ; « OFF-003 CA1 : un téléphone jamais synchronisé le dit aussi » | Couvert |
| OFF-003 · REC-07 | CA2 | Une coupure pendant l'envoi ne crée aucun doublon ; la file repart d'elle-même, une fois | `MHL` « OFF-003 : au retour dans l'application, la file part d'elle-même, une seule fois » ; `MA` « PLN-007 : deux rejeux simultanés n'envoient chaque visite qu'une fois » ; `backend/apps/planning/tests/` `test_vis007_rejoue_depuis_la_file_sans_doublon`, `test_vis008_rejoue_sans_doublon` ; `R/` `test_rpt007_joindre_relire_et_rejouer_sans_doublon` | Couvert |
| OFF-007 · DC-54 · REC-17 | CA1 | Au-delà du délai du pays (7 jours par défaut, réglable), les données ne s'affichent plus | `MHL` « OFF-007 CA1 : au 8ᵉ jour sans synchronisation, les données ne s'affichent plus » ; « OFF-007 : avant le délai, rien n'est masqué » ; « OFF-007, DC-54 : le pays allonge le délai pour une zone isolée » | Couvert |
| OFF-007 | CA2 | La file est gardée et part à la synchronisation qui rend les données | `MHL` « OFF-007 CA2 : la file est gardée et part à la synchronisation qui rend les données » | Couvert |
| SEC-006 · REC-17 | CA1 | Téléphone révoqué ou compte suspendu : effacement local et retour à la connexion ; une session expirée n'efface rien | `MHL` « SEC-006 CA1 : un téléphone révoqué efface ses données et revient à la connexion » ; « SEC-006 : une session simplement expirée n'efface rien » ; `I/test_appareils_langue.py::test_sec006_un_compte_suspendu_le_dit_au_telephone` | Couvert |

## Conflits (0.8.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| OFF-004 · RG-050 | CA1 | Une décision du superviseur n'est jamais écrasée ; la version locale se lit puis s'abandonne | `R/test_conflits.py::test_off004_ca1_une_decision_du_superviseur_n_est_jamais_ecrasee` ; `MC` « OFF-004 CA1 : une décision du superviseur l'emporte… » | Couvert |
| OFF-004 · RG-053 | CA2 | Un conflit montre les deux versions, champ par champ ; le délégué choisit | `R/test_conflits.py::test_off004_ca2_une_visite_changee_des_deux_cotes` ; `MC` « OFF-004 CA2 : le rapport changé ailleurs montre les deux versions… » ; « OFF-004 CA2 : une visite changée des deux côtés attend le choix du délégué » ; « RG-053 : garder la version du serveur abandonne la saisie et ses envois » | Couvert |
| RG-052 | — | Une saisie sur une version périmée est un conflit ; sans changement ailleurs, pas de conflit ; un formulaire renvoyé tel quel n'écrase rien | `R/test_conflits.py::test_rg052_une_saisie_sur_une_version_perimee_est_un_conflit` ; `::test_rg053_le_formulaire_renvoye_tel_quel_n_ecrase_pas_ce_qui_a_change` ; `MC` « RG-052 : sans changement ailleurs… » | Couvert |

## Notifications et courriels (0.8.5, 0.8.6)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| NOT-002 | CA1 | Toucher la notification ouvre l'objet, application fermée ou ouverte | `MP` « NOT-002 CA1 : application fermée, le toucher ouvre le rapport à corriger » ; « NOT-002 CA1 : application ouverte, le toucher ouvre la semaine, une seule fois » | Partiel (écart 3) |
| NOT-002 | CA2 | Ni nom ni texte libre sur l'écran verrouillé ; langue de la personne | `I/test_push.py::test_not002_ca2_ni_nom_ni_texte_libre_sur_l_ecran_verrouille` ; `::test_not002_dans_la_langue_de_la_personne` | Couvert |
| NOT-002 | — | Adresse push donnée et retirée ; téléphone révoqué, portail, service coupé ou injoignable | `I/test_push.py` (`test_not002_le_telephone_donne_son_adresse_et_la_retire`, `…_un_telephone_revoque_ne_recoit_plus_rien`, `…_le_portail_n_a_pas_d_adresse_push`, `…_desactive_rien_ne_part`, `…_service_injoignable_et_application_desinstallee`, `…_sans_telephone_la_notification_reste_au_centre`) ; `MP` | Couvert |
| NOT-003 | CA1 | 20 rapports en 10 minutes : une seule notification « 20 rapports à valider » | `I/test_push.py::test_not003_ca1_vingt_rapports_en_dix_minutes_une_seule_notification` | Couvert |
| NOT-004 | CA1 | Aucun autre courriel que ceux de la sécurité ; secours des 48 h, une seule fois, sans nom | `I/test_courriels_preferences.py::test_not004_ca1_aucun_autre_module_n_envoie_de_courriel` ; `::test_not004_secours_d_une_decision_en_attente_depuis_48_h` ; `::test_not004_lue_la_demande_ne_declenche_rien` ; `::test_not004_un_nouveau_telephone_est_signale` ; `::test_not004_la_double_authentification_activee_est_signalee` | Couvert |
| NOT-005 | CA1 | Une notification obligatoire ne se coupe pas ; le pays en ajoute ; coupée, elle reste au centre | `I/test_courriels_preferences.py::test_not005_ca1_une_notification_obligatoire_ne_se_coupe_pas` ; `::test_not005_chacun_ses_preferences_dans_les_limites_du_pays` ; `::test_not005_coupee_elle_reste_au_centre_sans_push` ; `mobile/__tests__/preferences.test.tsx` | Couvert |

## Pièces jointes, réseau faible, position de référence (0.8.7, 0.8.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| OFF-005 | CA1 | Un rapport arrivé sans son document l'indique « pièce en attente » ; le fichier arrive après tout le reste, même après la validation | `R/test_pieces_differees.py` (les trois tests) ; `mobile/__tests__/pieces.test.tsx` « OFF-005 … » ; `portail/src/pages/JourneeRapports.test.tsx` « OFF-005 … » | Couvert |
| OFF-006 | CA1 | Une synchronisation quotidienne typique pèse moins de 500 Ko hors pièces jointes ; JSON compressé, jamais `/auth/` | `S/test_reseau_faible.py::test_off006_ca1_une_synchronisation_quotidienne_pese_moins_de_500_ko` ; `::test_off006_le_json_de_l_api_est_compresse` ; `::test_off006_les_routes_d_authentification_ne_le_sont_jamais` ; `::test_off006_la_commande_affiche_le_detail` | Partiel (écart 4) |
| DC-52 | — | Point médian de trois pointages d'au moins deux personnes ; un seul délégué ne fixe rien ; validé ou déplacé sur la carte, audité, à l'historique ; isolé par pays | `backend/apps/prospects/tests/test_position_proposee.py` (les quatre tests) ; `PE` « DC-52 : … » (quatre tests) | Couvert |

## Écarts

1. **OFF-001 CA1, sept jours en mode avion** : le contenu de la synchronisation et sa lecture sans réseau sont prouvés ; une semaine réelle en mode avion sur un téléphone ne l'est que sur le terrain (`docs/essais-terrain.md`, essai T1).
2. **SEC-005 CA1, base illisible sans la clé** : la clé et son application sont prouvées ; l'extraction de la base d'un vrai téléphone et sa lecture sans clé se font sur le terrain (essai T6).
3. **NOT-002 CA1 après redémarrage** : le toucher est prouvé par simulation ; l'arrivée réelle du push (Expo, puis Apple et Google) exige l'hébergement et les clés (0.9.5) et un vrai téléphone (`docs/notifications-push.md`, essai T5).
4. **OFF-006 CA1, réseau réel** : le poids est mesuré côté serveur sur la démonstration et projeté pour une liste cible de 300 prospects ; la mesure sur un réseau 2G/3G réel se fait sur le terrain (essai T3), avec `mesurer_synchro` sur les données du pilote.

## Décisions du cycle prises par délégation

Toutes notées [D, date, délégation] dans prd.md §14.60 à §14.67 ; les principales :

- délai sans synchronisation réglé par pays (§14.62) ;
- envois en attente effacés avec un téléphone révoqué (§14.62) ;
- contrôle champ par champ pour les visites, par version entière pour le rapport (§14.63) ;
- regroupement des push : 10 minutes, puis une par type et par heure (§14.64) ;
- 48 heures comptées depuis le premier événement non lu (§14.65) ;
- une pièce annoncée reçoit son fichier quel que soit l'état du rapport (§14.66) ;
- pas de compression sur `/auth/` (§14.67) ;
- un délégué seul ne fixe jamais la référence (§14.67) ;
- les visites passées gardent leur « distance inconnue » (§14.67).

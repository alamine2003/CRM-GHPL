# Recette du cycle 0.1 — Référentiel

Version de clôture : **0.1.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.1.x` est relié au test automatisé qui le prouve. Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée n'est citée par aucun test.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel (cycle futur)** : la partie du critère qui existe aujourd'hui est testée. Le reste dépend d'une fonction d'un cycle suivant (planning, visites, rapports, synchronisation) et sera testé avec elle.
- **Non couvert** : aucun test ne prouve encore le critère, ou une partie livrée de ce critère. Chaque cas figure dans la section « Écarts ».

Quand une partie seulement d'un critère n'est pas prouvée, le critère tient sur deux lignes : la partie couverte, puis la partie manquante.

Abréviations : `B/` = `backend/apps/`, `P` = `portail/src/App.test.tsx`, `M` = `mobile/__tests__/` (fichier précisé).

## Référentiels, réseaux et portefeuilles

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PRP-001 | CA1 | Chaque liste modifiable par l'administrateur pays | `B/referentiel/tests/test_referentiel.py::test_l_administrateur_pays_modifie_chaque_liste` (paramétré sur les six listes) ; `::test_les_autres_roles_lisent_mais_ne_modifient_pas` ; produits : `::test_un_produit_appartient_a_plusieurs_reseaux` ; `P` « ajoute une valeur à une liste et archive au lieu de supprimer (PRP-001) », « crée un produit et le range dans des réseaux » | Couvert |
| PRP-001 | CA2 | Valeur utilisée : archivée, jamais supprimée | `B/referentiel/tests/test_referentiel.py::test_une_valeur_utilisee_s_archive_et_ne_se_supprime_pas` ; `B/prospects/tests/test_prospects.py::test_le_type_utilise_par_une_fiche_compte_comme_utilise` ; `P` « ajoute une valeur à une liste et archive au lieu de supprimer (PRP-001) » | Couvert |
| ORG-004 | CA1 | Un réseau appartient à une division | `B/referentiel/tests/test_referentiel.py::test_un_reseau_appartient_a_une_division` | Couvert |
| ORG-004 | CA2 | Un produit dans plusieurs réseaux | `::test_un_produit_appartient_a_plusieurs_reseaux` (portefeuilles audités) ; `P` « liste les produits avec leur classe et leurs réseaux, et les filtre (ORG-004 CA2) », « gère le portefeuille d’un réseau » | Couvert |
| ORG-004 | CA3 | Le rapport ne propose que le portefeuille du réseau | `::test_le_delegue_ne_voit_que_le_portefeuille_de_son_reseau` ; `M` `session.test.tsx` « montre les produits du portefeuille de ses réseaux (ORG-004 CA3) » | Partiel (cycle 0.5 : rapport de visite) |

## Fiches prospects et établissements

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PRP-002 | CA1 | Prospect sans nom ni type refusé | `B/prospects/tests/test_prospects.py::test_un_prospect_sans_nom_ni_type_est_refuse` | Couvert |
| PRP-002 | CA2 | La fiche affiche établissements, potentiel, visites autorisées | `::test_la_fiche_creee_par_l_administrateur_est_commune` (potentiel) ; `B/prospects/tests/test_exercices.py::test_un_prospect_exerce_dans_plusieurs_etablissements` (lieu principal) ; `P` « liste les fiches, recherche et ouvre une fiche avec son potentiel (PRP-002) », « la fiche montre ses lieux d’exercice et en ajoute un (PRP-004) » | Partiel (cycle 0.4 : visites autorisées) |
| PRP-003 | CA1 | Un établissement a un secteur | `B/prospects/tests/test_etablissements.py::test_un_etablissement_a_un_secteur` (sans secteur, secteur d'un autre pays, localité hors secteur) ; `::test_le_delegue_obtient_les_secteurs_du_pays_pour_sa_saisie` | Couvert |
| PRP-003 | CA2 | GPS facultatif, nécessaire au contrôle de distance | `::test_les_coordonnees_gps_sont_facultatives_mais_completes` (établissement sans GPS signalé) ; `P` « liste les établissements, leur secteur et signale ceux sans GPS (PRP-003 CA2) » ; `M` `session.test.tsx` « crée un établissement avec la position du téléphone (PRP-003 CA2) » | Partiel (cycle 0.4 : contrôle de distance) |
| PRP-004 | CA1 | Plusieurs exercices actifs | `B/prospects/tests/test_exercices.py::test_un_prospect_exerce_dans_plusieurs_etablissements` ; `P` « la fiche montre ses lieux d’exercice et en ajoute un (PRP-004) » | Couvert |
| PRP-004 | CA2 | Visite limitée à un couple lié par un exercice actif à sa date | `::test_un_exercice_actif_a_la_date_de_la_visite` (règle `exercice_actif`, fin exclue) | Partiel (cycles 0.2 et 0.4 : visites planifiées et réalisées) |
| PRP-006 | CA1 | Fiche `a_valider` invisible des autres délégués | `B/prospects/tests/test_prospects.py::test_la_fiche_du_delegue_est_a_valider_et_visible_par_lui_seul` (liste et accès direct) ; `B/prospects/tests/test_etablissements.py::test_le_delegue_cree_un_etablissement_a_valider` ; `P` « le délégué crée une fiche, prévenu qu’elle sera à valider (PRP-006) » ; `M` `session.test.tsx` « cherche un prospect et en crée un au statut à valider (PRP-006) » | Couvert |
| PRP-006 | CA2 | Le délégué la planifie aussitôt | `B/prospects/tests/test_prospects.py::test_la_fiche_du_delegue_est_a_valider_et_visible_par_lui_seul` (visible et modifiable par son auteur) | Partiel (cycle 0.2 : planification) |
| PRP-012 | CA1 | Prospect : chaque modification historisée (champ, valeurs, auteur, date) | `B/prospects/tests/test_doublons.py::test_historique_champ_par_champ_sans_suppression` ; origines fusion, proposition et défusion : `::test_meme_numero_d_ordre_fusion_automatique`, `::test_proposition_ne_change_rien_avant_acceptation`, `::test_defusion_d_une_fusion_automatique_par_numero` | Couvert |
| PRP-012 | CA1 | Établissement : historique champ par champ | `B/prospects/tests/test_etablissements.py::test_l_historique_d_un_etablissement_champ_par_champ` | Couvert |
| PRP-012 | CA2 | Aucune suppression physique | `B/prospects/tests/test_doublons.py::test_historique_champ_par_champ_sans_suppression` (le modèle refuse `delete()`, archivage historisé) ; `B/prospects/tests/test_prospects.py::test_archivage_sans_suppression_et_audit_des_modifications` ; `B/prospects/tests/test_etablissements.py::test_recherche_filtres_et_archivage` | Couvert |
| PRP-012 | CA2 | Aucune route `DELETE` sur prospects et établissements | `B/prospects/tests/test_prospects.py::test_aucune_route_ne_supprime_un_prospect` ; `B/prospects/tests/test_etablissements.py::test_aucune_route_ne_supprime_un_etablissement` (le modèle refuse aussi `delete()`) | Couvert |

## Recherche et listes cibles

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PRP-005 | CA1 | Recherche tolérante aux accents et à la casse | `B/prospects/tests/test_recherche.py::test_recherche_tolerante_aux_accents_et_a_la_casse` ; `B/prospects/tests/test_prospects.py::test_recherche_tolerante_et_filtres` | Couvert |
| PRP-005 | CA2 | Seulement le pays actif et le périmètre | `B/prospects/tests/test_recherche.py::test_les_resultats_restent_dans_le_perimetre` ; `::test_etablissements_pagines_et_dans_le_perimetre` ; `B/perimetre/tests/test_isolation_routes.py` | Couvert |
| PRP-005 | CA3 | 20 résultats par page par défaut | `B/prospects/tests/test_recherche.py::test_pagination_vingt_par_page` ; `P` « filtres gardés dans l’adresse, puces retirables et pagination (PRP-005) » | Couvert |
| PRP-011 | CA1 | Ajout et retrait d'un prospect audités | `B/prospects/tests/test_ciblage.py::test_le_superviseur_tient_la_liste_et_chaque_changement_est_audite` ; `::test_qui_tient_quelle_liste` ; `P` « ajoute des prospects du secteur à la liste (PRP-011 CA1) » | Couvert |
| PRP-011 | CA2 | Liste cible disponible hors connexion sur le téléphone | `B/prospects/tests/test_ciblage.py::test_le_delegue_emporte_sa_liste` ; `M` `maListe.test.tsx` « PRP-011 CA2 : la liste du poste est enregistrée sur le téléphone », « PRP-011 CA2 : sans réseau, la liste enregistrée reste consultable » | Couvert (synchronisation incrémentale : cycle 0.8) |

Filtres et tris (spécialité, potentiel, localité, secteur, délégué) : `B/prospects/tests/test_recherche.py::test_filtres_par_specialite_potentiel_lieu_et_delegue`, `::test_tris`.

## Doublons, fusions et propositions

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PRP-007 | CA1 | Nom approchant (faute, accent, « Dr ») suggéré | `B/prospects/tests/test_doublons.py::test_suggestions_pendant_la_saisie` ; `P` « propose les fiches ressemblantes pendant la saisie (PRP-007) » | Couvert |
| PRP-007 | CA2 | Comparaison locale sur les fiches du téléphone | `M` `ressemblances.test.tsx` « PRP-007 CA2 : sans réseau, les fiches du téléphone servent aux suggestions » (fonction `ressemblantesLocales`) | Couvert |
| PRP-007 | CA2 | Formulaire mobile hors connexion : bascule sur la liste enregistrée | `M` `session.test.tsx` « sans réseau, le formulaire suggère les fiches de la liste enregistrée (PRP-007 CA2) » | Couvert |
| PRP-008 | CA1 | Même numéro d'ordre dans le pays : fusion automatique | `B/prospects/tests/test_doublons.py::test_meme_numero_d_ordre_fusion_automatique` ; `B/prospects/tests/test_prospects.py::test_numero_d_ordre_unique_dans_le_pays` | Couvert |
| PRP-008 | CA2 | Même téléphone fixe, noms différents : pas de fusion | `B/prospects/tests/test_doublons.py::test_meme_telephone_fixe_noms_differents_ne_fusionnent_pas` | Couvert |
| PRP-008 | CA3 | Décisions `certain` et `aucun` auditées avec score et critères | `::test_meme_numero_d_ordre_fusion_automatique` ; `::test_meme_telephone_fixe_noms_differents_ne_fusionnent_pas` | Couvert |
| PRP-008 | CA3 | Décision `probable` auditée avec score et critères | `::test_la_decision_probable_est_auditee_avec_score_et_criteres` | Couvert |
| PRP-009 | CA1 | Les deux fiches côte à côte | `::test_homonyme_sans_identifiant_fort_entre_dans_la_file` ; `::test_fusionner_puis_defusionner` (lieux et cibles de chaque fiche) ; `P` « compare les deux fiches côte à côte et garde la paire séparée (PRP-009) » | Couvert |
| PRP-009 | CA2 | « Garder séparées » : la paire ne revient plus | `::test_garder_separees_ne_revient_plus` ; `P` « compare les deux fiches côte à côte et garde la paire séparée (PRP-009) » | Couvert |
| PRP-010 | CA1 | Après défusion, chaque fiche retrouve visites, rapports, exercices, listes cibles | `::test_fusionner_puis_defusionner` (exercices, listes cibles) ; `::test_defusion_d_une_fusion_automatique_par_numero` ; `P` « défait une fusion après confirmation (PRP-010) » | Partiel (cycles 0.4 et 0.5 : visites et rapports) |
| PRP-010 | CA2 | Défusion auditée | `::test_fusionner_puis_defusionner` | Couvert |
| PRP-014 | CA1 | La fiche ne change pas avant acceptation | `::test_proposition_ne_change_rien_avant_acceptation` ; `::test_proposition_refusee_et_nouvel_exercice` ; `P` « le superviseur accepte une proposition ; la valeur actuelle reste visible (PRP-014) » | Couvert |
| PRP-014 | CA2 | Le délégué est notifié de la décision | `::test_proposition_ne_change_rien_avant_acceptation` (décision non lue puis « Vu ») ; `M` `ressemblances.test.tsx` « PRP-014 CA2 : le délégué voit les décisions sur ses propositions » | Couvert |

Autres décisions de la file : `::test_refuser_un_doublon_archive_la_fiche`, `::test_meme_mobile_et_nom_similaire_fusionnent`.

## Imports

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| PRP-013 | CA1 | Simulation sans écriture | `B/imports/tests/test_birdnotes.py::test_la_simulation_n_ecrit_rien_et_donne_le_rapport` ; `P` « simule d’abord, montre le bilan par motif, puis importe pour de bon (CA1, CA2) » | Couvert |
| PRP-013 | CA2 | Rapport d'erreurs téléchargeable | `::test_import_reel_et_rapport_des_anomalies` (motif de chaque ligne) ; `::test_api_reservee_a_l_administrateur_pays` (CSV téléchargé) ; `P` « simule d’abord, montre le bilan par motif, puis importe pour de bon (CA1, CA2) » | Couvert |
| PRP-013 | CA3 | Doublons signalés gardés pour la file | `::test_les_doublons_signales_sont_gardes` | Couvert |
| PRP-013 | CA4 | Réimport idempotent | `::test_un_reimport_ne_cree_rien_de_nouveau` ; `::test_les_exercices_viennent_de_l_etablissement_de_la_fiche` | Couvert |
| ORG-014 | CA1 | Simulation : créations comptées, rien d'écrit | `B/imports/tests/test_organisation.py::test_la_simulation_n_ecrit_rien` ; `::test_api_import_organisation` | Couvert |
| ORG-014 | CA1 | Simulation : modifications comptées | `::test_la_simulation_compte_les_modifications` (nouveau superviseur, produit ajouté au portefeuille, rien d'écrit) | Couvert |
| ORG-014 | CA1 | Portail : simulation du fichier d'organisation affichée | `P` « simule un fichier d’organisation et affiche son bilan (ORG-014 CA1) » | Couvert |
| ORG-014 | CA2 | Chaque ligne rejetée a un motif | `::test_import_motifs_poste_vacant_et_reimport` | Couvert |
| ORG-014 | CA3 | « Non pourvu » : poste vacant | `::test_import_motifs_poste_vacant_et_reimport` | Couvert |
| ORG-014 | CA4 | Réimport sans doublon | `::test_import_motifs_poste_vacant_et_reimport` | Couvert |

## Contrôles transverses du cycle 0.1

- Isolation : les routes du cycle (référentiel, prospects, établissements, exercices, listes cibles, doublons, fusions, propositions, imports) passent par `B/perimetre/tests/test_couverture_routes.py`, `B/perimetre/tests/test_isolation_routes.py` et la matrice `B/perimetre/tests/test_matrice.py`.
- Sécurité au niveau des lignes : `B/perimetre/tests/test_securite_lignes.py::test_toute_table_rattachee_a_un_pays_est_protegee` couvre les nouvelles tables.
- Accessibilité : analyse axe-core des pages Référentiels, Prospects, Établissements, Imports et Listes cibles (`P`). Doublons et Propositions l'ont depuis 0.1.9 (`P` « compare les deux fiches côte à côte… », « le superviseur accepte une proposition… »).
- Démonstration : `B/demonstration/tests/test_demonstration.py::test_la_demonstration_se_reinitialise_par_une_commande` vérifie les exercices et les listes cibles fictives.
- Traçabilité : chaque exigence livrée est citée par un test (`backend/tests/test_tracabilite.py`).

## Écarts

Aucun critère « Non couvert ». Les critères « Partiel » attendent les cycles 0.2, 0.4 et 0.5 et seront testés avec eux.

# Recette du cycle 0.7 — Indicateurs de pilotage

Version de clôture : **0.7.9**. Chaque critère d'acceptation (CA) du PRD prévu en `0.7.x` (DSH-001 à DSH-012, RPT-019) est relié au test automatisé qui le prouve. S'y ajoutent les décisions du cycle (DC-49, DC-50, DC-53, DC-57 ; DC-52 reportée), les sections de mise en œuvre (prd.md §14.51 à §14.59) et leurs décisions [D] prises par délégation, ainsi que les scénarios de recette REC-09 (partie Grafana) et REC-10 (prd.md §21.1). Le test `backend/tests/test_tracabilite.py` échoue si une exigence livrée n'est citée par aucun test.

Légende :
- **Couvert** : le critère est entièrement prouvé par un test automatisé.
- **Partiel** : une partie est prouvée ; le reste figure dans « Écarts » ou attend un cycle suivant (indiqué).
- **Non couvert** : aucun test ; chaque cas figure dans « Écarts ».

Abréviations : `P/` = `backend/apps/pilotage/tests/`, `PP` = `portail/src/pages/Pilotage.test.tsx`, `PO` = `portail/src/pages/Objectifs.test.tsx`, `MMC` = `mobile/__tests__/mesChiffres.test.tsx`, `M` = `backend/apps/perimetre/tests/test_matrice.py`, `I` = `backend/apps/perimetre/tests/test_isolation_routes.py`.

## Mes chiffres du délégué (0.7.1)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| DSH-001 | — | Visites prévues et faites, couverture de la liste cible, rapports soumis, validés, en retard ; la semaine, la précédente, le cycle | `P/test_mes_chiffres.py::test_dsh001_les_chiffres_de_la_semaine` ; `::test_couverture_de_la_liste_cible` ; `MMC` « DSH-001 : les chiffres de la semaine, sans note ni classement » | Couvert |
| DSH-001 | CA1 | Sans réseau : les derniers chiffres reçus et leur heure | `MMC` « DSH-001 CA1 : sans réseau, les derniers chiffres et leur heure » | Couvert |
| DSH-001 | — | Chacun ses chiffres ; une autre semaine ; une date invalide est refusée | `P/test_mes_chiffres.py::test_dsh001_chacun_ses_chiffres` ; `::test_dsh001_une_autre_semaine_et_une_date_invalide` | Couvert |

## Tableau de l'équipe, réseaux, pays, siège (0.7.2 à 0.7.4)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| DSH-012 | CA1 | Chaque taux a une formule bornée à 100 % ; une visite imprévue n'abaisse aucun taux | `P/test_mes_chiffres.py::test_taux_bornes_a_100` ; `::test_dsh012_ca1_une_visite_imprevue_n_abaisse_aucun_taux` | Couvert |
| DSH-012 · DC-49 | — | Délégués côte à côte, ordre alphabétique, total ; ni note, ni rang, ni « meilleur » | `P/test_equipe.py::test_dsh012_les_delegues_cote_a_cote_et_le_total` ; `PP` « DSH-012 : les délégués côte à côte, le total de l'équipe, sans classement » | Couvert |
| DSH-012 | CA2 | Sans visite, « Aucune activité » | `MMC` « DSH-012 CA2 : sans visite, « Aucune activité » » ; `PP` « DSH-012 … » | Couvert |
| DSH-002 | CA1 | Un délégué non rattaché n'apparaît jamais | `P/test_equipe.py::test_dsh002_ca1_un_delegue_non_rattache_n_apparait_jamais` ; `::test_pilotage_reserve_au_superviseur` | Couvert |
| DSH-003 | — | DM et DF : leurs réseaux ; regroupements par réseau, zone, secteur | `P/test_equipe.py::test_dsh003_le_dm_et_le_df_voient_leurs_reseaux` ; `PP` « DSH-003 : par réseau, une ligne de total par réseau, dépliable sur ses délégués » | Couvert |
| DSH-003 | CA1 | Le total d'un réseau est la somme de ses délégués ; un poste de deux réseaux compte dans chacun, une fois au total | `P/test_equipe.py::test_dsh003_ca1_le_total_d_un_reseau_est_la_somme_de_ses_delegues` ; `::test_dsh003_un_poste_de_deux_reseaux_compte_dans_chacun_une_fois_au_total` | Couvert |
| DSH-004 · REC-10 | — | Le siège compare les pays, agrégés, sans aucun nom ; total de tous les pays | `P/test_siege.py::test_dsh004_comparaison_et_total_par_pays_sans_aucun_nom` ; `PP` « DSH-004 : le siège voit les pays sans aucun nom, et descend au nominatif d'un pays » | Couvert |
| DSH-004 | CA1 | Chaque consultation nominative du siège crée un événement d'audit ; le bandeau le rappelle | `P/test_siege.py::test_dsh004_ca1_la_descente_nominative_du_siege_est_auditee` ; `PP` « DSH-004 CA1 : en descente nominative, le siège est prévenu de l'audit » | Couvert |

## Filtres, objectifs, délais, exports (0.7.5 à 0.7.8)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| DSH-005 | — | Périodes (semaine à un an, dates choisies ≤ 1 an) ; chaque filtre restreint | `P/test_filtres.py::test_dsh005_periodes` ; `::test_dsh005_dates_invalides` ; `::test_dsh005_chaque_filtre_restreint` ; `PP` « DSH-005 : la période et les filtres du périmètre passent au serveur » | Couvert |
| DSH-005 | CA1 | Les valeurs proposées sont celles du seul périmètre | `P/test_filtres.py::test_dsh005_ca1_les_options_sont_celles_du_perimetre` | Couvert |
| DSH-006 · DC-50 | CA1 | Réalisation = prévues effectuées / prévues échues (KPI-03) ; écarts justifiés, second chiffre distinct | `P/test_objectifs.py::test_dsh006_ca1_la_realisation_suit_la_definition_de_kpi_03` | Couvert |
| DSH-009 | CA1 | Un objectif a une période, un réseau, un indicateur, une cible ; saisies incohérentes refusées ; produit du portefeuille | `P/test_objectifs.py::test_dsh009_saisies_refusees` ; `::test_dsh009_presentations_d_un_produit` ; `PO` « DSH-009 CA1 : un nouvel objectif a une période, un réseau, un indicateur et une cible » | Couvert |
| DSH-009 | CA2 | L'avance ou le retard à ce jour (attendu au prorata, [D] délégation) ; états | `P/test_objectifs.py::test_dsh009_ca1_ca2_le_dm_fixe_un_objectif_et_suit_son_retard` ; `::test_dsh009_etats` ; `PO` « DSH-009 : chaque objectif, son avancement et l'attendu à ce jour » | Couvert |
| DSH-009 | — | Seuls le DM du réseau et l'administrateur pays fixent ; modification et archivage audités, archivage confirmé | `P/test_objectifs.py::test_dsh009_seuls_le_dm_du_reseau_et_l_administrateur_pays` ; `::test_dsh009_modifier_et_archiver` ; `PO` « archiver demande confirmation avant d'agir » | Couvert |
| DSH-007 | CA1 | Délais en heures ouvrées du pays (week-ends et fériés exclus) ; médiane, décisions, part en moins d'un jour ouvré ; au siège par pays | `P/test_delais.py::test_dsh007_ca1_heures_ouvrees_du_pays` ; `::test_dsh007_une_decision_compte_dans_la_periode_ou_elle_est_prise` ; `::test_dsh007_mediane_sans_decision_et_cible` ; `::test_dsh007_au_pilotage_et_au_siege` ; `PP` « DSH-007 : délais de validation… » | Couvert |
| RPT-019 · DSH-008 | CA1 | L'export ne contient que le périmètre ; ni le délégué ni l'administrateur pays n'exportent | `P/test_exports.py::test_rpt019_ca1_le_perimetre_seulement` ; `M` (`pilotage.exporter`) | Couvert |
| RPT-019 · DSH-008 | CA2 | Chaque export crée un événement d'audit (format, période, filtres, lignes) ; CSV et Excel ; cellules neutralisées | `P/test_exports.py::test_rpt019_ca2_indicateurs_en_csv_audites` ; `::test_rpt019_rapports_soumis_et_texte_neutralise` ; `::test_dsh008_classeur_excel` ; `PP` « RPT-019 : exporter le tableau ou les rapports… » | Couvert |

## Grafana, fraîcheur, prescription (0.7.9)

| Exigence | CA | Critère | Test(s) | Statut |
|---|---|---|---|---|
| DSH-010 · REC-09 | CA1 | Un rôle de pays ne lit que ses vues ; aucune table métier | `P/test_grafana.py::test_dsh010_ca1_ca2_chaque_pays_ne_lit_que_ses_vues` (rôles réels, `SET ROLE`) | Couvert |
| DSH-010 | CA2 | Le siège lit l'agrégat par pays, pas le détail par réseau | `P/test_grafana.py::test_dsh010_ca1_ca2_chaque_pays_ne_lit_que_ses_vues` | Couvert |
| DSH-010 | CA3 | Aucun texte libre ni nom dans le schéma `pilotage` | `P/test_grafana.py::test_dsh010_ca3_aucun_texte_libre_ni_nom` | Couvert |
| DSH-010 | — | Rôles créés sans mot de passe ; provisionnement sans secret | `P/test_grafana.py::test_dsh010_instructions_sans_mot_de_passe` | Couvert |
| DSH-011 | CA1 | L'heure du dernier calcul s'affiche (portail, Grafana) | `PP` « DSH-012 … » (« calculé à ») ; `P/test_grafana.py::test_dsh011_fiabilite_les_jours_font_le_tableau_du_pays` (vue `fraicheur`) | Couvert |
| DSH-011 | — | Grafana à moins d'une heure, portail à moins de 5 minutes | Planification `config/celery.py` (minute 7) et `refetchInterval` du portail : relus, non testés automatiquement | Partiel (écart 1) |
| — | — | Fiabilité : la somme des jours de Grafana égale le tableau du pays | `P/test_grafana.py::test_dsh011_fiabilite_les_jours_font_le_tableau_du_pays` | Couvert |
| DC-53 | — | Tendance par produit, agrégée, période et précédente ; aucun nom de prescripteur ; périmètre seulement | `P/test_prescription.py::test_dc53_tendance_agregee_par_produit` ; `::test_dc53_le_perimetre_seulement` ; `PP` « DC-57, DC-53 : … » | Couvert |
| DC-57 | — | Points d'attention par règles, reliés à leurs visites ; l'action n'est plus en retard si le délégué est revenu | `P/test_prescription.py::test_dc57_points_d_attention_relies_a_leurs_visites` ; `::test_dc57_l_action_n_est_plus_en_retard_si_le_delegue_est_revenu` ; `PP` « DC-57, DC-53 : … » | Couvert |
| DC-52 | — | Position de référence à partir de deux pointages, validée sur carte | Reportée au cycle 0.8 par délégation (§14.59) | Cycle 0.8 |

## Écarts

1. **Fréquence des rafraîchissements** (DSH-011) : la planification horaire et le rechargement du portail sont relus mais pas testés de bout en bout ; le contrôle se fera sur l'environnement hébergé (0.9.5), avec le panneau « Fraîcheur des données ».
2. **Grafana lui-même** n'a pas tourné ici : les requêtes des deux tableaux ont été exécutées sous les rôles de chaque pays et du siège sur la base de démonstration ; l'affichage dans Grafana se vérifiera à son installation (O-04, 0.9.5).

# Démonstration de fin de cycle 0.7 — Indicateurs de pilotage

Scénario d'environ 30 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Le mot de passe vient de la variable d'environnement et ne s'écrit nulle part. Noter les comptes affichés (README, « Démonstration ») : un délégué, son superviseur, le DM du périmètre, le responsable pays et la direction du siège.
2. Valider quelques journées depuis « À traiter » (superviseur), pour que les délais de validation des rapports aient des décisions à montrer.
3. Avec le compte du DM, créer un objectif sur son réseau (« Objectifs », « Nouvel objectif »), par exemple 40 visites sur le mois.
4. Calculer les agrégats de Grafana : `python manage.py rafraichir_grafana` (le worker le fait chaque heure).
5. Ouvrir le portail sur un ordinateur, le téléphone du délégué à côté (README, « Sur un iPhone »).

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Délégué (téléphone) | « **Mes chiffres** » : visites prévues et faites, couverture, rapports, la semaine précédente en comparaison ; couper le réseau : les chiffres restent, avec leur heure | DSH-001 CA1 |
| 2 | Superviseur (portail) | « **Pilotage** » : ses délégués côte à côte, par ordre alphabétique, chaque taux avec « n sur m », sans note ni rang ; « Aucune activité » pour un délégué sans visite ; « calculé à … » à côté de la période | DSH-002, DSH-012, DC-49, DSH-011 |
| 3 | DM | « Regrouper » par réseau : une ligne de total par réseau, dépliable ; le total est la somme des délégués | DSH-003 CA1 |
| 4 | Responsable pays | Période « 90 derniers jours », puis un filtre de zone et « Avec activité » : les listes ne proposent que le pays ; « Effacer les filtres » | DSH-005 CA1 |
| 5 | Responsable pays | « **Délais de validation** » : médianes des plannings et des rapports en heures ouvrées, part des décisions en moins d'un jour ouvré | DSH-007 CA1 |
| 6 | Responsable pays | « **Points d'attention** » : prescripteurs passés à « prescrit », en baisse, actions promises en retard ; « Voir les visites ». Puis « **Tendance de prescription** » par produit, agrégée | DC-57, DC-53 |
| 7 | DM | Les mêmes points : un clic sur une visite ouvre la journée du délégué | DC-57 |
| 8 | Responsable pays | « **Exporter** » : les indicateurs en classeur Excel, les rapports en CSV ; ouvrir les fichiers ; le journal d'audit montre les deux exports, avec leurs filtres et leur nombre de lignes | RPT-019 CA1 et CA2 |
| 9 | DM | « **Objectifs** » : l'objectif créé, son avancement, le trait de l'attendu à ce jour, « En avance » ou « En retard » ; le superviseur le lit sans pouvoir le modifier | DSH-009 CA1 et CA2 |
| 10 | Direction du siège | « Pilotage » sans pays : un tableau par pays, sans nom, le total, les délais par pays ; « Voir les délégués » d'un pays : le bandeau rappelle que la consultation est auditée | DSH-004 CA1, REC-10 |
| 11 | — | Grafana : si le service est installé (`docs/grafana.md`), l'organisation du pays affiche son tableau ; une requête sur la vue d'un autre pays répond « permission denied ». Sinon, montrer `recette-0.7.md` et le test qui prouve l'isolation avec les rôles réels | DSH-010, REC-09 |

## Messages clés

- Chaque rôle ouvre ses chiffres sans rien remplir ; aucun classement des délégués, des taux bornés et expliqués.
- Le siège compare les pays sans voir de nom ; descendre au nominatif est tracé.
- Les points d'attention disent quoi regarder et renvoient aux visites ; rien ne part vers un service extérieur.
- Exports et Grafana restent dans le périmètre et le pays de chacun.

## Ce qui reste hors de ce cycle

- Position de référence des établissements (DC-52) : cycle 0.8.
- Grafana hébergé, comptes et mots de passe des rôles : installation en 0.9.5 (O-04).

# Démonstration de fin de cycle 0.1 — Référentiel

Scénario d'environ 25 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Noter les comptes affichés. La base contient déjà quelques paires de doublons probables et une proposition de modification en attente.
2. Activer à l'avance la double authentification des comptes marqués `*`.
3. Ouvrir le portail sur un ordinateur. Sur l'iPhone : `make telephone` sur l'ordinateur, même Wi-Fi, puis scanner le QR code avec l'appareil photo (README, « Sur un iPhone »).
4. Pour l'étape 9, préparer un classeur d'organisation **fictif** (jamais le fichier réel).

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Administrateur pays (Sénégal) | Accueil : « Qualité des données », ce qui reste à trancher puis les fiches à compléter ; un clic ouvre la liste filtrée | 0.1.9 |
| 2 | Administrateur pays | Référentiels : types, spécialités par type, classes, produits ; portefeuille d'un réseau | PRP-001, ORG-004 |
| 3 | Administrateur pays | Prospects : recherche sans accent (« ndiaye »), filtres, tri, pagination ; fiche, lieux d'exercice, historique des modifications | PRP-002, PRP-004, PRP-005, PRP-012 |
| 4 | Administrateur pays | Établissements : liste et carte, « sans position » ; créer un établissement avec son secteur | PRP-003 |
| 5 | Administrateur pays | Doublons : comparer une paire côte à côte, fusionner ; onglet « Fusions » : défaire la fusion | PRP-009, PRP-010 |
| 6 | Administrateur pays | Propositions : accepter ou refuser avec un motif la modification proposée par le délégué | PRP-014 |
| 7 | Superviseur | Listes cibles des postes de son équipe : ajouter un prospect, changer la fréquence, voir la charge du poste | PRP-011 |
| 8 | Délégué (iPhone) | Ma liste ; nouveau prospect : les fiches ressemblantes apparaissent dès la saisie ; la fiche sans doublon devient commune, sinon elle attend l'administrateur pays ; sur l'accueil, la décision sur sa proposition | PRP-006, PRP-007, PRP-008, PRP-014 |
| 9 | Administrateur pays | Imports : simuler le classeur d'organisation fictif, lire les rejets motivés, importer ; un second import ne crée rien | ORG-014 |
| 10 | Administrateur pays | Imports : historique des lots BirdNotes et rapport d'anomalies | PRP-013 |

## Messages clés

- Une seule fiche par professionnel de santé : les doublons sont signalés pendant la saisie, détectés à l'enregistrement et tranchés par l'administrateur pays ; une fusion se défait.
- Le délégué ne modifie pas une fiche commune : il propose, l'administration décide, et chaque champ changé reste dans l'historique.
- La recette du cycle est dans `recette-0.1.md` : chaque critère d'acceptation est relié au test qui le prouve.
- Prochain cycle (0.2, Planning) : préparation de la semaine depuis la liste cible.

## Après la séance

Réinitialiser la base (étape 1) : la démonstration suivante repart du même état.

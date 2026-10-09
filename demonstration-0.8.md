# Démonstration de fin de cycle 0.8 — Mobilité

Scénario d'environ 30 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran. Ce cycle se montre surtout **sur un téléphone** : prévoir le build `recette` (README, « Builds de test Android et iOS ») ou, à défaut, l'application ouverte dans le navigateur (`npx expo start --web`).

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Le mot de passe vient de la variable d'environnement et ne s'écrit nulle part. Noter les comptes affichés : le délégué, son superviseur, l'administrateur pays.
2. Se connecter au téléphone avec le délégué et laisser la synchronisation se faire.
3. Pour l'étape 8, il faut un établissement sans position et trois visites pointées par deux délégués : la démonstration n'en crée pas d'elle-même ; montrer sinon `recette-0.8.md` et les tests de DC-52.
4. Ouvrir le portail sur un ordinateur, à côté du téléphone.

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Délégué (téléphone) | Le profil : « Données hors connexion » (visites, prospects, rapports gardés), la ligne « Synchronisé à … » sous chaque en-tête | OFF-001, OFF-003 CA1 |
| 2 | Délégué | Passer en **mode avion** : ouvrir la tournée, démarrer une visite, écrire le rapport, proposer une correction de fiche ; la ligne passe à « 3 envois en attente » | OFF-002, OFF-003 |
| 3 | Délégué | Joindre un PDF sans réseau : « Annoncée, en attente du fichier » | OFF-005 |
| 4 | Délégué | Rétablir le réseau : la file se vide d'elle-même ; au portail, le superviseur voit le rapport une seule fois, avec « pièce en attente » puis le document | OFF-003 CA2, OFF-005 CA1, REC-07 |
| 5 | Superviseur puis délégué | Le superviseur modifie l'heure d'une visite que le délégué a aussi changée sans réseau : au retour, le téléphone montre les deux versions, le délégué choisit | OFF-004 CA2, RG-053 |
| 6 | Superviseur | Demander une correction : la notification arrive au centre (et en push si le service est actif, `docs/notifications-push.md`) ; le texte ne porte aucun nom | NOT-002, NOT-003 |
| 7 | Délégué | Profil, « Notifications sur ce téléphone » : couper « Rapports validés » ; « Correction demandée » est grisée, « Obligatoire » | NOT-005 |
| 8 | Administrateur pays (portail) | « Établissements » : le bandeau « 1 position proposée attend votre validation » ; la fiche montre les pointages et le point proposé ; un clic le déplace ; « Valider cette position » ; l'historique dit « position proposée validée » | DC-52 |
| 9 | Administrateur pays | « Équipe », révoquer le téléphone du délégué : à l'ouverture suivante, le téléphone efface ses données et revient à la connexion | SEC-006, REC-17 |
| 10 | — | Le poids d'une synchronisation : `python manage.py mesurer_synchro <délégué>` (environ 25 Ko compressés) | OFF-006 |

## Messages clés

- Le délégué travaille une semaine sans réseau ; il voit toujours ce qui attend d'être envoyé, et rien n'est envoyé deux fois.
- Un conflit ne se règle jamais en silence ; une décision du superviseur l'emporte toujours.
- Les notifications ne disent rien de sensible sur l'écran verrouillé ; seuls les courriels de sécurité existent.
- Un téléphone perdu s'efface à distance ; la base du téléphone est chiffrée.

## Ce qui reste hors de ce cycle

- Les essais sur le terrain (`docs/essais-terrain.md`) : sur place, avec des délégués.
- Le push réel (clés Apple et Google, service actif) : à l'hébergement, 0.9.5.
- Le dépôt du dossier CDP (`docs/dossier-cdp.md`) : par le responsable du traitement, avant le pilote.

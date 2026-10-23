# Essais de terrain du cycle 0.8 (version 0.8.9)

Ce protocole vérifie, sur de vrais téléphones et de vrais réseaux, ce que les tests automatiques ne peuvent pas prouver (`recette-0.8.md`, « Écarts »). **Il se mène sur place, avec des délégués volontaires** : il ne peut pas être joué depuis l'environnement de développement. Toutes les données utilisées sont celles de la démonstration ou d'une préproduction, jamais des données réelles de prospects avant les formalités CDP (`docs/dossier-cdp.md`).

## Préparer

| Élément | Détail |
|---|---|
| Instance | Une préproduction joignable depuis Internet (0.9.5) ou, à défaut, l'instance d'essai (`ENVIRONNEMENT=demonstration` ; depuis 1.0.8, elle part vide et les comptes se créent depuis le portail) |
| Téléphones | Au moins un Android d'entrée de gamme (2 Go de mémoire, Android 10 ou plus) et un iPhone (iOS 16 ou plus), chacun avec le build `recette` (README, « Builds de test Android et iOS ») |
| Comptes | Deux délégués de la même équipe, leur superviseur, l'administrateur pays (comptes de la démonstration ; mots de passe transmis à part, jamais par écrit dans un ticket) |
| Lieux | Un cabinet en ville (bonne couverture), un poste de santé en zone rurale (2G/EDGE ou 3G faible), un trajet sans réseau |
| Outils | `python manage.py mesurer_synchro <identifiant>` sur le serveur ; sur Android, les options pour développeurs (« Profil de réseau ») ; un chronomètre ; la grille ci-dessous |

## Essais

| # | Exigence | Déroulé | Attendu | Résultat |
|---|---|---|---|---|
| T1 | OFF-001 CA1, REC-06 | Synchroniser le lundi matin, passer en mode avion jusqu'au vendredi soir. Chaque jour : ouvrir la tournée, démarrer et terminer les visites, rédiger les rapports, consulter la liste cible et l'historique d'un prospect | Tout s'affiche et s'écrit sans réseau ; la ligne « Synchronisé le … · n envois en attente » grandit | |
| T2 | OFF-003 CA2, REC-07 | Fin de T1 : rétablir le réseau, puis le couper au milieu de l'envoi (mode avion pendant 5 s), puis le rétablir | La file se vide d'elle-même ; au portail, chaque visite et chaque rapport apparaît **une seule fois** | |
| T3 | OFF-006 CA1 | Sur le poste de santé rural : chronométrer une synchronisation complète. Au serveur, lancer `mesurer_synchro` pour le même délégué | Synchronisation terminée en moins de 2 minutes en 3G faible ; poids mesuré sous 500 Ko | |
| T4 | OFF-005 CA1 | Sans réseau, joindre un PDF de 5 Mo à un rapport et le soumettre ; rétablir un réseau faible | Le rapport arrive d'abord (« pièce en attente » au portail), le document ensuite ; il s'ouvre une fois arrivé | |
| T5 | NOT-002, NOT-003 | Instance avec push actif (`docs/notifications-push.md`). Le superviseur demande une correction ; l'application est fermée, puis le téléphone redémarré | La notification arrive dans les 15 minutes, sans nom sur l'écran verrouillé ; le toucher ouvre le rapport à corriger | |
| T6 | SEC-005 CA1 | Android de test seulement : extraire le fichier de la base locale (`adb` avec le build `recette`), essayer de l'ouvrir avec `sqlite3` | « file is not a database » : illisible sans la clé | |
| T7 | SEC-006, OFF-007, REC-17 | L'administrateur pays révoque le téléphone d'un délégué ; le délégué rouvre l'application. Sur un autre téléphone, avancer la date de 8 jours sans synchroniser | Données effacées et retour à la connexion ; au 8ᵉ jour, « Synchronisation nécessaire » et la file conservée | |
| T8 | DC-52 | Deux délégués démarrent trois visites dans un établissement sans position ; l'administrateur pays ouvre la fiche | « Position proposée » avec les trois pointages ; validée, la visite suivante a sa distance | |
| T9 | Ergonomie | Chaque délégué fait sa journée normale avec l'application, puis répond aux questions ci-dessous | Réponses consignées | |

Questions de T9, posées sans orienter la réponse :
1. Qu'est-ce qui vous a fait perdre du temps aujourd'hui ?
2. Y a-t-il un moment où vous n'avez pas su si vos données étaient envoyées ?
3. Qu'est-ce que vous faisiez dans l'outil actuel et que vous n'avez pas trouvé ?
4. La batterie a-t-elle tenu la journée ?

## Consigner

Pour chaque essai, noter : date, lieu, téléphone (modèle, système), réseau observé, résultat (« conforme » ou l'écart constaté), capture d'écran si utile. Un écart devient un ticket avec sa gravité (critique, majeur, mineur) ; un défaut critique ou majeur sur la synchronisation bloque le passage au cycle 0.9 (prd.md §21.3).

## Ce que l'équipe de développement prépare

- `mesurer_synchro` pour comparer le poids mesuré sur le terrain et celui du serveur.
- Le build `recette` des deux plateformes (EAS).
- Le nettoyage de l'instance d'essai après les essais (base recréée chez Neon ; `reinitialiser_demo` est retirée en 1.0.8).

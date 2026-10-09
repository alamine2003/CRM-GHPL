# Pilote contrôlé au Sénégal (version 0.9.7)

Ce document organise le pilote prévu par la feuille de route (prd.md §23) :
- **qui** : un superviseur et 2 à 5 délégués d'un même réseau ;
- **combien de temps** : au moins 4 semaines, avant une extension décidée selon les résultats.

C'est la condition 4 de la 1.0.0 (prd.md §21.2) : un pilote d'au moins 4 semaines avec au moins un réseau complet, et les indicateurs KPI-01 à KPI-07 mesurés et présentés.

> **Le pilote se fait sur le terrain, avec de vraies personnes et de vraies données.** Rien ne peut le remplacer depuis le dépôt. Ce kit le prépare : conditions de départ, déroulé, mesure, décision.

## 1. Conditions avant le premier jour

Le pilote ne commence pas tant qu'une seule de ces cases reste vide.

| Condition | Preuve | Responsable |
|---|---|---|
| Formalités CDP accomplies (déclaration, autorisation de transfert hors du Sénégal) | Récépissé de la CDP (`docs/dossier-cdp.md`) | Responsable du traitement |
| Hébergement de production sur offres payantes, sauvegarde de nuit et test de restauration réussi | Guide d'exploitation §2, §8 ; essai consigné | Administrateur technique |
| Version installée : la dernière 0.9.x, CI verte | `/api/health/` | Responsable technique |
| Données BirdNotes reprises après une répétition à blanc conforme | `repeter_migration` sans écart ; rapport d'anomalies lu | Administrateur pays |
| Organisation du pays : réseau du pilote, postes, rattachements, listes cibles | Page « Organisation », listes cibles | Administrateur pays |
| Comptes créés, rôles attribués, double authentification activée pour l'encadrement | Page « Utilisateurs » | Administrateur pays |
| Applications installées sur les téléphones (Android, iPhone) par la distribution choisie | Un téléphone par délégué, connecté | Responsable technique |
| Formation donnée (1 h 30 par délégué, 1 h pour le superviseur) avec les guides | `docs/guides/` | Responsable pays |
| Essais de terrain du cycle 0.8 passés sans défaut bloquant | `docs/essais-terrain.md` | Responsable technique |

## 2. Qui fait quoi

| Rôle | Pendant le pilote |
|---|---|
| Délégués (2 à 5) | Travaillent uniquement dans INNOV CRM : planning, visites, rapports. BirdNotes reste ouvert en lecture seule. |
| Superviseur | Approuve les plannings, valide les journées, signale tout défaut dans l'heure. |
| Administrateur pays | Corrige l'organisation et les fiches, traite les doublons, recueille les défauts. |
| Responsable technique | Suit Sentry et la page « Exploitation », corrige ; publie les correctifs (`docs/mise-a-jour.md`). |
| Responsable pays | Préside le point hebdomadaire, décide de l'extension. |

## 3. Déroulé

| Semaine | Contenu |
|---|---|
| S0 (la semaine d'avant) | Formation ; chaque délégué prépare et soumet son planning de S1 dans INNOV CRM ; le superviseur l'approuve. |
| S1 | Premières tournées. Point quotidien de 15 minutes (téléphone) avec le superviseur la première semaine. |
| S2 à S4 | Régime normal. Point hebdomadaire le lundi (30 minutes) : indicateurs, défauts, décisions. |
| Fin de S4 | Bilan : indicateurs des 4 semaines, défauts, avis des délégués (questionnaire du §6), décision d'extension. |

Le planning de S1 doit être soumis avant l'échéance du pays (jeudi 18 h par défaut). Il est approuvé avant la fermeture du lundi 0 h.

## 4. Mesure des indicateurs

Chaque lundi, pour la semaine écoulée, puis à la fin pour les 4 semaines :

```bash
python manage.py rapport_pilote --pays SN --du AAAA-MM-JJ --au AAAA-MM-JJ --reseau <identifiant du réseau>
```

La commande donne, pour les délégués du réseau, chaque indicateur, sa cible [H] et s'il est atteint :

| Indicateur | Ce que la commande mesure | Cible [H] |
|---|---|---|
| KPI-01 Plannings soumis à l'heure | Plannings soumis avant l'échéance / plannings attendus (un par délégué et par semaine) | ≥ 90 % |
| KPI-02 Délai de validation des plannings | Médiane, en heures ouvrées, entre soumission et décision | < 1 jour ouvré |
| KPI-03 Taux de réalisation | Visites approuvées faites / visites approuvées échues, avec la part des écarts justifiés | ≥ 85 % |
| KPI-04 Rapports dans le délai | Rapports soumis le jour de la visite / visites faites | ≥ 90 % |
| KPI-05 Adoption | Délégués dont le téléphone a synchronisé au moins 3 jours dans la semaine / délégués | ≥ 80 % |
| KPI-06 Isolation | Prouvé par la suite d'isolation à chaque livraison (CI) ; aucune donnée d'un autre pays, réseau ou délégué ne doit apparaître pendant le pilote | 0 |
| KPI-07 Rapports jamais reçus | Signal du serveur : visites faites depuis plus de 48 h sans rapport reçu. **À confirmer sur chaque téléphone** : la file d'envoi doit être vide : aucun bandeau « … envois en attente » (guide du délégué, « La file d'envoi ») | 0 |
| KPI-09 Délai de validation des rapports | Médiane entre soumission et décision | < 1 jour ouvré |

`--json` garde le résultat dans un fichier, pour le bilan. Le tableau de pilotage du portail donne les mêmes chiffres, délégué par délégué.

## 5. Défauts

Chaque défaut se consigne dans un tableau partagé :
- date ;
- qui ;
- téléphone ou portail ;
- étapes pour le reproduire ;
- capture sans donnée de patient ;
- gravité ;
- référence de l'erreur si l'écran en affiche une.

| Gravité | Définition | Délai de correction |
|---|---|---|
| Critique | Perte ou fuite de données, blocage du travail de tous | Le jour même ; le pilote s'arrête s'il n'y a pas de contournement |
| Majeur | Un parcours essentiel bloqué pour une personne, un indicateur faux | Avant le point hebdomadaire suivant |
| Mineur | Gêne, libellé, présentation | Version suivante (0.9.8) |

## 6. Questionnaire de fin de pilote (délégués et superviseur)

1. Combien de temps vous faut-il pour préparer votre semaine ? (avant / avec INNOV CRM)
2. Combien de temps pour un rapport de visite ?
3. Avez-vous perdu des données, ou cru en perdre ? Quand ?
4. Avez-vous travaillé sans réseau ? L'application a-t-elle suivi ?
5. Qu'est-ce qui vous a le plus gêné ? Qu'est-ce qui vous a le plus aidé ?
6. Recommanderiez-vous l'application à vos collègues ? (de 0 à 10)

## 7. Décision de fin de pilote

| Résultat | Décision |
|---|---|
| KPI-01, 03, 04, 05 atteints, KPI-06 et KPI-07 à 0, aucun défaut critique ou majeur ouvert | Extension au reste du réseau, puis aux autres réseaux par vagues |
| Un indicateur manqué de peu, défauts mineurs seulement | Prolonger de 2 semaines avec les corrections |
| Défaut critique non résolu, perte de données, KPI-06 ou KPI-07 non nul | Arrêt ; retour à BirdNotes ; analyse et nouvelle version avant de reprendre |

La décision est écrite, datée et signée par le responsable pays. Elle entre dans le dossier de lancement de la 1.0.0 (prd.md §21.2, condition 9).

# Tests de charge (version 0.9.4)

Ce guide vérifie que l'application tient le volume d'un pays de **500 délégués** (NFR-001) dans les temps du PRD (NFR-002, DC-56) :

- **500 ms** au 95e centile côté serveur, pour les écrans courants ;
- **1 s** pour le portail sur une bonne connexion ;
- **2 s** perçues sur le téléphone en 3G.

Il existe deux mesures complémentaires :

1. **Dans le serveur**, sans réseau. Elle peut se faire partout, même sur un poste de développement, et isole le travail de l'application et de la base.
2. **Par le réseau**, sur la préproduction, avec k6. Elle ajoute le réseau, l'hébergeur et la concurrence entre utilisateurs.

## 1. Créer la base de charge

```bash
createdb innov_charge
DATABASE_URL=postgres://…/innov_charge python manage.py migrate
DATABASE_URL=postgres://…/innov_charge INNOV_DEMO_MOT_DE_PASSE=… \
  python manage.py generer_charge --delegues 500 --oui   # retirée en 1.0.8, voir ci-dessous
```

> **1.0.8** : `generer_charge` et les autres commandes de données fictives sont retirées (prd.md §14.81). Une nouvelle mesure à 500 délégués demandera une base de charge construite autrement ; les tests automatiques gardent leurs données fictives.

`generer_charge` partait de la démonstration (données fictives) aux proportions d'un vrai pays, puis donne à chaque délégué trois semaines approuvées :

| Élément | Volume |
|---|---|
| Postes | 550 |
| Superviseurs | 58 |
| DM | 16 |
| Prospects | 6 000 |
| Semaines par délégué | deux semaines terminées et la semaine en cours |
| Densité | 8 visites par jour et par délégué, comme le PRD (NFR-001 : environ 70 000 visites par jour pour 8 500 délégués), prises dans la liste cible |
| Activité | les visites passées faites, leurs rapports rédigés, la conformité des journées calculée, les journées d'avant la semaine en cours validées par le superviseur, comme en régime de croisière |

La commande refuse de tourner en production (`ENVIRONNEMENT`). Pour 500 délégués, elle dure environ deux heures et donne 60 000 visites et 43 000 rapports (base de 400 Mo). `--visites-par-jour` règle la densité.

## 2. Mesurer dans le serveur

```bash
DATABASE_URL=postgres://…/innov_charge python manage.py mesurer_charge
```

Pour chaque rôle, la commande prend cinq comptes et rejoue trois fois les lectures de leurs écrans courants, comme le portail et le téléphone les font. Pour chaque route, elle donne :

- le 50e centile ;
- le 95e centile ;
- le pire temps ;
- le nombre de requêtes SQL.

Elle échoue si une route dépasse 500 ms au 95e centile. Tout se passe dans une transaction annulée : la mesure ne laisse rien dans la base.

Un test (`tests/test_charge.py`) rejoue la mesure sur la démonstration à chaque livraison. Il vérifie aussi que le tableau de bord du pays fait **le même nombre de requêtes**, quel que soit le nombre de semaines des délégués : une régression qui ferait une requête par délégué échoue avant d'arriver en production.

## 3. Résultats

Mesure du 9 octobre 2026, sur un poste de développement (un processus, PostgreSQL 16 local). Base de charge : 500 délégués, 60 000 visites, 43 000 rapports. Cinq comptes par rôle, trois lectures chacun.

| Écran (route) | Rôle | p50 | p95 | Requêtes |
|---|---|---|---|---|
| Programme du jour | Délégué | 173 ms | 223 ms | 65 |
| Semaine | Délégué | 369 ms | 421 ms | 229 |
| Liste cible | Délégué | 55 ms | 66 ms | 16 |
| Synchronisation des rapports | Délégué | 206 ms | 354 ms | 56 |
| Synchronisation de l'historique | Délégué | 244 ms | 316 ms | 101 |
| Mes chiffres | Délégué | 35 ms | 42 ms | 18 |
| Détail d'une visite | Délégué | 29 ms | 74 ms | 11 |
| Notifications | Délégué | 12 ms | 15 ms | 9 |
| À traiter | Superviseur | 261 ms | 322 ms | 187 |
| Retards | Superviseur | 262 ms | 309 ms | 117 |
| Tableau de l'équipe | Superviseur | 121 ms | 203 ms | 29 |
| Plannings à valider | Superviseur | 18 ms | 74 ms | 47 |
| Tableau du pays (calculé d'avance) | Responsable pays | 22 ms | 22 ms | 8 |
| Prescription (calculée d'avance) | Responsable pays | 18 ms | 18 ms | 8 |
| Prospects | Responsable pays | 88 ms | 99 ms | 10 |
| Établissements | Responsable pays | 32 ms | 35 ms | 9 |
| Organisation | Administrateur pays | 395 ms | 410 ms | 12 |
| Utilisateurs | Administrateur pays | 113 ms | 192 ms | 9 |
| Journal d'audit | Administrateur pays | 98 ms | 103 ms | 10 |
| Consolidation | Siège | 9 ms | 9 ms | 8 |

**Toutes les routes sont sous 500 ms au 95e centile.** Le worker calcule d'avance, toutes les 4 minutes, le tableau du pays et sa prescription (6,7 s) puis la consolidation du siège (5,1 s).

### Ce qui a été corrigé

La première mesure (avant 0.9.4) dépassait la cible sur sept écrans :

| Écran | Avant | Après | Correction |
|---|---|---|---|
| À traiter | 7 s, 3 900 requêtes | 322 ms | Journées lues en quelques requêtes groupées ; conformité non réécrite quand elle ne change pas ; rapports rouverts cherchés par sous-requête |
| Tableau du pays | 6 s | 22 ms (calcul d'avance : 6,7 s) | Visites lues en deux requêtes et en lignes légères ; tableau calculé d'avance (§ ci-dessous) |
| Prescription | 5,8 s | 18 ms (calcul d'avance) | Retours comptés par la base, chaque retour comparé au précédent dans la base |
| Organisation | 2 s, 1 078 requêtes | 410 ms, 12 requêtes | Secteurs et occupants préchargés, seulement les colonnes affichées |
| Synchronisation des rapports | 0,9 s, 410 requêtes | 354 ms, 56 requêtes | Listes du pays et portefeuilles lus une fois par réponse ; rapports existants lus ensemble |
| Retards | 0,5 s | 309 ms | Même sélection des plannings que « À traiter » |
| Utilisateurs | 0,7 s (pointe) | 192 ms | Rien à corriger : premier appel du processus |

### Tableaux calculés d'avance

Le tableau d'un pays entier, sa prescription et la consolidation du siège ne dépendent pas de la personne qui les lit. Le worker les recalcule toutes les 4 minutes pour la période par défaut (la semaine) et les garde 5 minutes. DSH-011 autorise ce délai ; l'heure du calcul reste affichée. Une autre période ou un filtre se calcule à la première demande, puis se garde 5 minutes.

Les tableaux d'une équipe (superviseur, DM, DF) restent calculés à chaque lecture : ils sont rapides, et une validation doit s'y voir aussitôt.

### Restauration à ce volume

La base de charge (400 Mo) se sauvegarde chiffrée en 37 Mo et se restaure, contrôles compris, en 21 secondes. La cible de reprise est de 4 heures (NFR-006).

## 4. Mesurer par le réseau (préproduction)

`deploiement/charge/scenario.js` simule un matin de semaine pendant 10 minutes :

| Population | Utilisateurs simultanés | Ce qu'ils font |
|---|---|---|
| Délégués | 100 | Synchronisent toutes les 30 s |
| Superviseurs | 15 | Ouvrent leur file, leurs plannings à valider et leur tableau d'équipe toutes les 20 s |
| Responsables | 3 | Ouvrent le tableau du pays et les prospects |

Le scénario échoue si une réponse dépasse 1 s au 95e centile ou si plus de 1 % des requêtes échouent.

```bash
k6 run -e API=https://api.preprod.exemple -e JETONS=jetons.json deploiement/charge/scenario.js
```

`jetons.json` contient des jetons d'accès de comptes de la base de charge, obtenus par la connexion. **Ce fichier n'est jamais commité** ; jetez-le après l'essai (les jetons expirent au bout de 15 minutes).

Les 2 s perçues sur le téléphone en 3G se mesurent aux essais de terrain (`docs/essais-terrain.md`). Le poids d'une synchronisation est déjà mesuré par `mesurer_synchro` (OFF-006).

## 5. Limites

- La base de charge a le volume d'un pays, pas sa diversité : des noms et des établissements fictifs, et des semaines toutes semblables. Les vraies données peuvent faire apparaître des cas plus lourds (un superviseur qui remplace un collègue, un DM en escalade). Le pilote (0.9.7) les montrera.
- La mesure dans le serveur se fait sur une seule machine, sans concurrence. La concurrence se mesure avec k6 sur la préproduction, dont la taille (offres payantes) se fixe en 0.9.5.
- 17 pays à terme (≈ 8 500 délégués) : chaque pays est isolé dans la base (sécurité au niveau des lignes) et ses lectures ne parcourent que ses lignes. Les temps d'un pays ne dépendent donc pas des autres, mais la taille de la base et du serveur, si.

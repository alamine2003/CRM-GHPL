# INNOV CRM

CRM multi-pays des délégués médicaux de Generic Healthcare : le délégué planifie sa semaine et rapporte ses visites sur mobile, le superviseur approuve et valide sur le portail web, le siège pilote chaque pays sans mélanger leurs données.

Version courante : voir [`VERSION`](VERSION) et [`CHANGELOG.md`](CHANGELOG.md).

## Documents de référence

| Document | Contenu |
|---|---|
| [`prd.md`](prd.md) | Produit et métier : rôles, workflows, exigences identifiées, règles, feuille de route de `0.0.1` à `1.0.0` |
| [`architecture.md`](architecture.md) | Architecture complète et décisions (ADR) |
| [`architecture-essentials.md`](architecture-essentials.md) | Règles non négociables, à lire avant toute contribution |

## Organisation du dépôt

```
backend/     service central Django + DRF (API /api/v1, schema.yaml)
portail/     portail web React + MUI (superviseurs, responsables, siège)
mobile/      application délégué React Native + Expo
packages/    i18n (fr/en), design (jetons), api-types (générés)
scripts/     outils de vérification
```

## Démarrer

Prérequis : Python 3.12, Node.js 22.12+, PostgreSQL 16 (ou Docker), gettext.

```bash
docker compose up -d db redis     # ou un PostgreSQL local (rôle innov, base innov ; sinon DATABASE_URL)
make installer                    # environnement Python, traductions, dépendances npm
make serveur                      # API sur http://localhost:8000 (/api/health/)
make portail                      # portail sur http://localhost:5173
make mobile                       # Expo : ouvrir avec Expo Go ou un émulateur
```

Premier compte (en attendant les écrans d'administration) :

```bash
cd backend
.venv/bin/python manage.py creer_pays SN
.venv/bin/python manage.py creer_utilisateur prenom.nom --prenom Prénom --nom Nom --pays SN --afficher-lien
.venv/bin/python manage.py attribuer_role prenom.nom admin_pays     # ou admin_siege pour un compte sans pays
# Ouvrir le lien affiché pour choisir le mot de passe, puis se connecter sur le portail.
```

L'administrateur pays construit ensuite l'organisation (zones, secteurs, divisions, réseaux, postes, occupants, superviseurs) depuis la page **Organisation** du portail. Les affectations dans un autre pays et les transferts se font par l'API (`/api/v1/utilisateurs/<id>/affectations/` et `/transferts/`) en attendant leurs écrans (0.0.6).

### Sur un iPhone (ou un Android)

1. Installer **Expo Go** depuis l'App Store, à jour.
2. Brancher l'ordinateur et l'iPhone sur le **même Wi-Fi**.
3. Sur l'ordinateur, la base démarrée (voir plus haut) : `make telephone`. Le script expose l'API sur le réseau local et affiche un QR code.
4. Scanner le QR code avec l'**appareil photo** de l'iPhone, puis accepter l'accès au réseau local demandé par Expo Go.
5. Se connecter avec un compte de démonstration (délégué pour l'application de terrain).

Si l'adresse n'est pas trouvée : `INNOV_IP=192.168.1.20 make telephone` (adresse Wi-Fi de l'ordinateur). Dans Expo Go, la base locale du téléphone n'est pas chiffrée (SQLCipher n'existe que dans une vraie compilation) : n'y utiliser que la démonstration. Les versions de test installables (TestFlight) arrivent en 0.2.8.

Variables utiles : `backend/.env.example` (serveur), `VITE_API_URL` (portail), `EXPO_PUBLIC_API_URL` (mobile).

## Démonstration

Une base de démonstration aux données **fictives** (volumes réels du Sénégal : 4 divisions, 19 réseaux, 48 secteurs, 227 postes, 207 délégués ; Togo réduit) se recrée d'une commande (DEM-001). Elle **efface toute la base** et n'est permise qu'en développement ou démonstration :

```bash
cd backend
INNOV_DEMO_MOT_DE_PASSE='…' .venv/bin/python manage.py reinitialiser_demo --oui   # --echelle 0.2 pour une base légère
```

La commande affiche un compte par rôle (siège, responsable et administrateur pays, DF, DM, superviseur, délégué). Sans la variable, un mot de passe est tiré au hasard et affiché une fois. Les courriels finissent en `@demo.invalid` : aucun message ne peut partir vers une vraie boîte. Les comptes marqués `*` devront activer la double authentification à leur première connexion. Une instance lancée avec `ENVIRONNEMENT=demonstration` affiche un bandeau « Démonstration » sur chaque écran.

Scénario de démonstration de fin de cycle : [`demonstration-0.0.md`](demonstration-0.0.md). Recette du cycle (exigence → test) : [`recette-0.0.md`](recette-0.0.md).

## Exploitation

- Journaux : JSON sur la sortie standard (une ligne par requête, utilisateur pseudonymisé). En local, `JOURNAUX_LISIBLES=1` pour du texte.
- Suivi des erreurs : fournir `SENTRY_DSN` à l'hébergeur pour l'activer ; sans lui, les erreurs restent dans les journaux. Le DSN se trouve dans Sentry : *Settings → Projects → (projet) → Client Keys (DSN)*. Seul le serveur en a besoin : le portail et le mobile lui remontent leurs erreurs.
- Disponibilité : UptimeRobot surveille `https://<api>/api/health/` (réponse 200 et `"statut": "ok"` ; 503 si la base est indisponible) et la page d'accueil du portail.
- Mise en ligne : `python manage.py check --deploy --database default` vérifie notamment que le rôle PostgreSQL de l'application ne contourne pas l'isolation des pays.
- Le portail affiche l'état technique dans **Exploitation** (administrateur technique et siège).
- Double authentification : fournir `INNOV_CLE_CHIFFREMENT` (longue chaîne aléatoire, distincte de `DJANGO_SECRET_KEY`) ; elle chiffre les secrets des applications d'authentification. La perdre oblige à réinitialiser la double authentification de chaque compte.
- Journal d'audit : en production, n'accorder au rôle de l'application que `INSERT` et `SELECT` sur `audit_evenementaudit` ; les déclencheurs refusent de toute façon modification, suppression et troncature.

## Vérifier

```bash
make verifier     # lint, tests serveur et clients, types, convention de version
make schema       # après une modification de l'API
```

Ce sont les mêmes contrôles que la CI.

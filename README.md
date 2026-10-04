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

Variables utiles : `backend/.env.example` (serveur), `VITE_API_URL` (portail), `EXPO_PUBLIC_API_URL` (mobile).

## Démonstration

Une base de démonstration aux données **fictives** (volumes réels du Sénégal : 4 divisions, 19 réseaux, 48 secteurs, 227 postes, 207 délégués ; Togo réduit) se recrée d'une commande (DEM-001). Elle **efface toute la base** et n'est permise qu'en développement ou démonstration :

```bash
cd backend
INNOV_DEMO_MOT_DE_PASSE='…' .venv/bin/python manage.py reinitialiser_demo --oui   # --echelle 0.2 pour une base légère
```

La commande affiche un compte par rôle (siège, responsable et administrateur pays, DF, DM, superviseur, délégué). Sans la variable, un mot de passe est tiré au hasard et affiché une fois. Les courriels finissent en `@demo.invalid` : aucun message ne peut partir vers une vraie boîte.

## Exploitation

- Journaux : JSON sur la sortie standard (une ligne par requête, utilisateur pseudonymisé). En local, `JOURNAUX_LISIBLES=1` pour du texte.
- Suivi des erreurs : fournir `SENTRY_DSN` à l'hébergeur pour l'activer ; sans lui, les erreurs restent dans les journaux.
- Mise en ligne : `python manage.py check --deploy --database default` vérifie notamment que le rôle PostgreSQL de l'application ne contourne pas l'isolation des pays.
- Le portail affiche l'état technique dans **Exploitation** (administrateur technique et siège).

## Vérifier

```bash
make verifier     # lint, tests serveur et clients, types, convention de version
make schema       # après une modification de l'API
```

Ce sont les mêmes contrôles que la CI.

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

Variables utiles : `backend/.env.example` (serveur), `VITE_API_URL` (portail), `EXPO_PUBLIC_API_URL` (mobile).

## Vérifier

```bash
make verifier     # lint, tests serveur et clients, types, convention de version
make schema       # après une modification de l'API
```

Ce sont les mêmes contrôles que la CI.

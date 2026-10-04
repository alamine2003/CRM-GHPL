# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.0.1] — Initialisation

Premier jalon du cycle 0.0 « Fondations » (`prd.md` §23).

### Ajouté

- Dépôt unique : `backend/` (Django), `portail/` (React), `mobile/` (Expo), `packages/` (`i18n`, `design`, `api-types`), espaces de travail npm (ADR-013).
- Version unique dans le fichier `VERSION`, affichée par l'API (`/api/health/`, `/api/v1/informations/`), le portail et l'application mobile (ADR-018).
- Service central Django 5.2 + DRF : sonde `/api/health/`, informations publiques `/api/v1/informations/`, API protégée par défaut, schéma OpenAPI versionné `backend/schema.yaml` et vérifié en CI (ADR-012).
- Internationalisation français / anglais dès le départ, côté serveur (gettext) et clients (catalogues partagés `@innov/i18n`, clés vérifiées identiques) — USR-004, ADR-019.
- Jetons de design de la maquette INNOV CRM (`@innov/design`) et thème MUI clair / sombre.
- Premier écran du portail : marque, choix de la langue, état du service, versions client et serveur.
- Premier écran de l'application mobile : marque, version, choix de la langue ; bundles Android et iOS compilés en CI.
- CI GitHub Actions : convention de version, lint (ruff, ESLint, Prettier), types, tests serveur et clients, schéma et types d'API à jour, build du portail, bundles mobiles, analyse de secrets (gitleaks) — SEC-007.
- Pile de développement Docker Compose (PostgreSQL 16, Redis 7, serveur), `Makefile`, Dependabot.

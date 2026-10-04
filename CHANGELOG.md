# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.0.2] — Base de données, pays et paramètres

Deuxième jalon du cycle 0.0 « Fondations » : la base de données et les premières données métier.

### Ajouté

- Modèle de données prêt pour la synchronisation mobile (architecture §8, §14) : chaque table métier hérite d'un modèle commun avec identifiant **UUID v7** généré par le créateur (ADR-006), **numéro de version** incrémenté à chaque écriture, horodatages UTC et archivage logique ; la suppression physique est refusée (RG-005).
- **Journal des changements** (`socle_journalchangement`), partitionné par mois dès sa création : chaque écriture y ajoute une ligne rattachée au pays de l'objet ; c'est lui que le téléphone lira pour se synchroniser.
- Le pays d'un objet ne peut jamais changer (RG-001).
- **Pays** (ORG-001) : catalogue des 17 filiales (hypothèse O-07) avec fuseau, langue et devise par défaut ; création au statut `actif` ; transitions `actif` ↔ `suspendu` → `archive` (prd.md §17.5) ; un pays archivé reste lisible et ne change plus. Commande `python manage.py creer_pays SN` (et `--liste`).
- **Paramètres par pays** (ORG-011) : 12 paramètres de prd.md §7.5 avec valeur par défaut et validation (jours ouvrés, échéances du planning, heure limite du rapport, seuils de visites, plage horaire, GPS, distance de pointage, escalade, conservation) ; chaque modification ajoute une valeur **datée**, sans effet rétroactif ; un pays archivé est en lecture seule.
- Extensions PostgreSQL `pg_trgm`, `unaccent`, `fuzzystrmatch` (recherche et doublons ; vérifie l'hypothèse HT-07).
- Modèle utilisateur propre au projet (UUID v7, pays principal, langue), déclaré dès maintenant pour ne pas avoir à réécrire les migrations ; les comptes et la connexion arrivent en 0.0.3. Un utilisateur n'est jamais supprimé (RG-007).
- 41 tests serveur supplémentaires (47 au total), dont l'ordre et l'unicité des UUID v7, les transitions de statut, l'isolation des paramètres entre pays et l'absence d'effet rétroactif.

### Reste à livrer pour ces exigences

- ORG-001 CA2 (un pays suspendu refuse la connexion de ses utilisateurs) : avec la connexion, en 0.0.3.
- ORG-001 CA4 et ORG-011 CA2 (audit des changements) : avec le journal d'audit, en 0.0.8.
- Écrans du siège et de l'administrateur pays pour les pays et paramètres : avec les comptes et les rôles (0.0.3 à 0.0.6).

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

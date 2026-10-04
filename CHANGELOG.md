# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.0.3] — Comptes, connexion et récupération d'accès

Troisième jalon du cycle 0.0 « Fondations ».

### Ajouté

- **Comptes nominatifs** (USR-001, USR-003) : identifiant au format `prenom.nom`, prénom et nom obligatoires, comptes génériques ou partagés refusés (`admin`, `test`, `delegue`…), courriel unique ; un compte sans pays est un compte du siège. Suspension (ferme toutes les sessions, garde les données) et réactivation. Pas de super-utilisateur Django : les droits viendront des rôles (0.0.4).
- Commande `python manage.py creer_utilisateur prenom.nom --prenom … --nom … [--courriel …] [--pays SN]` : aucun mot de passe saisi ni affiché ; l'utilisateur reçoit un lien pour le choisir (ou `--afficher-lien` pour le transmettre en main propre).
- **Politique de mot de passe** (SEC-001) : Argon2id, 12 caractères minimum, refus des mots de passe courants, entièrement numériques ou proches de l'identité.
- **Connexion et verrouillage** (SEC-002) : après 5 échecs consécutifs, compte verrouillé 15 minutes (même avec le bon mot de passe) et courriel d'alerte ; même réponse pour un compte inconnu et un mauvais mot de passe ; limite de 20 tentatives par minute et par adresse.
- **Pays suspendu ou archivé** (ORG-001 CA2) : connexion refusée avec un message explicite, et sessions ouvertes coupées aussitôt ; le siège n'est pas concerné.
- **Sessions** (architecture §11.1) : jeton d'accès de 15 minutes lié à une session révocable ; jeton de rafraîchissement qui change à chaque usage — le rejouer révoque la session. Portail : cookie `HttpOnly`, `SameSite=Strict`, session de 30 minutes glissantes. Mobile : magasin sécurisé du téléphone (Keychain / Keystore, appareil déverrouillé uniquement), 7 jours glissants. Changer de mot de passe ferme toutes les sessions.
- **Récupération d'accès** (USR-005) : lien à usage unique valable 30 minutes, envoyé par courriel dans la langue de l'utilisateur ; une nouvelle demande invalide l'ancien lien ; la demande ne révèle jamais si un compte existe.
- Format d'erreur commun de l'API `{code, message, details}`, messages traduits en français et en anglais ; test qui échoue si un message du serveur n'a pas de traduction anglaise.
- Paquet partagé `@innov/api-client` (portail et mobile) : jeton d'accès en mémoire uniquement, un seul rafraîchissement à la fois, nouvel essai automatique après un 401.
- **Portail** : pages de connexion, mot de passe oublié, nouveau mot de passe ; accueil personnalisé (prénom, pays) ; déconnexion ; reprise de la session au rechargement ; en-tête compact sur téléphone.
- **Application mobile** : écran de connexion avec demande de lien, accueil personnalisé, déconnexion, reprise de la session au démarrage.
- Tests : 100 côté serveur, 33 côté clients (client d'API, portail, mobile, traductions). Parcours complet vérifié dans un navigateur réel (lien → mot de passe → connexion → rechargement → déconnexion).

### Reste à livrer

- Refus des mots de passe **compromis** (base de fuites connues) : à décider, car il suppose d'interroger un service externe (SEC-001).
- USR-001 CA2 (un utilisateur sans rôle ne voit rien) : avec les rôles, en 0.0.4.
- Écrans de gestion des comptes par l'administrateur pays (USR-003) : avec les rôles et la navigation (0.0.4 à 0.0.6).
- Audit des connexions, échecs et réinitialisations : en 0.0.8 (AUD-001).

### Exploitation

- Le portail et l'API doivent partager le même domaine parent (par exemple `crm.exemple.org` et `api.crm.exemple.org`) pour que le cookie de session fonctionne.
- Nouvelles variables : `PORTAIL_URL`, `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `JWT_SIGNING_KEY` (facultative), `REDIS_URL` (limites de débit partagées). `DJANGO_SECRET_KEY` doit faire au moins 50 caractères hors développement.

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

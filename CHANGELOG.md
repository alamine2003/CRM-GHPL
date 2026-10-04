# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.0.6] — Navigation, accueil par rôle, administration, appareils et démonstration ; design enrichi

Sixième jalon du cycle 0.0 « Fondations ».

### Ajouté — portail

- **Navigation par sections** (Activité, Administration) : chaque rubrique n'apparaît qu'aux rôles qui peuvent l'utiliser ; menu utilisateur dans la barre supérieure (Mon profil, déconnexion).
- **Accueil par rôle** : le siège voit ses pays (drapeaux, statut) et la vue consolidée ; l'administrateur et le responsable pays, une carte « À traiter » (comptes sans rôle, postes vacants, postes sans superviseur) ; le superviseur, « Mon équipe » (postes rattachés et occupants) ; DF et DM, leurs réseaux ; le délégué, son poste et sa semaine à venir.
- **Équipe** (USR-003, ORG-002, ORG-009, ORG-010) : tuiles (comptes, sans rôle, suspendus, téléphones), recherche et filtres, création d'un compte (identifiant proposé au format prenom.nom, lien de mot de passe envoyé), fiche latérale : suspendre, réactiver, envoyer un lien, attribuer et retirer des rôles (historique daté), affectations dans d'autres pays et transferts pour le siège.
- **Téléphones** (USR-006 CA1) : appareil, système, version de l'application, dernier contact ; révocation après confirmation.
- **Paramètres du pays** (ORG-011) : regroupés en Calendrier, Planning, Visites, Rapports, Conservation ; un éditeur adapté à chaque règle (jours ouvrés, échéances, plages horaires, seuils par type de poste, durées de conservation) ; pastilles « Personnalisé » et « À confirmer ».
- **Pays** (siège, ORG-001) : cartes avec drapeau, fuseau, devise, langue et statut ; ouvrir un pays, suspendre, réactiver, archiver avec confirmation ; « Travailler sur ce pays » bascule le pays actif.
- **Mon profil** : rôles, langue, changement de mot de passe.

### Ajouté — mobile

- **Onglets réels** : Tournée, Semaine, Prospects, Mes chiffres, Profil ; les rubriques d'une version future affichent ce qu'elles apporteront et quand.
- **Profil** : compte, langue mémorisée, téléphone enregistré, déconnexion.
- En-tête arrondi commun à tous les écrans.

### Ajouté — serveur

- **Langue de l'utilisateur** (USR-004) : `PATCH /api/v1/auth/moi/` ; le portail et le mobile appliquent la langue du compte à la connexion, et l'enregistrent quand l'utilisateur la change. La langue par défaut reste celle du pays.
- **Appareils** (USR-006) : la connexion mobile décrit le téléphone (identifiant d'installation tiré au hasard et gardé dans le magasin sécurisé, plateforme, système, modèle, version) ; il est enregistré à la première connexion. Un appareil révoqué ne peut plus se connecter ni rafraîchir sa session, donc plus synchroniser (CA2) ; ses sessions sont fermées. Révoquer : siège et administrateur pays (matrice §6.3, « effacer à distance » — l'effacement des données locales suit au cycle 0.8).
- **Démonstration** (DEM-001) : commande `reinitialiser_demo` ; données fictives générées sur la structure réelle (CA2 : noms tirés de listes, courriels en `@demo.invalid`), réinitialisables à l'identique (CA1) ; refusée hors développement et démonstration.

### Écarts assumés

- La liste des téléphones montre le **dernier contact** avec le serveur (connexion ou rafraîchissement) : la synchronisation des données, et donc la « dernière synchronisation » du PRD, arrive au cycle 0.8.

### Reste à livrer

- Journal d'audit des actions d'administration (comptes, rôles, affectations, transferts, révocations, paramètres) : 0.0.8 (AUD-001).

## [0.0.5] — Organisation matricielle, affectations multi-pays et transferts ; design enrichi

Cinquième jalon du cycle 0.0 « Fondations ».

### Ajouté — organisation d'un pays (module `organisation`)

- **Zones et secteurs** (ORG-003) : création, renommage, archivage ; un secteur appartient à une seule zone du pays (CA1) ; un secteur archivé reste visible mais n'est plus proposé (CA2, filtre `?actifs=1`) ; une zone ou une division qui a encore des éléments actifs ne s'archive pas.
- **Postes** (ORG-005) : type (VM, VM OTC, KAM, dermo), réseaux et secteurs multiples ; un poste sans occupant est « vacant » (CA1) et peut couvrir plusieurs secteurs (CA2) ; un poste occupé ne s'archive pas.
- **Occupations datées** (ORG-006) : une personne (délégué, ou superviseur qui visite) occupe un ou plusieurs postes, avec début et fin facultative (CA1, CA2) ; un poste n'a qu'un occupant à la fois ; la première occupation est le poste principal (RG-011).
- **Rattachements** (ORG-007) : chaque poste est rattaché à un superviseur (ou à un DM pour le poste d'un superviseur-visiteur, RG-023) ; un nouveau rattachement termine le précédent à la date indiquée, sans toucher au passé (CA2). Un délégué sans superviseur actif est signalé sur le portail et le mobile (CA1 ; le blocage de la soumission viendra avec le planning en 0.2).
- **Périmètre de réseaux daté des DF et DM** (ORG-008) : un DM ne voit que les postes de ses réseaux (CA1) ; retirer un réseau coupe l'accès à la date de fin (CA2).
- **Qui voit quels postes** (architecture §11.2) : pays entier pour le siège, le responsable et l'administrateur pays ; postes des réseaux du périmètre pour DF et DM ; postes rattachés pour le superviseur ; ses propres postes pour le délégué (« Mon organisation »).
- **Divisions et réseaux minimaux** [H] : code et libellé, pour porter postes et périmètres dès maintenant ; le portefeuille de produits et la gestion complète arrivent avec ORG-004 en 0.1.1.
- Convention commune des liens datés : actif le jour `j` si `debut <= j < fin`, dans le fuseau du pays (RG-006) ; une période vide (fin = début) vaut annulation.
- Chaque écriture passe par les modèles communs : identifiant UUIDv7, version, journal des changements (synchronisation future).

### Ajouté — appartenance à plusieurs pays (module `identite`)

- **Affectations supplémentaires** (ORG-009, RG-003) : l'administrateur du siège accorde un rôle dans un autre pays, daté et motivé ; l'utilisateur choisit alors ce pays actif et n'y voit que ses données (CA1) ; à la date de fin, l'accès cesse sans intervention (CA2) ; l'administrateur du pays d'accueil voit le compte affecté.
- **Transferts** (ORG-010, RG-004) : autorisés par le siège ; rôles, occupations, rattachements et périmètres prennent fin dans le pays d'origine, où l'historique reste consultable (CA1, CA2) ; un rôle peut être donné dans le pays d'arrivée.
- Matrice (USR-002) : actions `organisation.lire`, `organisation.gerer`, `affectations.gerer`, couvertes par les tests rôle × action. La consultation de l'organisation par DF, DM et superviseur est une hypothèse [H] tirée d'architecture §11.2 (le PRD ne liste que la gestion).

### Ajouté — design

- **Portail, page Organisation** : tuiles de chiffres clés (postes, vacants, sans superviseur, secteurs), onglets Postes / Zones et secteurs / Divisions et réseaux, recherche et filtres (vacants, sans superviseur), tableau sur grand écran et cartes sur téléphone, menus d'actions (affecter un occupant, rattacher un superviseur, libérer, archiver), dialogues de création, états vides explicatifs.
- **Portail, accueil** : bandeau d'accueil bleu marine (date et pays, rôles en pastilles), chiffres de l'organisation pour qui peut la consulter, carte « Mon poste » (poste, superviseur, réseaux, secteurs) avec alerte si le superviseur manque.
- **Navigation** : la rubrique Organisation est active et n'apparaît qu'aux rôles qui peuvent la consulter ; les rubriques sont de vrais liens.
- **Mobile** : rôles en pastilles dans l'en-tête, cartes « Mon poste » avec liseré orange, alerte si le superviseur manque.

### Corrigé

- Des messages du serveur ajoutés en 0.0.4 n'avaient pas de traduction anglaise : ils sont traduits, et un nouveau test compare le code au catalogue pour qu'un message ne soit plus jamais oublié (USR-004). Nouvelle commande `make messages`.

### Reste à livrer

- Écrans de gestion des comptes, des affectations et des transferts : 0.0.6 (l'API est prête).
- Audit des changements d'organisation, des affectations et des transferts (ORG-009 CA3) : 0.0.8 (AUD-001).
- Blocage de la soumission d'un planning sans superviseur (ORG-007 CA1) : avec le planning (0.2).

## [0.0.4] — Rôles, périmètre et permissions ; nouveau design

Quatrième jalon du cycle 0.0 « Fondations ».

### Ajouté — design (aligné sur la maquette INNOV CRM)

- **Portail** : thème complet (Plus Jakarta Sans, DM Sans, cartes, boutons, champs et pastilles de la maquette) ; barre latérale bleu marine avec accent orange, pays, utilisateur et déconnexion ; tiroir de navigation sur téléphone ; pages de connexion avec panneau de marque ; bleu clair lisible en thème sombre. Les rubriques futures sont visibles mais inactives, avec la version qui les livrera.
- **Accueil du portail** : date du pays, avancement de la feuille de route calculé depuis la version (paquet `@innov/domaine`), état du service, mon compte.
- **Mobile** : polices de la maquette embarquées ; connexion avec en-tête « Bienvenue » et formulaire en feuille arrondie ; accueil avec en-tête bleu marine (date, pays, avancement), cartes et barre d'onglets.

### Ajouté — rôles et permissions

- **Neuf rôles datés** (`prd.md` §6.1) attribués par pays, jamais supprimés : un rôle se termine et reste dans l'historique. Rôles du siège et technique sans pays (RG-002) ; rôles de pays sur le pays principal du compte (les affectations dans d'autres pays arrivent en 0.0.5).
- **Matrice des autorisations** (USR-002) : traduction exacte de `prd.md` §6.3 pour les actions de ce cycle ; un test vérifie qu'elle suit le PRD et que l'administrateur technique n'a aucune action métier.
- **Moteur de périmètre** : pays actif par l'en-tête `X-Pays` (ou pays principal) ; le siège choisit un pays ou la vue consolidée ; un utilisateur sans rôle ne voit rien (USR-001 CA2) ; un objet hors périmètre répond 404 sans révéler son existence (USR-002 CA2).
- **Vue de base `VuePerimetre`** (architecture §12, couche 1) et test qui échoue si une route métier ne l'utilise pas.
- **API** : pays (liste, création, statut — ORG-001), paramètres du pays (lecture, modification — ORG-011), comptes (liste, création avec envoi du lien, suspension, réactivation, réinitialisation — USR-003), rôles (historique, attribution, retrait), désignations des responsables et administrateurs pays avec historique (ORG-002), périmètre de l'utilisateur.
- **Désignations** (ORG-002) : seul l'administrateur du siège désigne responsables et administrateurs pays ; l'administrateur pays attribue les rôles terrain (DF, DM, superviseur, délégué).
- Commande `python manage.py attribuer_role prenom.nom <role>` pour nommer le premier administrateur du siège.
- **Portail** : rôles dans « Mon compte », sélecteur de pays (siège et comptes multi-pays), message si aucun rôle. **Mobile** : rôle affiché, message si aucun rôle.
- Tests : 189 côté serveur (dont chaque rôle × chaque action, et l'isolation entre deux pays), 42 côté clients.

### Corrigé

- Le navigateur ne pouvait pas envoyer l'en-tête `X-Pays` (CORS) : trouvé en vérifiant le parcours dans un vrai navigateur, corrigé et couvert par un test.

### Décision à prendre

- **Sécurité au niveau des lignes PostgreSQL** (ADR-003, recommandation à confirmer en 0.0.4) : la couche applicative et les tests d'isolation sont en place ; la seconde barrière dans la base demande un rôle de base sans privilèges et des politiques par table. À confirmer avant de la mettre en œuvre.

### Reste à livrer

- Audit des attributions et retraits de rôles, des désignations et des changements de statut : en 0.0.8 (AUD-001).
- Écrans de gestion des comptes, des rôles et des paramètres : avec la navigation (0.0.6).

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

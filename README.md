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
make serveur                      # tables de la base à jour, puis API sur http://localhost:8000 (/api/health/)
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

Si l'adresse n'est pas trouvée : `INNOV_IP=192.168.1.20 make telephone` (adresse Wi-Fi de l'ordinateur). Dans Expo Go, la base locale du téléphone n'est pas chiffrée (SQLCipher n'existe que dans une vraie compilation) : n'y utiliser que la démonstration. Pour une application installée, chiffrée comme en production : les builds de test ci-dessous.

Variables utiles : `backend/.env.example` (serveur), `VITE_API_URL` et `VITE_CONTACT_DONNEES` (portail), `EXPO_PUBLIC_API_URL` et `EXPO_PUBLIC_PORTAIL_URL` (mobile).

### Builds de test Android et iOS (EAS)

Les builds se font sur les serveurs d'Expo (EAS Build), décrits dans [`mobile/eas.json`](mobile/eas.json) :

| Profil | Pour | Résultat |
|---|---|---|
| `apercu` | Testeurs, installation directe | Android : un `.apk` à télécharger. iOS : une installation *ad hoc* sur les iPhone déclarés (identifiant UDID). |
| `simulateur` | Essai iOS sans iPhone ni compte Apple payant | Une application pour le simulateur de Xcode ; Android comme `apercu`. |
| `recette` | TestFlight et piste de test interne Google Play | iOS : `.ipa` signé pour l'App Store Connect. Android : `.aab`. Numéro de build incrémenté par EAS. |

Une seule fois, par le titulaire des comptes :

1. Créer un compte Expo, puis le projet : `cd mobile && npx eas-cli init` affiche l'identifiant du projet. Le garder en variable d'environnement `EAS_PROJECT_ID` (avec `EXPO_OWNER` si le projet appartient à une organisation Expo) : il ne s'écrit pas dans le dépôt.
2. Dans *expo.dev → Projet → Environment variables*, environnement **preview** : `EXPO_PUBLIC_API_URL` = adresse HTTPS du serveur de test.
3. iOS : un compte Apple Developer (payant) est nécessaire pour `apercu` et `recette` ; EAS crée les certificats et profils à la première commande. Pour `apercu`, déclarer les iPhone avec `npx eas-cli device:create`. La réponse à la question de chiffrement d'App Store Connect (l'application chiffre sa base locale) revient au titulaire du compte.
4. Android : EAS génère et garde la clé de signature à la première commande. Pour `recette`, l'application doit exister dans la Google Play Console.

Lancer un build, depuis `mobile/` : `npx eas-cli build --profile apercu --platform all` (ou `android`, `ios`). Le lien d'installation s'affiche à la fin et sur expo.dev. `npx eas-cli submit --profile recette --platform ios` envoie le dernier build `recette` vers TestFlight.

Depuis GitHub : *Actions → Builds de test mobiles → Run workflow*, après avoir ajouté le secret `EXPO_TOKEN` (*expo.dev → Account settings → Access tokens*) et la variable `EAS_PROJECT_ID` (*Settings → Secrets and variables → Actions*). Le build continue chez Expo ; le journal du workflow donne son lien.

## Démonstration

Depuis 1.0.8, plus aucune donnée fictive n'est versée dans une instance : elle part vide (décision du 12 octobre 2026, prd.md §14.81). Le premier compte, un administrateur du siège, se crée ainsi :

```bash
cd backend
INNOV_ADMIN_IDENTIFIANT=prenom.nom INNOV_ADMIN_MOT_DE_PASSE='…' .venv/bin/python manage.py preparer_instance
```

La commande ne fait rien si un compte existe déjà. L'administrateur du siège active la double authentification à sa première connexion, crée les pays (page **Pays**), puis les comptes. Une instance lancée avec `ENVIRONNEMENT=demonstration` affiche « Essai » sur chaque écran : sans sauvegarde, elle ne reçoit aucune donnée réelle. Les données fictives ne servent plus qu'aux tests automatiques (`apps/demonstration/generateur.py`).

Les vraies données se chargent **sur un poste local seulement**, jamais dans le dépôt ni sur l'instance gratuite (formalités CDP). Le fichier d'organisation (gammes, réseaux, produits, postes, délégués) :

```bash
cd backend
.venv/bin/python manage.py importer_organisation ~/Downloads/ORGANISATION.xlsx --pays SN --auteur prenom.nom --simulation
.venv/bin/python manage.py importer_organisation ~/Downloads/ORGANISATION.xlsx --pays SN --auteur prenom.nom
```

La simulation n'écrit rien ; l'import crée le pays s'il manque, puis les produits, gammes, réseaux, secteurs, postes et comptes (sans mot de passe). Un second import ne crée aucun doublon.

Scénario de démonstration de fin de cycle : [`demonstration-0.0.md`](demonstration-0.0.md). Recette du cycle (exigence → test) : [`recette-0.0.md`](recette-0.0.md).

## Exploitation

- Journaux : JSON sur la sortie standard (une ligne par requête, utilisateur pseudonymisé). En local, `JOURNAUX_LISIBLES=1` pour du texte.
- Suivi des erreurs : fournir `SENTRY_DSN` à l'hébergeur pour l'activer ; sans lui, les erreurs restent dans les journaux. Le DSN se trouve dans Sentry : *Settings → Projects → (projet) → Client Keys (DSN)*. Seul le serveur en a besoin : le portail et le mobile lui remontent leurs erreurs.
- Disponibilité : UptimeRobot surveille `https://<api>/api/health/` (réponse 200 et `"statut": "ok"` ; 503 si la base est indisponible) et la page d'accueil du portail.
- Mise en ligne : `python manage.py check --deploy --database default` vérifie notamment que le rôle PostgreSQL de l'application ne contourne pas l'isolation des pays.
- Le portail affiche l'état technique dans **Exploitation** (administrateur technique et siège).
- Double authentification : fournir `INNOV_CLE_CHIFFREMENT` (longue chaîne aléatoire, distincte de `DJANGO_SECRET_KEY`) ; elle chiffre les secrets des applications d'authentification. La perdre oblige à réinitialiser la double authentification de chaque compte.
- Rappels, escalades et alertes du lundi (0.3.8) : un worker Celery avec son ordonnanceur (`celery -A config worker --beat`, service `worker` de `docker-compose.yml`) et `REDIS_URL`. Sans worker, `python manage.py executer_echeances` rejoue la passe (toutes les 15 minutes par une tâche planifiée de l'hébergeur, par exemple).
- Journal d'audit : en production, n'accorder au rôle de l'application que `INSERT` et `SELECT` sur `audit_evenementaudit` ; les déclencheurs refusent de toute façon modification, suppression et troncature.

## Vérifier

```bash
make verifier     # lint, tests serveur et clients, types, convention de version
make schema       # après une modification de l'API
```

Ce sont les mêmes contrôles que la CI.

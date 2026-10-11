# Démonstration gratuite sur Render (version 1.0.3)

Ce guide met en ligne une **démonstration** d'INNOV CRM, sans payer : le portail web et le serveur, avec des données fictives. Il suit le plan `render-demo.yaml`.

> **Jamais de vraies données ici.** Ni vrais délégués, ni vrais médecins. La base gratuite n'a pas de sauvegarde, et Render l'efface au bout de quelques semaines. Les vraies données attendent la production (`render.yaml`, `docs/exploitation.md`) et les formalités CDP.

## Ce que la démonstration gratuite fait, et ne fait pas

| Oui | Non |
|---|---|
| Le portail et le serveur en ligne, en HTTPS | Pas de sauvegarde |
| Deux pays fictifs (Sénégal, Togo), une vingtaine de délégués, leurs plannings, visites et rapports | Les tâches automatiques ne tournent pas (escalades, fermeture du lundi, rappels) |
| Tous les rôles, avec un même mot de passe choisi par vous | Les courriels ne partent pas (ils s'écrivent dans le journal du serveur) |
| La base se remplit toute seule au premier démarrage | Un document joint est perdu au redéploiement suivant |

Le serveur gratuit **s'endort** après un quart d'heure sans visite. La première page met alors environ une minute à s'afficher, le temps qu'il se réveille. C'est normal.

## Avant de commencer

- Votre compte GitHub (celui du dépôt `alamine2003/CRM-GHPL`).
- Un mot de passe pour les comptes de démonstration : **12 caractères au moins**, que vous notez dans un endroit sûr. Ne l'écrivez jamais dans le dépôt.
- Pour les comptes d'encadrement (responsable pays, administrateur, siège), une application d'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator…). Elle sert à la double authentification, demandée à la première connexion.

## Étape 1 — Fusionner le travail dans la branche principale

Render lit le plan dans la branche `main`.

1. Ouvrez la demande de fusion sur GitHub : `https://github.com/alamine2003/CRM-GHPL/pull/1`.
2. En bas, si elle est encore en brouillon, cliquez **« Ready for review »**.
3. Cliquez **« Merge pull request »**, puis **« Confirm merge »**.

## Étape 2 — Créer le compte Render

1. Allez sur `https://render.com` et cliquez **« Get Started »**.
2. Choisissez **« GitHub »** pour vous inscrire avec votre compte GitHub, et acceptez.
3. Quand Render demande l'accès à vos dépôts, autorisez au moins **CRM-GHPL**.

## Étape 3 — Créer la démonstration à partir du plan

1. Dans Render, cliquez **« New + »** (en haut), puis **« Blueprint »**.
2. Choisissez le dépôt **alamine2003/CRM-GHPL**, branche **main**.
3. Dans **« Blueprint Path »** (chemin du plan), écrivez : `render-demo.yaml`. Sans cela, Render prendrait le plan de production, payant.
4. Donnez un nom, par exemple `innov-demo`.
5. Render affiche ce qu'il va créer : **innov-demo-base** (base de données), **innov-demo-api** (serveur) et **innov-demo-portail** (portail). Vérifiez que chacun est marqué **Free**.

## Étape 4 — Remplir les cinq valeurs demandées

| Valeur | Ce que vous écrivez |
|---|---|
| `INNOV_DEMO_MOT_DE_PASSE` | Votre mot de passe de démonstration (12 caractères au moins) |
| `CORS_ALLOWED_ORIGINS` | `https://innov-demo-portail.onrender.com` |
| `CSRF_TRUSTED_ORIGINS` | `https://innov-demo-portail.onrender.com` |
| `PORTAIL_URL` | `https://innov-demo-portail.onrender.com` |
| `VITE_API_URL` | `https://innov-demo-api.onrender.com` |

Attention : pas de `/` à la fin des adresses.

Cliquez **« Apply »** (appliquer). Render construit alors le serveur et le portail. Comptez 5 à 15 minutes la première fois.

## Étape 5 — Vérifier les adresses réelles

Si un nom est déjà pris chez Render, il ajoute un suffixe, par exemple `innov-demo-api-x7k2.onrender.com`. Ouvrez chaque service dans le tableau de bord : son adresse est affichée en haut.

- Si l'adresse du **portail** diffère : dans **innov-demo-api → Environment**, corrigez `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` et `PORTAIL_URL`, puis **« Save Changes »**.
- Si l'adresse du **serveur** diffère : dans **innov-demo-portail → Environment**, corrigez `VITE_API_URL`, enregistrez, puis **« Manual Deploy » → « Deploy latest commit »** (le portail lit cette adresse à sa construction).

## Étape 6 — Essayer

1. Ouvrez `https://innov-demo-api.onrender.com/api/health/`. La page doit afficher `"statut": "ok"` et `"environnement": "demonstration"`. Si elle tarde, attendez une minute : le serveur se réveille.
2. Retrouvez les comptes : **innov-demo-api → Logs**, cherchez la ligne **« Démonstration prête (données fictives) »**. En dessous, chaque rôle avec son identifiant (au format `prenom.nom`).
3. Ouvrez le portail `https://innov-demo-portail.onrender.com`. Connectez-vous, par exemple avec le compte **superviseur (SN)** ou **delegue (SN)**, et votre mot de passe de démonstration.
4. Un bandeau « Démonstration » rappelle que les données sont fictives.

## Limites connues des navigateurs

Le portail et le serveur ont deux adresses différentes en `…onrender.com`. Safari, les navigateurs de l'iPhone, Brave et la navigation privée bloquent alors le cookie qui garde la session ouverte : le portail vous déconnecte à chaque rechargement de page. **Utilisez Chrome, Edge ou Firefox** pour la démonstration. Avec un nom de domaine, plus tard, ce problème disparaît (`docs/exploitation.md` §2 bis).

## Quand la base gratuite expire

Render prévient par courriel avant d'effacer une base gratuite. Pour repartir :

1. Supprimez **innov-demo-base** dans Render.
2. Dans **Blueprints → innov-demo**, cliquez **« Manual Sync »** : Render recrée une base vide.
3. Redéployez **innov-demo-api** : au démarrage, il remplit de nouveau la base de données fictives, avec le même mot de passe.

## Passer à la production plus tard

La production suit `render.yaml` : offres payantes, base sauvegardée, file de tâches, sauvegarde de nuit, R2 pour les fichiers. Elle ne se fait qu'après les formalités CDP (`docs/dossier-lancement.md`). Le guide est `docs/exploitation.md`.

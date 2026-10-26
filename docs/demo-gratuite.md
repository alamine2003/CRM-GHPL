# Démonstration gratuite sur Render et Neon (versions 1.0.3, 1.0.4, 1.6.3 et 1.9.4)

Ce guide met en ligne une **démonstration** d'INNOV CRM, sans payer : le portail web et le serveur chez Render, la base de données chez Neon, sans aucune donnée au départ (1.0.8 : plus de données fictives). Il suit le plan `render-demo.yaml`.

Pourquoi Neon : Render n'accepte qu'une base gratuite par compte, et l'efface au bout d'un mois. La base gratuite de Neon n'a pas cette limite.

> **Jamais de vraies données ici.** Ni vrais délégués, ni vrais médecins. La démonstration n'a pas de sauvegarde. Les vraies données attendent la production (`render.yaml`, `docs/exploitation.md`) et les formalités CDP.

## Ce que la démonstration gratuite fait, et ne fait pas

| Oui | Non |
|---|---|
| Le portail et le serveur en ligne, en HTTPS | Pas de sauvegarde |
| Toutes les fonctions du portail (prospects, pilotage, suivi des ventes, droits du directeur opérationnel…) | Les tâches automatiques ne tournent pas (escalades, fermeture du lundi, rappels) |
| Le premier administrateur du siège créé tout seul au premier démarrage ; vous créez ensuite pays, comptes et données d'essai | Les courriels ne partent pas (ils s'écrivent dans le journal du serveur) |
| Aucune donnée au départ : l'instance est vide | Un document joint est perdu au redéploiement suivant |

Le serveur gratuit **s'endort** après un quart d'heure sans visite. La première page met alors environ une minute à s'afficher, le temps qu'il se réveille. C'est normal.

## Avant de commencer

- Votre compte GitHub (celui du dépôt `alamine2003/CRM-GHPL`).
- Un mot de passe pour le compte administrateur du siège : **12 caractères au moins**, que vous notez dans un endroit sûr. Ne l'écrivez jamais dans le dépôt.
- La double authentification n'est plus demandée (1.1.2) : chacun peut l'activer dans « Mon profil », avec une application d'authentification sur son téléphone (Google Authenticator, Microsoft Authenticator…).

## Étape 1 — Fusionner le travail dans la branche principale

Render lit le plan dans la branche `main`.

1. Ouvrez la demande de fusion en cours sur GitHub : `https://github.com/alamine2003/CRM-GHPL/pull/20` (elle contient tout le travail depuis la dernière fusion, dont le suivi des ventes).
2. En bas, si elle est encore en brouillon, cliquez **« Ready for review »**.
3. Cliquez **« Merge pull request »**, puis **« Confirm merge »**.

## Étape 2 — Créer la base gratuite chez Neon

1. Allez sur `https://neon.tech`, cliquez **« Sign up »** et inscrivez-vous avec votre compte GitHub ou Google.
2. Créez un projet :
   - nom : `innov-demo` ;
   - version de Postgres : **16** ;
   - région : **AWS Europe Central 1 (Frankfurt)**, la même que Render, pour que la démonstration reste rapide.
3. Neon affiche une **adresse de connexion** (« Connection string ») qui commence par `postgresql://`. Deux réglages :
   - désactivez **« Connection pooling »** (ou « Pooled connection ») : l'adresse ne doit **pas** contenir `-pooler` ;
   - gardez la fin `?sslmode=require`.
4. Copiez cette adresse. Elle contient un mot de passe : ne la mettez nulle part ailleurs que dans Render (étape 4), et ne l'envoyez à personne.

## Étape 2 bis — Créer le compte Render

1. Allez sur `https://render.com` et cliquez **« Get Started »**.
2. Choisissez **« GitHub »** pour vous inscrire avec votre compte GitHub, et acceptez.
3. Quand Render demande l'accès à vos dépôts, autorisez au moins **CRM-GHPL**.

## Étape 3 — Créer la démonstration à partir du plan

1. Dans Render, cliquez **« New + »** (en haut), puis **« Blueprint »**.
2. Choisissez le dépôt **alamine2003/CRM-GHPL**, branche **main**.
3. Dans **« Blueprint Path »** (chemin du plan), écrivez : `render-demo.yaml`. Sans cela, Render prendrait le plan de production, payant.
4. Donnez un nom, par exemple `innov-demo`.
5. Render affiche ce qu'il va créer : **innov-demo-api** (serveur) et **innov-demo-portail** (portail). Vérifiez que chacun est marqué **Free**. La base n'y figure pas : elle est chez Neon.

## Étape 4 — Remplir les sept valeurs demandées

| Valeur | Ce que vous écrivez |
|---|---|
| `DATABASE_URL` | L'adresse de connexion copiée chez Neon (étape 2) |
| `INNOV_ADMIN_IDENTIFIANT` | Votre identifiant d'administrateur du siège, au format `prenom.nom` |
| `INNOV_ADMIN_MOT_DE_PASSE` | Son mot de passe (12 caractères au moins) |
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
2. Au premier démarrage, **innov-demo-api → Logs** affiche **« Administrateur du siège créé »**.
3. Ouvrez le portail `https://innov-demo-portail.onrender.com`. Connectez-vous avec l'identifiant et le mot de passe d'administrateur choisis à l'étape 4. Le bandeau « Essai » rappelle qu'il n'y a pas de sauvegarde : aucune donnée réelle ici.
4. Remplissez l'instance avec des données **inventées**, dans cet ordre : **Pays** (« Ouvrir un pays »), **Équipe** (les comptes, avec une adresse fictive), **Imports** (un fichier d'organisation inventé qui nomme ces comptes : il crée réseaux, produits, secteurs et postes, et donne à chacun son rôle et ses réseaux), **Listes cibles**. Le kit de recette décrit ces étapes en détail : `docs/recette-utilisateur.md` §1.2. Pour le suivi des ventes : **Imports**, « Ventes », ou **Ventes**, « Saisir une vente ». Sans pays choisi, **Ventes** montre tous les pays en francs CFA de l'Ouest, une fois les taux de change fixés (« Taux de change »).

> **Les liens de mot de passe.** Un compte que vous créez reçoit son lien de mot de passe par courriel, et la démonstration n'envoie aucun courriel. Donnez donc à chaque compte une adresse fictive (par exemple `prenom.nom@exemple.invalid`) : le lien s'écrit alors dans le journal du serveur (**innov-demo-api → Logs**, cherchez `reinitialisation?jeton=`). Sans adresse, aucun lien n'est écrit. Le lien ne vaut que 30 minutes et ne sert qu'une fois.

## Limites connues des navigateurs

Le portail et le serveur ont deux adresses différentes en `…onrender.com`. Safari, les navigateurs de l'iPhone, Brave et la navigation privée bloquent alors le cookie qui garde la session ouverte : le portail vous déconnecte à chaque rechargement de page. **Utilisez Chrome, Edge ou Firefox** pour la démonstration. Avec un nom de domaine, plus tard, ce problème disparaît (`docs/exploitation.md` §2 bis).

## Repartir d'une base neuve

Pour remettre la démonstration à zéro :

1. Chez Neon, dans le projet `innov-demo`, supprimez la branche de données et recréez-en une (ou créez un nouveau projet), puis copiez la nouvelle adresse.
2. Dans Render, **innov-demo-api → Environment**, remplacez `DATABASE_URL`, puis **« Save Changes »**.
3. Au redémarrage, le serveur recrée seulement l'administrateur du siège, avec le même identifiant et le même mot de passe.

La base gratuite de Neon s'endort quand personne ne s'en sert, et se réveille en une seconde environ.

## Passer à la production plus tard

La production suit `render.yaml` : offres payantes, base sauvegardée, file de tâches, sauvegarde de nuit, R2 pour les fichiers. Elle ne se fait qu'après les formalités CDP (`docs/dossier-lancement.md`). Le guide est `docs/exploitation.md`.

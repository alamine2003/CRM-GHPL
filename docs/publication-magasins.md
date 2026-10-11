# Publication des applications sur Google Play et l'App Store (versions 0.9.9 et 1.0.0)

Condition 7 de la 1.0.0 (prd.md §21.2) : les applications sont publiées sur Google Play et l'App Store, en distribution privée ou publique (question O-06). Ce guide liste ce que l'entreprise doit fournir et les étapes, depuis la construction jusqu'à la mise en ligne.

> **Rien de ceci ne peut se faire depuis le dépôt.** Les comptes de développeur sont au nom de l'entreprise, se paient, et demandent des pièces d'identité. Les magasins relisent chaque application avant de la publier, ce qui prend de quelques heures à quelques jours.

## 1. Ce que l'entreprise doit fournir

| Élément | Où | Remarque |
|---|---|---|
| Compte Google Play Console au nom de l'entreprise | play.google.com/console | Paiement unique ; vérification de l'organisation (numéro D-U-N-S) |
| Compte Apple Developer Program, organisation | developer.apple.com | Abonnement annuel ; numéro D-U-N-S |
| Choix de distribution (O-06) | Décision, quand elle sera prise | Les trois voies sont prêtes (§1 bis) ; rien à reconstruire pour passer de l'une à l'autre |
| Adresse de contact pour les données personnelles | Variable `VITE_CONTACT_DONNEES` du portail (Render, `innov-portail`) | Affichée par la politique de confidentialité ; sans elle, la page renvoie vers l'administrateur pays |
| Adresse et téléphone d'assistance | Fiches des magasins | Ceux de l'administration pays ou du support |
| Compte de démonstration pour la relecture des magasins | Fiches des magasins | Un compte délégué **de démonstration** (données fictives), jamais un vrai compte |

## 1 bis. Trois façons de distribuer, toutes prêtes (1.0.0, O-06)

La question O-06 n'est pas tranchée : les trois voies sont préparées, et on peut commencer par la première pour le pilote.

| Voie | Pour qui | Construction | Ce que l'entreprise fait |
|---|---|---|---|
| **Installation directe (pilote)** | Les 2 à 5 téléphones du pilote | `eas build --profile pilote` : fichier APK pour Android ; pour l'iPhone, distribution « ad hoc » limitée aux téléphones enregistrés (`eas device:create`) | Enregistrer chaque iPhone ; envoyer le lien d'installation donné par EAS. Aucune relecture des magasins. |
| **Magasins publics, accès réservé** (hypothèse du PRD) | Tous les délégués | `eas build --profile production` | Fiches publiques (§3) ; seuls les comptes créés par l'administration se connectent |
| **Magasins privés** | Tous les délégués, application invisible du public | La même construction `production` | Google : application privée pour l'organisation (Managed Google Play) ; Apple : application sur mesure (Custom App) via Apple Business Manager |

Les deux dernières voies utilisent la **même construction** : le choix se fait dans les consoles des magasins, pas dans le code. Les trois reçoivent les mêmes mises à jour à distance (canal `production`).

### La politique de confidentialité

Les deux magasins exigent une adresse publique. Elle est servie par le portail, sans compte, en français et en anglais :

- adresse à déclarer : `https://<adresse du portail>/confidentialite` ;
- l'application l'ouvre depuis l'écran de connexion et depuis « Profil », dans la langue de l'utilisateur ; elle connaît l'adresse du portail par la variable `EXPO_PUBLIC_PORTAIL_URL`, à définir dans l'environnement `production` d'EAS ;
- le texte reprend le dossier CDP. Toute modification du traitement (nouvelle donnée, nouveau prestataire) se reporte dans les catalogues de traduction (`confidentialite.*`) **et** dans la déclaration des magasins (§3).

## 2. Construire

Profil `production` de `mobile/eas.json` : version de l'application lue dans le fichier `VERSION`, construction pour les magasins (bundle Android, archive iOS), canal de mises à jour `production`. Le profil `pilote` donne la même application, à installer directement. Les variables `EAS_PROJECT_ID` et `EXPO_OWNER` désignent le projet Expo de l'entreprise ; elles se déclarent dans l'environnement EAS, pas dans le dépôt. `EAS_PROJECT_ID` active aussi les mises à jour à distance (`expo-updates`, `docs/mise-a-jour.md`).

```bash
cd mobile
eas build --profile production --platform all
eas build --profile pilote --platform all     # installation directe, pilote
```

Les clés de signature sont gardées par EAS (Expo), jamais dans le dépôt.

## 3. Fiches des magasins

| Rubrique | Contenu |
|---|---|
| Nom | INNOV CRM |
| Description courte | Planning, visites et rapports des délégués médicaux. |
| Description | Pour les équipes de visite médicale de l'entreprise : préparer la semaine, faire ses visites, même sans réseau, et rédiger ses rapports. Réservé aux comptes créés par l'entreprise. |
| Catégorie | Professionnel (Business) |
| Captures | Téléphone : programme du jour, visite, rapport, « Mes chiffres » (démonstration, données fictives) |
| Données collectées (déclaration de sécurité des données / étiquette de confidentialité) | Identifiant et courriel professionnels ; position au début et à la fin de chaque visite seulement (jamais en continu) ; contenu des rapports ; aucune donnée vendue ni partagée à des fins publicitaires ; chiffrement en transit et sur le téléphone |
| Autorisations demandées | Position pendant l'utilisation : début et fin de chaque visite, position d'un établissement sur demande, jamais en continu (texte affiché par le téléphone, `mobile/app.config.ts`) ; notifications ; biométrie pour le déverrouillage |
| Âge | Tout public (application professionnelle) |

## 4. Soumettre

```bash
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

Google : piste « Interne », puis « Production » après essai. Apple : TestFlight, puis soumission à la relecture.

## 5. Après la publication

- Vérifier qu'un téléphone neuf installe l'application depuis le magasin et se connecte.
- Les mises à jour qui ne touchent pas au code natif passent par EAS Update (`docs/mise-a-jour.md`) ; les autres repassent par les magasins.
- Relever `INNOV_VERSION_MIN_APP` seulement deux semaines après la publication d'une version qui l'exige.

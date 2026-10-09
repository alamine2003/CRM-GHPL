# Publication des applications sur Google Play et l'App Store (version 0.9.9)

Condition 7 de la 1.0.0 (prd.md §21.2) : les applications sont publiées sur Google Play et l'App Store, en distribution privée ou publique (question O-06). Ce guide liste ce que l'entreprise doit fournir et les étapes, depuis la construction jusqu'à la mise en ligne.

> **Rien de ceci ne peut se faire depuis le dépôt.** Les comptes de développeur sont au nom de l'entreprise, se paient, et demandent des pièces d'identité. Les magasins relisent chaque application avant de la publier, ce qui prend de quelques heures à quelques jours.

## 1. Ce que l'entreprise doit fournir

| Élément | Où | Remarque |
|---|---|---|
| Compte Google Play Console au nom de l'entreprise | play.google.com/console | Paiement unique ; vérification de l'organisation (numéro D-U-N-S) |
| Compte Apple Developer Program, organisation | developer.apple.com | Abonnement annuel ; numéro D-U-N-S |
| Choix de distribution (O-06) | Décision | Public avec accès réservé aux comptes créés (hypothèse du PRD), ou privé : Managed Google Play et Apple Business Manager |
| Politique de confidentialité publiée à une adresse web | Site de l'entreprise | Exigée par les deux magasins ; reprend le dossier CDP (`docs/dossier-cdp.md`) |
| Adresse et téléphone d'assistance | Fiches des magasins | Ceux de l'administration pays ou du support |
| Compte de démonstration pour la relecture des magasins | Fiches des magasins | Un compte délégué **de démonstration** (données fictives), jamais un vrai compte |

## 2. Construire

Profil `production` de `mobile/eas.json` : version de l'application lue dans le fichier `VERSION`, construction pour les magasins (bundle Android, archive iOS), canal de mises à jour `production`. Les variables `EAS_PROJECT_ID` et `EXPO_OWNER` désignent le projet Expo de l'entreprise ; elles se déclarent dans l'environnement EAS, pas dans le dépôt. `EAS_PROJECT_ID` active aussi les mises à jour à distance (`expo-updates`, `docs/mise-a-jour.md`).

```bash
cd mobile
eas build --profile production --platform all
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

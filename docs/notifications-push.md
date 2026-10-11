# Notifications push (NOT-002, NOT-003)

Depuis la version 0.8.5, le téléphone reçoit en notification push ce qui arrive au centre de notifications. Ce guide dit comment l'activer et comment vérifier, sur un vrai téléphone, ce que les tests automatiques ne peuvent pas montrer.

## Ce qui est en place

| Élément | Où | Rôle |
|---|---|---|
| Adresse push du téléphone | `PUT /api/v1/auth/push/` (mobile, `src/Push.tsx`) | Connecté, le téléphone demande l'autorisation, puis donne son adresse Expo. Elle est oubliée à la déconnexion et à la révocation. |
| Envoi regroupé | `backend/apps/notifications/push.py`, tâche `apps.notifications.taches.push` toutes les 5 minutes | Le premier événement attend 10 minutes que la rafale se regroupe ; ensuite, une notification au plus par type et par heure (NOT-003). |
| Texte de l'écran verrouillé | `push.texte()` | Une phrase par type, dans la langue de la personne, **sans nom ni donnée de santé** (NOT-002 CA2). |
| Ouverture au toucher | `src/Push.tsx` | Le rapport à reprendre, la semaine, sinon le centre de notifications, même application fermée (CA1). |

## Activer (hébergement, 0.9.5)

Rien n'est envoyé tant que `PUSH_ACTIF` n'est pas vrai. Les valeurs viennent de l'environnement du serveur, jamais du dépôt :

| Variable | Valeur |
|---|---|
| `PUSH_ACTIF` | `true` pour envoyer |
| `PUSH_EXPO_JETON` | Jeton d'accès Expo, si l'option « Enhanced Security for Push Notifications » est activée sur le projet Expo (recommandé) |
| `PUSH_EXPO_URL` | Laisser la valeur par défaut (`https://exp.host/--/api/v2/push/send`) |

Côté application :

1. Le projet EAS existe déjà pour les builds de test (README, « Builds de test Android et iOS ») ; `EAS_PROJECT_ID` doit être défini au moment du build.
2. **Android** : déposer la clé du compte de service Firebase (FCM v1) dans le projet Expo : `npx eas-cli credentials` → Android → « Google Service Account Key for Push Notifications ». La clé reste chez Expo, pas dans le dépôt.
3. **iOS** : `npx eas-cli credentials` → iOS → « Push Notifications » ; EAS crée la clé APNs avec le compte Apple Developer.
4. Construire un nouveau build (`apercu` ou `recette`) : le module de notifications natif n'existe pas dans l'ancien.

Le worker et l'ordonnanceur Celery doivent tourner (`celery -A config worker` et `celery -A config beat`). Depuis 0.8.5, ils trouvent bien les tâches des modules `taches` de chaque application (elles n'étaient pas déclarées auparavant).

## Vérifier sur un téléphone (test terrain, 0.8.9)

| # | Geste | Attendu |
|---|---|---|
| 1 | Se connecter sur le téléphone, accepter les notifications | L'administrateur pays voit l'appareil ; en base, `jeton_push` est rempli |
| 2 | Le superviseur demande une correction d'un rapport du délégué | Au plus 15 minutes après : « Une correction de rapport est demandée. » ; aucun nom de médecin |
| 3 | Téléphone verrouillé, regarder la notification | Ni nom, ni produit, ni texte du rapport |
| 4 | Fermer l'application, toucher la notification | L'application s'ouvre sur le rapport à corriger |
| 5 | Soumettre 20 rapports en 10 minutes (compte de démonstration) | Le superviseur reçoit une seule notification « 20 rapports à valider. » |
| 6 | Se déconnecter, refaire le geste 2 | Plus rien n'arrive sur ce téléphone ; la notification reste au centre |

Une notification qui n'arrive pas : vérifier `PUSH_ACTIF`, le worker et l'ordonnanceur, puis les journaux (`push_injoignable`). Une application désinstallée est reconnue à l'envoi suivant : son adresse est effacée.

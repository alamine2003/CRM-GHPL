# Démonstration de fin de cycle 0.6 — Validation des rapports

Scénario d'environ 30 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Le mot de passe vient de la variable d'environnement et ne s'écrit nulle part. Noter les comptes affichés à l'écran (README, « Démonstration ») : pour le Sénégal, le premier délégué, son superviseur et le DM du périmètre.
2. La base reprend le terrain du cycle 0.5 : trois semaines exécutées, leurs rapports soumis (dont un en retard et un à l'horodatage douteux), un rapport en brouillon et un à rédiger. Aucune journée n'est encore validée : « À traiter » est plein.
3. Lancer une fois la tâche périodique (`python manage.py executer_echeances`) : elle envoie les rappels, les alertes de retard à 48 h et les escalades du moment.
4. Ouvrir le portail sur un ordinateur, le téléphone du délégué à côté (README, « Sur un iPhone »).

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Superviseur (portail) | « **À traiter** » : quatre chiffres en tête, les journées terminées de l'équipe par délégué et par semaine, « Conforme » ou « À vérifier · n écarts » avec chaque écart, l'état des rapports | RPT-012, 20.A |
| 2 | Superviseur | « Ouvrir la journée » d'une journée **à vérifier** : contrôles, chaque visite, son rapport soumis en entier, la pièce jointe PDF, « Soumis en retard » et « Horodatage douteux » avec les deux heures | RPT-012, RPT-007 CA2, RPT-010 CA1 |
| 3 | Superviseur | « **Demander une correction** » sur un rapport : sans commentaire, le bouton reste inactif ; avec un commentaire et « Résumé de l'échange » coché, le rapport revient au délégué. « Valider ce rapport » sur l'autre visite : il se valide seul ; « Valider la journée » reste inactif et dit pourquoi | RPT-014 CA1 et CA2, RPT-013, 22.A |
| 4 | Délégué (téléphone) | La notification « … demande une correction de votre rapport du … » ouvre le rapport, la demande en tête ; la Tournée liste les « **Rapports à corriger** », même d'une semaine passée. Corriger le résumé et soumettre | RPT-014, RPT-015, 29.A |
| 5 | Superviseur | La notification « … a corrigé son rapport du … » ouvre la journée : « Version 2, soumise après correction », la demande, « Modifié : Résumé de l'échange » ; « Voir la version 1 » déplie l'ancienne version. Valider : la journée est validée, figée, et quitte « À traiter » | RPT-015 CA1, 28.A, REC-08 |
| 6 | Superviseur | Revenir à la file : « **Valider les n journées conformes** » ne prend que les journées conformes, complètes et sans horodatage douteux ; chaque rapport validé dit par qui, quand et comment | RPT-013 CA1 et CA2, RG-034, RG-035, 23.A |
| 7 | Superviseur | Rouvrir la journée validée (depuis la conformité de la semaine, « Ouvrir la journée ») : « **Rouvrir le rapport** », motif obligatoire. La journée revient dans « À traiter » avec « 1 rapport rouvert » ; son classement reste figé | RPT-016, 31.A, 32.A |
| 8 | Superviseur | Onglet « **Retards** » : les rapports non soumis après leur échéance, leurs jours de retard, filtrables par délégué ; l'alerte « … rapports du … toujours pas soumis, 48 h après les visites » dans les notifications | RPT-017 CA1, RG-032, 34.A, 35.A |
| 9 | DM (portail) | La notification « …, journée du … : à valider par escalade » ouvre une journée qui attend depuis plus de 24 heures ouvrées : marquée « Escaladée », il la valide en mode `escalade` ; le superviseur garde la main | RPT-018, 25.A, 38.A |
| 10 | Délégué (téléphone) | Le centre de notifications : « n rapports validés », regroupés ; à 18 h, « Rapport de la visite du jour à soumettre avant minuit » si un rapport du jour attend | §18, NOT-006, 37.A |
| 11 | — | Ce qui ne se montre pas en séance : la réouverture par le DM après 30 jours (CA1, prouvée par les tests) ; le push sur le téléphone (0.8.5). Couvert ou attendu : `recette-0.6.md` | RPT-016 CA1, NOT-003 |

## Messages clés

- Le superviseur a une seule porte d'entrée, « À traiter » : ses journées, leurs écarts, leurs rapports, puis les retards dans un onglet à côté.
- Il valide d'un geste ce qui est conforme, et regarde de près ce qui ne l'est pas. Aucune validation automatique : chaque rapport validé dit par qui, quand et comment.
- Une correction est motivée et ciblée ; la version précédente reste lisible et ce qui a changé se voit. Une réouverture est motivée, auditée et notifiée.
- Personne n'est oublié : rappel au délégué à 18 h, alerte au superviseur à 48 h, escalade au DM après 24 heures ouvrées.
- La recette du cycle est dans `recette-0.6.md` : chaque critère d'acceptation est relié au test qui le prouve, dont le scénario REC-08 de bout en bout.
- Prochain cycle (0.7) : les indicateurs de pilotage, du délégué au siège.

## Points à faire trancher

1. **Délai d'escalade** (24 heures ouvrées, 25.A) : le même que pour les plannings. Convient-il à la validation des rapports ?
2. **Fenêtres des alertes** (7 jours, liste des retards sur 13 semaines) : hypothèses à confirmer pendant le pilote.
3. **Réouverture** (30 jours pour le superviseur) : la durée convient-elle aux contrôles de fin de mois ?

## Après la séance

Réinitialiser la base (étape 1 de la préparation) : la démonstration suivante repart du même état.

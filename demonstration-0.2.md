# Démonstration de fin de cycle 0.2 — Planning

Scénario d'environ 25 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Noter les comptes affichés, dont le délégué et l'administrateur pays du Sénégal.
2. La base contient, pour ce délégué, **deux semaines** :
   - la semaine en cours, déjà **soumise à temps** (visites complètes, un passage) ;
   - la semaine suivante, **en préparation** : six visites, dont une à compléter, un passage de deux confrères et une demi-journée de formation le dernier jour.
3. Activer à l'avance la double authentification des comptes marqués `*`.
4. Ouvrir le portail sur un ordinateur. Sur l'iPhone : `make telephone` sur l'ordinateur, même Wi-Fi, puis scanner le QR code avec l'appareil photo (README, « Sur un iPhone »). Pour une application installée, voir README, « Builds de test ».

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Administrateur pays (portail) | Jours fériés : le calendrier de l'année ; ajouter une fête à date variable, la décaler, voir qu'une date passée ne se modifie plus | ORG-012 |
| 2 | Délégué (iPhone) | Accueil, « Ma semaine » : cette semaine soumise, la suivante en préparation avec son échéance ; toucher une ligne ouvre la semaine. Onglet Semaine, semaine en cours : « Soumis au superviseur », « Soumis le … » ; elle se lit sans se modifier. Toucher un jour : l'itinéraire numéroté et les distances ; toucher une visite : son détail et ses fiches | PLN-001, PLN-006, PLN-010 |
| 3 | Délégué | « Semaine suivante » : statut, échéance (« À soumettre avant le jeudi … à 18:00 »), nombre de visites face au seuil de chaque jour, kilomètres estimés sans montant | PLN-006, PLN-010, RG-013 |
| 4 | Délégué | Carte « À vérifier » : le point bloquant (visite à compléter) et ce qui sera signalé au superviseur (seuils) ; la demi-journée de formation réduit de moitié l'objectif de son jour | PLN-004, PLN-009 |
| 5 | Délégué | Le passage : « Poste de santé … · Passage · 2 prescripteurs », chaque prescripteur sur sa ligne ; dissocier puis regrouper | PLN-003 |
| 6 | Délégué | « Ajouter depuis ma liste cible » : cocher deux prospects, choisir un jour ; « Copier vers » sur une visite ; réordonner un jour | PLN-005 |
| 7 | Délégué | Commencer une visite, quitter l'application, la rouvrir : « Reprendre la saisie ». Passer en mode avion, enregistrer une visite : « 1 envoi en attente » ; réseau revenu, elle part une seule fois | PLN-007 |
| 8 | Délégué (portail) | Planning : la semaine en colonnes ; glisser un prospect de la liste cible sur un jour, une visite d'un jour à l'autre | PLN-005, PLN-006 |
| 9 | Délégué (iPhone) | En fin de semaine, « Ouvrir la visite à corriger » : compléter l'heure et l'objectif. Puis « Soumettre le planning » et confirmer : « Soumis le … ». Après jeudi 18 h, elle part quand même, marquée « En retard » | PLN-002, PLN-008 |

## Messages clés

- Le délégué prépare sa semaine sur le téléphone, même sans réseau : rien de ce qu'il saisit ne se perd, et rien n'est créé deux fois.
- Les contrôles se voient pendant la préparation, pas seulement à la soumission : ce qui bloque (même heure, visite incomplète, fiche inactive, lieu sans exercice) est séparé de ce qui sera simplement signalé au superviseur (seuils, hors cible, hors secteur, retard).
- Un délégué dont le poste n'a pas de superviseur ne peut pas soumettre : le message lui dit de prévenir l'administrateur pays (ORG-007), qui voit ces postes dans « À traiter ».
- La recette du cycle est dans `recette-0.2.md` : chaque critère d'acceptation est relié au test qui le prouve.
- Prochain cycle (0.3, Validation des plannings) : le superviseur reçoit le planning, voit les signalements, l'approuve ou le renvoie avec un commentaire.

## Après la séance

Réinitialiser la base (étape 1 de la préparation) : la démonstration suivante repart du même état.

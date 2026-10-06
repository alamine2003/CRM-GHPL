# Démonstration de fin de cycle 0.3 — Validation des plannings

Scénario d'environ 30 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Noter les comptes affichés (README, « Démonstration ») : pour le Sénégal, le superviseur, le délégué, le « délégué semaine fermée » et le DM.
2. La base contient, au Sénégal, le cycle du planning sur **deux délégués** :
   - **premier délégué** (le compte « délégué » affiché) :
     - la semaine en cours, **approuvée** avant la fermeture du lundi 0 h : soumise le vendredi précédent, validée le samedi par son superviseur (version 1). Elle contient des visites complètes, un passage de deux confrères, une matinée d'accompagnement du superviseur et une visite hors liste cible ;
     - la semaine suivante, **en préparation** : six visites, dont une à compléter (heure et objectif), un passage et une demi-journée de formation le dernier jour ;
   - **second délégué** (le compte « délégué semaine fermée » affiché) :
     - la semaine suivante, **soumise** il y a deux heures, à temps : elle attend la décision du superviseur dans la file « Validation » ;
     - la semaine en cours, **fermée sans planning** : il a déjà demandé la réouverture. Son superviseur la voit dans « Semaines fermées », sous sa file, avec « Réouverture demandée ».
3. Les deux délégués dépendent du superviseur affiché : il trouve le planning soumis du second délégué dans sa file, et sa demande de réouverture sous « Semaines fermées ».
4. Activer à l'avance la double authentification des comptes marqués `*` (dont le DM).
5. Ouvrir le portail sur un ordinateur. Sur l'iPhone : `make telephone` sur l'ordinateur, même Wi-Fi, puis scanner le QR code avec l'appareil photo (README, « Sur un iPhone »). Pour une application installée, voir README, « Builds de test ».

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Premier délégué (iPhone) | Accueil, « Ma semaine » : cette semaine approuvée, la suivante en préparation. Onglet Semaine, semaine en cours : « Approuvé par … le … » ; « La semaine a commencé : ce planning validé ne se modifie plus. » Toucher une visite : son détail, sans modification possible | PLN-012, RG-018, §14.21 |
| 2 | Premier délégué (portail) | Planning : la même semaine approuvée, en lecture. Les modifications d'un planning approuvé se font depuis le téléphone, et seulement jusqu'au lundi 0 h | PLN-015, §14.21 |
| 3 | Premier délégué (iPhone) | « Semaine suivante » : « À soumettre avant le lundi … » (la fermeture de cette semaine-là). Carte « À vérifier » : la visite à compléter bloque, les seuils seront signalés. « Ouvrir la visite à corriger » : compléter l'heure et l'objectif. Puis « Soumettre le planning » et confirmer : « Soumis le … » | PLN-002, PLN-004, PLN-008, RG-013 |
| 4 | Second délégué (iPhone, puis portail) | Semaine en cours : « La semaine a commencé lundi à 0 h sans planning validé : elle est fermée. » La demande est déjà partie : « Demande envoyée à votre superviseur : vous serez prévenu dès qu'il aura rouvert la rédaction. » Sur une semaine fermée sans demande, le bouton « Demander la réouverture » l'envoie, une seule fois. On ne peut ni préparer ni soumettre | PLN-008 CA1, §14.21 |
| 5 | Superviseur (portail) | La cloche : le nombre de non lues ; « … demande la réouverture de son planning de la semaine n » ouvre la page Validation. La file, « du plus ancien au plus récent » : le planning soumis du second délégué, puis celui que le premier vient de soumettre (étape 3), avec le délégué, la date de soumission, l'attente et les alertes (hors liste cible, seuils), et l'accompagnement avec son explication | NOT-001, PLN-011 CA1, PLN-018 |
| 6 | Superviseur | Ouvrir le planning : la semaine en colonnes, les activités, les contrôles, le kilométrage ; toucher la visite hors liste cible : son alerte. Rien ne se modifie | PLN-011 CA2, PLN-004 CA2 |
| 7 | Superviseur | Ouvrir une visite et écrire une « Remarque pour la révision ». Puis « Demander une révision » : sans commentaire ni remarque, la demande ne part pas ; avec un commentaire, elle part et le délégué est notifié. Le planning affiche « Révision demandée le … par … · version 1 » | PLN-013, RG-017 |
| 8 | Second délégué (iPhone) | La notification de révision ; le commentaire en tête de la semaine et « Remarque : … » sur la visite visée. Corriger, puis « Soumettre la version 2 » : pas de retard compté | PLN-013 CA2, PLN-014, PLN-008 CA2 |
| 9 | Superviseur (portail) | La file : « Version 2 · après révision », avec le rappel de la révision précédente. La carte « 2 versions » : « Voir la version 1 », telle qu'elle a été soumise, avec la révision demandée ; « Voir la version 2 » et sa comparaison (visites ajoutées, retirées, déplacées). « Approuver » et confirmer : la page passe au planning suivant de la file. Le délégué reçoit « Votre planning de la semaine n est approuvé » | PLN-014, AUD-003, PLN-012 |
| 10 | Superviseur | Sous la file, « Semaines fermées » : tous les délégués du superviseur sans planning validé pour la semaine en cours (dans la démonstration, la plupart n'en ont pas : « Aucun planning »), et « Réouverture demandée » sur celui qui l'a demandée. « Rouvrir la rédaction », puis « Oui, rouvrir » : « Rédaction rouverte : … en est prévenu. » | §14.21 |
| 11 | Second délégué (iPhone) | « … a rouvert la rédaction de votre planning de la semaine n ». La semaine se prépare : « Rédaction rouverte le … : le planning n'a pas été fait à temps, sa soumission sera marquée en retard. » Ajouter une visite et soumettre : « En retard » | PLN-008 CA1, RG-016 |
| 12 | Premier délégué (iPhone) | Le superviseur approuve le planning soumis à l'étape 3. Revenir à cette semaine suivante : changer l'heure d'une visite dans sa journée garde le statut « approuvé » ; changer de jour se dit « Ce changement sera soumis à votre superviseur » | PLN-015 |
| 13 | DM | L'escalade (24 h ouvrées sans décision) et l'alerte du lundi 0 h ne se montrent pas en séance : le compte du DM exige la double authentification, et les échéances supposent d'attendre l'heure dite. Elles sont couvertes par les tests (`recette-0.3.md`, PLN-016) | PLN-016, RG-019 |

## Messages clés

- Le délégué rédige, le superviseur valide. Rien ne s'approuve tout seul : sans décision 24 heures ouvrées après la soumission, le DM du périmètre est prévenu et peut décider (mode « escalade »).
- La semaine ferme le **lundi à 0 h** (heure du pays). Un planning qui n'est pas validé à cette heure ne se soumet plus, ne se décide plus et ne se modifie plus. Le délégué demande la réouverture, seul le superviseur l'accorde, et la réouverture reste inscrite : la soumission qui suit est « en retard ».
- Un planning validé se modifie selon RG-018 jusqu'au lundi 0 h : l'heure dans la journée librement, le reste par une nouvelle version à approuver. Ensuite, plus du tout.
- Le vendredi à 9 h, le délégué dont le planning de la semaine suivante n'est pas soumis reçoit un rappel. À 0 h le lundi, chaque DM apprend combien de plannings de ses réseaux ne sont pas approuvés.
- Chaque version reste consultable telle qu'elle a été soumise, avec sa décision, son auteur et son mode (direct, escalade, remplacement).
- La recette du cycle est dans `recette-0.3.md` : chaque critère d'acceptation est relié au test qui le prouve, et les écarts restants y sont listés.
- Prochain cycle (0.4) : le programme du jour, l'exécution des visites prévues par le planning approuvé.

## Après la séance

Réinitialiser la base (étape 1 de la préparation) : la démonstration suivante repart du même état.

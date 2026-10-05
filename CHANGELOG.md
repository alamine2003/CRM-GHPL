# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.2.7] — Brouillons sauvegardés et hors connexion de base

Septième jalon du cycle 0.2 « Planning ».

### Ajouté — PLN-007

- **Brouillon de saisie** (**CA1**) : la fiche d'une visite ou d'une absence est gardée sur le téléphone, chiffrée, à chaque changement.
  - Si l'application se ferme en pleine saisie, la semaine affiche à la réouverture « Une nouvelle visite n'a pas été enregistrée », avec « Reprendre la saisie » et « Abandonner cette saisie ».
  - Enregistrer, annuler, copier ou retirer efface le brouillon.
- **Sans réseau**, une visite ou une absence enregistrée reste sur le téléphone : « Pas de réseau : enregistrée sur le téléphone, elle partira dès que le réseau revient. »
  - Une carte « 1 envoi en attente » la liste, avec « Envoyer maintenant ».
  - La file part d'elle-même à la relecture suivante de la semaine ; « Réseau retrouvé : 1 envoi est parti » le confirme.
  - Un refus du serveur n'est jamais mis en attente : il s'affiche ; refusé au rejeu, l'envoi garde son message jusqu'à ce qu'on l'abandonne.
- **Semaine hors ligne** : la dernière semaine lue s'affiche sans réseau (« Hors ligne : semaine telle qu'au 5 oct., 11:50 »).
- **Sans doublon** : chaque nouvelle visite ou absence porte un identifiant tiré sur le téléphone ; renvoyée après une coupure, elle n'est créée qu'une fois (le serveur rend celle qui existe).
- prd.md §14.14 consigne le périmètre ; la synchronisation complète reste au cycle 0.8.

### Architecture

- Serveur : `id` facultatif à la création d'une visite ou d'une absence, création idempotente, `identifiant_pris` si l'identifiant appartient à un autre planning.
- Mobile : `src/Brouillons.ts`, `src/Attente.tsx` ; `oublier` dans la base locale.

### Design

Revue sur le rendu réel, réseau coupé puis rétabli : mobile à 360 px et à 390 px en thème sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Semaine, réseau revenu | « Pas de réseau : enregistrée sur le téléphone » restait affiché après l'envoi | Remplacé par « Réseau retrouvé : 1 envoi est parti » |
| Semaine, sans réseau | Le message de mise en attente en vert, couleur des succès | En bleu : une information, pas un succès |
| Envois en attente | « Enregistrés… ils partent » pour un seul envoi | Accordé au nombre |

## [0.2.6] — Vues semaine, jour et détail ; kilométrage estimé

Sixième jalon du cycle 0.2 « Planning ».

### Ajouté — vues du planning (PLN-006)

- **Téléphone** :
  - la **semaine** montre le statut du planning et, pour chaque jour, le nombre de visites face à son seuil (**CA1**) ; sans seuil connu, le nombre seul ;
  - toucher un jour ouvre la **journée** : itinéraire numéroté dans l'ordre, heure, passages, absences, distance d'un arrêt à l'autre ;
  - toucher une visite ouvre son **détail** : quand, lieu, objectif, réseau, statut, ce qui reste à compléter ou à corriger, et les fiches prospect et lieu. « Modifier la visite » ramène à sa saisie tant que le planning se prépare ; un planning soumis s'ouvre directement en détail.
  - La journée et le détail appartiennent à l'onglet Semaine, qui reste allumé et y ramène.
- **Portail** : la rubrique **Planning** (délégué, superviseur sur un poste) n'est plus « à venir ».
  - Une colonne par jour, avec le résumé de la semaine, les contrôles et les kilomètres.
  - En préparation, on **glisse un prospect** de la liste cible sur un jour pour y poser une visite pré-remplie (PLN-005 CA1), ou **une visite** d'un jour à l'autre pour la déplacer ; « Poser » fait la même chose au clavier. Une carte de visite ouvre son détail, d'où l'on peut la retirer.

### Ajouté — kilométrage estimé (PLN-010)

- Calculé à vol d'oiseau entre les établissements, dans l'ordre de la journée (**CA1**) ; un passage compte pour un arrêt ; un lieu sans coordonnées est sauté et signalé.
- Affiché pour la semaine (« ≈ 15,6 km estimés cette semaine, à vol d'oiseau »), par jour et entre deux arrêts. **CA2** : aucun montant.
- prd.md §14.13 consigne les choix [H] : vol d'oiseau, départ au premier lieu, saisie fine sur le téléphone.

### Architecture

- `planning/kilometrage.py`, sans service externe ; la semaine renvoie `kilometrage`.
- Mobile : `src/Itineraire.tsx`, routes `jour/[date]` et `visite/[id]`. Portail : `pages/Planning.tsx`.

### Design

Revue sur le rendu réel : mobile à 360 px et 390 px en thème sombre ; portail à 1440, 834 et 414 px et en thème sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Journée et détail (mobile) | Plus aucun onglet allumé : on ne savait plus où l'on était | L'onglet Semaine reste allumé et y ramène |
| Planning (portail) | Carte « Planning » sous le titre « Planning » | « Résumé de la semaine » |
| Planning (portail) | Cinq lignes « Sous le minimum de visites », une par jour | Une ligne : « Sous le minimum de visites : lun. 5, mar. 6… » |
| Colonnes (portail) | « 1 visite, objectif 6 à 10 · 15,6 km » sur trois lignes dans une colonne étroite | « 1 sur 6–10 », les kilomètres dessous ; libellé vocal complet |
| Colonnes (portail) | « Déposez ici un prospect ou une visite » en gros sous chaque jour | « Déposer ici », discret |
| Liste cible (tablette, téléphone) | Soixante prospects déroulés sous la semaine | Douze, puis « Afficher les 38 autres » |

## [0.2.5] — Copier, reprendre la semaine, poser depuis la liste cible

Cinquième jalon du cycle 0.2 « Planning ».

### Ajouté — PLN-005

- **Depuis ma liste cible** (**CA1**) : dans la carte Planning, « Ajouter depuis ma liste cible » ouvre la liste.
  - On coche les prospects, on choisit le jour, puis « Poser 3 visites le jeudi 8 ».
  - Chaque visite reprend le prospect et son établissement principal ; l'heure et l'objectif se complètent ensuite.
  - La liste montre d'abord les prospects pas encore prévus dans la semaine (filtre « Pas encore prévus »), avec recherche et filtre A/B/C ; pour ceux qui sont déjà prévus, elle dit le jour.
- **Reprendre la semaine précédente** (**CA2**) : sur une semaine vide, « Reprendre ces 8 visites » recopie la semaine d'avant jour pour jour, passages compris.
  - Un jour devenu férié ou d'absence est sauté, et le message le dit.
  - Les absences ne sont pas reprises ; une semaine qui a déjà des visites ne se reprend pas.
- **Copier une visite** : dans sa fiche, « Copier vers » pose la même visite (prospect, lieu, heure, objectif, note) sur un autre jour.
- Déplacer (changer le jour) et supprimer (retirer) existaient déjà depuis 0.2.2.
- prd.md §14.12 consigne les choix [H], dont « cocher puis poser » à la place du glisser-déposer sur téléphone (il viendra sur le portail en 0.2.6).

### Corrigé

- Les tests des jours fériés et du planning figeaient l'heure dans le seul corps du test ; le jeu de données était créé à l'heure réelle, avec des droits qui commençaient « après » l'heure figée. Ils échouaient dès 9 h UTC passées, puis l'auraient fait le 7 octobre. L'heure est désormais figée avant la création des données.

### Architecture

- Copie, reprise et pose passent par `ajouter_visite` : mêmes règles qu'un ajout (jour, réseau, passage, ordre). Trois routes couvertes par la matrice des droits et les tests d'isolation ; énumération `RaisonRepriseEnum`.
- Mobile : `src/Pose.tsx` ; `LigneChoix` sait cocher.

### Design

Revue sur le rendu réel : mobile à 360 et 414 px, et à 390 px en thème sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| À vérifier | Une ligne « lun. 5 : visite à compléter » par visite posée : la carte s'allongeait à chaque pose | Une ligne par jour et par champs manquants (« lun. 12 : 2 visites à compléter ») |
| Planning (360 px) | « Reprendre la semaine précédente (8 visites) » sur deux lignes, texte mal centré | L'explication passe au-dessus ; le bouton dit « Reprendre ces 8 visites » ; les boutons centrent leur texte |
| Fiche de visite | « Copier vers » sans dire ce qui est copié | « La visite telle qu'enregistrée, sur le jour touché » |

## [0.2.4] — Contrôles bloquants et signalements

Quatrième jalon du cycle 0.2 « Planning ».

### Ajouté — contrôles du planning (PLN-004)

- Pendant la préparation, une carte **« À vérifier »** apparaît sous le planning, en deux parties :
  - **à corriger avant de soumettre** : les contrôles bloquants (RG-015) ;
  - **signalé à votre superviseur** : les signalements (RG-016).
  Toucher un point ouvre la visite concernée.
- **Bloquants** (RG-015) :
  - visite incomplète ;
  - fiche du prospect ou du lieu devenue inactive ;
  - prospect qui n'exerce pas dans ce lieu à cette date ;
  - deux visites à la même heure (**CA1**) ; les visites d'un même passage partagent la leur sans conflit ;
  - le même prospect deux fois le même jour.
  La soumission (0.2.8) les refusera avec la liste ; la garde est prête côté serveur (`planning_bloque`).
- **Signalements** (RG-016), qui n'empêchent pas la soumission (**CA2**) :
  - jours sous le minimum ou au-dessus du maximum de visites du type de poste, au prorata des absences et sans les jours fériés (RG-022, PLN-009 CA1) ;
  - prospect hors liste cible ;
  - lieu hors des secteurs du poste (RG-024) ;
  - prospects A sans visite dans le mois, sur la dernière semaine du mois.
- Chaque jour montre son nombre de visites face à son seuil (« 1 sur 6–10 »), en ambre hors de la fourchette. Chaque visite concernée porte sa marque (« Même heure qu'une autre visite », « Hors liste cible »…).
- prd.md §14.11 consigne les choix [H] : arrondis du prorata, fourchette la plus large pour plusieurs types de poste, prospects A signalés en fin de mois.

### Architecture

- `planning/controles.py` : contrôles calculés à la demande, sans état ; la semaine renvoie `controles` (bloquants, signalements, objectifs).
- Énumérations du schéma nommées : `CodeControleEnum`, `GraviteControleEnum` ; le composant d'API prend le nom `ControlePlanning`, distinct des anomalies d'import.
- Mobile : `src/Controles.tsx` (carte, objectif du jour, marques des visites).

### Design

Revue sur le rendu réel : mobile à 360 et 414 px, et à 390 px en thème sombre. Seconde et troisième revues après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| En-tête du jour | « 1 / 6–10 » cryptique, en orange à côté de « Aujourd'hui », lui aussi orange | « 1 sur 6–10 » en ambre ; libellé vocal complet (« 1 visite, objectif 6 à 10 ») |
| En-tête du jour (360 px) | L'objectif passait sur deux lignes à côté de « Aujourd'hui » | Il ne se replie plus ; seul l'espace libre se réduit |
| Passage en conflit d'heure | « Même heure qu'une autre visite » répété sur chaque visite du passage | Une seule marque, sur la ligne du passage, qui porte l'heure |

## [0.2.3] — Ordre de la journée, passages, absences

Troisième jalon du cycle 0.2 « Planning ». L'heure et les notes, prévues ici, sont arrivées dès 0.2.2 avec PLN-002.

### Ajouté — ordre de la journée

- Les visites à heure fixe se rangent d'elles-mêmes dans l'ordre chronologique ; celles sans heure se placent à la main.
- Le lien « Réordonner » d'un jour fait apparaître des flèches sur les visites sans heure, juste là où elles sont ; « Terminer » referme le mode.
- L'heure garde le dernier mot : une visite qui reçoit une heure reprend sa place.

### Ajouté — passages (PLN-003)

- Deux visites ou plus du même jour dans le même établissement font apparaître « Regrouper les n visites à … en un passage ».
- **CA1** : le passage s'affiche à son heure, avec le lieu puis « Passage · n prescripteurs ». Un filet relie ses visites.
- **CA2** : chaque visite garde son prospect, son objectif et ce qui lui reste à compléter.
- Le passage a une seule heure : la changer sur une visite la change pour toutes, et le formulaire le dit.
- Une nouvelle visite dans ce lieu ce jour-là rejoint d'office le passage.
- Une visite déplacée ailleurs le quitte ; un passage réduit à une visite se défait ; « Dissocier » le défait à la demande.

### Ajouté — absences (PLN-009)

- « Absence », sur chaque jour planifiable, déclare un congé, une formation, une réunion, une maladie ou une autre absence, pour la journée, le matin ou l'après-midi. Une absence « autre » demande un motif.
- L'absence s'affiche dans la journée (« Formation · Après-midi ») ; toucher la ligne la modifie ou la retire.
- Une journée entière d'absence ne propose plus d'ajouter une visite. Elle ne se déclare pas tant que des visites y sont prévues : le message invite à les déplacer ou les retirer d'abord.
- **CA1** : une demi-journée compte pour moitié dans la part travaillée du jour (`part_travaillee`), que les contrôles de seuils de 0.2.4 utiliseront. **CA2** (validation avec le planning) viendra avec le cycle 0.3.
- Démonstration : la semaine du premier délégué compte un passage de deux confrères et une demi-journée de formation.
- prd.md §14.10 consigne les choix [H].

### Architecture

- `Visite.ordre`, tables `Passage` et `Absence` sous sécurité au niveau des lignes ; six routes couvertes par la matrice des droits et les tests d'isolation.
- Les énumérations du schéma portent des noms explicites (`TypeAbsenceEnum`, `PeriodeAbsenceEnum`).
- Mobile : la journée a son composant (`src/Journee.tsx`), les absences leur formulaire (`src/Absences.tsx`).

### Design

Revue sur le rendu réel : mobile à 360 et 414 px, et à 390 px en thème sombre. Seconde et troisième revues après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Passage (360 px) | « Poste de santé Touré · 2 … » tronqué : le nombre de prescripteurs (CA1) illisible, « Dissocier » serré à droite | Lieu sur sa ligne, « Passage · 2 prescripteurs » dessous ; « Dissocier » sous les visites du passage |
| Passage | Rien ne distinguait ses visites des visites seules | Filet coloré qui relie les visites à la ligne du passage |
| Journée | Deux lignes d'actions empilées sous chaque jour | Une seule rangée : « + Ajouter une visite », « Absence », « Réordonner » |
| Réordonner | Bouton et aide dans la carte Planning, loin du jour ; les flèches apparaissaient hors de vue | Le mode s'ouvre dans le jour lui-même, aide et « Terminer » sous ses visites |
| Absence | « Motif » (le type) puis « Précisez le motif » (le commentaire) | Le groupe de pilules s'appelle « Type » |

## [0.2.2] — Visites planifiées

Deuxième jalon du cycle 0.2 « Planning ».

### Ajouté — visites dans la semaine (PLN-002)

- Dans l'onglet **Semaine** du téléphone, chaque jour planifiable d'un planning en préparation reçoit ses visites : heure, prospect, lieu, objectif. « Ajouter une visite » ouvre la saisie :
  - le **jour**, à choisir parmi les jours planifiables de la semaine ;
  - le **prospect**, pris d'abord dans la liste cible (disponible même hors ligne), sinon cherché dans toutes les fiches du pays ;
  - le **lieu**, parmi les lieux d'exercice actifs du prospect, le principal d'abord ; s'il n'y en a qu'un, il est retenu d'office ;
  - l'**heure**, saisie comme on la dit (« 9h30 », « 14:00 », « 8h ») ;
  - le **réseau**, proposé seulement si le délégué en a plusieurs cette semaine ;
  - l'**objectif** et une **note** facultative.
- **CA1** : une visite peut rester incomplète pendant la préparation. Elle s'affiche « À compléter : Heure, Objectif », et le bilan du planning compte celles qui restent à compléter. Le refus à la soumission, avec la liste des champs manquants, est prêt côté serveur (`planning_incomplet`) et s'appliquera en 0.2.8.
- Toucher une visite la modifie ou la retire tant que le planning est en préparation ou à réviser. Un planning soumis ne propose plus ni ajout ni modification.
- **RG-025** : le prospect et le lieu doivent être actifs dans le pays ; une fiche « à valider » n'est acceptée que pour son auteur. Un jour férié, un jour hors de la semaine ou un réseau d'un autre poste sont refusés avec un message explicite.
- Ajout et retrait audités ; un retrait archive la visite, il ne la supprime pas.
- Démonstration : la semaine en cours du premier délégué de chaque pays est en préparation, avec trois visites complètes et une à compléter.
- prd.md §14.9 consigne les choix [H] : objectif en texte libre, réseau parmi ceux du poste, visite incomplète permise en préparation, lien prospect–lieu contrôlé en 0.2.4.

### Architecture

- Table `Visite` sous sécurité au niveau des lignes ; routes couvertes par la matrice des droits et les tests d'isolation.
- Les statuts et transitions de la visite (prd.md §17.2) rejoignent la machine à états exportée vers `packages/domaine` (ADR-011).
- Client API : `plannings.ajouterVisite`, `visites.modifier`, `visites.retirer` ; types `Visite`, `SaisieVisite`, `ModificationVisite`, `StatutVisite`.

### Design

Revue sur le rendu réel : mobile à 360 et 414 px, et à 390 px en thème sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Saisie d'une visite | Le formulaire s'ouvrait au défilement de la semaine : titre et choix du jour hors de vue | Il s'ouvre en haut de page |
| Semaine, après enregistrement | Le message « Visite ajoutée » restait hors de vue, en haut | La semaine se réaffiche en haut, message visible |
| Choix du prospect | Huit propositions avant toute recherche repoussaient l'heure et l'objectif loin en bas | Cinq propositions ; la recherche affine |
| Choix du prospect | « Depuis ma liste cible » affiché au-dessus de « Personne de ce nom… » | Mention seulement quand la liste propose quelqu'un |
| Objectif (360 px) | Texte indicatif tronqué | « Ex. : présenter le produit du mois » |
| Thème sombre | « Ajouter une visite », « Changer », « Revenir à cette semaine », les liens de connexion et le potentiel B en bleu marine sur fond marine, presque invisibles | Couleur de lien adaptée au thème (`useLien`), bleu clair en sombre |

## [0.2.1] — Semaine, jours ouvrés, jours fériés

Premier jalon du cycle 0.2 « Planning ».

### Ajouté — calendrier des jours fériés (ORG-012)

- L'administrateur pays tient le calendrier dans **Paramètres**, juste après le groupe « Calendrier » : ajouter, modifier, retirer un jour férié, année en cours ou suivante.
  - **CA1** : un jour férié n'est pas planifiable et sort des jours comptés par les contrôles de la semaine (RG-022).
  - **CA2** : une date se modifie ou se retire jusqu'à la veille ; à partir du jour même, elle est acquise et grisée. La mention « date variable » signale les fêtes annoncées peu avant (Korité, Tabaski…).
  - Un même jour ne peut pas être férié deux fois ; chaque changement est audité.
- Nouveau droit `jours_feries.gerer` (administrateur pays) ; prd.md §6.3 complétée.

### Ajouté — semaine et planning du délégué (PLN-001)

- **Onglet « Semaine »** du téléphone, qui n'est plus « à venir » :
  - les jours ouvrés du pays (lundi–vendredi par défaut, paramètre `jours_ouvres`, RG-014) ;
  - les jours fériés affichés et non planifiables (**CA2**) ;
  - le repère « Aujourd'hui » et la navigation d'une semaine à l'autre ;
  - « Préparer cette semaine » crée le planning au statut « En préparation ».
- **CA1 (RG-012)** : un seul planning par délégué et par semaine, garanti par une contrainte en base.
  - Une semaine se désigne par son lundi ; une semaine passée ne se planifie plus.
  - Il faut occuper un poste cette semaine-là : le délégué, ou le superviseur qui assure une activité de terrain (prd.md §6.3).
- Nouveau droit `plannings.preparer` (délégué, superviseur) ; création auditée.
- Les visites s'ajouteront au planning à partir de 0.2.2.

### Architecture

- **ADR-011** : la machine à états du planning (prd.md §17.1) est définie au serveur (`planning/etats.py`). `make schema` l'exporte vers `packages/domaine/src/etats.json`, que lisent les clients (`peutPasser`, `transitionsPlanning`) ; un test serveur échoue si le fichier n'est pas à jour.
- Nouvelle application `planning` ; tables `JourFerie` et `Planning` sous sécurité au niveau des lignes ; routes couvertes par la matrice et les tests d'isolation.
- Démonstration : jours fériés à date certaine de l'année en cours et de la suivante (fêtes fixes, et fêtes calculées depuis Pâques) pour le Sénégal et le Togo.

### Design

Revue sur le rendu réel : mobile à 360 et 414 px, portail à 360, 414, 834 et 1440 px. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Semaine (mobile) | « Aucune visite » répété sur chaque jour, le jour férié noyé dans ce bruit | Ligne vide quand il n'y a rien ; seul le jour férié porte une mention |
| Semaine (mobile) | Jours en minuscules (« lundi ») sur deux lignes | « Lundi 5 oct. » sur une ligne de 48 px |
| Jours fériés (portail, 360 px) | Libellé écrasé à une largeur nulle par la date et les boutons | Les boutons passent à la ligne sur petit écran |
| Jours fériés (portail) | Dates longues sur deux lignes (« ven. 25 décembre ») | Mois abrégé (« ven. 25 déc. ») |
| Ajout d'un jour férié | Date proposée : le 1er janvier, déjà passé, donc refusé | Demain par défaut dans l'année en cours |

## [0.1.9] — Stabilisation, qualité des données et démonstration du cycle 0.1

Neuvième et dernier jalon du cycle 0.1 « Référentiel ».

### Décision consignée

- **Doublons** : c'est l'administrateur pays qui tranche la file des doublons, pas le superviseur ([D] du 4 octobre 2026, prd.md §14.7). C'était déjà le comportement livré en 0.1.8.

### Recette du cycle

- **Matrice de recette** [`recette-0.1.md`](recette-0.1.md) : chaque critère d'acceptation des 16 exigences du cycle est relié au test qui le prouve. Bilan : 35 critères couverts, 6 partiels (la partie qui dépend des visites, du planning ou des rapports sera testée avec eux), aucun non couvert.
- **Trous comblés** :
  - PRP-007 CA2 : sur le téléphone, sans réseau, le formulaire suggère les fiches de la liste cible enregistrée ;
  - PRP-008 CA3 : une décision « probable » est auditée avec son score et ses critères ;
  - PRP-012 CA1 : historique champ par champ d'un établissement ;
  - PRP-012 CA2 : aucune route ne supprime un prospect ni un établissement ;
  - ORG-014 CA1 : la simulation compte les modifications (rattachements, portefeuilles) sans rien écrire, et le portail affiche son bilan.

### Qualité des données

- **Accueil de l'administrateur pays** :
  - « À traiter » réunit désormais tout ce qui attend une décision : postes vacants ou sans superviseur, fiches prospects et établissements à valider, paires de doublons, propositions de modification ;
  - nouvelle carte « Qualité des données » : fiches actives sans lieu d'exercice, sans téléphone, sans spécialité (quand leur type en propose), hors de toute liste cible, établissements sans position, chacune rapportée au total. Chaque ligne ouvre la liste filtrée ; une ligne à zéro disparaît.
- **Nouveaux filtres** de la liste des prospects (PRP-005) : sans téléphone, sans spécialité, hors liste cible (administration du pays).
- La page Établissements s'ouvre avec les filtres de l'adresse (`statut`, `sans_coordonnees`).
- API `GET /api/v1/qualite/` (administrateur pays, pays actif seulement).

### Mobile : trouver l'information en un toucher (délégué)

- **Fiche prospect** : métier, potentiel, place dans ma liste (fréquence par cycle), lieux d'exercice avec jours de présence, n° d'ordre, secteur et localité.
  - « Appeler » et « Écrire un courriel » en un toucher.
  - Chaque lieu ouvre sa fiche (PRP-002, PRP-004).
- **Fiche établissement** :
  - « Itinéraire » ouvre Plans ou Google Maps vers la position GPS de référence, ou vers l'adresse ;
  - « Appeler » en un toucher ;
  - « Qui exerce ici », avec le potentiel de chacun (PRP-003).
- **Ma liste** :
  - recherche instantanée, même hors ligne, sur le nom (dans les deux ordres), la spécialité, le lieu, le secteur et les chiffres du téléphone ;
  - filtres A, B, C avec leurs effectifs ;
  - chaque ligne ouvre la fiche ;
  - quand la personne n'est pas dans la liste, « Chercher … dans toutes les fiches » relance la recherche dans le pays.
- **Proposer une correction** (PRP-014), sur la fiche d'un prospect ou d'un établissement commun, juste sous les contacts.
  - Prospect : téléphones, courriel, n° d'ordre. Établissement : adresse, téléphone. Un commentaire facultatif.
  - Seuls les champs changés sont envoyés ; l'envoi reste impossible tant que rien ne change.
  - La fiche ne change qu'après l'accord du superviseur ou de l'administrateur pays (CA1), et la décision revient sur l'accueil (CA2).
- **Sans réseau** (PRP-011 CA2) : la liste enregistrée sur le téléphone garde aussi les téléphones. Le délégué ouvre la fiche, appelle et retrouve le lieu principal.
- Les lignes des onglets Prospects et Établissements ouvrent aussi leur fiche ; le champ de recherche indique ce qu'il accepte.
- Revue sur le rendu réel à 360 et 414 px, puis seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Fiche prospect | Titre « Lieux d'exercice » remplacé par une erreur de traduction | Libellé dédié, vérifié par un test |
| Ma liste | Environ 200 px avant la première fiche : libellé au-dessus d'un champ qui le répète | Libellé vocalisé mais masqué, recherche et filtres groupés |
| Ma liste filtrée | Résumé du poste répété au-dessus des résultats | Masqué pendant une recherche ou un filtre |
| Fiches | Double filet sous la dernière ligne de chaque bloc | Dernière ligne sans filet |
| Fiche établissement | Personnes qui y exercent sans leur potentiel | Repère A, B ou C devant chaque nom |
| Proposer une correction | Formulaire ouvert en bas de la fiche, hors de l'écran | Placé sous les contacts : il s'ouvre là où le délégué regarde |

### Démonstration (DEM-001)

- La base de démonstration contient des paires de doublons probables, saisies par un délégué avec une faute de frappe, et une proposition de modification en attente : la 0.1.8 se montre sans rien préparer.
- **Scénario de fin de cycle** : [`demonstration-0.1.md`](demonstration-0.1.md).
- **Sur un iPhone** : `make telephone` expose l'API sur le Wi-Fi local et lance Expo ; on scanne le QR code avec l'appareil photo, dans Expo Go (README, « Sur un iPhone »).
- L'accueil annonce « Cycle 0.1 terminé » et le cycle 0.2 « Planning ».

### Design

Revue de la carte « Qualité des données » et de la liste filtrée, à 360, 414, 834 et 1440 px, puis seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Accueil | « À trancher » répétait la carte « À traiter » juste au-dessus | Les décisions rejoignent « À traiter » ; la carte qualité ne garde que les fiches à compléter |
| Accueil | Sous-titres de section aussi grands que le titre de la carte | Sous-titres supprimés, une seule liste |
| Accueil | Lignes cliquables sans aucun indice | Libellés soulignés, comme des liens |
| Prospects (360 px) | Interrupteurs de filtre de 24 px de haut, trop petits pour le doigt | 40 px sur téléphone |

## [0.1.8] — Doublons, propositions, historique, import de l'organisation ; refonte du design

Huitième jalon du cycle 0.1 « Référentiel ».

### Ajouté — doublons des fiches prospects (PRP-007 à PRP-010)

- **PRP-007 — suggestions pendant la saisie** : dès deux lettres, le formulaire de création affiche les fiches ressemblantes : faute de frappe, accent, titre « Dr », même numéro d'ordre ou même mobile. « Ouvrir » mène à la fiche existante au lieu d'en créer une seconde.
  - **CA2** : sans réseau, le téléphone compare la saisie à la liste cible gardée dans sa base chiffrée.
- **PRP-008 — détecteur à l'enregistrement** :
  - **certain** (même numéro d'ordre dans le pays, ou même mobile avec un nom similaire) : fusion automatique, et la saisie renvoie la fiche conservée ;
  - **probable** : la fiche reste `a_valider` et entre dans la file ;
  - **aucun** : la fiche devient aussitôt commune (§14.6). Une fiche créée par un délégué n'attend donc plus une validation manuelle quand elle n'a pas de doublon.
  - **CA2** : un même téléphone fixe (le standard d'une clinique) avec des noms différents ne rend jamais deux fiches identiques, ni même probables.
  - **CA3** : chaque décision est auditée avec son score (0 à 100) et ses critères. Seuils et pondérations : prd.md §14.6 [H].
- **PRP-009 — file des doublons** (nouvelle page « Doublons », administrateur pays) :
  - **CA1** : comparaison des deux fiches côte à côte, les valeurs différentes en évidence (identité, téléphones, lieux d'exercice, listes cibles, auteur) ;
  - décisions « Fusionner », « Garder séparées » et « Refuser la fiche saisie » (archivée) ;
  - **CA2** : une paire gardée séparée ne revient plus.
- **Import BirdNotes** : les groupes de doublons signalés par BirdNotes et les fiches au même nom entrent dans la file, une fois chacun ; un réimport n'ajoute aucune paire. Rien n'est fusionné à l'import.
- **PRP-010 — défusion** (onglet « Fusions ») :
  - **CA1** : chaque fiche retrouve ses lieux d'exercice, ses listes cibles et les champs que la fusion avait complétés ;
  - **CA2** : la défusion est auditée ;
  - une paire défusionnée ne refusionne plus automatiquement ;
  - une fiche qui partageait le numéro d'ordre de l'autre le perd, et l'historique le garde.

### Ajouté — historique et propositions (PRP-012, PRP-014)

- **PRP-012 — historique** : chaque champ modifié d'un prospect ou d'un établissement est historisé avec l'ancienne et la nouvelle valeur, l'auteur, la date et l'origine (saisie, proposition, fusion, défusion). Les validations et archivages y figurent. La fiche affiche son historique repliable. CA2 : aucune suppression physique.
- **PRP-014 — propositions de modification** : le délégué propose un changement sur une fiche commune (téléphones, courriel, numéro d'ordre, adresse, nouveau lieu d'exercice), avec un commentaire.
  - **CA1** : la fiche ne change pas avant l'acceptation.
  - Le superviseur des postes de l'auteur ou l'administrateur pays accepte ou refuse avec un motif ; la page « Propositions » montre la valeur actuelle à côté de la valeur proposée.
  - **CA2** : le délégué voit les décisions sur le portail et sur l'accueil du téléphone, jusqu'à ce qu'il les marque « Vu ».
  - Nouveaux droits `propositions.creer` (délégué) et `propositions.trancher` (administrateur pays, superviseur dans son périmètre) ; prd.md §6.3 complétée.
- Tables `Fusion`, `DoublonProbable`, `Changement` et `Proposition` sous sécurité au niveau des lignes ; routes couvertes par la matrice et les tests d'isolation.

### Ajouté — import du fichier d'organisation (ORG-014)

- Classeur Excel, feuille « ORGANISATION », une ligne par poste. Il crée ou retrouve divisions, réseaux, zones, secteurs, comptes (sans mot de passe), rôles, périmètres de réseaux des DF et DM, postes, occupations, rattachements aux superviseurs et produits des portefeuilles.
- **CA1** : simulation sans rien écrire ; **CA2** : chaque ligne rejetée a son motif (colonne vide, fonction inconnue) ; **CA3** : « POSTE NON POURVU » crée un poste vacant ; **CA4** : un réimport retrouve ses postes et ne crée aucun doublon.
- Hypothèses dans prd.md, sous ORG-014 [H].
- Le classeur est lu sans nouvelle dépendance lourde ; son XML passe par `defusedxml`, qui refuse les entités dangereuses.
- La page « Imports » propose les deux sources : export BirdNotes ou fichier d'organisation.

### Design — direction « registre » (portail et mobile)

Référence : `docs/design.md`, avec la grille de revue obligatoire à chaque version.

| Écran | Défaut observé en 0.1.7 | Correction |
|---|---|---|
| Tout le portail | Titre répété dans la barre du haut puis en 28 px, avec une phrase de sous-titre | Barre de 48 px sans titre ; titre de page de 20 px et contexte (pays) sur la même ligne |
| Tout le portail | Bandeau « Démonstration » orange hachuré de 32 px | Filet orange de 3 px et mention discrète dans la barre |
| Tout le portail | Tuiles de chiffres à pastille d'icône, ombres, arrondis de 10 px | Barre de chiffres sans icône, surfaces plates séparées par des filets, arrondis de 6 px |
| Accueil | Bannière à dégradé et halos | En-tête simple ; feuille de route en barre segmentée sans pastilles |
| Navigation | Numéros de version sur les rubriques futures | Groupe « À venir », sans numéro ; libellé « Visites » raccourci |
| Organisation, Référentiels, Équipe | Réseaux, classes, rôles et états en pastilles colorées | Texte, et couleur réservée aux états qui appellent une action |
| Fiches et listes | Avatars d'initiales, icônes de type, icônes devant les boutons libellés | Supprimés ; le potentiel A/B/C reste l'unique couleur métier (A orange, B marine, C gris) |
| Boutons | Actions principales en orange | Marine ; l'orange marque l'élément actif et ce qui est « à traiter » |
| 360 à 834 px | Débordement horizontal (Profil, Accueil, puis toutes les pages via un texte masqué mal dimensionné) | Corrigés, vérifiés par capture aux quatre largeurs |
| Prospects (360 px) | Statut en boutons coupés, flèche de pagination à la ligne, liste à 520 px du haut | Statut défilant, pagination compacte, chiffres sur une rangée défilante : liste visible au premier écran |
| Listes cibles (≤ 834 px) | Les 45 postes empilés avant le détail | Liste déroulante de postes |
| Formulaires (téléphone) | Dialogue étroit, champs serrés | Plein écran |
| Mobile | En-tête marine de 180 à 360 px, pastilles de rôles, barre « v0.0.6 Fondations » périmée | En-tête de 56 px sur fond clair ; version et rôles dans « Profil » |
| Mobile | Cartes à liseré et icône orange, onglets en pilules, libellés en capitales | Cartes sobres, onglets de 56 px avec repère orange, libellés en casse normale |

Revue des nouveaux écrans 0.1.8 (360, 834 et 1440 px), puis seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Doublons | Lignes vides des deux côtés, tirets en gras, phrase d'aide répétée sur chaque paire | Lignes vides masquées, gras réservé aux valeurs qui diffèrent, aide une seule fois au-dessus de la file |
| Propositions | Étiquette « En attente » répétant le filtre ; « — → » quand le champ était vide | Étiquette retirée ; seule la nouvelle valeur s'affiche quand l'ancienne est vide |
| Mobile, saisie | Suggestions en paragraphe à puces dans une alerte | Liste à filets : nom, puis spécialité et lieu |
| Mobile, accueil | Motif du refus absent | Motif sous le nom de la fiche |

## [0.1.7] — Recherche, filtres, tri et pagination ; design enrichi

Septième jalon du cycle 0.1 « Référentiel ».

### Ajouté — recherche des fiches (PRP-005)

- **CA1** : recherche tolérante aux accents et à la casse sur le nom (titre ignoré), le téléphone, le n° d'ordre et, nouveauté, le nom d'un lieu d'exercice en cours : « clinique du cap » trouve ceux qui y exercent.
- **CA2 — périmètre** : les résultats ne contiennent que des fiches du pays actif et du périmètre de l'utilisateur :
  - administrateur pays, responsable pays et siège : tout le pays ;
  - délégué, superviseur, DM et DF (architecture §11.2) : les secteurs de leurs postes (par la fiche ou par un lieu d'exercice), leurs listes cibles et les fiches qu'ils ont créées.

  La synthèse suit le même périmètre. Un prospect hors secteur restant planifiable (RG-024), la portée « tout le pays » se demande explicitement (`portee=pays`) [H]. La fiche commune reste consultable par son lien.
- **Filtres** : type, spécialité, potentiel, activité, secteur et localité (par la fiche ou par un lieu d'exercice en cours), délégué (liste cible de son poste), sans lieu d'exercice, statut.
- **Tri** : nom, potentiel, spécialité, secteur, plus récents.
- **CA3 — pagination** : 20 résultats par page par défaut, 100 au plus. La réponse donne `total`, `page` et `taille` ; le champ `limite` disparaît.
- **Établissements** : même pagination et même périmètre ; filtres par localité et activité ; tri par nom, type, secteur, plus récents.

### Portail et mobile

- **Page Prospects** :
  - barre de recherche en carte : recherche, statut, tri, et bouton « Filtres » avec le nombre de filtres actifs ;
  - panneau de filtres repliable en grille : type, spécialité (selon le type), potentiel, activité, secteur, localité (selon le secteur), délégué, sans lieu d'exercice, tout le pays ;
  - filtres actifs en puces retirables, avec « Tout effacer » ;
  - filtres gardés dans l'adresse de la page : un lien rouvre la même recherche, un changement de filtre ramène à la page 1 ;
  - « 21–40 sur 425 » et numéros de page en haut et en bas ; la liste s'estompe pendant le chargement de la page suivante.
- **Page Établissements** : tri, pagination ; la carte affiche jusqu'à 100 établissements.
- **Mobile** : pages de 20 et bouton « Voir plus ».

## [0.1.6] — Listes cibles et fréquences ; design enrichi

Sixième jalon du cycle 0.1 « Référentiel ».

### Ajouté — listes cibles par poste (PRP-011, RG-043, RG-024)

- **Cible** : prospect de la liste d'un poste, avec sa **fréquence cible** en visites par cycle. Le cycle dure 4 semaines au Sénégal (paramètre `cycle_visite_semaines`). La cible est datée (début, fin exclue) ; un retrait la garde dans l'historique du poste.
- **Fréquence par défaut selon le potentiel** : nouveaux paramètres pays `frequence_cible_a`, `frequence_cible_b` et `frequence_cible_c`, valant 2, 1 et 1 [H]. L'export BirdNotes ne donne pas de fréquences : ses « poids » de potentiel (10, 8, 6) n'en sont pas.
- **Qui tient la liste** (RG-043, nouveaux droits `cibles.lire` et `cibles.gerer`) :
  - l'administrateur pays, pour tous les postes du pays ;
  - le superviseur, pour les postes qui lui sont rattachés ;
  - la lecture suit la visibilité des postes : DF et DM pour leurs réseaux, le délégué pour son poste.
- **CA1** : chaque ajout, retrait (avec motif) et changement de fréquence est audité.
- **Affectation territoriale** : le CRM propose les prospects actifs des secteurs du poste, repérés par leur fiche ou par un lieu d'exercice en cours, potentiel A d'abord. Une recherche dans tout le pays reste possible ; un prospect hors secteur est alors ciblable mais signalé (RG-024).
- **Charge du poste** : taille de la liste, répartition A/B/C, visites attendues par cycle et par jour ouvré, comparées aux seuils de visites par jour du type de poste (RG-016).
- Un prospect archivé sort de toutes les listes.
- La table est protégée par la sécurité au niveau des lignes ; les routes sont couvertes par la matrice et les tests d'isolation.
- API : `ciblage/postes/`, `ciblage/postes/<id>/` (liste, ajout), `…/candidats/`, `ciblage/cibles/<id>/` (fréquence), `…/retirer/`, `ciblage/moi/`.

### Ajouté — liste cible hors connexion (PRP-011 CA2)

- **Base locale chiffrée du téléphone** (architecture-essentials §5) : SQLite chiffrée par SQLCipher (`expo-sqlite`). La clé de 256 bits est tirée au hasard et gardée dans le Keychain ou le Keystore.
- La liste cible du délégué y est enregistrée à chaque consultation. Sans réseau, il retrouve la dernière liste enregistrée, avec sa date.
- La base est vidée à la déconnexion.
- La synchronisation complète (OFF-001, 0.8) reprendra cette base.

### Portail et mobile

- **Page Listes cibles** (menu Activité) :
  - postes à gauche, avec occupant (ou « poste vacant »), nombre de prospects et barre de répartition A/B/C ;
  - poste choisi à droite, avec ses secteurs et quatre tuiles : prospects ciblés, visites par cycle, visites par jour ouvré face aux seuils du poste, prospects hors secteur ;
  - liste colorée par potentiel ; fréquence réglable par « − » et « + » ; retrait avec motif ; filtre A/B/C ;
  - ajout en lot : candidats du secteur, recherche, filtre de potentiel, « tout sélectionner » ;
  - alerte quand la liste demande plus de visites par jour que le maximum du type de poste.
- **Mobile** : l'onglet Prospects s'ouvre sur « Ma liste » (prospects, fréquences, lieu principal, recherche locale), disponible hors connexion.

### Démonstration

- Chaque poste occupé a une liste cible : jusqu'à 60 prospects de ses secteurs, potentiel A d'abord, avec quelques fréquences relevées. Les postes vacants restent sans liste.

### Reste à faire

- Reprendre les listes cibles de BirdNotes (onglet « Affectation prospects », 11 349 lignes délégué ↔ prospect). Il faut d'abord relier chaque délégué BirdNotes à un poste, ce que permettra l'import du fichier d'organisation (ORG-014, 0.1.8).

## [0.1.5] — Lieux d'exercice des prospects ; design enrichi

Cinquième jalon du cycle 0.1 « Référentiel ».

### Ajouté — exercices datés prospect ↔ établissement (PRP-004, prd.md §14.3)

- **Exercice** : lien daté entre un prospect et un établissement (début, fin facultative, lieu principal, jours et horaires de présence en clair [H]). Il est actif le jour `j` si `début <= j < fin` : la fin est exclue, comme pour les liens de l'organisation.
- **CA1** : un prospect peut exercer dans plusieurs établissements à la fois. Le premier exercice devient le lieu principal ; en désigner un autre retire ce rôle au précédent. Il ne peut y avoir qu'un exercice en cours par couple prospect-établissement.
- **CA2** : `exercice_actif(prospect, établissement, jour)` dit si un couple est lié à une date. C'est le contrôle que les visites appliqueront (RG-015, 0.4).
- Un exercice relie deux fiches **en service** du même pays. Archiver un prospect ou un établissement termine ses exercices en cours. Un exercice terminé reste dans l'historique.
- **Qui gère les exercices** : ceux qui peuvent modifier la fiche, c'est-à-dire l'administrateur pays, ou le délégué tant que sa fiche est à valider. Sur une fiche commune, le délégué proposera un nouvel exercice (PRP-014, 0.1.8).
- Création, modification et fin sont auditées. La table est protégée par la sécurité au niveau des lignes, et les routes sont couvertes par les tests d'isolation.
- API :
  - `prospects/<id>/exercices/` (liste, ajout) ;
  - `exercices/<id>/` (lieu principal, présence) ;
  - `exercices/<id>/terminer/` ;
  - `etablissements/<id>/exercices/`.
- La fiche prospect donne son **lieu principal**. La synthèse compte les fiches actives **sans lieu d'exercice** : c'est un indicateur de qualité des données.

### Import BirdNotes

- Chaque prospect repris exerce dans l'établissement nommé sur sa fiche BirdNotes, depuis la date de création de la fiche. Les compteurs indiquent les fiches sans établissement et les établissements non repris.
- Un réimport complète les fiches reprises en 0.1.4, une seule fois.

### Portail et mobile

- **Fiche prospect** : section « Lieux d'exercice » :
  - cartes par établissement, avec icône du type, lieu principal en évidence, date de début et présence ;
  - étoile pour changer de lieu principal ;
  - fin d'un exercice à une date choisie ;
  - historique repliable ;
  - ajout par recherche d'établissement.
- **Fiche établissement** : les prospects qui y exercent, avec leur spécialité, leur potentiel et le lieu principal marqué.
- **Liste des prospects** : spécialité et lieu principal sous chaque nom. Nouvelle tuile « Sans lieu d'exercice ».
- **Mobile** : le lieu principal s'affiche dans la liste des prospects.
- **Vocabulaire** : le champ hospitalier/privé s'appelle désormais « Activité », pour ne pas le confondre avec l'exercice.

### Démonstration

- Chaque prospect fictif exerce dans un établissement de son secteur adapté à son métier : l'officine en pharmacie, le paramédical en poste ou centre de santé, le médecin en cabinet, clinique ou hôpital. Un prospect sur quatre a un second lieu d'exercice.

## [0.1.4] — Import BirdNotes et modèle aligné sur le terrain ; design enrichi

Quatrième jalon du cycle 0.1 « Référentiel ». Le 4 octobre 2026, l'export réel du CRM en place au Sénégal (BirdNotes) a servi de point de départ « pour ne pas inventer » : les listes et paramètres suivent sa pratique, et l'import est avancé de 0.1.8 à 0.1.4. Le fichier, qui contient des données réelles, n'entre jamais dans le dépôt : seuls des libellés génériques et des proportions y figurent.

### Ajouté — import contrôlé depuis BirdNotes (PRP-013)

- **Module `imports`** : l'administrateur pays téléverse l'export JSON de BirdNotes tel quel (ou son archive ZIP). Le fichier est lu en mémoire et n'est pas conservé.
- **CA1 — simulation d'abord** : tout est calculé dans une transaction puis annulé. Seuls le bilan (compteurs par donnée) et les anomalies restent, dans un `LotImport`.
- **CA2 — rapport d'anomalies** : chaque ligne écartée ou corrigée a un motif, traduit. Le rapport se télécharge en CSV (séparateur « ; », lisible par Excel).
- **Ce qui est repris**, dans l'ordre des dépendances :
  - secteurs et localités : les secteurs nouveaux vont dans une zone « À répartir », les variantes d'orthographe sont fusionnées ;
  - gammes → divisions et réseaux, produits, portefeuilles : la gamme technique « Default » est ignorée et signalée ;
  - établissements : le type est déduit du nom (poste de santé, centre de santé, pharmacie…), sinon « Autre » à préciser ; l'activité H est reprise ; un établissement sans secteur prend celui de la majorité de ses prospects, signalé ; sans secteur ni prospect, il est écarté ;
  - prospects validés (`actif`) et demandes de création (`a_valider`) : le type est déduit de la spécialité, le potentiel est ramené à A/B/C (« BB » → B, « D » et « X » → C, signalé), le grade donne la civilité, les téléphones sont normalisés en E.164 (inexploitables signalés).
- **CA3** : les groupes de doublons signalés par BirdNotes sont gardés avec les fiches, pour la file des doublons (0.1.8). Les demandes de modification en attente sont comptées et reportées aux propositions de modification (0.1.8).
- **CA4 — réimport idempotent** : chaque fiche garde sa référence BirdNotes (`ReferenceExterne`). Un nouvel import la retrouve et ne crée rien. Les compléments utiles plus tard y sont conservés : établissement d'exercice, délégués affectés, position GPS.
- Commande `manage.py importer_birdnotes <fichier> --pays SN --auteur … [--simulation] [--rapport rapport.csv]`.
- API `imports/` (liste, détail, téléversement, rapport CSV) ; nouveau droit `imports.gerer` réservé à l'administrateur pays. Le lot est audité (`import.birdnotes`), la table est protégée par la sécurité au niveau des lignes, les routes sont couvertes par la matrice et les tests d'isolation.
- Les tests portent sur un export **entièrement fictif** qui reprend seulement la structure des tables.

### Ajouté — nettoyage des prospects (proposition du 4 octobre 2026, DC-46)

- **Règle d'écriture imposée à la saisie comme à l'import** : NOM en majuscules, Prénom avec sa majuscule (« NDIAYE », « Mame-Diarra »).
- **Titre sorti du nom** : « DR » saisi à la place du prénom (2 415 fiches) ou en tête du nom passe dans la civilité. Quand prénom et nom restent collés, la fiche est signalée « à séparer à la main ».
- **Localités « INTERMEDIARE »** (1 338 fiches) non reprises : le secteur est gardé, la localité reste à préciser.
- **Fiches au même nom** une fois le titre retiré : gardées ensemble (référence `homonymes`) pour la file des doublons (0.1.8), où le superviseur tranche. Rien n'est fusionné à l'import.
- Fusions de spécialités confirmées : sage-femme d'État → sage-femme, gynécologue → gynécologie-obstétrique, et les corrections d'orthographe.

### Modifié — modèle aligné sur la pratique réelle (prd.md §14.1, §14.2)

- **Types de prospect** : liste fermée médecin, paramédical, pharmacie, grossiste. Sage-femme et infirmier deviennent des spécialités paramédicales, l'officine une spécialité de la pharmacie. Les anciennes valeurs par défaut (pharmacien, sage-femme, infirmier, chirurgien-dentiste, autre) sont archivées : elles restent lisibles là où elles ont servi (PRP-001 CA2).
- **44 spécialités** rattachées à leur type ; nouvelle liste des **grades** (docteur, professeur, professeur agrégé, chef de service, assistant, résident), modifiable dans Référentiels.
- **Type d'établissement « poste de santé »**, premier type relevé sur le terrain.
- **Exercice hospitalier ou privé (H/P)** sur le prospect et l'établissement.
- **Référentiel des localités** par secteur (`Localite`, ORG-003) : la localité d'un établissement n'est plus un texte libre. Elle donne son secteur et doit lui appartenir. Le prospect peut porter un secteur et une localité.
- **Paramètres par défaut** :
  - distance de pointage : 100 m au lieu de 200 ;
  - visites sans GPS tolérées par journée : 3 au lieu de 0 [H] ;
  - nouveau paramètre « cycle de visite » : 4 semaines.
- **Un secteur se rattache à une autre zone** : c'est le sort des secteurs repris dans « À répartir ». Le déplacement est audité.

### Portail et mobile

- **Page Imports** (menu Administration) :
  - étapes « Choisir le fichier → Simuler et vérifier → Importer » ;
  - zone de dépôt par glisser-déposer ;
  - bilan en tuiles (prospects, établissements, produits, lignes écartées) et détail par donnée ;
  - anomalies **regroupées par motif**, rejets d'abord, et téléchargement du rapport CSV ;
  - confirmation chiffrée avant l'import réel ;
  - historique des lots, chacun consultable.
- **Fiches prospect** : grade, exercice H/P, secteur puis localité du secteur choisi. La liste affiche spécialité et localité.
- **Fiches établissement** : localité choisie parmi celles du secteur, exercice H/P.
- **Organisation** : un clic sur un secteur ouvre sa fiche, pour changer sa zone et gérer ses localités (ajout, archivage).
- **Mobile** : la localité d'un nouvel établissement se choisit parmi celles du secteur.

### Démonstration

- Générateur calibré sur les proportions relevées (agrégats seulement) :
  - spécialités : sage-femme 24,5 %, infirmier 24,4 %, officine 14,8 %, médecine générale 12,7 % ;
  - potentiels : A 42 %, B 46 %, C 12 % ;
  - exercice : privé 71 % ;
  - grades des médecins ;
  - postes de santé majoritaires parmi les établissements.
- Deux à quatre localités fictives par secteur.

### Feuille de route (prd.md §23)

- 0.1.4 : import BirdNotes et modèle aligné ;
- 0.1.5 : exercices datés (PRP-004) ;
- 0.1.6 : listes cibles (PRP-011) ;
- 0.1.7 : recherche et pagination (PRP-005) ;
- 0.1.8 : doublons, fusion, défusion, propositions et historique (PRP-007 à PRP-010, PRP-012, PRP-014), plus l'import du fichier d'organisation (ORG-014).

### Constats sur l'export réel (à confirmer)

- BirdNotes compte 24 délégués, alors que le fichier d'organisation en prévoit 207 : périmètre de la phase test, ou effectif réel ? (O-01).
- 367 établissements ont un type à préciser, et 576 établissements sans secteur ni prospect ne sont pas repris.
- Les comptes, postes et l'historique des visites ne sont pas repris : l'organisation viendra du fichier d'organisation (ORG-014).

## [0.1.3] — Fiches établissements, positions GPS et carte ; design enrichi

Troisième jalon du cycle 0.1 « Référentiel ».

### Ajouté — établissements (PRP-003)

- **Fiche du §14.2** : nom, type (référentiel du pays), secteur, adresse, localité, téléphone (E.164), coordonnées GPS de référence, statut et auteur.
- **CA1** : un établissement appartient toujours à un secteur actif du pays. On n'archive pas un secteur qui porte encore des établissements.
- **CA2** : les coordonnées sont facultatives, mais nécessaires au contrôle de distance des visites (0.4) :
  - les deux vont ensemble, dans des bornes valides ;
  - un établissement sans position est signalé (tuile, filtre « Sans GPS », alerte sur la fiche).
- **Création par le délégué** au statut `a_valider` (§14.6), visible de lui seul jusqu'à la validation de l'administrateur pays, comme un prospect. La validation, l'archivage avec motif et la modification suivent les mêmes règles et sont audités, y compris le changement de position.
- Recherche tolérante par nom, localité ou téléphone ; filtres par statut, type et secteur ; synthèse (actifs, à valider, sans GPS, secteurs couverts, répartition par type).
- Liste des secteurs accessible à la saisie : le délégué, qui ne lit pas l'organisation, peut choisir le secteur.
- Mêmes droits que les prospects (`prospects.*`, ligne « Créer un prospect ou un établissement » du §6.3) ; table protégée par la sécurité au niveau des lignes, recherche par index trigramme, routes couvertes par les tests d'isolation.

### Portail et mobile

- **Page Établissements** (menu Activité) :
  - icône par type et secteur en pastille ; indicateur de position (vert ou barré) ;
  - vue **Carte** OpenStreetMap des établissements positionnés ; un clic sur un point ouvre sa fiche ; la carte se charge à la demande ;
  - **fiche latérale** avec carte, coordonnées, lien OpenStreetMap ; bouton « Positionner » quand la position manque.
- **Saisie** :
  - secteurs groupés par zone ;
  - **« Utiliser ma position »**, avec la précision obtenue ;
  - aperçu sur la carte, et un clic sur la carte ajuste la position.
- **Mobile** : l'onglet Prospects s'ouvre sur deux segments, Prospects et Établissements. On peut créer un établissement **devant la porte**, avec la position du téléphone (autorisation demandée à l'usage).

### Démonstration

- Établissements fictifs dans chaque secteur : cabinets, pharmacies, cliniques, un hôpital par zone. Positions tirées autour des zones, une sur cinq absente. Trois sont à valider.

### Hypothèses

- [H] La localité est un texte libre en attendant un référentiel des localités (architecture §13.2) — remplacé en 0.1.4.

### Reste à livrer

- Exercices datés prospect ↔ établissement : 0.1.4.

## [0.1.2] — Fiches prospects et création par le délégué ; design enrichi

Deuxième jalon du cycle 0.1 « Référentiel ».

### Ajouté — fiches prospects (PRP-002)

- **Module `prospects`** (architecture §7.1), fiche du §14.1 :
  - identité : civilité, nom, prénom ;
  - classement : type, spécialité, potentiel A/B/C ;
  - coordonnées : numéro d'ordre professionnel, téléphones mobile et professionnel, courriel ;
  - statut et auteur.
- **CA1** : une fiche sans nom ni type est refusée ; la spécialité suit le type. Elle est obligatoire quand le pays a défini des spécialités pour ce type (médecin), et refusée si elle ne s'y applique pas.
- **Normalisation**, base de la détection de doublons (0.1.7) :
  - nom sans accents ni titre (« Dr Aïssatou N'Diaye » → « aissatou ndiaye ») ;
  - téléphones au format international E.164, un numéro local étant lu dans le pays de la fiche ;
  - numéro d'ordre unique dans le pays.
- **Fiche commune** à tous les réseaux du pays (§14.4) ; **CA2** : la fiche affiche son potentiel. Ses établissements arrivent en 0.1.3 et les visites autorisées en 0.4.
- **Recherche tolérante** aux accents, à la casse et aux titres (« dr ndiaye »), par téléphone ou numéro d'ordre. Filtres par statut, type et potentiel ; synthèse (fiches actives, à valider, répartition A/B/C). La pagination complète arrive en 0.1.6 ; d'ici là, 100 résultats au plus.
- Toute création, modification (ancienne et nouvelle valeur), validation et tout archivage sont **audités**. La consultation nominative d'une fiche par le siège l'est aussi (AUD-001).
- Rien ne se supprime : une fiche s'archive, avec un motif.

### Ajouté — création par le délégué (PRP-006, RG-041)

- Une fiche créée par un délégué est **`a_valider`** ; il peut la consulter et la corriger aussitôt (CA2 : la planification arrive en 0.2).
- **CA1** : elle reste invisible des autres délégués, en liste comme par son identifiant, jusqu'à devenir `actif`.
- L'administrateur pays la **valide** ; elle devient alors commune et seul l'administrateur la modifie. Les propositions de modification arrivent en 0.1.7, et le détecteur de doublons fera cette validation automatiquement.
- Créée par l'administrateur pays, une fiche est aussitôt active.
- **Droits** :
  - `prospects.lire` : tous les rôles métier du pays ;
  - `prospects.creer` : administrateur pays et délégué. Le superviseur « selon délégation » [H] n'est pas encore ouvert, et le siège n'a pas de prospects (RG-002) ;
  - `prospects.gerer` (valider, modifier toute fiche, archiver) : administrateur pays.
- Table protégée par la sécurité au niveau des lignes ; routes couvertes par les tests d'isolation et la matrice.
- Une valeur du référentiel portée par une fiche compte comme utilisée (PRP-001 CA2).

### Portail et mobile

- **Page Prospects** :
  - tuiles : fiches actives avec leur répartition A/B/C, à valider, potentiel A ;
  - recherche instantanée et filtres ;
  - lignes colorées par potentiel ;
  - **fiche latérale** : identité, coordonnées cliquables, statut, actions Valider, Modifier, Archiver ; emplacements des établissements et des visites ;
  - **saisie guidée** : spécialités filtrées par type, potentiel en un clic, aide sur la validation pour le délégué.
- **Mobile — onglet Prospects** (n'est plus « bientôt ») : recherche dans les fiches communes, badge « À valider », création en quelques gestes (type, spécialité et potentiel en pastilles).

### Démonstration

- 1 200 fiches prospects fictives au Sénégal, dont 6 à valider créées par un délégué. Noms tirés des listes, sans téléphone ni courriel (DEM-001 CA2).
- Liste triée par nom de famille.

## [0.1.1] — Référentiels du pays et portefeuilles de produits ; design enrichi

Premier jalon du cycle 0.1 « Référentiel ».

### Ajouté — référentiels (PRP-001)

- **Module `referentiel`** (architecture §7.1) : listes de valeurs par pays (types de prospect, spécialités, types d'établissement, classes thérapeutiques, motifs d'écart) et produits.
- **Valeurs proposées à l'ouverture d'un pays**, dans sa langue :
  - types de prospect et d'établissement du PRD (§14.1, §14.2) ;
  - 15 spécialités médicales et 8 motifs d'écart [H], à confirmer par pays.

  Les pays déjà ouverts les reçoivent par migration.
- **Modifiables par l'administrateur pays** (CA1) : ajouter, renommer ; une spécialité peut dépendre d'un type de prospect. Le code reste stable quand le libellé change (imports, échanges).
- **Rien ne se supprime** (CA2) : une valeur s'archive. Elle n'est plus proposée mais reste lisible là où elle a servi, et peut être réactivée. On n'archive pas une classe qui porte encore des produits actifs. Le nombre d'utilisations est affiché.
- Créations, modifications, archivages et réactivations sont **audités** (AUD-001).

### Ajouté — produits et portefeuilles (ORG-004)

- **Produits** propres à chaque pays : nom, code, classe thérapeutique.
- **Portefeuille daté** réseau ↔ produit :
  - un produit peut appartenir à plusieurs réseaux (CA2) ;
  - le portefeuille se gère par réseau ou par produit ;
  - un ajout ou un retrait prend effet aujourd'hui, sans changer le passé ;
  - chaque ajout et retrait est audité.
- **Mon portefeuille** (`/api/v1/referentiel/mon-portefeuille/`) : les produits des réseaux des postes de l'utilisateur, et de son périmètre pour DF et DM. Le rapport de visite (0.5) ne proposera que ceux-là (CA3, RG-033).
- Un réseau appartient toujours à une division (CA1, déjà en 0.0.5, désormais testé).
- **Droits** : `referentiels.gerer` (siège, administrateur pays), `referentiels.lire` (tous les rôles métier du pays) ; tables protégées par la sécurité au niveau des lignes (ADR-003) ; nouvelles routes couvertes par les tests d'isolation.

### Portail et mobile

- **Page Référentiels**, en trois onglets :
  - **Produits** : recherche insensible aux accents, filtres par classe et par réseau, couleur par classe thérapeutique, réseaux de chaque produit, produits hors portefeuille signalés, archivés sur demande ;
  - **Portefeuilles** : une carte par réseau, regroupées par division, avec une jauge (6 à 25 produits conseillés) et un dialogue de sélection par classe ;
  - **Listes de valeurs** : les cinq listes, ajout direct, renommage, archivage et réactivation.
- Tuiles : produits actifs, classes, réseaux pourvus, produits sur plusieurs réseaux.
- **Mobile — Mes produits** sur l'accueil : le portefeuille de ses réseaux, avec aperçu et dépliage.

### Démonstration

- 15 classes thérapeutiques et environ 156 produits fictifs au Sénégal. Chaque réseau porte un portefeuille de 6 à 25 produits, et un produit sur deux environ est sur plusieurs réseaux.

### Reste à livrer

- Fiches prospects et établissements qui utiliseront ces listes : 0.1.2 et 0.1.3.
- Import du référentiel produits depuis BirdNotes : 0.1.8.
- Proposition des seuls produits du portefeuille dans le rapport (ORG-004 CA3, partie rapport) : 0.5.

## [0.0.9] — Stabilisation et démonstration du cycle 0.0 ; design enrichi

Neuvième et dernier jalon du cycle 0.0 « Fondations ».

### Recette du cycle

- **Matrice de recette** [`recette-0.0.md`](recette-0.0.md) : chaque critère d'acceptation des 23 exigences du cycle est relié au test qui le prouve, avec son statut (couvert, partiel faute de la fonction d'un cycle suivant, reporté).
- **Trous comblés** :
  - audit des affectations, retraits et transferts (ORG-009 CA3) ;
  - audit de la réinitialisation par l'administrateur (USR-005 CA2) ;
  - matrice rôle × action complète : 9 rôles × 14 actions (USR-002 CA1) ;
  - double authentification vérifiée pour chacun des 6 rôles sensibles du PRD (SEC-003 CA1) ;
  - auteur et dates de l'historique des désignations (ORG-002 CA2) ;
  - création puis lecture d'un pays par l'API (ORG-001 CA1 et CA3) ;
  - HTTPS imposé en production et analyse de secrets de la CI (SEC-007) ;
  - comptes, mots de passe, appareils, sessions et verrouillage audités (AUD-001 CA1).
- **Traçabilité automatique** : un test échoue si une exigence livrée (version ≤ `VERSION`) n'est citée par aucun test.

### Stabilisation

- **Aucun texte codé en dur** (USR-004 CA2) : une règle ESLint bloque tout texte affiché ou libellé écrit en dur dans le portail et le mobile ; un test vérifie que chaque clé `t('…')` utilisée existe dans le catalogue.
- **Accessibilité** : analyse automatique axe-core (WCAG 2.1 A et AA) de la connexion, de l'accueil, d'Équipe, de Mon profil et d'Organisation.
- **Chargement plus léger du portail** : les pages d'administration et le générateur de QR code se chargent à la demande ; le paquet initial passe sous le seuil d'alerte.
- **Étiquette de version** : à la fusion sur `main`, la CI pose l'étiquette `vX.Y.Z` de la version (prd.md §23).

### Démonstration (DEM-001)

- **Bandeau « Démonstration — données fictives »** sur chaque écran du portail et pastille sur le mobile, quand le serveur tourne en `ENVIRONNEMENT=demonstration` : une capture d'écran ne peut pas passer pour la production.
- **Scénario de démonstration de fin de cycle** : [`demonstration-0.0.md`](demonstration-0.0.md) (déroulé par rôle, exigences montrées).
- `reinitialiser_demo` signale les comptes qui devront activer la double authentification.

### Design

- **Apparence** : clair, sombre ou réglage du système, depuis Mon profil ou d'un clic dans la barre supérieure ; le choix est mémorisé sur le navigateur.
- **Avancement du produit** : frise des dix cycles et des neuf versions du cycle en cours ; « Cycle 0.0 terminé », prochain cycle annoncé.
- Chargement des pages : squelettes à la place d'un écran vide.

## [0.0.8] — Double authentification, sessions, journal d'audit immuable ; design enrichi

Huitième jalon du cycle 0.0 « Fondations ».

### Ajouté — double authentification (SEC-003)

- **Code à usage unique** par application d'authentification (Google Authenticator, Microsoft Authenticator…) : la connexion se fait en deux étapes ; après le mot de passe, le serveur répond `202` avec un jeton d'étape signé, valable 5 minutes, puis `POST /api/v1/auth/connexion/code/` ouvre la session. Un code déjà utilisé est refusé (rejeu) ; les échecs comptent dans le verrouillage du compte.
- **Obligatoire** pour `admin_siege`, `direction_siege`, `responsable_pays`, `admin_pays`, `df`, `dm` (CA1) : tant qu'elle n'est pas activée, toute route métier répond `403 double_authentification_requise` ; le portail n'affiche que l'assistant d'activation. Facultative pour les autres rôles.
- **Assistant d'activation** (portail) en quatre étapes : installer une application, scanner le QR code (ou saisir la clé), confirmer avec un premier code, noter les **10 codes de secours** (copier, télécharger ; chacun ne sert qu'une fois, conservé seulement sous forme d'empreinte).
- Le secret est **chiffré** en base (Fernet, clé `INNOV_CLE_CHIFFREMENT`, à défaut dérivée de `DJANGO_SECRET_KEY`).
- Mobile : étape du code (ou d'un code de secours) à la connexion ; un rôle qui doit encore l'activer est renvoyé vers le portail, sans session ouverte.
- Équipe : « Réinitialiser la double authentification » d'un compte (téléphone perdu) ; ses sessions sont fermées.

### Ajouté — sessions (SEC-004)

- **Mon profil → Sessions ouvertes** : portail ou mobile, appareil, adresse masquée, dernière activité ; fermer une session ou toutes les autres. Une session fermée échoue à l'appel suivant (CA1).
- Équipe : « Fermer ses sessions » pour un compte.
- **Verrouillage local du mobile** : après 5 minutes en arrière-plan, l'application demande la biométrie ou le code du téléphone ; un téléphone sans aucune protection doit se reconnecter.
- Portail : la session expire toujours après 30 minutes d'inactivité (0.0.3).

### Ajouté — journal d'audit (AUD-001)

- **Table `audit_evenementaudit`** : connexions et échecs (dont verrouillage, appareil révoqué, code invalide, rejeu de jeton), déconnexions, mots de passe, comptes, rôles, affectations, transferts, révocations d'appareil et de session, double authentification, organisation (création, renommage, archivage, occupations, rattachements), pays (création, statut) et paramètres (ancienne et nouvelle valeur).
- Chaque événement porte auteur, rôles, pays, action, objet, date, contexte (client, appareil, session, adresse IP, navigateur, référence de requête) et résultat (CA1) ; jamais de mot de passe, jeton, secret ni code.
- **Immuable** (CA2) : un déclencheur PostgreSQL refuse toute modification, suppression ou troncature, quel que soit le rôle applicatif ; l'application elle-même refuse `save` d'un événement existant et `delete`.
- Écrit dans la **même transaction** que l'action : une action annulée ne laisse pas d'événement, un échec de connexion en laisse un.
- **Mon profil → Activité récente** : les 20 derniers événements de sécurité du compte, pour repérer une connexion inconnue.
- Page Exploitation : carte « Journal d'audit » (déclencheurs d'immuabilité actifs).

### Design

- Connexion : étape du code avec grand champ à chiffres espacés, bascule code de secours.
- Mon profil : centre de sécurité (double authentification, sessions, frise d'activité).
- Mobile : écran de verrouillage aux couleurs de la marque.

### Écarts assumés

- **Chaînage** des événements par empreinte (architecture §16.1) : `0.9.2`, comme prévu. **Partitionnement mensuel** : quand les volumes le justifieront (§13).
- Le droit `INSERT`/`SELECT` seul pour le rôle de production sur la table d'audit est une consigne de mise en ligne (README) ; le déclencheur protège déjà contre toute modification.

## [0.0.7] — Erreurs, journaux, suivi, isolation renforcée ; design enrichi

Septième jalon du cycle 0.0 « Fondations ».

### Ajouté — gestion des erreurs

- **Référence de requête** : chaque réponse porte un en-tête `X-Request-Id`, repris dans toute erreur (`reference`) ; l'utilisateur peut la donner au support, qui la retrouve dans les journaux et le suivi.
- **Erreur inattendue** : réponse JSON sobre (`erreur_interne`, message traduit avec la référence), jamais de trace technique ; un chemin inconnu de l'API répond aussi en JSON (`introuvable`).
- **Portail** : écran « Quelque chose s'est mal passé » (référence, recharger, retour à l'accueil) — une page qui plante n'emporte plus le cadre ni la navigation ; page 404 ; erreurs de chargement avec message, référence et bouton « Réessayer » ; notification « Modification enregistrée. » après chaque enregistrement ; bannière quand le réseau tombe et message quand il revient.
- **Mobile** : écran d'erreur avec référence et « Réessayer », sans fermeture de l'application.

### Ajouté — journaux et suivi des erreurs (architecture §16.3, §19)

- **Journaux techniques JSON** : une ligne par requête (méthode, chemin, statut, durée, référence, pays) ; l'utilisateur n'apparaît que sous un pseudonyme (empreinte HMAC), jamais son nom ni son identifiant. `JOURNAUX_LISIBLES=1` donne du texte en local.
- **Signalement des plantages** du portail et du mobile au serveur (`POST /api/v1/erreurs-clients/`, limité en débit, sans donnée saisie ni paramètre d'adresse).
- **Sentry, prêt mais désactivé** : il s'active seulement si l'hébergeur fournit `SENTRY_DSN` ; rien de personnel n'est envoyé (en-têtes d'authentification, cookies et corps retirés).
- **Page Exploitation** (administrateur technique et siège) : état de la base (temps de réponse, migrations en attente), isolation des pays (tables protégées, rôle de base conforme), suivi des erreurs, vérification des fuites de mots de passe, format des journaux ; synthèse « Tout est opérationnel » ou « N points d'attention ». [H] action `exploitation.lire`, technique, sans donnée métier.

### Ajouté — isolation

- **Premiers tests d'isolation systématiques** : un administrateur du Togo essaie chaque route qui désigne un objet, avec des identifiants du Sénégal, et chaque liste ; une nouvelle route sans cas de test fait échouer la suite.

### Ajouté — sécurité (décisions du 4 octobre 2026)

- **Sécurité au niveau des lignes PostgreSQL** (ADR-003, architecture §12, couche 2) : chaque table rattachée à un pays (organisation, paramètres, journal des changements) n'accepte, pendant une requête métier, que les lignes du pays actif — en lecture comme en écriture, même si un filtre applicatif manquait. Le siège reste autorisé sur tous les pays ; un utilisateur sans rôle ne voit rien. Les tests s'exécutent sous un rôle PostgreSQL ordinaire ; un test échoue si une nouvelle table de pays n'est pas protégée ; `check --deploy` signale un rôle de base qui contournerait ces règles.
- **Mots de passe compromettants refusés** (SEC-001) : un mot de passe ne peut plus contenir un mot de la liste `mots_compromettants.txt` (nom de l'entreprise, mots du métier, pays et villes des filiales, mots de passe courants), même déguisé (« D@k4r », « P4ssw0rd ») ; message : « Ce mot de passe peut être compromettant : il contient « dakar » ». Hors développement, un mot de passe paru dans des fuites publiques est aussi refusé (Have I Been Pwned, k-anonymat : seuls 5 caractères de son empreinte quittent le serveur) ; si ce service ne répond pas, la vérification n'empêche pas l'utilisateur d'avancer.

### Sécurité du dépôt

- Historique de la branche réécrit : les anciens mots de passe de test et l'adresse de base de données avec mot de passe de la CI, signalés par GitGuardian, n'existent plus dans aucun commit.

### Décidé

- Surveillance de disponibilité : **UptimeRobot**, sur `/api/health/` (API) et la page d'accueil du portail.

### Corrigé

- `/api/v1/pays/<code>/designations/` répondait 200 (liste vide) pour un pays hors périmètre au lieu de 404 : trouvé par la nouvelle suite d'isolation.

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

# Direction visuelle d'INNOV CRM

Référence de design du portail et de l'application mobile, établie en 0.1.8. Chaque version
la respecte, et chaque nouvel écran est relu avec la grille de la section 5.

## 1. Diagnostic de 0.1.7 (captures à 360, 414, 834 et 1 440 px, et application mobile)

| Écran | Défaut observé | Effet |
|---|---|---|
| Tout le portail | Titre répété : barre du haut (« Prospects ») puis titre de page de 28 px et phrase de sous-titre | ~150 px perdus avant le contenu ; lecture redondante |
| Tout le portail | Bandeau « Démonstration » orange hachuré de 32 px au-dessus de tout | Le premier élément vu est un avertissement criard |
| Tout le portail | Quatre « tuiles » par page : pastille d'icône colorée + chiffre de 26 px gras | Décoration, ~120 px ; 2 × 2 sur mobile : tout le premier écran |
| Tout le portail | Cartes à ombre et arrondi de 10 px partout, y compris autour d'une seule liste | Interface générique ; contours qui s'empilent |
| Tout le portail | Pastilles d'icône dans chaque en-tête de carte (« Coordonnées », « Lieux d'exercice »…) | Icônes décoratives, sans fonction |
| Accueil | Bannière marine à dégradé et halos | Effet décoratif ; 200 px |
| Navigation | Entrées futures avec puce de version (« 0.4.1 ») | Bruit permanent pour un contenu inexistant |
| Organisation, Référentiels, Listes cibles | Secteurs, réseaux, classes en pastilles colorées dans les tableaux | Chaque ligne crie ; la couleur ne porte plus de sens |
| Prospects (360 px) | Statut en boutons accolés : « À valider » coupé sur deux lignes ; pagination dont la flèche passe à la ligne | Contrôles cassés |
| Listes cibles (≤ 834 px) | Les 45 postes s'empilent au-dessus du détail | Le contenu utile est à 6 000 px |
| Profil (360 et 414 px) | Débordement horizontal (courriel, double authentification) | Page qui glisse latéralement |
| Accueil (360 px) | Débordement horizontal | Idem |
| États vides | Pastille d'icône de 56 px et texte centré | Disproportionné |
| Mobile | En-tête marine de 180 à 360 px à coins arrondis, pastille « Démonstration », barre de version « v0.0.6 Fondations » périmée | Un tiers de l'écran avant le contenu |
| Mobile | Cartes « Mon poste », « Mes produits » à icône et liseré orange ; libellés en capitales espacées | Hiérarchie confuse, ton générique |
| Mobile | Champ de recherche sans indication, pilules d'onglets de 44 px très arrondies | Rendu d'assemblage de composants |
| Typographie | Titres en Plus Jakarta Sans 800, chiffres en 26 px, libellés de tuile longs | Poids visuel disproportionné |

## 2. Direction : « registre »

INNOV CRM est un outil de travail quotidien : un registre de visites, de fiches et d'équipes.
L'identité tient à la **précision typographique** et à **deux couleurs de marque utilisées
avec retenue**, non à la décoration.

- **Encre marine** (`#1B2A5B`) : structure, navigation, texte d'accent, actions principales.
- **Orange INNOV** (`#F26B1D`) : un seul usage, *là où vous êtes et ce qui compte* — repère
  de l'élément de navigation actif, potentiel A, chiffre à traiter. Jamais en fond de grande
  surface.
- **Papier** : fond `#F5F6F8`, surfaces blanches, filets `#E2E5EB`. Pas d'ombre portée ; un
  filet sépare, une surface regroupe.
- **Le potentiel A/B/C** est la seule « couleur métier » des listes : A orange, B marine,
  C gris.

### Typographie

| Usage | Police | Taille / interligne | Graisse |
|---|---|---|---|
| Titre de page | Plus Jakarta Sans | 20 / 28 | 700 |
| Titre de section | Plus Jakarta Sans | 15 / 22 | 700 |
| Texte | DM Sans | 14 / 20 | 400 |
| Libellé, métadonnée | DM Sans | 12.5 / 18 | 500 |
| Chiffre clé | Plus Jakarta Sans, chiffres tabulaires | 20 / 24 | 700 |

Pas de capitales espacées hors des en-têtes de colonnes de tableau.

### Espace et forme

- Grille de 4 px ; marges de page 24 px (ordinateur), 16 px (mobile).
- Arrondis : 6 px (boutons, champs, surfaces), 4 px (puces). Pas de pilule, sauf l'avatar.
- Densité : ligne de liste de 48 px sur ordinateur, 56 px sur mobile (zone tactile ≥ 44 px).

### Composants

- **En-tête de page** : titre de 20 px et actions sur une ligne ; contexte (pays) en texte
  discret à côté, pas de phrase descriptive. Pas de titre dans la barre du haut.
- **Barre de chiffres** : une seule surface, chiffres alignés et séparés par des filets, sans
  icône ; un chiffre « à traiter » prend l'orange.
- **Section** : titre de section + contenu sur la surface ; pas d'icône d'en-tête.
- **Listes** : lignes séparées par un filet, sans carte par ligne ; les attributs secondaires
  en texte gris séparé par « · », jamais en pastilles.
- **Icônes** : réservées à la navigation, aux actions sans libellé (avec info-bulle et nom
  accessible) et aux états (succès, erreur). Aucune icône à côté d'un titre.
- **États** : vide = une phrase et, si utile, une action ; chargement = squelette à la forme du
  contenu ; erreur = message, référence, « Réessayer » ; succès = notification brève.
- **Démonstration** : un filet de 3 px orange en haut d'écran et la mention dans la barre,
  discrète mais permanente.

## 3. Portail

- Barre latérale marine de 224 px : marque, pays, navigation ; les rubriques à venir sont
  regroupées sous « À venir », sans numéro de version.
- Barre du haut de 48 px : pays, langue, thème, compte.
- Contenu limité à 1 280 px de large.

## 4. Mobile

Depuis 1.4.0, la maquette « CRM GHPL – Écrans mobile et tablette » fait foi (prd.md §14.82) ; ses jetons sont dans `mobile/src/theme.ts`.

- Téléphone : la marque « CRM » et le logo GH en tête, puis le titre (20/28) et son contexte ; action à droite (bouton de 44 px) ; aucune bannière.
- Onglets du bas à 5 entrées, libellés courts, zone de 56 px, repère orange de 3 px au-dessus de l'onglet actif.
- Tablette (à partir de 900 px) : barre latérale marine de 92 px, en-tête de 68 px, liste à gauche (430 px) et détail à droite.
- Listes pleine largeur, séparées par des filets ; boutons de 48 px de haut ; statuts en pastille et texte, jamais la couleur seule ; potentiel A/B/C en carré plein (orange, marine, gris).
- Choix multiple (1.4.6) : case de 22 px à coins de 4 px, pleine (couleur d'accent, coche blanche) quand cochée ; la ligne entière se touche. L'action qui en découle dit le compte et le jour (« Poser 2 visites le mardi 13 »).
- Proposition de correction (1.4.7) : un champ modifié prend un contour de 2 px couleur d'accent ; sur la tablette, ce qui change se lit à droite, l'ancienne valeur barrée en gris au-dessus de la nouvelle en gras.
- Chiffres (1.4.8) : grand nombre en Plus Jakarta Sans 800 de 34 px ; barre de taux de 6 px (marine, piste couleur de ligne) ; barres des jours sans axe, le prévu en gris et le fait en orange posé dessus ; variation « ● +3 pts » en vert si elle monte, en gris sinon.
- Notifications (1.4.9) : pastille de 10 px cerclée de 2 px, pleine tant que la notification n'est pas lue, sur une ligne au fond teinté (surface 2) et au texte en demi-gras ; lue, la pastille est vide et le texte normal. Interrupteur de 44 × 26 px, marine allumé, couleur de ligne éteint, bouton blanc de 20 px.
- Établissement (1.4.5) : nom en grand (21 px, 28 sur la tablette), position de référence en statut, deux actions égales ; formulaire : choix en listes déroulantes (.inp à chevron), position dans une carte (téléphone) ou un volet de 400 px (tablette).
- Prospects (1.4.4) : recherche à loupe (.inp), filtres en pastilles défilantes (carré du potentiel devant), lignes de 64 px (carré, nom, spécialité · lieu, cycle « 2 / 3 » à droite) ; tablette : tableau à en-têtes en capitales. Fiche : initiales dans un rond marine (56 px, 76 sur la tablette), trois actions égales à contour.
- Semaine (1.4.3) : navigation en segments, jours en pastilles (jour choisi en marine, filet orange) sur le téléphone, en colonnes sur la tablette (jour choisi encadré d'une barre orange) ; itinéraire en ronds marine numérotés de 28 px, distance entre deux arrêts sur un filet pointillé ; version choisie marquée d'un filet orange à gauche.
- Formulaire (1.4.2) : titres de champ en `.sec-t`, aide en `.lib` sous le titre ; choix unique court en segments (`.seg`, 44 px) ; une partie à revoir a un filet rouge doublé.
- Actions d'un écran de détail (1.4.1) : collées en bas du téléphone, l'action principale deux fois plus large que la secondaire ; en ligne sous l'objet sur la tablette, l'action principale d'abord (240 px au moins). Un choix obligatoire se fait par des ronds à cocher de 20 px (liste sur le téléphone, deux colonnes en fenêtre sur la tablette).

## 5. Grille de revue (obligatoire à chaque version)

Chaque écran modifié est inspecté à 360, 414, 834 et 1 440 px (et sur l'application mobile)
avant et après défilement, puis noté :

1. **Hiérarchie** — le contenu essentiel et l'action principale se voient d'emblée.
2. **Composition** — proportions, densité, espaces équilibrés.
3. **Typographie** — tailles, graisses, longueurs de ligne lisibles.
4. **Cohérence** — composants semblables, mêmes règles.
5. **Identité** — choix intentionnels, pas d'apparence de modèle.
6. **Adaptation** — ni débordement, ni chevauchement, ni texte coupé.
7. **Utilisabilité** — contrastes, zones tactiles, focus, retours d'interaction.

Les défauts relevés (écran, problème, impact, correction) et leur résolution sont consignés
dans le journal des versions.

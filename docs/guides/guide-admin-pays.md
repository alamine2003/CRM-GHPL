# Guide de l'administrateur pays — portail web INNOV CRM

Version 0.9.7 (kit du pilote). Ce guide décrit le portail tel qu'il est livré. Les exemples utilisent des noms inventés (« Awa Fictive », « Dr Moussa Exemple », « Cabinet Imaginaire ») : aucune donnée réelle.

## À qui s'adresse ce guide

Ce guide s'adresse à l'administrateur pays, qui tient sur le portail web l'organisation, les comptes, les référentiels, les fiches prospects et les paramètres de son pays.

L'administrateur pays administre : il ne pilote pas l'activité et ne lit pas les rapports de visite nominatifs. Ces tâches reviennent à l'encadrement (superviseur, DM, DF, responsable pays).

## Se connecter

### Première connexion

1. L'administrateur du siège crée votre compte et vous désigne administrateur pays. Vous recevez par courriel un lien pour choisir votre mot de passe, valable 30 minutes.
2. Ouvrez l'adresse du portail, choisissez la langue, tapez votre « Identifiant » (format prenom.nom) et votre « Mot de passe ». Cliquez « Se connecter ».
3. Le portail affiche « Protégez votre compte » : la double authentification est obligatoire pour votre rôle.

### Activer la double authentification

Il vous faut un téléphone avec une application d'authentification gratuite (Google Authenticator, Microsoft Authenticator ou équivalente). L'assistant suit quatre étapes :

1. « Installer une application ».
2. « Scanner le QR code » : dans l'application, ajoutez un compte et scannez le code. Si le scan est impossible, saisissez la clé affichée.
3. « Confirmer » : tapez le code à 6 chiffres affiché par l'application.
4. « Codes de secours » : notez ces codes en lieu sûr, hors de votre téléphone. Chacun remplace une fois le code de l'application. Ils ne seront plus affichés. Cochez « J'ai mis mes codes en lieu sûr », puis « Terminer ».

Ensuite, à chaque connexion, l'écran « Vérification en deux étapes » demande le code à 6 chiffres. Sans votre téléphone, cliquez « Utiliser un code de secours ».

Dans « Mon profil », vous pouvez demander « Nouveaux codes de secours ».

### Le mot de passe

Au moins 12 caractères, ni trop courant, ni proche de votre nom, sans mot facile à deviner (nom de l'entreprise, du métier, d'un pays ou d'une ville). « Mot de passe oublié ? » envoie un lien valable 30 minutes.

Après 5 échecs (mot de passe ou code), le compte est verrouillé 15 minutes. Un courriel vous prévient.

### Mon profil, déconnexion

« Mon profil » permet de choisir la « Langue de l'interface », l'« Apparence », de « Changer de mot de passe », de voir les « Sessions ouvertes » et l'« Activité récente du compte ».

Cliquez « Se déconnecter » en fin de travail. Après 30 minutes sans activité, la session expire.

## Le menu de l'administrateur pays

| Rubrique | À quoi elle sert |
|---|---|
| « Accueil » | « À traiter » et « Qualité des données » |
| « Prospects », « Établissements » | Fiches communes, validation, positions proposées |
| « Listes cibles » | Prospects de chaque poste |
| « Propositions » | Corrections de fiches proposées par les délégués |
| « Remplaçants » | Remplaçants des superviseurs |
| « Objectifs » | Objectifs par réseau |
| « Organisation » | Zones, secteurs, divisions, réseaux, postes |
| « Référentiels » | Produits, portefeuilles, listes de valeurs |
| « Doublons » | File des doublons probables, fusions |
| « Imports » | Fichier d'organisation, export BirdNotes |
| « Équipe » | Comptes, rôles, téléphones |
| « Paramètres » | Règles du pays, jours fériés, champs du rapport |
| « Journal d'audit » | Qui a fait quoi, quand |

Vous n'avez pas accès à « Pilotage », ni aux rapports de visite des délégués.

## Le travail courant, dans l'ordre

| Fréquence | Ce que vous faites |
|---|---|
| Chaque jour | Ouvrir l'accueil : « À traiter », « Qualité des données » |
| Chaque jour | Trancher les doublons, valider les fiches, traiter les propositions |
| À chaque arrivée ou départ | Créer ou suspendre un compte, affecter ou libérer un poste |
| À chaque changement d'équipe | Rattacher les postes au bon superviseur |
| Chaque semaine | Valider les positions proposées des établissements |
| Chaque année et avant chaque fête | Tenir le calendrier des jours fériés |
| Au besoin | Ajuster les paramètres, les référentiels, les listes cibles |

## L'accueil

### « À traiter »

La carte affiche, s'il y en a :
- « … comptes sans rôle » ;
- « … postes vacants » ;
- « … postes sans superviseur ».

Un poste sans superviseur est urgent : son délégué ne peut pas soumettre de planning. Un clic ouvre la liste filtrée.

### « Qualité des données »

La carte affiche d'abord ce qui reste à trancher : fiches prospects et établissements « à valider », « paires de doublons », « propositions de modification ». Puis les fiches à compléter : « Sans lieu d'exercice », « Sans téléphone », « Sans spécialité », « Hors de toute liste cible », « Établissements sans position ». Un clic ouvre la liste filtrée.

## Organisation

Rubrique « Organisation ». Trois onglets : « Postes », « Zones et secteurs », « Divisions et réseaux ».

### Zones, secteurs et localités

Onglet « Zones et secteurs » :
- « Nouvelle zone » ;
- « Ajouter un secteur » dans une zone ; un secteur appartient à une seule zone ;
- « Déplacer » un secteur vers une autre zone ;
- « Nouvelle localité » : les quartiers ou villages d'un secteur.

### Divisions et réseaux

Onglet « Divisions et réseaux » : « Nouvelle division », puis « Ajouter un réseau » dans la division. Le portefeuille de produits d'un réseau se gère dans « Référentiels ».

### Postes

Onglet « Postes ». En tête : nombre de postes, « Postes vacants », « Sans superviseur », secteurs. Les filtres « Tous », « Vacants », « Sans superviseur » et la recherche aident à trouver un poste.

- **Créer un poste** : « Nouveau poste ». Renseignez le « Libellé », le « Code », le « Type de poste » (« Visiteur médical », « Visiteur médical OTC », « Key Account Manager », « Dermo-conseillère »), les « Réseaux » et les « Secteurs ». Un poste peut être vacant et couvrir plusieurs secteurs.
- **Affecter un occupant** (occupation) : « Affecter un occupant », choisissez la « Personne » et la date « À partir du ». Un poste n'a qu'un occupant à la fois.
- **Rattacher un superviseur** (rattachement) : « Rattacher un superviseur », choisissez le « Superviseur » et la date « À partir du ». Le rattachement précédent prend fin à cette date ; le passé ne change pas.
- **Libérer le poste** : l'occupation prend fin aujourd'hui ; l'historique est conservé.
- **Archiver** un poste qui n'existe plus.

À savoir :
- Le délégué planifie sur le poste qu'il occupe le lundi de la semaine.
- Sans superviseur rattaché, le délégué ne peut pas soumettre son planning. Le message lui dit de vous prévenir.
- Les périmètres des DF et des DM (leurs réseaux) viennent de l'import du fichier d'organisation. Le portail n'a pas d'écran pour les modifier un par un.

## Comptes et rôles

Rubrique « Équipe », onglet « Comptes ». En tête : nombre de comptes, actifs, « Sans rôle », « Suspendus », « Téléphones ».

### Créer un compte

1. Cliquez « Nouveau compte ».
2. Renseignez « Prénom », « Nom », « Identifiant » (format prenom.nom), « Courriel » et « Langue ».
3. Validez. Un lien valable 30 minutes part par courriel pour choisir le mot de passe.

Utilisez une adresse de courriel professionnelle : sans courriel, la personne ne reçoit pas le lien.

### Attribuer ou retirer un rôle

Ouvrez la fiche du compte. Dans « Rôles » :
- « Attribuer un rôle » : délégué, superviseur, DM, DF ;
- « Retirer » un rôle.

L'historique des rôles reste sur la fiche. Les rôles de responsable pays et d'administrateur pays sont attribués par le siège.

N'oubliez pas : pour qu'un délégué travaille, il faut un compte, le rôle « Délégué », un poste occupé, et un superviseur rattaché à ce poste.

### Suspendre, réactiver, dépanner

Sur la fiche du compte :
- « Suspendre » : la personne ne peut plus se connecter. Son téléphone efface ses données à la tentative suivante.
- « Réactiver ».
- « Envoyer un lien de mot de passe » : pour une personne qui a oublié son mot de passe ou dont le lien a expiré.
- « Fermer ses sessions » : la déconnecte partout.
- « Réinitialiser la double authentification » : pour une personne qui a perdu son téléphone ; elle la reconfigurera à la prochaine connexion.

Les affectations dans d'autres pays et les transferts sont accordés par l'administrateur du siège.

### Téléphones

Onglet « Téléphones » : chaque téléphone enregistré, son propriétaire, la version de l'application et le « Dernier contact ».

Pour un téléphone perdu, volé, ou celui d'une personne qui quitte l'entreprise :
1. Cliquez « Révoquer ».
2. Confirmez : la personne ne pourra plus se connecter ni synchroniser depuis ce téléphone.

À l'ouverture suivante, le téléphone efface ses données (envois en attente compris) et revient à l'écran de connexion. Si la personne change de téléphone, révoquez l'ancien ; le nouveau s'enregistre à la première connexion.

## Référentiels

Rubrique « Référentiels ». Trois onglets.

### Produits

« Nouveau produit » : « Nom du produit », « Code » (laissé vide, il est tiré du nom), « Classe thérapeutique », « Réseaux ». Un produit peut appartenir à plusieurs réseaux. « Afficher les archivés » montre les anciens produits.

### Portefeuilles

Pour chaque réseau, « Gérer le portefeuille » : cochez les produits. Ils sont proposés aux délégués de ce réseau à partir d'aujourd'hui ; les rapports passés gardent les leurs. Repère : 6 à 25 produits par réseau. Un portefeuille vide signifie que les délégués n'auront rien à présenter.

### Listes de valeurs

Les listes : « Types de prospect », « Spécialités », « Types d'établissement », « Classes thérapeutiques », « Motifs d'écart », « Grades », « Résultats de visite », « Articles promotionnels », « Types de prochaine action ».

- « Nouvelle valeur », puis « Ajouter ».
- « Renommer ».
- « Archiver » : rien ne se supprime ; une valeur archivée n'est plus proposée mais reste lisible là où elle a servi. « Réactiver » la remet.

Une spécialité se rattache à un type de prospect pour ne la proposer qu'à lui.

## Listes cibles

Rubrique « Listes cibles ». Vous pouvez tenir la liste de tout poste du pays (le superviseur tient celles de son équipe).

- « Ajouter des prospects » : cochez, puis « Ajouter n prospects ».
- Réglez la fréquence par cycle avec « Une visite de moins par cycle » et « Une visite de plus par cycle ».
- « Retirer de la liste » demande un motif.

Un prospect hors des secteurs du poste est accepté mais signalé « Hors secteur ». Si la liste demande plus de visites par jour que le maximum du type de poste, un avertissement s'affiche.

## Prospects et établissements

### Fiches prospects

Rubrique « Prospects ». Recherche par nom (sans tenir compte des accents), téléphone ou numéro d'ordre ; filtres et tri.

- « Nouveau prospect » : le NOM s'enregistre en majuscules ; le titre (Dr, Pr) va dans la « Civilité ». Le « N° d'ordre professionnel » évite les doublons.
- « Valider la fiche » : une fiche « À valider » devient commune.
- « Modifier », « Archiver » (avec un motif ; rien ne se supprime).
- « Ajouter un lieu d'exercice » : le prospect y exerce à partir d'une date. « Définir comme lieu principal » : ce lieu est proposé en premier pour la planification. « Terminer » un exercice qui prend fin.
- La case « Le prescripteur accepte d'être contacté sur ce numéro » commande l'affichage du mobile personnel aux délégués qui l'ont dans leur liste cible.
- « Historique des modifications » : chaque champ changé, son ancienne et sa nouvelle valeur, l'auteur, la date et l'origine.

### Établissements

Rubrique « Établissements », affichage « Liste » ou « Carte ».

- « Nouvel établissement » : nom, type, secteur, adresse, localité, téléphone et « Position GPS de référence ». La position est facultative mais nécessaire au contrôle de distance des visites.
- « Rayon de pointage (mètres) » : facultatif, pour un grand établissement (hôpital, campus), de 50 à 2 000 m. Vide : la distance du pays s'applique.
- Le filtre « Sans GPS » liste les établissements sans position.

### Positions proposées

Un établissement sans position en reçoit une proposée, calculée à partir des pointages de démarrage des visites : trois pointages, faits par au moins deux personnes différentes.

1. Le bandeau « … positions proposées attendent votre validation » s'affiche en haut de la liste. Cliquez « Les afficher ».
2. Ouvrez la fiche : la carte montre le « Point proposé » et les petits points des pointages (date, précision, sans nom).
3. Si besoin, cliquez à l'entrée exacte de l'établissement pour y déplacer le point (« Point déplacé de … m »). « Revenir au point proposé » annule.
4. Cliquez « Valider cette position ».

Les prochaines visites seront contrôlées à partir de cette position. Les visites déjà faites ne changent pas. L'historique de la fiche indique « position proposée validée ».

### Doublons

Rubrique « Doublons », onglet « À trancher ». Chaque paire montre la « Fiche saisie » et la « Fiche existante » côte à côte, avec un score « Ressemblance … / 100 » et les critères (nom similaire, même n° d'ordre, même mobile…).

| Décision | Effet |
|---|---|
| « Fusionner » | La fiche existante est gardée ; lieux d'exercice et listes cibles de l'autre la rejoignent |
| « Garder séparées » | La paire ne reviendra plus |
| « Refuser la fiche saisie » | La fiche saisie est archivée |

Onglet « Fusions » : toutes les fusions, automatiques ou non. « Défaire » sépare à nouveau les fiches ; la paire ne sera plus fusionnée automatiquement.

L'application ne fusionne seule que les cas certains (même numéro d'ordre, ou même mobile avec un nom très proche). Tout le reste arrive dans votre file.

### Propositions

Rubrique « Propositions », filtre « En attente ». « Accepter » met la fiche à jour. « Refuser » demande un « Motif du refus ». Le superviseur du délégué peut aussi trancher.

## Paramètres du pays

Rubrique « Paramètres ». Chaque ligne affiche « Valeur par défaut » ou « Personnalisé ». « À confirmer » signale une valeur encore en discussion. Cliquez « Modifier » pour changer une valeur.

Une modification vaut pour la suite, jamais pour le passé. Chaque changement est inscrit au journal d'audit, avec l'ancienne et la nouvelle valeur. Attention : une journée pas encore validée par le superviseur est recalculée avec les nouveaux seuils.

| Carte | Paramètre | Valeur par défaut |
|---|---|---|
| « Calendrier » | « Format d'affichage des dates », « Jours ouvrés » | JJ/MM/AAAA ; lundi à vendredi |
| « Planning » | « Fermeture de la semaine (soumettre avant) » | Lundi 0 h, semaine du planning |
| « Planning » | « Délai avant escalade au DM (heures ouvrées) » | 24 |
| « Visites » | « Visites par jour et par type de poste » | Par type de poste |
| « Visites » | « Plage horaire des visites » | 8 h à 20 h |
| « Visites » | « Visites sans GPS tolérées par jour » | 3 |
| « Visites » | « Distance de pointage (mètres) » | 100 |
| « Visites » | « Durée d'une visite (minutes) » | 3 à 180 |
| « Visites » | « Géolocalisation des visites » | Activée |
| « Visites » | « Attente de la position (secondes) » | 60 |
| « Rapports » | « Heure limite du rapport » | 23 h 59 |
| « Rapports » | « Autre produit présenté (hors portefeuille) » | Désactivé |
| « Téléphone » | « Verrouillage du téléphone (minutes) » | 15 (de 5 à 30) |
| « Conservation des données » | « Durées de conservation » | Activité et audit 5 ans, positions GPS 12 mois, pièces jointes 3 ans |

### Champs du rapport

Carte « Champs du rapport », à côté des paramètres des rapports. Ils s'ajoutent au socle commun (produits, résultat, résumé, prochaine action).

1. « Ajouter un champ ».
2. « Libellé », « Type de réponse » (« Texte libre », « Nombre », « Liste de choix » avec au moins deux choix, « Oui / non »).
3. Cochez « Obligatoire pour soumettre » si besoin.

Le type ne change plus une fois le champ créé. « Retirer » ôte le champ des prochains rapports. Un rapport déjà commencé garde les champs de son ouverture.

### Jours fériés

Carte « Jours fériés », dans « Paramètres ».

1. Choisissez l'« Année ».
2. « Ajouter » : « Date », « Libellé », et cochez « Date variable (fête religieuse annoncée peu avant) » si besoin.
3. Pour corriger, ouvrez le jour férié ; « Retirer » l'ôte du calendrier.

Un jour férié n'est pas planifiable et ne compte pas dans les contrôles de la semaine. Sa date se modifie jusqu'à la veille ; à partir du jour même, il ne change plus.

Pensez aux fêtes à date variable : elles ne sont pas saisies d'avance. Saisissez-les dès que la date est annoncée. Une visite déjà posée sur un jour devenu férié devra être déplacée par le délégué.

## Remplaçants et objectifs

### Remplaçants

Rubrique « Remplaçants », « Désigner un remplaçant » : « Superviseur remplacé », « Remplaçant », « Du », « Au (inclus) ». Vous pouvez le faire pour tout superviseur du pays, par exemple s'il est absent sans l'avoir fait lui-même.

### Objectifs par réseau

Rubrique « Objectifs », « Nouvel objectif » : « Réseau », « Indicateur » (« Visites faites », « Couverture des potentiels A et B », « Présentations d'un produit »), « Produit » le cas échéant, « Du », « Au », « Cible ». « Modifier » et « Archiver » sont tracés au journal d'audit. Le DM du réseau peut aussi les fixer.

## Imports

Rubrique « Imports ». Deux sources :
- « Fichier d'organisation » : classeur Excel (.xlsx), feuille « ORGANISATION ». Il crée postes, comptes, rôles, périmètres DF et DM, occupations et rattachements.
- « Export BirdNotes » : le fichier d'extraction fourni par BirdNotes, tel quel, ou son archive ZIP. Il reprend secteurs, localités, divisions, réseaux, produits, portefeuilles, établissements et prospects.

### Les trois étapes

1. « Choisir le fichier ».
2. « Simuler et vérifier » : cliquez « Lancer la simulation ». Tout est calculé puis annulé : « Simulation terminée : rien n'a été enregistré. » Lisez les chiffres et les « Anomalies ». Téléchargez le « Rapport CSV » si besoin.
3. « Importer » : cliquez « Importer pour de bon » et confirmez.

Le traitement prend environ une minute pour un pays entier. Le fichier est lu le temps du traitement et n'est pas conservé.

À savoir :
- Un second import du même fichier ne crée pas de doublon : il retrouve les fiches déjà reprises.
- Rien n'est fusionné à l'import. Les doublons signalés arrivent dans « Doublons ».
- Les anomalies courantes : « type à préciser », « localité à préciser », « prénom à séparer ». Corrigez-les ensuite à la main dans les fiches.
- Les secteurs nouveaux vont dans une zone « À répartir » : déplacez-les dans la bonne zone.
- L'« Historique » garde chaque simulation et chaque import, avec son rapport.

Règle de confidentialité : n'importez jamais un fichier réel sur l'instance de démonstration.

## Journal d'audit

Rubrique « Journal d'audit ». Il dit qui a fait quoi, quand et d'où : connexions, décisions, exports, modifications. Il ne se modifie jamais.

- Du plus récent au plus ancien, 30 par page.
- Filtres : « Personne (identifiant) », famille (« Toutes les familles » : Connexions, Rapports, Exports, Paramètres…), résultat (« Réussi », « Échec »), période (« Du », « Au »).
- Un clic ouvre le détail : rôles, pays, objet, application, adresse (masquée en partie), référence de la requête.

Vous ne voyez que votre pays. Le journal ne s'exporte pas.

## Exports

L'administrateur pays n'exporte pas les indicateurs ni les rapports de visite : le bouton « Exporter » est dans « Pilotage », réservé à l'encadrement (superviseur, DM, DF, responsable pays) et au siège. Chaque export y est audité.

Vous pouvez seulement télécharger le « Rapport CSV » des anomalies d'un import. Pour un besoin d'export, adressez-vous au responsable pays.

## Questions fréquentes

### Un délégué ne peut pas soumettre son planning : « pas de superviseur ».

Son poste n'a pas de superviseur rattaché cette semaine-là. « Organisation », onglet « Postes », filtre « Sans superviseur », puis « Rattacher un superviseur ».

### Un nouveau délégué ne voit aucune liste cible.

Vérifiez qu'il occupe un poste (« Affecter un occupant ») et que la liste du poste n'est pas vide (« Listes cibles »).

### Une personne a perdu son téléphone.

« Équipe », onglet « Téléphones », « Révoquer ». Si elle utilisait ce téléphone pour la double authentification, ouvrez sa fiche et « Réinitialiser la double authentification ».

### Une personne n'a pas reçu son lien de mot de passe.

Vérifiez son courriel sur sa fiche, puis « Envoyer un lien de mot de passe ». Le lien est valable 30 minutes ; demandez-lui de regarder ses courriers indésirables.

### J'ai fusionné deux fiches par erreur.

« Doublons », onglet « Fusions », « Défaire ». Chaque fiche retrouve ses lieux d'exercice et ses listes cibles.

### Le Ramadan se termine à une date encore incertaine.

Ajoutez le jour férié avec « Date variable ». Vous pourrez changer sa date jusqu'à la veille.

### Les délégués d'un hôpital sont toujours « loin du lieu ».

Ouvrez l'établissement et renseignez un « Rayon de pointage » adapté (par exemple 300 m). Vérifiez aussi que sa position est juste.

### Je ne trouve pas le réglage du délai sans synchronisation (7 jours).

Ce paramètre existe pour le pays, mais il n'apparaît pas dans l'écran « Paramètres » de cette version. Adressez-vous à l'administrateur technique.

## À qui s'adresser

| Besoin | Qui contacter |
|---|---|
| Désigner un responsable ou un administrateur pays, affectation dans un autre pays, transfert, suspension du pays | L'**administrateur du siège** |
| Votre propre double authentification perdue (téléphone et codes de secours) | L'**administrateur du siège** |
| Une décision sur un planning ou un rapport, une liste cible d'équipe | Le **superviseur** concerné, ou son **DM** |
| Un export d'indicateurs ou de rapports | Le **responsable pays** |
| « Service injoignable », « Quelque chose s'est mal passé » avec une « Référence », un paramètre absent de l'écran, un import qui échoue | L'**administrateur technique** ; donnez-lui la référence affichée |

L'administrateur technique exploite la plateforme ; il ne prend jamais de décision métier. Les coordonnées de ces personnes vous sont données par votre entreprise.

# Journal des versions

Toutes les versions d'INNOV CRM sont consignées ici. Convention : `0.0.1` … `0.0.9`, `0.1.1` … `0.9.9`, puis `1.0.0` (ADR-018). Chaque section cite les exigences livrées par leur identifiant (`prd.md`).

## [0.8.2] — Rapports et fiches sans réseau

Deuxième jalon du cycle 0.8 « Mobilité ».

### Ajouté (OFF-002, prd.md §14.61)

- Le rapport de chaque visite de la semaine et de la suivante, ou son modèle vierge, est gardé sur le téléphone : un rapport jamais ouvert s'écrit sans réseau et part au retour du réseau.
- Une proposition de mise à jour de fiche faite sans réseau attend dans la file, avec un identifiant tiré sur le téléphone ; le serveur ne la crée qu'une fois.
- Profil : « Rapports prêts à écrire sans réseau ».

### Corrigé

- Démonstration : la semaine en préparation ne perd plus son passage de deux confrères quand le prospect libéré pour « Proposées à votre dernière visite » (DC-61) en faisait partie ; le test échouait selon la date du jour.

### Design

Revue sur le rendu réel (délégué de la démonstration, téléphone, avec et sans réseau) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport jamais ouvert, sans réseau | « Le rapport s'écrit avec du réseau pour l'instant » : bloquant, sans issue | Le rapport s'écrit depuis le modèle gardé ; sinon, le message dit de synchroniser |
| Proposition de fiche, sans réseau | Erreur de réseau, saisie perdue | Mise en file, message « gardée sur le téléphone » |

## [0.8.1] — Une semaine de travail sans réseau

Premier jalon du cycle 0.8 « Mobilité ».

### Ajouté (OFF-001, SEC-005, prd.md §14.60)

- Synchronisation du téléphone en une passe : programme, semaines en cours et suivante, détail des visites, liste cible, trois dernières visites de chaque prospect (une seule lecture côté serveur), visites proposées, « Mes chiffres » ; tout est gardé dans la base locale chiffrée.
- Départ automatique à la connexion et au retour dans l'application (plus de 30 minutes) ; « Synchroniser maintenant » dans le profil ; une partie qui échoue ne vide rien.
- Profil : carte « Données hors connexion » (dernière synchronisation, ce qui est gardé).
- Chiffrement de la base locale vérifié par un test (clé de 256 bits, magasin sécurisé, appliquée avant toute lecture).

### Design

Revue sur le rendu réel (délégué de la démonstration, téléphone clair et sombre, avec et sans réseau) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Profil | « 12 visites · 50 prospects · 6 historiques » : mot technique, ligne coupée au milieu | Trois lignes claires, un nombre chacune |

## [0.7.9] — Grafana, points d'attention et clôture du cycle 0.7

Neuvième et dernier jalon du cycle 0.7 « Indicateurs de pilotage » : recette `recette-0.7.md`, démonstration `demonstration-0.7.md`.

### Ajouté (DSH-010, DSH-011, DC-53, DC-57, prd.md §14.59)

- Grafana isolé par pays : schéma `pilotage` d'agrégats sans nom ni texte libre, recalculés chaque heure ; un rôle de base par pays qui ne lit que ses vues, un rôle du siège qui ne lit que l'agrégat par pays (CA1 à CA3). Provisionnement et tableaux dans `deploiement/grafana/`, guide `docs/grafana.md`, sans aucun secret.
- Fraîcheur : « calculé à … » à côté de la période du pilotage, rechargement toutes les 5 minutes ; heure du dernier calcul dans Grafana.
- Fiabilité : la somme des jours de Grafana égale le tableau du pays (test automatisé).
- Points d'attention (DC-57) : actions promises en retard, prescripteurs passés à « prescrit », prescripteurs en baisse, chacun relié à ses visites.
- Tendance de prescription (DC-53) : retours par produit, part favorable de la période et de la précédente, agrégée.
- Décision par délégation : DC-52 (position de référence) passe au cycle 0.8.

### Design

Revue sur le rendu réel (responsable pays et DM de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Points d'attention | Deux visites du même délégué le même jour donnaient deux lignes identiques (« 29 sept. · Aminata Touré ») | Une ligne par journée, « (2 visites) » |
| Pilotage | Rien ne disait de quand datent les chiffres | « calculé à 20:33 » à côté de la période ; rechargement toutes les 5 minutes |

## [0.7.8] — Exports audités

Huitième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (RPT-019, DSH-008, RG-061, prd.md §14.58)

- « Exporter » sur « Pilotage » : indicateurs par délégué ou rapports de visite, en classeur Excel ou en CSV, avec la période et les filtres affichés.
- Limité au périmètre du tableau (CA1) ; chaque export est inscrit au journal d'audit avec ses filtres et son nombre de lignes (CA2).
- Décision par délégation : CSV « ; » en UTF-8 avec BOM, classeur .xlsx sans dépendance, heures du pays, cellules neutralisées contre les formules.

### Design

Revue sur le rendu réel (responsable pays de la démonstration, bureau et téléphone ; fichiers téléchargés et relus) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Menu d'export | Rien ne disait que l'export suit la période et les filtres, ni qu'il est audité | Une ligne d'aide en tête du menu |
| Fichier des rapports | Heures en temps universel (« 2026-09-21T09:55+00:00 ») | Heure du pays, « 2026-09-21 09:55 » |
| Classeur Excel | Sans style par défaut, et des cellules vides écrites comme du texte | Style « Normal » déclaré ; cellules vides omises |

## [0.7.7] — Délais de validation

Septième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-007, KPI-02, KPI-09, prd.md §14.57)

- « Pilotage » : délai médian de validation des plannings et des rapports, nombre de décisions, part prise en moins d'un jour ouvré ; au siège, par pays et pour tous les pays.
- Délais comptés en heures ouvrées du pays, sans week-ends ni jours fériés (CA1).
- Décision par délégation : approbations, révisions, validations et demandes de correction prises sur la période ; médiane seulement, sans classement.

### Design

Revue sur le rendu réel (responsable pays et direction du siège de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Pilotage du pays | Les délais venaient après les 207 délégués : invisibles sans défiler toute la page | Placés sous les chiffres clés |
| Libellés | « Plannings : médiane », en majuscules dans l'en-tête du siège | « Plannings, délai médian » |
| Cible | Une médiane hors cible ressemblait à une médiane tenue | Au-delà d'un jour ouvré, elle ressort en orange |

## [0.7.6] — Objectifs par réseau

Sixième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-006, DSH-009, prd.md §14.56)

- Page « Objectifs » : objectifs datés par réseau sur les visites faites, la couverture des potentiels A et B ou les présentations d'un produit ; fixés par le DM du réseau ou l'administrateur pays, lus par l'encadrement de leur périmètre (CA1).
- Avancement : réalisé contre la cible, repère de l'attendu à ce jour et état « En avance », « En retard », « Atteint »… (CA2).
- Création, modification et archivage tracés dans le journal d'audit.
- Décision par délégation : l'attendu est la cible au prorata des jours écoulés de la période.
- Taux de réalisation et part des écarts justifiés vérifiés contre la définition de KPI-03 (DSH-006).

### Modifié

- Une confirmation sans champ reste une boîte centrée sur téléphone, au lieu d'occuper tout l'écran.

### Design

Revue sur le rendu réel (administrateur pays et DM de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Téléphone | Le tableau débordait : l'état et les actions étaient hors de l'écran | Une carte par objectif, état en haut à droite |
| Archiver | Un appui archivait sans retour possible | Confirmation « Archiver cet objectif ? » |
| Confirmation | Sur téléphone, la boîte vide occupait tout l'écran | Boîte centrée quand il n'y a pas de champ |
| Interrupteur | « Afficher aussi les objectifs terminés » alors que les récents l'étaient déjà | « … terminés depuis plus de 90 jours » |

## [0.7.5] — Filtres et périodes du pilotage

Cinquième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-005, prd.md §14.55)

- Périodes : semaine, 30 et 90 derniers jours, 6 et 12 derniers mois, dates choisies (un an au plus), au pilotage et à la consolidation du siège.
- Filtres : zone, secteur, division, réseau, superviseur, délégué, activité ; valeurs tirées du seul périmètre (CA1), combinables, gardées dans l'adresse.
- Décision par délégation : au-delà d'un cycle, la couverture se lit sur toute la période.

### Design

Revue sur le rendu réel (responsable pays et direction du siège de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Période | « Dates choisies » envoyait une demande sans dates : erreur, page bloquée en chargement | Les dates partent de la période affichée |
| Filtres | Deux changements successifs de l'adresse s'écrasaient : seul le dernier comptait | Changements groupés en une seule mise à jour |
| Note | « Cycle de 4 semaines, du 9 septembre au 8 octobre » sur une période de 30 jours | « La couverture se lit sur toute la période » |
| Téléphone | Dix champs de filtre avant le premier chiffre | Filtres repliés derrière « Filtres (n) », période toujours visible |
| Téléphone | « Filtres (5) » comptait la période et les dates | Seuls les filtres sont comptés |

## [0.7.4] — Consolidation du siège

Quatrième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-004, REC-10, prd.md §14.54)

- « Pilotage » du siège en vue consolidée : un tableau par pays, agrégé, sans aucun nom, et le total de tous les pays.
- Descente au nominatif d'un pays (« Voir les délégués ») ; chaque consultation crée l'événement d'audit `pilotage.consultation_nominative` (CA1), rappelé par un bandeau.

### Design

Revue sur le rendu réel (direction du siège de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Descente nominative | Aucun chemin visible pour revenir à la vue consolidée, hors du sélecteur de pays en haut de page | Bouton « Tous les pays » dans le bandeau d'audit |
| Téléphone | Bouton du bandeau coupé sur quatre lignes | Libellé court, sur une ligne |

## [0.7.3] — Pilotage du DM, du DF et du pays

Troisième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-003, prd.md §14.53)

- « Pilotage » ouvert au DM et au DF (postes de leurs réseaux) et au responsable pays (tout le pays).
- « Regrouper » par réseau, zone ou secteur : une ligne de total par groupe, dépliable sur ses délégués ; le total d'un groupe est la somme de ses délégués (CA1).
- Décisions par délégation : l'administrateur pays n'a pas cette page ; un poste de deux réseaux compte dans chacun, une seule fois dans l'ensemble.

### Modifié

- Moteur des indicateurs : données chargées par lot pour tous les délégués ; 0,3 s au lieu de 5,7 s pour les 207 délégués de la démonstration.

### Design

Revue sur le rendu réel (responsable pays et DM de la démonstration, bureau et téléphone) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Par réseau | Un tableau complet par réseau : page très longue, colonnes non alignées d'un tableau à l'autre | Un seul tableau : une ligne de total par réseau, dépliable sur ses délégués, puis « Ensemble » |
| Par réseau | Première colonne intitulée « Délégué » sur des lignes de réseau | En-tête « Réseau », « Zone » ou « Secteur » selon le regroupement |
| Responsable pays | Page affichée après 5,7 s | Calcul groupé : 0,3 s |

## [0.7.2] — Tableau de l'équipe du superviseur

Deuxième jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-002, DSH-012, prd.md §14.52)

- Page « Pilotage » du portail : les délégués de l'équipe côte à côte, semaine par semaine (visites faites, réalisation, écarts justifiés, géolocalisées, rapports dans le délai, couverture du cycle, à suivre), par ordre alphabétique, sans note ni classement (DC-49) ; ligne « Équipe » tirée des sommes ; « Aucune activité cette semaine » sans visite.
- Seuls les délégués des postes rattachés au superviseur pendant la semaine y figurent (DSH-002 CA1).
- Droit `pilotage.lire` (superviseur).

### Design

Revue sur le rendu réel (bureau 1440 px, tablette 834 px, téléphone 390 px, thème sombre, données de démonstration) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Barre de chiffres | « dont 0 imprévue » | Précision affichée seulement s'il y a des imprévues |
| Téléphone | Le sous-titre masqué ne disait plus quelle semaine était affichée ; « Cette semaine » se lisait comme l'état et non comme une action | La semaine se redit sous le titre ; bouton « Semaine en cours » |
| Tableau | En-têtes sur deux lignes très espacées | Interligne resserré, alignés en bas |
| Tableau | « — » suivi de « 0 sur 0 » à chaque ligne sans liste cible | Détail masqué quand il n'y a pas de base |
| Téléphone | Colonne des noms trop large | 140 px au lieu de 180 |

## [0.7.1] — Mes chiffres du délégué

Premier jalon du cycle 0.7 « Indicateurs de pilotage ».

### Ajouté (DSH-001, prd.md §14.51)

- Moteur commun des indicateurs (`apps/pilotage`) : visites prévues (version approuvée), échues, à venir, faites, imprévues, écarts justifiés, à justifier, géolocalisées ; rapports dans le délai, validés, en retard ; couverture de la liste cible et des potentiels A et B, à leur fréquence. Taux bornés à 100 %, vides sans base, « Aucune activité » sans visite ; ni score ni classement (DC-49, DC-50).
- Onglet « Mes chiffres » du téléphone : la semaine, sa courbe jour par jour, la variation en points par rapport à la semaine précédente, la couverture sur le cycle de visites, les semaines passées ; gardé sur le téléphone et lisible sans réseau avec l'heure de calcul (CA1).
- Décisions par délégation : une visite prévue ne compte qu'une fois échue ; la couverture se lit sur le cycle de visites ; l'API est ouverte au délégué et au superviseur qui occupe un poste, chacun pour ses visites.

### Retiré

- L'écran « Disponible en 0.7.1 » de l'onglet Chiffres.

### Design

Revue sur le rendu réel (application web du téléphone, 360 et 414 px, thème clair et sombre, données de démonstration) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Mes chiffres | « 0 sur 1 visites prévues non faites » : accord sur le total faux | Textes au singulier et au pluriel selon le total |
| Courbe des jours | Un trait gris sous les jours sans visite, lu comme une petite barre | Barre absente à zéro, ligne de base discrète |
| Hors connexion | Revenir à la semaine en cours cherchait une autre copie locale et laissait l'ancienne semaine affichée | La semaine en cours se relit sous sa clé ; sans copie, l'écran le dit et propose « Revenir à la semaine en cours » |
| Hors connexion | Heure de calcul répétée sous le titre et dans le bandeau | Une seule fois, dans le bandeau |

## [0.6.9] — Recette et démonstration du cycle 0.6

Dernier jalon du cycle 0.6 « Validation des rapports ».

### Ajouté

- Recette du cycle (`recette-0.6.md`) : chaque critère relié à son test. Nouveaux tests pour les écarts relevés : REC-08 de bout en bout, audit des validations par journée et par lot (RG-034), aucune validation automatique (RG-035), rapport validé non modifiable (RG-036), lot refusé à une journée incomplète (23.A), retards lus par le remplaçant et le DM, pièce jointe lue par le DM, le DF et le responsable pays (RPT-007 CA2), le superviseur qui garde la main après l'escalade (25.A), la journée rouverte au-delà de 4 semaines (32.A), la tâche périodique ; au portail, « Soumis en retard » et « Escaladée ».
- Démonstration de fin de cycle (`demonstration-0.6.md`).
- Décision du 8 octobre 2026 : jusqu'à 1.0.0, l'option recommandée est retenue à chaque choix, par délégation du responsable produit (`prd.md` §14.50).

## [0.6.8] — Notifications du workflow de rapport

Huitième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (prd.md §18, NOT-003, NOT-006)

- « n rapports à valider » au superviseur et « n rapports validés » au délégué, regroupés par jour tant que la notification n'est pas lue.
- Décision 37.A : rappel au délégué à 18 h le jour de la visite si un rapport du jour n'est pas soumis.
- Décision 38.A : une notification par journée escaladée au DM du périmètre, qui ouvre la journée.

### Design

Revue sur le rendu réel (centre de notifications du portail) :

| Écran | Défaut observé | Correction |
|---|---|---|
| Notifications du DM | À la mise en service, 32 journées anciennes lui étaient escaladées d'un coup. | Seules les journées des 7 derniers jours sont notifiées, comme les alertes de retard. |

## [0.6.7] — Rapports en retard

Septième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-017, RG-032)

- Onglet « Retards » dans « À traiter » (décision 35.A) : les rapports non soumis après leur échéance, avec leurs jours de retard, et les journées de plus de 4 semaines non validées ; chaque ligne ouvre la journée.
- **CA1** : la liste se filtre par délégué ; le filtre reste dans l'adresse de la page.
- Décision 34.A : 48 heures après la visite, un rapport toujours pas soumis alerte le superviseur, une seule fois par délégué et par jour ; la notification ouvre les retards du délégué.
- [H] Liste sur 13 semaines ; alertes pour les visites des 7 derniers jours seulement.

### Design

Revue sur le rendu réel (bureau, portail en largeur de téléphone). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Notifications | Deux visites du même jour donnaient deux alertes identiques, impossibles à distinguer ; « Le rapport de Aminata… » sans élision. | Une alerte par délégué et par jour, avec le nombre : « Aminata Touré : 2 rapports du 6 octobre toujours pas soumis, 48 h après les visites ». |
| Retards, filtre | Le choix « Délégué » semblait vide alors que tous les délégués étaient affichés. | « Tous les délégués » s'affiche, libellé au-dessus. |
| À traiter, onglets | Rien n'indiquait qu'il y avait des retards. | « Retards (2) ». |
| Retards, téléphone | Le texte de chaque ligne s'écrasait à côté du lien. | Le lien passe sous le texte quand la place manque. |

## [0.6.6] — Réouverture d'un rapport validé

Sixième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-016)

- « Rouvrir le rapport » sous un rapport validé, avec un motif obligatoire ; le rapport revient au délégué.
- **CA1** : le superviseur rouvre jusqu'à 30 jours après la validation ; au-delà, seul le DM du périmètre, qui lit la journée en consultation.
- **CA2** : la réouverture est inscrite au journal d'audit et notifiée au délégué ; décision 31.A : quand le DM rouvre, le superviseur est prévenu aussi.
- Décision 32.A : la journée revient dans « À traiter » (« 1 rapport rouvert ») jusqu'à la nouvelle validation ; son classement de conformité reste figé.
- Les journées validées s'ouvrent depuis la conformité de la semaine et depuis la fiche du prospect.
- Le délégué retrouve le rapport rouvert dans « Rapports à corriger », motif en tête ; la version suivante dit « soumise après réouverture ».

### Design

Revue sur le rendu réel (bureau, téléphone, portail en largeur de téléphone). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Semaine, conformité | « Validée : figée » restait affiché sur une journée dont un rapport venait d'être rouvert. | « Classement figé » : c'est ce qui ne change pas. |
| Semaine et fiche prospect | « Ouvrir la journée » se collait au texte au lieu de s'aligner à droite. | Lien aligné à droite, comme dans « À traiter ». |
| À traiter | « 1 rouvert » : on ne savait pas ce qui l'était. | « 1 rapport rouvert ». |

## [0.6.5] — Correction et nouvelle soumission

Cinquième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-015)

- **CA1** : la version précédente d'un rapport corrigé reste consultable. Le superviseur voit la version, la demande à laquelle elle répond et ce qui a changé ; chaque partie modifiée porte « Modifié » ; « Voir la version 1 » déplie l'ancienne version.
- Décision 28.A : qui a demandé la correction est prévenu quand le rapport corrigé revient ; la notification ouvre la journée.
- Décision 29.A : la liste « Rapports à corriger » de la Tournée montre ceux de toutes les semaines.
- Chaque version garde la demande de correction à laquelle elle répond.

### Design

Revue sur le rendu réel (bureau, téléphone, portail en largeur de téléphone). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Journée, version précédente dépliée | L'étiquette « Modifié » se répétait dans l'ancienne version : on ne savait plus laquelle était à jour. | L'étiquette reste sur la version actuelle seulement. |
| Journée avec un rapport renvoyé | « 1 rapport n'est pas encore soumis » : faux, il l'a été puis a été renvoyé. | « 1 rapport est renvoyé pour correction : la journée se validera quand il sera soumis à nouveau. » |

## [0.6.4] — Demande de correction

Quatrième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-014, DC-60)

- « Demander une correction » sous chaque rapport soumis : un commentaire et, au choix, les parties à revoir ; le rapport revient au délégué, « à corriger ». **CA1** : impossible sans commentaire.
- **CA2** : les autres rapports de la journée se valident toujours ; la journée attend le rapport corrigé (22.A). « À traiter » compte les rapports renvoyés.
- Sans échéance (DC-60) : le rapport renvoyé n'est pas « en retard ».
- Le délégué reçoit une notification qui ouvre le rapport ; le rapport affiche la demande en tête ; la Tournée liste les rapports à corriger de la semaine. Resoumis, le rapport revient en version 2.
- Décision 25.A : l'escalade des rapports au DM garde 24 heures ouvrées, le délai des plannings.

### Design

Revue sur le rendu réel (bureau, téléphone). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport à corriger (téléphone) | « En retard : ce rapport était attendu avant minuit… » s'affichait sous la demande, alors que le rapport avait été soumis à l'heure. | Un rapport déjà soumis une fois n'est en retard que si sa première soumission l'était ; le rappel du délai disparaît aussi. |
| Tournée (téléphone) | Les rapports renvoyés pour correction tombaient dans « Rapports en retard ». | Liste à part, « Rapports à corriger », avant les rapports en retard. |

## [0.6.3] — Validation des rapports

Troisième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-013, RPT-018, RG-034, RG-035)

- « Valider ce rapport » sous chaque rapport soumis (mode `unitaire`).
- « Valider la journée », après confirmation (mode `journee`). Décision 22.A : la journée se valide quand tous ses rapports sont soumis ; sinon le bouton est inactif et la page dit combien il en manque.
- « Valider les n journées conformes » sur « À traiter » (mode `lot`). **CA1** : seules les journées conformes. Décision 23.A : et seulement si tous leurs rapports sont soumis, sans horodatage douteux.
- **CA2** : chaque rapport validé porte son validateur, la date et le mode, affichés sous le rapport ; chaque validation est inscrite au journal d'audit.
- Une journée dont tous les rapports sont validés est validée : son classement est figé et elle quitte « À traiter ».
- **RPT-018** : le remplaçant valide en mode `remplacement` ; le DM du périmètre valide en mode `escalade` une journée dont un rapport attend depuis plus de 24 heures ouvrées [H], marquée « Escaladée » dans sa file.

### Design

Revue sur le rendu réel (bureau, téléphone). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Journée, rapport validé | « Validé le … par … · seul » : le mode, isolé en fin de ligne, se lisait mal. | « Validé seul le 7 oct., 21:28 par … » ; « Validé en remplacement… », « par escalade… ». |
| À traiter, après le lot | « 4 journées validées (2 rapports) » : l'accord de « rapport » ne suivait pas le nombre. | « 4 journées validées, 2 rapports. », « 1 rapport », « aucun rapport ». |

## [0.6.2] — Consultation d'une journée

Deuxième jalon du cycle 0.6 « Validation des rapports ».

### Ajouté

- Portail : depuis « À traiter », « Ouvrir la journée » montre les contrôles de la journée, ses activités, puis chaque visite : heures, durée, distance, motif d'un écart, écarts de conformité qui la concernent, et son rapport soumis en entier.
- **RPT-007 CA2** : le superviseur (et l'encadrement de son périmètre) ouvre la pièce jointe d'un rapport soumis ; jamais celle d'un brouillon.
- **RPT-010 CA1** : « Soumis en retard » et « Horodatage douteux » visibles du superviseur, avec l'heure du téléphone et l'heure de réception.
- **RG-037** : le nombre de versions d'un rapport s'affiche.
- Un brouillon reste au délégué : le superviseur n'en voit que l'état.
- Décision 20.A : la file « À traiter » remonte sur 4 semaines.

### Design

Revue sur le rendu réel (bureau 1 440 px, téléphone 390 px, mode sombre). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Journée, rapport | Les textes longs (résumé, prochaine action) étaient alignés à droite sur toute la largeur : difficiles à lire. | Libellé dans une colonne à gauche, texte aligné à gauche à côté ; l'un sous l'autre sur téléphone. |
| Journée, prochaine action | « …concurrents. · d'ici le 6 octobre » : ponctuation collée et échéance noyée. | L'échéance et la visite proposée passent sur une seconde ligne, discrète (« À faire d'ici le 6 octobre »). |
| Journée, visite | L'écart de distance n'apparaissait qu'en tête de page, pas sur la visite concernée. | Chaque visite rappelle ses écarts, en orange, sous son déroulement. |

## [0.6.1] — File « À traiter » du superviseur

Premier jalon du cycle 0.6 « Validation des rapports ».

### Ajouté (RPT-012)

- Portail : page « À traiter » du superviseur. En tête, les journées à vérifier, les rapports à valider, les rapports attendus et les plannings à valider, avec un lien vers ces derniers.
- Par délégué, ses journées terminées et non validées des quatre dernières semaines [H], de la plus ancienne, regroupées par semaine.
- **CA1** : chaque journée affiche « Conforme » ou « À vérifier » et le détail de ses écarts, ainsi que l'état de ses rapports (à valider, attendus, en retard, horodatage douteux). « Consulter la semaine » ouvre le planning.
- Le remplaçant d'un superviseur voit les journées de l'équipe qu'il remplace ; le DM, celles d'un superviseur-visiteur.
- Nouveau droit « valider les rapports » (superviseur, DM).
- Démonstration (18.A) : le prospect du dernier rapport soumis, qui proposait une nouvelle visite, n'est pas replanifié la semaine suivante ; il apparaît sous « Proposées à votre dernière visite ».

### Design

Revue sur le rendu réel (bureau 1 440 px, téléphone 390 px, mode sombre). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| À traiter, journée sans visite faite | « 1 visite » seulement : rien ne disait qu'il n'y avait aucun rapport à attendre. | « 1 visite, aucune effectuée » ; « 3 visites, 2 effectuées » quand une partie seulement a été faite. |
| À traiter, liste des journées | Dix journées à la suite sur trois semaines, difficiles à situer. | Un intertitre par semaine (« Semaine du 21 septembre »). |
| À traiter, téléphone | « Consulter la semaine » partait du bord de la carte, décalé du texte de la journée. | Le bouton s'aligne sur le texte, sous l'icône. |

## [0.5.9] — Stabilisation et démonstration du cycle 0.5 ; décisions de la relecture

Dernier jalon du cycle 0.5 « Rapports de visite ». Toutes les recommandations de la relecture du cahier des charges sont retenues (DC-49 à DC-62, `prd.md` §14.40) ; celles qui touchent les cycles déjà livrés sont appliquées ici.

### Ajouté

- **Indisponibilité imprévue** (DC-51) : « Je suis indisponible aujourd'hui » sous le programme du jour, pour la journée, le matin ou l'après-midi, sans motif, même semaine fermée et sans réseau. Les visites de la période sont justifiées d'un coup et ne comptent plus comme écart.
- **Précision du GPS et rayon de pointage** (DC-55) : une position trop imprécise compte « sans GPS », jamais « loin du lieu » (« dont n à la position trop imprécise ») ; un rayon propre par établissement, de 50 à 2 000 m, saisi et affiché au portail. Démonstration : 300 m pour les hôpitaux.
- **Mobile personnel protégé** (DC-58) : « Le prescripteur accepte d'être contacté sur ce numéro » ; le numéro ne s'affiche qu'à l'administration, et au délégué qui a ce médecin dans sa liste cible, avec l'accord.
- **Verrouillage réglable** (DC-59) : de 5 à 30 minutes, 15 par défaut, dans la carte « Téléphone » des paramètres.
- **Visite proposée reprise** (DC-61) : « Proposées à votre dernière visite » dans « Nouvelle visite », tant que le prospect n'est pas replanifié.
- **Préparer ma visite** (DC-47) : sur le détail d'une visite, les derniers retours du prescripteur par produit, les échantillons déjà remis et le nombre de visites rapportées.
- Recette du cycle (`recette-0.5.md`) : chaque critère relié à son test ; les écarts relevés sont comblés par de nouveaux tests (ordre de la chronologie, DM et DF, portefeuille au jour de la visite, visite imprévue, conformité d'une journée d'indisponibilité, bornes du verrouillage, rayon et accord écrits par l'API, file du téléphone, écrans du portail).
- Démonstration de fin de cycle (`demonstration-0.5.md`).

### Modifié

- PRD : KPI-03, PLN-009, DSH-006, DSH-012, OFF-007, RG-054, VIS-010, SEC-004, RPT-014, NFR-002, §7.5, §14.1, §14.18 et §14.35 réécrits selon les décisions ; O-12 tranchée (17.A : la lecture des rapports reste celle de 0.5.8).

### Retiré

- « Maladie » dans le planning (devenue « indisponibilité imprévue ») et le paramètre « échéance d'approbation du planning », qui n'agissait plus (DC-51, DC-61).

### Design

Revue sur le rendu réel (téléphone 360 px, portail). Seconde revue après correction :

| Écran | Défaut observé | Correction |
|---|---|---|
| Fiche d'un établissement (portail) | Le rayon de pointage ne se voyait que dans le formulaire de modification ; la fiche ne disait pas quel seuil s'appliquait. | Ligne « Rayon de pointage » dans les coordonnées : « 300 m » ou « Distance du pays ». |

## [0.5.8] — Chronologie des rapports d'un prospect

Huitième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-011)

- Téléphone : carte « Visites précédentes » sur la fiche d'un prospect (résultat, produits et retours, résumé, suite prévue), du plus récent au plus ancien ; trois visites, puis « Voir les visites plus anciennes » ; la dernière liste reste lisible sans réseau.
- **CA1** : un délégué ne voit que ses propres rapports.
- Portail : section « Rapports de visite » dans la fiche d'un prospect, pour le superviseur, le DM, le DF et le responsable pays, chacun dans son périmètre ; jamais un brouillon d'autrui [H].
- Nouveau droit « lire les rapports » ; l'administration et le siège n'en disposent pas [H].
- Relecture du cahier des charges (`revue-exigences.md`) : 13 exigences douteuses, avec choix et recommandations, en attente de décision (O-12).
- Décision 15.A : les documents PDF restent dans le rapport.

### Design

Revue sur le rendu réel (téléphone 360 px, portail clair et sombre). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Fiche prospect (téléphone) | Le nom de la déléguée se répétait sur chacun de ses propres rapports. | Le nom n'apparaît que pour le rapport d'un autre. |
| Fiche prospect (téléphone, portail) | « Suite : Envoyer de la documentation : Reprendre… » : deux deux-points de suite. | « Suite : Envoyer de la documentation — Reprendre… ». |
| Fiche prospect (portail) | Les produits s'enchaînaient sur une ligne, avec leurs retours, difficiles à lire. | Un produit par ligne, dans une liste. |

## [0.5.7] — Soumission et retard du rapport ; pas de photo

Septième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-010, RG-032, RG-037)

- Délai rappelé sur le rapport : « À soumettre aujourd'hui avant minuit » ; passé minuit, « En retard » en orange.
- Carte « Rapports en retard » en tête de la Tournée : les rapports non soumis des jours précédents de la semaine, ouverts d'un appui.
- Soumettre sans réseau : le rapport passe en lecture (« Soumis sur le téléphone à … »), l'en-tête indique « Soumission en attente du réseau », et l'envoi part seul au retour du réseau.
- **CA1** : soumis le jour J sans réseau, reçu le jour J+1, le rapport est à l'heure. L'heure du téléphone fait foi, sauf incohérence (futur, avant la fin de la visite, horloge décalée de plus de 15 minutes) : l'heure de réception est alors retenue et l'horodatage est signalé douteux [H].
- Chaque soumission fige une version du rapport ; un envoi rejoué n'en crée pas d'autre.
- Démonstration : un rapport soumis le lendemain, en retard.

### Retiré (DC-48)

- Les photos du rapport : « Prendre une photo » et « Galerie » disparaissent ; seul « Joindre un PDF » reste, et le serveur refuse les images. Raison : aucun usage établi, et le risque d'y voir une ordonnance ou un patient.

### Design

Revue sur le rendu réel (téléphone 360 px). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Tournée, rapports en retard | Chaque ligne répétait « Effectuée » et la date, même pour deux rapports du même jour. | Seul l'état du rapport s'affiche ; la date n'apparaît qu'une fois par jour. |
| Rapport, délai | « À soumettre aujourd'hui avant minuit » flottait seul entre l'en-tête et l'objectif. | Placé juste sous le nom du prospect et le lieu. |
| Rapport soumis sans réseau | L'en-tête disait encore « Enregistré à … », comme si tout était parti. | « Soumission en attente du réseau ». |

## [0.5.6] — Brouillon automatique du rapport

Sixième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-009)

- Le rapport s'enregistre tout seul, sans bouton : sur le téléphone à chaque saisie, puis au serveur dès que la frappe s'arrête. L'en-tête indique « Enregistré à … » ou « Gardé sur le téléphone à … ».
- Sans réseau, la saisie attend dans la file d'envoi et part seule au retour du réseau ; un rapport déjà ouvert (ou préparé à la fin de la visite) se complète sans réseau.
- **CA1** : le brouillon survit à la fermeture de l'application et au redémarrage du téléphone ; « Brouillon repris » signale une saisie retrouvée.
- Les photos et documents en attente sont gardés dans l'espace de l'application et effacés une fois envoyés.

### Retiré

- Le bouton « Enregistrer le brouillon ».

### Design

Revue sur le rendu réel (téléphone 360 px). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport, saisie | L'état « Enregistré à … » n'apparaissait qu'en bas de page, sous le bouton « Soumettre » : invisible pendant la frappe. | Il s'affiche aussi sous le titre de l'écran, toujours visible. |
| Rapport rouvert sans réseau | L'en-tête ne disait plus qu'une saisie attendait d'être envoyée. | « Gardé sur le téléphone à … » est repris de l'heure de la dernière saisie. |

## [0.5.5] — Pièces jointes du rapport

Cinquième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-007)

- Section « Photos et documents » du rapport : « Prendre une photo », « Galerie », « Document PDF » ; aperçu des photos, taille, « Retirer ».
- **CA1** : 10 Mo au plus par fichier, 3 par rapport [H] ; photos compressées à la prise ; type reconnu au contenu (JPEG, PNG, HEIC, PDF), pas au nom.
- **CA2** : la pièce ne se lit que par qui voit le rapport, par une adresse contrôlée, jamais mise en cache.
- Sans réseau : la pièce attend sur le téléphone (« En attente du réseau ») et part seule au retour du réseau, même si le rapport a été soumis entre-temps, dès lors qu'elle a été prise avant.
- Une pièce retirée est archivée, jamais effacée (RG-005).
- Décision DC-47 inscrite au PRD (§14.35) : faire mieux que l'outil actuel.
- Démonstration : une fiche PDF fictive jointe à un rapport passé.

### Design

Revue sur le rendu réel (téléphone 360 px). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport, photos (version web) | La photo choisie partait dans un format que le serveur refusait (« Données invalides »). | Le fichier est lu avant l'envoi dans un navigateur ; sur le téléphone, son adresse locale suffit. |
| Rapport, photos | « Choisir une photo » passait sur deux lignes à côté du bouton PDF. | Libellés courts : « Galerie », « Document PDF ». |

## [0.5.4] — Prochaine action

Quatrième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-006)

- La prochaine action a un **type** (nouvelle liste « Types de prochaine action » du pays) et une précision, obligatoires pour soumettre ; une **échéance** facultative (1 semaine, 2 semaines, 1 mois après la visite) ; « Proposer une nouvelle visite ».
- **CA1** : à la visite suivante du même prospect, le délégué retrouve l'action notée la dernière fois, sur le détail de la visite (même sans réseau) et en tête du rapport ; jamais celle d'un collègue, jamais un brouillon.
- Démonstration : prochaines actions typées, avec échéance, sur les rapports passés.

### Design

Revue sur le rendu réel (téléphone 360 px). Seconde revue après correction :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport, prochaine action | « Précisez l'action » et « Échéance » se collaient aux choix au-dessus. | Un espace sépare chaque bloc. |

## [0.5.3] — Produits présentés, retour du prescripteur, échantillons et cadeaux

Troisième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté — produits présentés et retour du prescripteur (RPT-004)

- Chaque produit présenté reçoit le retour du prescripteur : « Ne prescrit pas », « Peu », « Prescrit », « Très bien ». Il est obligatoire pour soumettre.
- **CA1** : l'ordre de présentation est conservé jusque dans le rapport soumis ; un produit ne se présente qu'une fois.
- **CA2** : seuls les produits du portefeuille du réseau sont proposés ; un produit « autre », saisi en clair, si le pays l'autorise (nouveau paramètre, désactivé par défaut).

### Ajouté — échantillons et cadeaux remis (RPT-005, RG-038)

- Section facultative : échantillons des produits présentés, cadeaux de la nouvelle liste « Articles promotionnels » du pays ; quantité réglée par « − » et « + ».
- **CA1** : aucune notion de stock, de solde ni de dotation.

### Modifié

- API : `produits` du rapport devient `presentations` (avec le retour) ; les rapports existants sont repris sans retour.
- Démonstration : retours variés et remises sur les rapports passés.

### Design

Revue sur le rendu réel (téléphone 360 px). Seconde revue après correction :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport, retour du prescripteur | Les quatre choix passaient sur deux lignes pour chaque produit : trois produits occupaient un écran entier. | Une rangée de quatre cases de même largeur, libellés courts (le libellé complet reste lu par le lecteur d'écran). |

## [0.5.2] — Objectif prévu et résultat obtenu

Deuxième jalon du cycle 0.5 « Rapports de visite ».

### Ajouté (RPT-003)

- **CA1** : le rapport s'ouvre sur l'objectif prévu de la visite, dans un cadre en tête ; il est relevé à l'ouverture du rapport et ne bouge plus.
- Visite imprévue : sa justification s'affiche à la place de l'objectif.
- « Résultat obtenu » juste sous l'objectif : le choix de la liste, et une précision facultative (« Précisez ce qui a été obtenu »).
- Le rapport soumis se lit dans le même ordre : objectif, résultat, produits, résumé, prochaine action, champs du pays.
- Démonstration : les rapports passés portent leur objectif et, pour certains, une précision du résultat.

### Design

Revue sur le rendu réel (téléphone 360 px clair, 390 px sombre). Seconde revue après correction :

| Écran | Défaut observé | Correction |
|---|---|---|
| Rapport, résultat obtenu | Le champ « Précisez ce qui a été obtenu » se collait aux choix du résultat. | Un espace le sépare des choix. |

## [0.5.1] — Rapport de visite : socle et champs par pays

Premier jalon du cycle 0.5 « Rapports de visite ».

### Ajouté — rapport de visite (RPT-001, RPT-002, RG-030, RG-033)

- Après une visite effectuée, « Rédiger le rapport » sur le téléphone : sous l'annonce de la visite terminée et sous la visite elle-même ; « Reprendre le rapport » pour un brouillon, « Voir le rapport » une fois soumis.
- **RPT-001 CA1** : tant que le rapport n'est pas soumis, la visite se lit « Rapport à rédiger » ou « Rapport en brouillon » dans le programme du jour.
- Socle : produits présentés touchés dans l'ordre de présentation (rang affiché), résultat de la visite, résumé de l'échange, prochaine action. Seuls les produits du portefeuille du réseau de la visite, au jour de la visite, sont proposés ; un champ les filtre au-delà de 8.
- **RPT-002 CA1** : incomplet, il ne se soumet pas ; l'écran dit ce qui manque. Soumis, il se lit sans se modifier.
- « Enregistrer le brouillon » à tout moment ; en 0.5.1 le rapport s'écrit avec du réseau (brouillon sur le téléphone en 0.5.6, soumission hors connexion en 0.5.7).
- Nouvelle liste de référence « Résultats de visite » [H] : objectif atteint, partiellement atteint, non atteint, à relancer.

### Ajouté — champs du rapport par pays (RPT-008)

- Portail, « Paramètres » : carte « Champs du rapport » ; texte libre, nombre, liste de choix (au moins deux), oui / non ; obligatoires ou facultatifs ; modifier, retirer.
- **CA1** : un rapport garde les champs de son ouverture ; un changement ne vaut que pour les rapports suivants.

### Démonstration

- Portefeuilles en place depuis un trimestre ; champ « Patients concernés par semaine » au Sénégal et au Togo ; rapports soumis pour les visites passées, un brouillon, un rapport attendu.

### Design

Revue sur le rendu réel (téléphone 360 px clair et 390 px sombre ; portail 1440 px et 390 px). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Programme du jour | Après « Terminer la visite », la visite quittait la carte : rien ne menait au rapport. | « Rédiger le rapport » sous l'annonce de la visite terminée ; il disparaît une fois le rapport soumis. |
| Rapport, produits | Un portefeuille de 24 produits repoussait tout le formulaire. | Champ « Chercher un produit » au-delà de 8 ; les produits choisis restent visibles. |
| Rapport soumis | Le résumé, aligné à droite à côté de son libellé, se lisait mal. | Libellé au-dessus, texte sur toute la largeur. |

## [0.4.9] — Contrôles de conformité, recette et démonstration du cycle 0.4

Dernier jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — contrôles de conformité (VIS-010, RG-029)

- Chaque journée du délégué est classée « conforme » ou « à vérifier » par le serveur, à chaque réception et à chaque consultation ; rien n'est bloqué.
- Écarts relevés : hors de la plage horaire, pointage trop loin du lieu, visite trop courte ou trop longue, visite imprévue, visite restée prévue (à justifier), visites sans GPS au-delà de la tolérance.
- **CA1** : une journée sans écart est « conforme » ; la journée du jour reste « en cours » tant qu'elle n'est pas finie.
- **CA2** : seuils du pays dans « Paramètres » ; nouveau paramètre « Durée d'une visite » (3 à 180 minutes par défaut).
- **CA3** : recalculée tant que la journée n'est pas validée ; figée ensuite avec les seuils appliqués (la validation arrive au cycle 0.6).
- Portail : carte « Conformité des journées » sur le planning consulté par le superviseur, écart par écart.

### Corrigé (recette du cycle)

- Un report dans la semaine commencée (VIS-007 CA2) laissait la modification « fermée » : absente de la file du superviseur et impossible à approuver. Une modification d'un planning déjà approuvé n'est plus fermée ; le superviseur la trouve dans « Plannings à valider » et la décide.
- « 1 visite sans GPS » au singulier.

### Recette et démonstration

- `recette-0.4.md` : chaque critère du cycle relié à son test ; `demonstration-0.4.md` : scénario de fin de cycle.

### Design

Revue sur le rendu réel du portail (bureau 1440 px, téléphone 390 px, sombre) : semaine en cours et semaine passée du délégué. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Conformité, téléphone | Le résumé se tassait à côté du titre de la carte. | Le résumé passe sous le titre. |
| Conformité, journée du jour | La journée en cours se lisait « Conforme » alors qu'elle n'était pas finie. | « Journée en cours : aucun écart pour l'instant », en gris. |

## [0.4.8] — Visite imprévue

Huitième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — visite imprévue (VIS-008, RG-027)

- « Visite imprévue » sous le programme du jour : prospect (liste cible ou recherche), lieu, justification ; la visite démarre aussitôt, au jour réel, avec l'heure et la position du moment.
- **CA1** : sans justification, elle ne démarre pas.
- **CA2** : marquée « Imprévue » sur le téléphone (programme, semaine, détail avec la justification) et sur la semaine du planning au portail.
- Sans approbation : elle n'entre ni dans les versions, ni dans les contrôles, ni dans le kilométrage estimé, ni dans le compte des visites planifiées.
- Sans réseau, elle démarre quand même et attend dans la file.

### Modifié

- « Prochaine visite » : la visite en cours la plus récemment démarrée passe en tête.

### Design

Revue sur le rendu réel (téléphone 360 px ; portail 1440 px, superviseur). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Portail, semaine du planning | La visite imprévue affichait « À compléter : Objectif » et comptait parmi les visites planifiées. | Rien à compléter ; « 7 visites planifiées », l'imprévue à part avec son repère. |
| Programme du jour | Le panneau de la visite imprévue se collait à la liste du jour. | Un filet le détache, comme une nouvelle section. |
| Programme du jour | Deux visites en cours : la plus ancienne restait « Prochaine visite ». | La dernière démarrée passe en tête. |

## [0.4.7] — Reporter une visite

Septième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — reporter une visite (VIS-007)

- « Reporter » sur une visite prévue : motif de la liste du pays, nouveau jour parmi les prochains jours ouvrés, heure (reprise de la visite), commentaire facultatif.
- **CA1** : la nouvelle visite reprend prospect, lieu, réseau et objectif et référence la visite d'origine ; la visite reportée indique son nouveau jour.
- **CA2** : dans la semaine approuvée, le nouveau jour est une modification soumise au superviseur (« Le nouveau jour attend l'accord de votre superviseur ») ; dans une semaine en préparation, la visite s'ajoute au planning.
- Sans réseau, le report attend dans la file ; rejoué, il ne crée qu'une nouvelle visite.

### Corrigé

- Une modification soumise faisait disparaître les visites « à justifier » et l'historique de la semaine : la version approuvée reste la référence.

### Design

Revue sur le rendu réel au téléphone (360 px clair, 390 px sombre) : boutons d'écart, panneau de report, annonce, détail. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Programme du jour | « Reportée · Rendez-vous reporté » ne disait pas quand. | « Reportée au jeu. 8 oct. · 10:30 ». |
| Programme du jour | Trois écarts sur une ligne ne tiennent pas à 360 px. | Deux par ligne : « Prospect absent », « Reporter », puis « Annuler la visite ». |
| Accueil | Après un report dans la semaine, « À justifier » disparaissait. | Corrigé côté serveur (voir ci-dessus). |

## [0.4.6] — Annuler une visite, visite non réalisée

Sixième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — annuler une visite (VIS-006)

- « Annuler la visite » sur une visite prévue, le jour même ou à l'avance depuis son détail, ou sur une visite en cours ; motif de la liste du pays, commentaire facultatif.
- **CA1** : sans motif, impossible. Une journée passée ne s'annule plus : elle se justifie.

### Ajouté — visite non réalisée (VIS-009)

- **CA1** : une visite restée prévue après sa journée apparaît « À justifier » en tête de l'accueil (semaine en cours et précédente).
- « Justifier : non réalisée » depuis son détail, avec un motif obligatoire.
- Sans réseau, annulation et non-réalisation attendent dans la file du téléphone.

### Modifié

- Démonstration : les journées passées sont exécutées (visites effectuées, quelques écarts), une visite reste à justifier.
- Le détail d'une visite montre son statut à jour après une action sur le téléphone ; « Effectuée » en vert dans l'historique.

### Design

Revue sur le rendu réel au téléphone (360 px clair : à justifier, motif, après ; 390 px sombre : annulation). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Détail d'une visite | Le statut restait « Prévue » après la justification. | Statut lu dans le programme gardé, à jour. |
| Programme du jour | Trois grands boutons empilés sous la prochaine visite. | « Prospect absent » et « Annuler la visite » côte à côte sous « Démarrer ». |
| Annonce | Une annulation s'annonçait en vert, comme une réussite. | Ton neutre pour les écarts. |
| Dernières visites | « Effectuée » en orange, couleur d'alerte. | En vert. |

## [0.4.5] — Prospect absent

Cinquième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — prospect absent (VIS-005)

- « Prospect absent » sur une visite prévue du jour ou en cours : le délégué choisit un motif dans la liste du pays et peut ajouter un commentaire.
- **CA1** : sans motif, l'absence ne se confirme pas ; le serveur la refuse aussi.
- Sans réseau, la déclaration attend dans la file du téléphone ; la visite se lit déjà « Prospect absent ».
- Le programme annonce l'absence (« Prospect absent noté pour … : Cabinet fermé »), passe à la visite suivante et affiche « Prospect absent · motif » ; le détail montre le motif et le commentaire.

### Design

Revue sur le rendu réel au téléphone (360 px clair, 390 px sombre hors ligne) : choix du motif, après la déclaration, détail. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Programme du jour | La visite absente se lisait « Prospect absent », sans le motif. | « Prospect absent · Cabinet fermé ». |
| Détail de la visite | « Prospect absent » répété sous le statut. | « Motif de l'absence » puis le motif et le commentaire. |

## [0.4.4] — Terminer une visite

Quatrième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — terminer une visite (VIS-004)

- « Terminer la visite » sur une visite en cours : « effectuée », heure réelle de fin et position, aux mêmes règles qu'au début.
- **CA1** : la fin suit le début ; sinon, elle est refusée.
- Sans réseau, la fin attend derrière le démarrage dans la file du téléphone et les deux partent dans l'ordre.
- Le programme annonce la visite terminée (« Visite de … terminée : 09:02 – 09:27 · 25 min »), passe à la suivante et marque la visite « Effectuée ».

### Modifié — attente de la position

- L'attente de la position, au début comme à la fin, est un paramètre du pays : 1 minute par défaut (décision du 6 octobre 2026), modifiable de 10 secondes à 5 minutes dans « Paramètres ».
- Les paramètres du pays disent la fermeture de la semaine « lundi 00:00, semaine du planning ».

### Décidé — démarrage

- Plusieurs visites peuvent être en cours en même temps ; une visite démarrée sans réseau garde sa date et son heure réelles (décisions du 6 octobre 2026).

### Design

Revue sur le rendu réel au téléphone (360 px) : visite en cours, puis terminée. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Programme après la fin | La visite terminée restait « Prochaine visite ». | La suivante prend sa place ; la visite terminée est annoncée et marquée « Effectuée » en vert. |

## [0.4.3] — Démarrer une visite

Troisième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — démarrer une visite (VIS-003)

- « Démarrer la visite » sur la prochaine visite du programme, ou depuis son détail, le jour prévu : la visite passe « en cours » à l'heure réelle, avec la position du moment si le pays active la géolocalisation (RG-028).
- **CA1** : sans réseau, l'heure et la position sont prises quand même ; le démarrage attend dans la file du téléphone et part au retour du réseau, sans doublon.
- **CA2** : sans position (refus, panne, 15 s sans réponse), la visite démarre quand même, marquée « sans GPS ».
- **CA3** : « En cours depuis 09:02 · À 110 m du lieu » ; le serveur garde la distance pour les contrôles de conformité (0.4.9).
- Seule une visite du planning approuvé se démarre, le jour prévu, une seule fois ; le démarrage est inscrit au journal.

### Design

Revue sur le rendu réel au téléphone (360 px, sombre) : avec position, sans réseau, sans GPS. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Prochaine visite démarrée | « En cours » répété : étiquette sur la carte et ligne « En cours depuis … ». | L'étiquette disparaît de la carte. |
| Démarrage sans réponse à l'autorisation de position | Le bouton tournait sans rien dire, sans limite. | « Recherche de votre position… » pendant l'attente ; au plus 30 s, puis la visite démarre sans GPS. |

## [0.4.2] — Détail d'une visite et historique récent

Deuxième jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — détail d'une visite (VIS-002)

- Sous le détail d'une visite : les **coordonnées** du prospect et du lieu (un appui sur un téléphone appelle), puis les **trois dernières visites** du délégué chez ce prospect, de la plus récente.
- **CA1** : seules les visites du délégué, dans des plannings validés, entrent dans l'historique.
- Le programme du jour prépare le détail de chaque visite de la journée : il se lit sans réseau.
- Démonstration : les deux semaines précédentes du premier délégué, terminées, donnent un historique.
- Décidé le 6 octobre 2026 : sur une visite passée, seul un résultat s'affiche, jamais « Prévue ».

### Décidé — programme du jour

- La prochaine visite est la première non faite de la journée, même si son heure est passée ; le programme vit sur le téléphone (décisions du 6 octobre 2026, prd.md §14.22).

### Design

Revue sur le rendu réel au téléphone (360 px, sombre), en ligne et hors ligne. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Détail hors ligne | Deux bandeaux « Hors ligne » à la suite. | Un seul. |
| Dernières visites | « Prévue » en orange sur des visites passées : trompeur. | Seul un résultat de visite s'affiche. |

## [0.4.1] — Programme du jour

Premier jalon du cycle 0.4 « Exécution des visites ».

### Ajouté — programme du jour (VIS-001)

- Sur l'accueil du téléphone (« Tournée »), le programme du jour : les visites de la version approuvée, dans l'ordre, la **prochaine visite** en tête avec son lieu et son objectif ; un passage dit « Lieu · n prescripteurs ». Dessous, le reste de la semaine, jour par jour.
- Le délégué suit la version approuvée (RG-018) : une modification qui attend la décision du superviseur n'y entre pas ; la visite touchée reste à sa place, marquée « Modification en attente ».
- **CA1** : sans réseau, le téléphone affiche le dernier programme lu (« Hors ligne : programme tel qu'au … ») et le détail de chaque visite.
- Sans planning approuvé, le programme le dit.

### Ajouté — le planning avance avec la semaine

- Le premier jour de sa semaine, un planning approuvé passe « en cours » ; la semaine finie, « terminé » (tâche périodique, journal d'audit). La démonstration montre la semaine en cours « en cours ».

### Design

Revue sur le rendu réel au téléphone (360 et 414 px, sombre), en ligne et hors ligne, pour un délégué au planning approuvé et pour un délégué sans planning. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Programme du jour | Deux visites à la même heure, dans le même lieu, sans dire qu'elles forment un passage. | « Lieu · 2 prescripteurs », sur deux lignes au besoin. |
| Programme de la semaine | « 0 visite » pour un jour sans visite. | « Aucune visite ». |

## [0.3.9] — Fermeture de la semaine et recette du cycle

Neuvième et dernier jalon du cycle 0.3 « Validation des plannings ». Il livre les décisions du 6 octobre 2026 (prd.md §14.21) et la recette du cycle.

### Modifié — fermeture de la semaine le lundi 0 h (RG-013, PLN-008 CA1)

- Le délégué rédige le planning de sa semaine et le soumet avant le **lundi 0 h** de cette semaine, heure du pays ; l'échéance du jeudi 18 h disparaît. Le paramètre du pays s'appelle « Fermeture de la semaine ».
- Le lundi à 0 h, tout planning de la semaine qui n'est pas validé — en préparation, à réviser ou soumis — est **fermé** : plus de soumission, de décision ni de modification ; sans planning, la semaine ne se crée plus.
- Un planning validé ne se modifie plus du tout dès le lundi 0 h (PLN-015, RG-018).

### Ajouté — demande et réouverture

- Délégué (téléphone et portail) : « La semaine a commencé lundi à 0 h sans planning validé : elle est fermée », et « Demander la réouverture » ; la demande part une fois au superviseur du poste et à son remplaçant.
- Superviseur (portail) : « Semaines fermées » sous la file, avec « Réouverture demandée » ; « Rouvrir la rédaction », après confirmation, crée le planning au besoin et prévient le délégué. Un planning fermé consulté ne propose plus que la réouverture.
- La réouverture reste inscrite (date, auteur, journal d'audit) : on sait que le planning n'a pas été fait à temps. La soumission qui suit est marquée « en retard » ; le superviseur décide ensuite normalement.

### Modifié — rappels et escalade (NOT-006, RG-019)

- Le rappel du planning non soumis part le **vendredi à 9 h** et vaut jusqu'à la fermeture.
- L'alerte des plannings non approuvés arrive au DM à la fermeture, le lundi à 0 h.
- Un planning fermé n'est plus escaladé, sauf après sa réouverture ; l'escalade compte toujours 24 heures ouvrées, du lundi au vendredi sans les jours fériés.

### Recette et démonstration

- [`recette-0.3.md`](recette-0.3.md) relie chaque critère d'acceptation du cycle au test qui le prouve ; scénario : [`demonstration-0.3.md`](demonstration-0.3.md).
- Démonstration : la semaine en cours du premier délégué est validée et la suivante en préparation ; un second délégué a sa semaine suivante soumise et sa semaine en cours fermée, avec une demande de réouverture.
- Décidé le 6 octobre 2026 (prd.md §14.21) : une semaine passée ne se rouvre pas, elle s'analyse telle quelle ; le paramètre « Échéance d'approbation » est conservé.

### Design

Revue sur le rendu réel : page « Plannings à valider » du superviseur (bureau, téléphone, sombre) et sa confirmation, semaine fermée du délégué au portail et au téléphone (360 px, sombre), semaine validée qui ne se modifie plus. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Semaines fermées (portail) | La demande de réouverture se perdait au milieu des délégués sans planning. | Les demandes passent en tête, puis l'ordre alphabétique. |
| Semaine fermée du délégué (portail) | Cinq colonnes de jours vides sous le message, sans rien à y faire. | Sans planning, la semaine fermée ne montre que le message et la demande. |

## [0.3.8] — Centre de notifications, rappels et escalade

Huitième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — centre de notifications (NOT-001)

- Portail : une cloche dans la barre du haut, avec le nombre de non lues, ouvre la page **Notifications** : les 100 plus récentes, lues et non lues, avec leur date ; « Tout marquer comme lu ».
- Téléphone : « Tout voir » sur la carte de l'accueil ouvre le centre.
- **CA1** : chaque notification ouvre l'écran de l'action attendue — le planning à décider, la file, ou la semaine concernée — et passe en lue.

### Ajouté — rappel du planning non soumis (NOT-006)

- Le mercredi à 9 h, heure du pays (**CA1**), le délégué dont la semaine suivante n'est pas soumise reçoit « Votre planning de la semaine n n'est pas encore soumis : à soumettre avant le jeudi … à 18:00 ». Une seule fois ; un jour férié le reporte au jour ouvré suivant ; plus rien après l'échéance.

### Ajouté — escalade vers le DM (PLN-016, RG-019)

- **CA1** : sans décision 24 heures ouvrées après la soumission (paramètre du pays, week-end et jours fériés exclus), le DM du périmètre est notifié (« Escalade : le planning de … attend une décision depuis 24 h ouvrées ») et le trouve dans sa file : « Escaladé : sans décision de … depuis le … ».
- **CA2** : sa décision porte le mode `escalade` (« · par escalade » dans la décision et l'historique). Le superviseur garde la main jusque-là.
- Le lundi à 9 h, chaque DM apprend combien de plannings de la semaine ne sont pas approuvés dans ses réseaux.
- Tâche périodique toutes les 15 minutes (Celery beat ; service `worker` en développement), idempotente ; commande `executer_echeances`.
- Hypothèses à confirmer (prd.md §14.20) : décompte des heures ouvrées, heures du rappel et de l'alerte, une notification d'escalade par planning ; les autres rappels arrivent avec le push, les rapports et la synchronisation.

### Design

Revue sur le rendu réel : accueil et centre du portail (superviseur et délégué) en bureau, téléphone et sombre, accueil et centre du téléphone à 360 px et en sombre. Le parcours du DM (escalade) n'a pas été capturé : son compte de démonstration exige la double authentification ; il est couvert par les tests. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Centre (portail) | L'infobulle de la cloche restait affichée après le clic et couvrait « Tout marquer comme lu ». | Infobulle au survol seulement. |
| Accueil (téléphone, 360 px) | « 2 nouvelles notifications » et « Toutes les notifications » se disputaient la ligne, le titre sur deux lignes. | « Tout voir ». |

## [0.3.7] — Verrouillage et modifications après approbation

Septième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — planning approuvé verrouillé (PLN-015, RG-018)

- **CA1 — modification mineure** : changer l'heure d'une visite dans sa journée reste libre ; le planning reste approuvé. Le changement est tracé (journal d'audit, version approuvée) et le superviseur le lit : « Heure changée depuis l'approbation : Awa NDIAYE · mar. 13 : 09:00 → 10:30 ».
- **CA2 — modification majeure** : changer le jour, le prospect, le lieu, l'objectif ou la note, ajouter ou retirer une visite, déclarer une activité, crée aussitôt une version soumise, « Version n · modification après approbation », jamais en retard ; le superviseur est notifié (« … (modification, version n) »). Il voit ce qui attend sa décision (« À décider : jeu. 8 15:00 · Malick BA », retraits) et les visites concernées portent « En attente » ; les autres restent prévues selon la version approuvée.
- Un changement majeur qui ne passerait pas le contrôle final est refusé et rien ne change ; tant qu'une modification attend la décision, le planning ne change plus.
- **Verrouillage** : une journée passée ne se modifie plus, ni ne reçoit une visite déplacée.
- Au téléphone, le formulaire d'une visite dit la règle et ce que fera l'enregistrement (« Seule l'heure change : le planning reste approuvé » ou « Ce changement sera soumis à votre superviseur »), avec « Soumettre la modification » et « Retirer et soumettre » ; les journées à venir proposent encore « Ajouter une visite ». Au portail, le délégué lit son planning approuvé et apprend qu'il se modifie depuis le téléphone.
- L'historique des versions dit le motif de chacune (« Après révision », « Modification après approbation »).
- Hypothèses à confirmer (prd.md §14.19) : objectif et note comptent comme majeurs ; pas de pose depuis la liste cible ni de copie sur un planning approuvé ; modification au portail plus tard.

### Design

Revue sur le rendu réel : téléphone à 360 px et en sombre (semaine approuvée, formulaire après approbation, changement mineur puis majeur, semaine en attente de décision), portail bureau, téléphone et sombre (consultation approuvée avec heure changée, file et consultation d'une modification, colonnes de la semaine), planning du délégué au portail. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Consultation d'une modification (portail) | Ce qui attendait la décision n'apparaissait qu'en bas de page, sans dire quelles visites. | « À décider : jeu. 8 15:00 · Malick BA » et la référence, juste sous le bandeau de décision. |
| Colonnes de la semaine (portail) | « En attente d'approbation » sur deux lignes, l'icône décalée, dans une carte étroite. | « En attente », le détail en infobulle. |
| Planning du délégué (portail) | La phrase « utilisez l'application mobile » flottait entre deux cartes. | Alerte d'information en tête de page. |

## [0.3.6] — Historique et comparaison des versions

Sixième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — historique des versions (PLN-014 CA2, AUD-003)

- Dès qu'un planning a deux versions, une carte « n versions » les liste, de la plus récente : soumission, décision (« En attente », « Révision demandée », « Approuvée ») et résumé de ce qui a changé (« 1 ajoutée · 1 retirée · 1 déplacée »). Au portail, dans la consultation du superviseur et le planning du délégué ; au téléphone, par « Historique : n versions » sur la semaine.
- Chaque version s'ouvre dans son état exact au moment de sa soumission, avec qui l'a décidée, quand, en remplacement ou non, son commentaire et le nombre de remarques.
- Accès : le délégué du planning et ceux qui le décident (responsable du poste, remplaçant actif) ; les autres reçoivent « introuvable ».

### Ajouté — comparaison (PLN-014 CA1)

- Depuis la version précédente : visites ajoutées, retirées, déplacées (« lun. 5 09:00 → ven. 9 09:30 ») et modifiées (prospect, lieu, objectif, note).

### Design

Revue sur le rendu réel : consultation du superviseur au portail en bureau, téléphone et sombre (carte des versions, version 2 comparée, version 1 décidée), planning du délégué au portail, écran des versions du téléphone à 360 px et en sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Carte des versions (portail) | « Soumise le lun. 5 octobre » quand le résumé dit « Soumis le lundi 5 octobre ». | Jour en toutes lettres partout. |
| Carte des versions (portail, téléphone) | « Voir la version n » décalé à droite du texte qu'il suit. | Bouton aligné sur le texte. |
| Version ouverte (portail, téléphone) | La décision n'y figurait pas : on ne savait ni qui avait demandé la révision, ni pourquoi. | Soumission, décision (qui, quand, en remplacement), commentaire et remarques en tête. |
| Version 1 ouverte | « Première version » répété deux fois. | La comparaison ne s'affiche que s'il y a une version précédente. |
| Comparaison (téléphone) | « ven. 9 / 09:30 » coupé en fin de ligne. | Moments insécables. |

## [0.3.5] — Nouvelle version et resoumission

Cinquième jalon du cycle 0.3 « Validation des plannings ».

### Décision du 5 octobre 2026 (PLN-008 CA2)

- Une nouvelle soumission après révision n'est jamais considérée comme un retard : seul compte le retard de la première soumission. Pendant la révision, l'échéance passée n'est plus signalée ; le délégué lit « À renvoyer après correction : pas de retard compté », au téléphone comme au portail.

### Ajouté — nouvelle version (PLN-014)

- Le délégué corrige et soumet « la version 2 » (bouton « Soumettre la version n ») ; la version figée suivante revient dans la file du superviseur.
- File et consultation : « Version 2 · après révision ». La consultation rappelle la révision précédente — commentaire et chaque remarque avec sa visite (ou « visite retirée depuis ») — pour vérifier que chaque point a été repris avant de décider.
- La décision montrée au délégué est celle de la version en cours : une fois la version 2 soumise, l'ancienne révision ne s'affiche plus comme décision.

### Ajouté — notification « Planning soumis » (prd.md §18)

- Chaque soumission notifie le superviseur du poste — ou le DM d'un superviseur-visiteur — et son remplaçant actif : « Planning de … à décider : semaine n (version 2) », qui ouvre le planning à décider.

### Design

Revue sur le rendu réel : portail bureau, téléphone et sombre (accueil du superviseur, file, version 2 avec la révision précédente), planning du délégué au portail avant et après resoumission, accueil et semaine du téléphone à 360 px et en sombre. Seconde revue après correction :

| Écran | Défaut observé | Correction |
|---|---|---|
| Planning du délégué (portail, téléphone) | Après la resoumission, la ligne « Décision » disait encore « Révision demandée… » (décision sur la version 1). | Seule la décision sur la version en cours s'affiche. |

## [0.3.4] — Révision motivée et remplaçant daté

Quatrième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — révision motivée (PLN-013, RG-017)

- Dans la consultation d'un planning soumis, **Demander une révision** à côté d'« Approuver ». Le responsable peut viser une visite précise : il l'ouvre et écrit une « Remarque pour la révision », qui s'affiche aussitôt sur la carte de la visite et sera jointe à la demande.
- **CA1** : une demande sans commentaire est refusée ; le commentaire général est facultatif seulement si des remarques visent des visites, et chaque remarque a un texte.
- **CA2** : le délégué est notifié (« Révision demandée sur votre planning de la semaine n »), lit le commentaire en tête de sa semaine (téléphone et portail) et chaque remarque sur la visite concernée (« Remarque : … ») ; le planning redevient modifiable et sa nouvelle soumission fige la version 2, qui revient dans la file.
- Le planning décidé affiche « Révision demandée le … par … · version n » avec le commentaire.

### Ajouté — remplaçant daté (ORG-013, RG-020)

- Page **Remplaçants** (portail) : désigner un remplaçant du … au … inclus, voir les remplacements en cours et à venir, y mettre fin (ou le retirer s'il n'a pas commencé). Le superviseur désigne pour lui-même, le DM pour les superviseurs de ses réseaux, l'administrateur pays pour tous (prd.md §6.3) ; le remplaçant est un autre superviseur du pays ; deux remplacements d'un même superviseur ne se chevauchent pas.
- **CA1** : pendant la période, le remplaçant trouve les plannings du superviseur remplacé dans sa file (« Pour … »), les consulte et décide.
- **CA2** : toute décision porte le mode `remplacement` et l'identité du remplaçant (« … · en remplacement »).
- **CA3** : à la fin de la période — ou dès qu'on y met fin — l'accès cesse.
- Le remplaçant est notifié : « Vous remplacez … du … au … ».

### Ajouté — notifications au portail

- Les notifications non lues s'affichent sur l'accueil du portail (délégué : approbation, révision ; superviseur : remplacement attribué) ; les toucher mène à la semaine ou à la file et les marque lues.

### Design

Revue sur le rendu réel : portail téléphone, bureau et sombre (remplaçants, remarque sur une visite, consultation, dialogue de révision, après envoi, désignation), vue du délégué au portail, accueil et semaine du téléphone à 360 px et en sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Consultation | La remarque s'affichait en entier, en gras bleu, sur la carte de la visite : la colonne s'allongeait. | Texte normal, limité à trois lignes ; le détail la montre en entier. |
| Planning du délégué (portail) | La révision se disait deux fois : bandeau en tête et ligne « Décision ». | La ligne « Décision » se tait pendant la révision. |
| Consultation (téléphone) | « Approuver » passé à la ligne restait décalé sous « Demander une révision ». | Espacement en grille, boutons alignés. |

## [0.3.3] — Approbation des plannings

Troisième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — approbation (PLN-012)

- Dans la consultation d'un planning soumis, un bandeau « En attente de votre décision » et le bouton **Approuver**. La confirmation rappelle que le planning devient la référence des visites de la semaine, que le délégué est notifié, et combien de points signalés restent à « À vérifier ». Après l'approbation, la page passe au planning suivant de la file, ou revient à la file vide.
- **CA1** : l'approbation fige la version. Chaque soumission crée désormais une version numérotée et figée (RG-037) : visites, passages et activités tels que soumis ; la décision s'y inscrit avec son auteur, sa date et son mode. Le planning approuvé ne se modifie plus (les modifications après approbation arrivent en 0.3.7). La consultation affiche « Approuvé le … par … · version n ».
- Un point bloquant apparu depuis la soumission (un jour devenu férié, par exemple) empêche l'approbation, avec le détail.
- **CA2** : le délégué est notifié. Sur l'accueil du téléphone : « Votre planning de la semaine n est approuvé » ; la toucher ouvre la semaine et la marque lue. Sa semaine dit « Approuvé par … le … », au téléphone comme sur le portail.

### Ajouté — superviseur-visiteur (PLN-017)

- Le planning d'un superviseur qui occupe un poste de délégué va au DM auquel ce poste est rattaché (RG-023) : il apparaît dans les « Plannings à valider » du DM, jamais dans la file du superviseur lui-même (**CA1**), et le DM l'approuve.
- Matrice (prd.md §6.3) : « Approuver ou faire réviser un planning » ouvert au DM ; nouvelle ligne « Recevoir et lire ses notifications », chacun les siennes.

### Ajouté — centre de notifications (première brique)

- Module `notifications` : une notification par événement et par destinataire, écrite dans la même transaction, isolée par pays, sans texte stocké (composé dans la langue de l'utilisateur, sans donnée de santé). Le push, les préférences et les autres événements (prd.md §18) arrivent en 0.3.8.

### Démonstration

- La semaine soumise du premier délégué a sa version figée ; son superviseur peut l'approuver, et le délégué trouve la notification sur l'accueil du téléphone.

### Design

Revue sur le rendu réel : portail téléphone, bureau et sombre (décision à prendre, confirmation, après approbation, planning décidé), vue du délégué au portail, accueil et semaine du téléphone à 360 px et en sombre. Seconde et troisième revues après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| File vide | « 0 planning en attente, du plus ancien au plus récent » en sous-titre, au-dessus du message de file vide. | Sous-titre masqué quand la file est vide. |
| Confirmation | Rien ne rappelait les points signalés au moment de décider, surtout au téléphone où « À vérifier » est sous le pli. | Ligne « n points signalés restent à « À vérifier » ». |
| Confirmation | Le nombre comptait chaque jour sous le minimum (« 7 points ») alors que « À vérifier » en montre 3 lignes. | Compté comme les lignes affichées. |
| Confirmation | « « À vérifier » » se coupait entre le guillemet et le mot. | Espaces insécables dans les guillemets. |
| Accueil (téléphone) | Le titre de la carte touchait le trait de la première notification. | Marge sous le titre. |

## [0.3.2] — Consultation d'un planning soumis

Deuxième jalon du cycle 0.3 « Validation des plannings ».

### Ajouté — consultation par le superviseur (PLN-011 CA2, PLN-004 CA2)

- Dans « Plannings à valider », chaque carte s'ouvre (« Consulter la semaine ») sur le planning soumis :
  - le délégué, son poste, la semaine ; « File des plannings » pour revenir, « Suivant : … » pour passer au planning suivant de la file ;
  - le résumé : statut, soumission (et « En retard »), visites, kilométrage estimé (PLN-010) ;
  - « À vérifier » : les contrôles, dont les seuils du jour (un seuil dépassé apparaît au superviseur, PLN-004 CA2) ;
  - les activités de la semaine avec leur explication et qui les a demandées (PLN-018) ;
  - la semaine, un jour par colonne, comme le délégué l'a préparée ; chaque visite dit le nombre de ses alertes (« 2 alertes ») ;
  - le détail d'une visite : prospect (spécialité, potentiel), lieu, passage, objectif, réseau, note et chacune de ses alertes.
- Rien ne s'y modifie. Un planning en préparation, ou d'un délégué qu'il ne supervise pas cette semaine-là, lui est introuvable. La décision (approuver, demander une révision) arrive en 0.3.3 et 0.3.4.

### Modifié

- Renommage technique : le modèle `Absence` devient `Activite`, comme dans l'interface depuis 0.3.1. Routes `plannings/{id}/activites/`, `activites/{id}/`, `activites/{id}/retirer/` ; codes d'erreur `activite_chevauchement`, `activite_avec_visites` ; audit `activite.declaration`, `activite.modification`, `activite.retrait`. Le vocabulaire métier « absence » (congé, maladie…) reste dans les textes.
- Les textes des contrôles ne s'adressent plus au délégué (« prospect hors liste cible », « lieu hors secteur ») : le superviseur les lit aussi.

### Démonstration

- La semaine soumise du premier délégué porte une visite le jeudi chez un prospect hors liste cible, dans un autre secteur, sans activité déclarée : le superviseur la repère dans la file puis sur la visite.

### Design

Revue sur le rendu réel : portail bureau, tablette, téléphone et sombre (file, consultation, détail d'une visite), plus la vue du délégué après le partage des composants. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| File (toutes tailles) | La carte rendue cliquable centrait son contenu, laissant une marge vide à gauche. | Grille pleine largeur, texte aligné à gauche. |
| File | Rien ne disait que la carte s'ouvre, notamment au toucher. | « Consulter la semaine » et un chevron en pied de carte. |
| Consultation | L'explication d'une activité apparaissait deux fois (carte des activités et colonne du jour). | La colonne ne garde que la ligne de l'activité ; l'explication est dans la carte. |
| Consultation | La démonstration n'avait aucune alerte sur une visite : la nouveauté ne se voyait pas. | Visite hors liste cible ajoutée à la démonstration. |
| Contrôles | « hors de votre liste cible » se lisait faux pour le superviseur. | Textes neutres, pour le délégué comme pour le superviseur. |

## [0.3.1] — Activités connexes et file des plannings en attente

Premier jalon du cycle 0.3 « Validation des plannings ». Décisions du 5 octobre 2026 (prd.md §14.17).

### Ajouté — activités connexes (PLN-018)

- L'activité principale et obligatoire du délégué reste la visite ; les cas spéciaux se déclarent dans le planning, sur la journée ou une demi-journée, sous le nom d'**activités** :
  - **absences, sans visite** : congé, maladie, formation, réunion, autre (comme avant : elles réduisent l'objectif du jour ; une journée entière ne reçoit pas de visite) ;
  - **avec visites** : **commando**, **déplacement** (« justifié par moi » ou « demandé par mon superviseur »), **accompagnement du superviseur**.
- **CA1** : une activité avec visites exige une explication (« où, avec qui, pourquoi ») ; les visites de sa journée hors secteur ou hors liste cible ne sont plus signalées comme anomalies : le superviseur lit l'activité et son explication.
- **CA2** : une activité avec visites ne réduit pas l'objectif du jour et laisse ajouter des visites ; matin et après-midi d'absence valent toujours une journée.
- Téléphone : le formulaire sépare « Absence, sans visite » et « Activité avec visites » ; la journée affiche l'activité comme une ligne de travail, avec son icône, son explication et « Demandé par le superviseur ». Portail : la colonne du jour montre l'explication.

### Ajouté — file des plannings en attente (PLN-011)

- **Plannings à valider** (portail, superviseur) : les plannings soumis de son équipe — postes qui lui sont rattachés cette semaine-là — du plus ancien au plus récent (**CA1**), avec, pour chacun :
  - le délégué, son poste, la semaine, le nombre de visites ;
  - « En attente depuis n jours », la date de soumission, « En retard » le cas échéant ;
  - les alertes résumées (sous le minimum, au-dessus du maximum, hors liste cible, hors secteur, prospects A oubliés) ;
  - les activités et leur explication.
- Droit `plannings.valider` (superviseur). Son propre planning n'entre pas dans sa file (il ira à son DM, PLN-017, 0.3.3). Consultation détaillée et décision : 0.3.2 et 0.3.3.

### Décisions consignées

- Géolocalisation (cycle 0.4) : position de référence d'un établissement proposée par le médian de ses trois premières visites pointées, validée par l'administrateur pays ; carte des visites pointées de la journée pour le superviseur, avec la distance de chacune ; pas de suivi en continu.
- Évaluation des délégués (cycle 0.7, DSH-012) : seuils Excellent 60, Bon 40, À consolider 15.

### Démonstration

- La semaine soumise du premier délégué porte une matinée d'accompagnement du superviseur ; son superviseur la trouve dans « Plannings à valider ».

### Design

Revue sur le rendu réel : mobile à 360 px et à 390 px en thème sombre (formulaire, déplacement demandé par le superviseur, journée), portail bureau, tablette, téléphone et sombre (file du superviseur). Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Formulaire d'activité (téléphone) | Quatre lignes d'aide avant le premier choix | Deux phrases ; le détail est porté par les groupes |
| Formulaire d'activité | Groupe « Avec visites » ambigu | « Activité avec visites », à côté de « Absence, sans visite » |
| Plannings à valider | Rien ne disait depuis quand un planning attend | « En attente depuis n jours », au-dessus de la date de soumission |

## [0.2.9] — Stabilisation et démonstration du cycle 0.2

Neuvième et dernier jalon du cycle 0.2 « Planning ».

### Recette du cycle

- **Matrice de recette** [`recette-0.2.md`](recette-0.2.md) : chaque critère d'acceptation des 11 exigences du cycle (ORG-012, PLN-001 à PLN-010), plus ORG-007 CA1 reporté du cycle 0.0, est relié au test qui le prouve. Aucun critère non couvert ; trois partiels attendent la validation des plannings (0.3) et les rapports (0.5).
- **Trous comblés** :
  - PLN-002 CA1 : le refus de soumission donne désormais les champs manquants de chaque visite (et la fiche ou l'heure en cause pour les autres points) ; l'ancienne garde, que la soumission n'appelait pas, est retirée ;
  - PLN-004 CA1 et CA2 : prouvés par la route de soumission elle-même ;
  - analyse d'accessibilité (WCAG 2.1 AA) de la page Planning et du dialogue de soumission.

### Corrigé — revue du code du cycle

- **Jour devenu férié ou d'absence** (PLN-001 CA2, RG-022) : une visite posée avant l'annonce d'un jour férié, ou d'une absence toute la journée, bloque désormais la soumission (« à déplacer »). Elle passait sans rien dire.
- **Matin et après-midi d'absence** valent une journée entière : le jour ne reçoit plus de visite, et la seconde demi-journée ne se déclare pas sur un jour qui en a.
- **Commandes concurrentes** : chaque commande relit le statut du planning sous verrou. Une soumission ne laisse plus entrer une visite rejouée par le téléphone au même moment, et un double clic sur « Reprendre la semaine précédente » ne duplique plus les visites (le bouton du portail attend aussi la réponse).
- **File d'attente du téléphone** (PLN-007) : un seul rejeu à la fois ; un envoi mis en attente pendant un rejeu n'est plus écrasé, et deux rejeux simultanés n'envoient plus la même visite deux fois.
- **Saisie interrompue** : elle ne se reprend plus si la visite qu'elle modifiait a été retirée entre-temps (elle en recréait une), ou si le planning n'est plus modifiable.
- **Heure du pays** : l'échéance et la date de soumission s'affichent dans le fuseau du pays, quel que soit le réglage de l'appareil.
- **Journée et détail hors ligne** (PLN-007) : sans réseau, la vue d'une journée et le détail d'une visite affichent la semaine gardée sur le téléphone, avec le bandeau « Hors ligne : semaine telle qu'au … » ; un refus du serveur, lui, reste affiché tel quel. Vérifié sur le rendu réel, réseau coupé, à 360 px et à 390 px en thème sombre.
- **Portail** :
  - la reprise annonce les visites vraiment reprises et les jours sautés (elle comptait aussi les visites ignorées) ;
  - le message de soumission suit la réponse du serveur, pas l'horloge du navigateur.
- **Contrôles** : prospect et lieu inactifs ensemble se disent chacun (« Fiche du prospect… », « Fiche du lieu… ») ; un prospect A ciblé par deux postes n'est nommé qu'une fois.
- **Poser depuis la liste cible** : le lieu « à valider » créé par un autre n'est plus proposé comme lieu principal.
- **Traçabilité** : l'ordre de la journée et les passages gardent la version et le journal des changements de chaque visite (support de la synchronisation, cycle 0.8) ; les modifications de visite et d'absence sont auditées.

### Décisions consignées (5 octobre 2026)

- Le délégué planifie et visite du lundi au vendredi sur son poste ; l'occupation se lit au lundi (prd.md §14.16).
- Les visites sont l'activité principale et obligatoire ; cas spéciaux (congés, maladie, fériés, commandos, déplacements justifiés ou demandés par le superviseur) : **activités connexes**, proposées pour 0.3.1 (prd.md §14.17).
- Évaluation hebdomadaire des délégués par un score composite pondéré : nouvelle exigence DSH-012 (cycle 0.7, prd.md §14.18).

### Démonstration (DEM-001)

- La base de démonstration raconte le cycle : la **semaine en cours** du premier délégué est déjà **soumise à temps**, la **suivante** est **en préparation** (une visite à compléter, un passage, une demi-journée de formation), avec son échéance à venir.
- **Accueil du délégué** : la carte « Ma semaine » (portail et téléphone) dit où en sont cette semaine et la suivante, avec l'échéance, et ouvre le planning. Elle remplace le texte « La préparation du planning arrive en version 0.2.1 ».
- **Scénario de fin de cycle** : [`demonstration-0.2.md`](demonstration-0.2.md).
- L'accueil annonce « Cycle 0.2 terminé » et le cycle 0.3 « Validation des plannings ».

### Design

Revue sur le rendu réel de la démonstration : mobile à 360 px et à 390 px en thème sombre, portail bureau, tablette, téléphone et sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Accueil du délégué (portail) | « La préparation du planning arrive en version 0.2.1 » : texte resté de l'avant-cycle | Carte « Ma semaine » : état des deux semaines, échéance, « Ouvrir le planning » |
| Accueil du délégué (téléphone) | Rien sur le planning, seulement « Tournée : prochainement » | Même carte, en tête ; chaque ligne ouvre sa semaine |
| Semaine de démonstration | La semaine préparée était déjà en retard le jour même | Semaine en cours soumise à temps, suivante à préparer avant jeudi |

## [0.2.8] — Soumission du planning, marquage en retard, builds de test

Huitième jalon du cycle 0.2 « Planning ».

### Ajouté — soumission (PLN-008, ORG-007, RG-013, RG-016)

- **Échéance** affichée sur le planning en préparation : « À soumettre avant le jeudi 8 octobre à 18:00 », puis « Échéance passée : … ». Elle vient du paramètre pays (jeudi 18 h par défaut), à l'heure du pays.
- **Soumettre le planning** : en fin de semaine sur le téléphone, dans le résumé de la semaine sur le portail, toujours après une confirmation (« Vous ne pourrez plus le modifier »). Le serveur refait le contrôle final :
  - poste sans superviseur rattaché cette semaine : refus, avec un message qui dit de prévenir l'administrateur pays (**ORG-007 CA1**) ;
  - planning sans visite : refus, sauf une semaine entièrement fériée ou d'absence ;
  - points bloquants (RG-015) : refus avec leur liste. Tant qu'il en reste, le téléphone remplace le bouton par « Ouvrir la visite à corriger » ; le portail grise le bouton et renvoie à « À vérifier ».
- **En retard** (**CA1**) : après l'échéance, la soumission est acceptée et marquée « En retard ». Le planning affiche « Soumis le lundi 5 octobre à 12:24 · En retard ». Le signalement « Échéance de soumission dépassée » devient « Soumis après l'échéance » pour le superviseur.
- La soumission est auditée ; elle demande le réseau (rien ne part en file d'attente).

### Ajouté — builds de test Android et iOS

- `mobile/eas.json` : profils `apercu` (`.apk`, iPhone déclarés), `simulateur` (simulateur iOS) et `recette` (TestFlight, piste de test interne de Google Play).
- Workflow manuel « Builds de test mobiles » (onglet Actions), avec le secret `EXPO_TOKEN` et la variable `EAS_PROJECT_ID`.
- README, « Builds de test » : les comptes à ouvrir et les commandes. **Aucun build n'a encore été produit** : il faut les comptes Expo, Apple Developer et Google Play du titulaire. La configuration est validée par `@expo/eas-json` et `expo config`.

### Architecture

- `Planning.soumis_le`, `Planning.en_retard` (migration 0007) ; `services.echeance`, `services.soumettre` ; route `POST plannings/{id}/soumettre/` ; `echeance` dans le planning ; codes `sans_superviseur`, `planning_vide` ; signalements `echeance_depassee`, `soumis_en_retard`.
- Seuls les plannings en préparation ou à réviser se soumettent ; la modification d'un planning approuvé reste au cycle 0.3.
- Mobile : `src/Soumission.tsx` ; `Ecran` accepte une référence de défilement.

### Design

Revue sur le rendu réel avec la démonstration (semaine bloquée, puis complétée et soumise après l'échéance) : mobile à 360 px et à 390 px en thème sombre, portail bureau, tablette, téléphone et sombre. Seconde revue après corrections :

| Écran | Défaut observé | Correction |
|---|---|---|
| Semaine (téléphone), point bloquant | La carte de soumission renvoyait « plus haut », plusieurs écrans au-dessus | « Ouvrir la visite à corriger » ouvre la première visite concernée |
| Semaine (téléphone), après soumission | La carte disparaissait ; le message et « Soumis le … » restaient hors de vue, en haut | La page remonte en haut après la soumission |
| Planning, échéance passée | La même conséquence dite deux fois (carte Planning et « À vérifier ») | La carte Planning donne la date ; « À vérifier » dit la conséquence |

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

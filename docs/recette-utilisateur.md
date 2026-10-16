# Kit de recette utilisateur — INNOV CRM, version 0.9.8

Ce kit sert à jouer à la main les 20 scénarios de recette obligatoires (prd.md §21.1, REC-01 à REC-20). Il répond à la condition 1 de la version 1.0.0 (prd.md §21.2) : « Les scénarios REC-01 à REC-20 sont passés en préproduction et pendant le pilote ».

Il s'adresse aux personnes de l'entreprise qui joueront les scénarios : administrateur du siège, administrateur pays, superviseur, DM, délégués, responsable pays, administrateur technique. Chaque scénario dit qui le joue, avec quel matériel, quoi faire, et ce que vous devez voir.

Les libellés entre « … » sont ceux de l'écran, en français. Les « … » à l'intérieur d'un libellé remplacent un nom, une date ou un nombre.

**Règles absolues**
- Données fictives seulement. Aucun nom, téléphone ou fichier réel. Le vrai export BirdNotes n'entre jamais en préproduction avant les formalités CDP (docs/mise-a-jour.md §5).
- Aucun mot de passe dans ce kit, dans un ticket ou dans un message. Les mots de passe des comptes de test se transmettent à part, depuis le coffre de l'entreprise.
- Une capture d'écran ne montre jamais de donnée de patient.

---

## 1. Avant de commencer

### 1.1 Préparer la préproduction (administrateur technique)

1. **Installer la version.** Suivez docs/mise-a-jour.md §2, étapes 1 à 4 : CI verte, étiquette, sauvegarde vérifiée, déploiement en préproduction. `/api/health/` doit afficher la version jouée.
2. **Vérifier les services** (docs/exploitation.md §1 et §5) : API, worker, ordonnanceur, base, file. Sans worker, les rappels et escalades ne partent pas. Vous pouvez alors lancer la passe à la main : `python manage.py executer_echeances`.
3. **Remplir la base de données fictives** (jusqu'à 1.0.7 ; depuis 1.0.8 la commande est retirée et l'instance part vide, prd.md §14.81). La commande `python manage.py reinitialiser_demo --oui` existe (backend/apps/demonstration/management/commands/reinitialiser_demo.py). Attention :
   - elle **efface toute la base** ;
   - elle **refuse** de tourner si l'instance n'est pas lancée avec `ENVIRONNEMENT` égal à `developpement`, `demonstration` ou `test`. Pour la recette, lancez donc l'instance de préproduction avec `ENVIRONNEMENT=demonstration` (un bandeau « Démonstration » s'affiche alors sur chaque écran), ou utilisez une instance de recette dédiée ;
   - le mot de passe commun des comptes vient de la variable `INNOV_DEMO_MOT_DE_PASSE`, saisie sur le serveur. Sans elle, il est tiré au hasard et affiché une fois. Ne l'écrivez nulle part ailleurs que dans le coffre.
4. **Noter les comptes affichés** par la commande (un par rôle, voir §1.2). Les courriels de ces comptes finissent en `@demo.invalid` : **aucun courriel ne leur parvient**. Pour les étapes qui demandent un courriel (lien de mot de passe, REC-01, REC-19), créez un compte de test avec une boîte de test de l'entreprise.
5. **Options à vérifier, et à noter dans chaque fiche** :
   - notifications push : actives seulement si `PUSH_ACTIF=true` et les clés Apple et Google installées (docs/notifications-push.md) ;
   - Grafana : seulement s'il est installé (docs/grafana.md) ;
   - test de restauration : comptes R2 et phrase de chiffrement en place (docs/exploitation.md §8).
6. **Après la campagne** : relancez `reinitialiser_demo --oui` pour repartir d'un état propre. Les pays créés en REC-01 ne se suppriment pas : seule la réinitialisation les efface.

### 1.2 Comptes de test

`reinitialiser_demo` crée deux pays fictifs, le Sénégal (SN) et le Togo (TG, réduit). Elle affiche un compte par rôle. Tous ont le même mot de passe. Les comptes marqués `*` doivent activer la double authentification à la première connexion : prévoyez un téléphone avec une application d'authentification (Google Authenticator, Microsoft Authenticator ou équivalente).

| Nom dans ce kit | Compte affiché par la commande | Double authentification |
|---|---|---|
| Administrateur du siège | `admin_siege` | oui |
| Direction du siège | `direction_siege` | oui |
| Administrateur technique | `admin_technique` | oui |
| Responsable pays SN / TG | `responsable_pays (SN)`, `responsable_pays (TG)` | oui |
| Administrateur pays SN / TG | `admin_pays (SN)`, `admin_pays (TG)` | oui |
| DF SN | `df (SN)` | oui |
| DM SN | `dm (SN)` | oui |
| Superviseur SN | `superviseur (SN)` | non |
| Délégué A | `delegue (SN)` | non |
| Délégué B | `delegue semaine fermee (SN)` | non |

D'autres comptes fictifs existent (autres superviseurs, délégués d'autres réseaux). L'administrateur pays retrouve leur identifiant dans « Équipe » ou « Organisation ». Ils ont le même mot de passe.

Pour créer un compte de test : utilisez un nom inventé de forme prénom.nom (par exemple « Aïda Fictive », identifiant `aida.fictive`). Les identifiants génériques (« admin », « test… », un nom de rôle) sont refusés.

### 1.3 Matériel

| Matériel | Pour quels scénarios |
|---|---|
| Un ordinateur avec un navigateur récent (portail) | Tous sauf REC-20 |
| Un téléphone Android (Android 10 ou plus) avec l'application de recette installée | REC-03 à REC-08, REC-11, REC-13, REC-14, REC-17, REC-19 |
| Un iPhone (iOS 16 ou plus) avec l'application de recette installée | Au moins une fois REC-06, REC-07, REC-17 |
| Un téléphone avec une application d'authentification | Comptes marqués `*` |
| Une boîte de courriel de test de l'entreprise | REC-01, REC-19 |
| Un classeur d'organisation **fictif** (.xlsx) | REC-02 |
| Un accès serveur (administrateur technique) | REC-16, REC-17, REC-20 |

L'application de recette s'installe selon le README, « Builds de test Android et iOS ». N'utilisez pas Expo Go : sa base locale n'est pas chiffrée.

### 1.4 Jour et ordre de passage

Les données de démonstration supposent un jour ouvré. Jouez REC-06, REC-07 et REC-11 un **mardi, mercredi ou jeudi** : la semaine en cours du délégué A a des visites du lundi au jeudi.

Ordre conseillé, sur une base fraîchement réinitialisée :
1. REC-19 (langues) au fil de l'eau, REC-01, REC-02, REC-18, REC-09, REC-10 ;
2. REC-03, REC-04, REC-05 (même planning, à enchaîner) ;
3. REC-06, REC-07, REC-11 (même jour) ;
4. REC-08, REC-15, REC-12 (validation des rapports, puis lecture de l'audit) ;
5. REC-13, REC-14, REC-16 ;
6. REC-17 en dernier : il révoque un téléphone ;
7. REC-20 à part, par l'administrateur technique.

### 1.5 Règle des défauts

Un scénario **non conforme ouvre un défaut**. Consignez-le dans le tableau partagé des défauts, comme pendant le pilote (docs/pilote.md §5) :
- date ;
- qui ;
- téléphone (modèle, système) ou portail (navigateur) ;
- étapes pour le reproduire ;
- capture sans donnée de patient ;
- gravité ;
- référence de l'erreur si l'écran en affiche une (« Référence : … »).

| Gravité | Définition (docs/pilote.md §5) | Délai de correction |
|---|---|---|
| Critique | Perte ou fuite de données, blocage du travail de tous | Le jour même |
| Majeur | Un parcours essentiel bloqué pour une personne, un indicateur faux | Avant le point hebdomadaire suivant |
| Mineur | Gêne, libellé, présentation | Version suivante |

Reportez le numéro du défaut dans la ligne « Défaut n° » du scénario. Un scénario corrigé se rejoue en entier.

### 1.6 Tableau récapitulatif

« Preuve automatisée » : un test automatique couvre déjà le scénario (« oui »), une partie seulement (« partielle »), ou rien (« non »). La recette manuelle reste obligatoire dans tous les cas.

| ID | Scénario (titre court) | Rôles | Preuve automatisée | Résultat préproduction | Résultat pilote |
|---|---|---|---|---|---|
| REC-01 | Deux pays, un responsable et un administrateur chacun | Administrateur du siège | oui | | |
| REC-02 | Import d'organisation et création des objets du pays | Administrateur pays | oui | | |
| REC-03 | Semaine préparée, visite incomplète bloquée, seuil signalé | Délégué, superviseur | oui | | |
| REC-04 | Révision demandée, nouvelle version soumise | Superviseur, délégué | oui | | |
| REC-05 | Planning approuvé, deux versions dans l'historique | Superviseur, délégué | oui | | |
| REC-06 | Programme et rapport hors connexion | Délégué | partielle | | |
| REC-07 | Rapport envoyé une seule fois, même après coupure | Délégué, superviseur | oui | | |
| REC-08 | Correction sur une visite, reste validé, rapport corrigé validé | Superviseur, délégué | oui | | |
| REC-09 | Aucun accès aux données d'un autre pays | Responsables pays SN et TG | oui | | |
| REC-10 | Indicateurs consolidés du siège, descente nominative auditée | Direction du siège | oui | | |
| REC-11 | Motif obligatoire pour chaque écart, report lié | Délégué, superviseur | oui | | |
| REC-12 | Audit de chaque validation (auteur, date, mode, décision) | Administrateur pays | oui | | |
| REC-13 | Fusion automatique, homonyme en file, défusion | Délégué, administrateur pays | oui | | |
| REC-14 | Visites d'un autre réseau invisibles | Deux délégués, administrateur pays | partielle | | |
| REC-15 | Validation par lot, journée « à vérifier » en attente | Superviseur | oui | | |
| REC-16 | Escalade au DM, décision d'un remplaçant | Superviseur, DM, remplaçant | oui | | |
| REC-17 | Téléphone révoqué effacé ; 8ᵉ jour sans synchronisation | Administrateur pays, délégué | oui | | |
| REC-18 | Affectation supplémentaire, un pays à la fois, fin datée | Administrateur du siège, DF | oui | | |
| REC-19 | Interface et notifications en français et en anglais | Tous | oui | | |
| REC-20 | Restauration complète dans le délai RTO | Administrateur technique | oui | | |

---

## 2. Scénarios

Chaque fiche se lit dans l'ordre : énoncé, qui, données de départ, étapes, résultat attendu, preuve automatisée, résultat à remplir. Remplissez une ligne en préproduction, une ligne pendant le pilote.

### REC-01 — Deux pays, un responsable et un administrateur chacun

**Énoncé (prd.md §21.1)** : « L'administrateur du siège crée deux pays et affecte un responsable et un administrateur différents à chacun. »
**Exigences couvertes** : ORG-001, ORG-002.

**Qui et matériel** : l'administrateur du siège, sur le portail. Un téléphone avec l'application d'authentification. Une boîte de courriel de test pour recevoir les liens.

**Données de départ** : compte `admin_siege`. Deux codes de pays du catalogue absents de la base, par exemple CI (Côte d'Ivoire) et BJ (Bénin). Quatre personnes inventées (par exemple « Aïda Fictive », « Koffi Exemple », « Mariam Imaginaire », « Yao Fictif »).

**Étapes**
1. Connectez-vous au portail avec `admin_siege`. Activez la double authentification si le portail affiche « Protégez votre compte ».
2. Menu « Pays ». Cliquez « Ouvrir un pays ». Dans « Code ISO du pays », tapez `CI`. Cliquez « Créer ».
3. Recommencez avec `BJ`.
4. Sur la carte « Côte d'Ivoire », cliquez « Travailler sur ce pays ».
5. Menu « Équipe », « Nouveau compte ». Remplissez « Prénom », « Nom », « Identifiant », « Courriel » (boîte de test) et « Langue ». Cliquez « Créer ».
6. Ouvrez la fiche du compte. Dans « Rôles », cliquez « Attribuer un rôle », choisissez « Responsable pays », validez.
7. Créez un second compte (une autre personne). Attribuez-lui « Administrateur pays ».
8. Revenez à « Pays », « Travailler sur ce pays » sur « Bénin ». Refaites les étapes 5 à 7 avec deux autres personnes.
9. Menu « Journal d'audit » : filtrez sur la famille « Pays », puis « Rôles ».
10. Optionnel : ouvrez le lien reçu par courriel pour le responsable de CI, choisissez un mot de passe, connectez-vous.

**Résultat attendu**
- Les cartes « Côte d'Ivoire » et « Bénin » s'affichent avec l'étiquette « Actif » et « Ouvert le … ».
- Chaque pays a un responsable et un administrateur, et ce sont quatre personnes différentes.
- Sur chaque fiche, le rôle affiche « depuis le … » (date de désignation).
- Le journal montre la création des pays et l'attribution des rôles, avec l'auteur et la date.
- À l'étape 10, le responsable de CI ne voit que la Côte d'Ivoire.

**Preuve automatisée**
- `backend/apps/socle/tests/test_pays_api.py::test_un_pays_cree_apparait_actif_dans_la_liste_du_siege`
- `backend/apps/perimetre/tests/test_comptes_et_roles.py::test_le_siege_designe_un_responsable_et_garde_l_historique`
- `backend/apps/audit/tests/test_audit.py::test_le_changement_de_statut_d_un_pays_est_audite`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-02 — Import d'organisation et création des objets du pays

**Énoncé** : « L'administrateur d'un pays importe le fichier d'organisation, crée un superviseur, un délégué, un poste vacant, une zone, un secteur, un prospect et un établissement. »
**Exigences couvertes** : ORG-003 à ORG-007, ORG-014, PRP-002, PRP-003.

**Qui et matériel** : l'administrateur pays, sur le portail. Téléphone d'authentification.

**Données de départ**
- Compte : l'administrateur de CI créé en REC-01 (si sa boîte de test fonctionne), sinon `admin_pays (SN)`.
- Un classeur Excel **fictif**, feuille « ORGANISATION », colonnes : GAMME, RESEAUX, DF, DM, SUPERVISEUR, ZONE, SECTEUR / VILLE, NOM ET PRENOMS, FONCTION, PRODUITS DE LA GAMME. Trois à cinq lignes avec des noms inventés. FONCTION vaut « VM », « VM OTC », « KAM » ou « DERMO ». Une ligne porte « POSTE NON POURVU » dans NOM ET PRENOMS.

**Étapes**
1. Connectez-vous. Menu « Imports ». Choisissez « Organisation ».
2. Déposez le classeur dans « Déposez ici le fichier d'organisation ».
3. Cliquez « Lancer la simulation ». Lisez « Postes créés », « Postes vacants », « Comptes créés » et les « Anomalies ».
4. Cliquez « Importer pour de bon » et confirmez.
5. Recommencez les étapes 2 à 4 avec le même fichier.
6. Menu « Équipe », « Nouveau compte » : créez une personne inventée. Sur sa fiche, « Attribuer un rôle » : « Superviseur ».
7. Créez une seconde personne avec le rôle « Délégué ».
8. Menu « Organisation », onglet « Zones et secteurs » : « Nouvelle zone », puis « Ajouter un secteur » dans cette zone.
9. Onglet « Postes » : « Nouveau poste ». Renseignez « Libellé », « Code », « Type de poste », « Réseaux » et « Secteurs » (le nouveau secteur). N'affectez personne : c'est le poste vacant.
10. Créez un second poste. Cliquez « Affecter un occupant » : le délégué de l'étape 7. Cliquez « Rattacher un superviseur » : le superviseur de l'étape 6.
11. Menu « Établissements », « Nouvel établissement » : nom, type, « Secteur » (le nouveau secteur), adresse. Laissez la « Position GPS de référence » vide.
12. Menu « Prospects », « Nouveau prospect » : NOM, « Type de prospect », « Spécialité », « N° d'ordre professionnel » inventé. Puis « Ajouter un lieu d'exercice » : l'établissement de l'étape 11.

**Résultat attendu**
- Après la simulation : « Simulation terminée : rien n'a été enregistré. » Les chiffres annoncent les postes, dont un poste vacant.
- Après l'import : « Import terminé. » Le second import ne crée rien de nouveau (« déjà présents »).
- « Organisation » affiche le poste vacant sous le filtre « Vacants », le poste occupé avec son occupant et son superviseur.
- Le secteur appartient à la seule zone créée.
- L'établissement est rattaché à son secteur ; il apparaît sous le filtre « Sans GPS ».
- La fiche du prospect est « Active » et montre son lieu d'exercice.

**Preuve automatisée**
- `backend/apps/imports/tests/test_organisation.py::test_la_simulation_n_ecrit_rien` et `::test_import_motifs_poste_vacant_et_reimport`
- `portail/src/App.test.tsx`, test « simule un fichier d’organisation et affiche son bilan (ORG-014 CA1) »
- `backend/apps/organisation/tests/test_organisation.py::test_un_secteur_appartient_a_une_seule_zone_du_meme_pays`, `::test_un_poste_sans_occupant_est_vacant_et_peut_couvrir_plusieurs_secteurs`, `::test_occupation_datee_avec_fin_facultative`, `::test_le_changement_de_superviseur_prend_effet_a_la_date_indiquee`
- `backend/apps/referentiel/tests/test_referentiel.py::test_un_reseau_appartient_a_une_division`
- `backend/apps/prospects/tests/test_prospects.py::test_un_prospect_sans_nom_ni_type_est_refuse` et `::test_la_fiche_creee_par_l_administrateur_est_commune`
- `backend/apps/prospects/tests/test_etablissements.py::test_un_etablissement_a_un_secteur`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-03 — Semaine préparée, visite incomplète bloquée, seuil signalé

**Énoncé** : « Le délégué prépare une semaine complète ; le système bloque une visite dont les champs obligatoires manquent et signale un seuil dépassé. »
**Exigences couvertes** : PLN-002, PLN-004.

**Qui et matériel** : le délégué A sur son téléphone ; le superviseur SN sur le portail pour la vérification finale.

**Données de départ** : base réinitialisée. La semaine suivante du délégué A est « En préparation », avec six visites dont une à compléter.

**Étapes**
1. Sur le téléphone, connectez-vous avec le délégué A. Onglet « Semaine », « Semaine suivante ».
2. Ajoutez des visites sur chaque jour ouvré : « Ajouter depuis ma liste cible », cochez des prospects, choisissez le jour, « Poser … visites le … ».
3. Laissez **un seul jour** avec moins de visites que le repère affiché (« n sur min–max »).
4. Sur un autre jour, « Ajouter une visite » : choisissez un prospect et son lieu, mais laissez « Heure » et « Objectif » vides.
5. Lisez la carte « À vérifier ».
6. Cherchez le bouton « Soumettre le planning ».
7. Touchez « Ouvrir la visite à corriger ». Complétez l'heure et l'objectif de chaque visite à compléter.
8. Touchez « Soumettre le planning », puis « Oui, soumettre ».
9. Sur le portail, le superviseur SN ouvre « Plannings à valider ».

**Résultat attendu**
- La visite incomplète affiche « À compléter : … » avec les champs manquants.
- La carte « À vérifier » montre la visite sous « À corriger avant de soumettre », et le jour trop léger sous « Signalé à votre superviseur » (« Sous le minimum de visites : … »).
- Tant que la visite est incomplète, « Soumettre le planning » est remplacé par « Ouvrir la visite à corriger ».
- Une fois corrigé, le planning part malgré le seuil : « Soumis au superviseur », « Soumis le … ».
- Chez le superviseur, la ligne du délégué A porte l'alerte « Sous le minimum : 1 jour ».

**Preuve automatisée**
- `backend/apps/planning/tests/test_visites.py::test_ca1_une_visite_incomplete_est_refusee_a_la_soumission`
- `backend/apps/planning/tests/test_soumission.py::test_un_planning_vide_ou_bloque_n_est_pas_soumis`
- `backend/apps/planning/tests/test_controles.py::test_ca1_deux_visites_a_la_meme_heure_sont_bloquantes` et `::test_ca2_les_seuils_du_jour_sont_signales_au_prorata_des_absences`
- `backend/apps/planning/tests/test_consultation.py::test_le_superviseur_lit_la_semaine_soumise_avec_ses_alertes`
- `mobile/__tests__/semaine.test.tsx`, tests « PLN-002 CA1 : une visite incomplète montre ce qui reste à compléter », « PLN-004 CA1 : un point bloquant remplace le bouton de soumission », « PLN-004 CA2 : les signalements sont dits, sans rien bloquer »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-04 — Révision demandée, nouvelle version soumise

**Énoncé** : « Le superviseur demande une révision avec commentaire ; le délégué soumet une nouvelle version. »
**Exigences couvertes** : PLN-013, PLN-014.

**Qui et matériel** : le superviseur SN sur le portail ; le délégué A sur son téléphone.

**Données de départ** : le planning soumis à la fin de REC-03.

**Étapes**
1. Portail, superviseur SN : « Plannings à valider ». Sur la ligne du délégué A, cliquez « Consulter la semaine ».
2. Ouvrez une visite. Écrivez une « Remarque pour la révision ».
3. Cliquez « Demander une révision ». Videz le « Commentaire au délégué » et retirez la remarque : essayez d'envoyer.
4. Remettez la remarque, écrivez un commentaire. Cliquez « Envoyer la demande ».
5. Téléphone, délégué A : ouvrez la notification « Révision demandée sur votre planning de la semaine … ».
6. Lisez le commentaire en tête de la semaine et la remarque sur la visite visée. Corrigez la visite.
7. Touchez « Soumettre la version 2 », puis confirmez.
8. Portail, superviseur : revenez à « Plannings à valider ».

**Résultat attendu**
- Sans commentaire ni remarque, la demande ne part pas.
- Avec commentaire, le planning affiche « Révision demandée le … par … · version 1 ».
- Le délégué lit le commentaire et « Remarque : … » sur la bonne visite.
- La nouvelle soumission n'est pas marquée « En retard ».
- Dans la file : « Version 2 · après révision », avec « Révision demandée sur la version 1, le … par … ».

**Preuve automatisée**
- `backend/apps/planning/tests/test_revision.py::test_ca1_une_demande_sans_commentaire_est_refusee`, `::test_ca2_le_delegue_lit_le_commentaire_sur_la_visite`, `::test_une_visite_seule_suffit_et_le_delegue_soumet_la_version_suivante`
- `backend/apps/planning/tests/test_resoumission.py::test_une_resoumission_apres_revision_n_est_pas_en_retard`
- `portail/src/pages/ConsultationPlanning.test.tsx`, test « CA1 : la demande exige un commentaire ; une remarque sur une visite suffit »
- `mobile/__tests__/semaine.test.tsx`, test « PLN-013 CA2 : le délégué lit la révision et la remarque sur la visite concernée »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-05 — Planning approuvé, deux versions dans l'historique

**Énoncé** : « Le superviseur approuve le planning ; l'historique conserve les deux versions. »
**Exigences couvertes** : PLN-012, AUD-003.

**Qui et matériel** : le superviseur SN sur le portail ; le délégué A sur son téléphone.

**Données de départ** : la version 2 soumise à la fin de REC-04.

**Étapes**
1. Portail, superviseur : « Plannings à valider ». Ouvrez le planning « Version 2 · après révision ».
2. Sur la carte « 2 versions », cliquez « Voir la version 1 », puis « Voir la version 2 ». Lisez la comparaison.
3. Cliquez « Approuver », puis « Approuver le planning ».
4. Téléphone, délégué A : ouvrez la notification d'approbation, puis la semaine. Touchez « Historique : 2 versions ».

**Résultat attendu**
- La version 1 se lit telle qu'elle a été soumise (avant la correction de REC-04), avec sa révision demandée.
- La comparaison montre les visites ajoutées, retirées, déplacées ou modifiées entre les deux versions.
- Message « Planning de … approuvé. » ; le planning quitte la file.
- Le délégué reçoit « Votre planning de la semaine … est approuvé ».
- Sur le téléphone : « Version 1 » porte « Révision demandée », « Version 2 » porte « Approuvée », chacune avec « Soumise le … ».

**Preuve automatisée**
- `backend/apps/planning/tests/test_approbation.py::test_pln012_ca1_l_approbation_fige_la_version`, `::test_pln012_ca2_le_delegue_est_notifie`, `::test_rg037_la_soumission_fige_une_version`
- `backend/apps/planning/tests/test_versions.py::test_ca2_toutes_les_versions_restent_consultables` et `::test_ca1_la_comparaison_montre_ajoutees_retirees_deplacees`
- `portail/src/composants/HistoriqueVersions.test.tsx` (tests « CA1 » et « CA2 »)
- `mobile/__tests__/versions.test.tsx`, tests « PLN-014 : le délégué relit ses versions et ce qui a changé » et « PLN-014 CA2 : une version décidée dit qui, quand et pourquoi »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-06 — Programme et rapport hors connexion

**Énoncé** : « Le délégué consulte son programme hors connexion et rédige un rapport. »
**Exigences couvertes** : VIS-001, RPT-009, OFF-001.

**Qui et matériel** : le délégué A, sur un téléphone Android, puis sur un iPhone. Mode avion.

**Données de départ** : base réinitialisée, un mardi, mercredi ou jeudi. La semaine en cours du délégué A est approuvée et a des visites aujourd'hui.

**Étapes**
1. Avec du réseau, connectez-vous. Onglet « Profil », « Données hors connexion », « Synchroniser maintenant ».
2. Passez le téléphone en **mode avion**. Fermez l'application et rouvrez-la.
3. Onglet « Tournée » : lisez le « Programme du jour ». Ouvrez la « Prochaine visite ».
4. Touchez « Démarrer la visite ». Après une minute, « Terminer la visite ».
5. Touchez « Rédiger le rapport ». Remplissez « Résultat obtenu », « Produits présentés », « Retour du prescripteur » pour chaque produit, « Résumé de l'échange », « Prochaine action ».
6. Au milieu de la saisie, fermez complètement l'application. Rouvrez-la et revenez au rapport.
7. Touchez « Soumettre le rapport ».
8. Ouvrez la fiche d'un prospect de « Ma liste » : lisez « Visites précédentes ».
9. Gardez le mode avion pour REC-07.

**Résultat attendu**
- En mode avion : « Hors ligne : programme tel qu'au … » et le même programme qu'avec réseau.
- Le démarrage affiche « Démarrée sans réseau : l'envoi partira dès le retour du réseau. »
- L'en-tête du rapport dit « Gardé sur le téléphone à … ».
- Après la fermeture : « Brouillon repris : vos dernières saisies, gardées sur le téléphone, ont été retrouvées. »
- Après la soumission : « Soumis sur le téléphone à … ». La ligne sous l'en-tête annonce des envois en attente (« … envois en attente »).
- La liste cible et les dernières visites restent lisibles.

**Preuve automatisée (partielle)**
- `backend/apps/planning/tests/test_programme.py::test_vis001_le_programme_du_jour_est_ordonne_avec_la_prochaine_en_tete`
- `mobile/__tests__/programme.test.tsx`, test « VIS-001 CA1 : en mode avion, le dernier programme lu s’affiche »
- `mobile/__tests__/rapport.test.tsx`, tests « sans réseau, la saisie reste sur le téléphone et attend dans la file » et « CA1 : après un redémarrage, la saisie non envoyée est reprise »
- `backend/apps/rapports/tests/test_synchro.py::test_off001_les_trois_derniers_rapports_de_la_liste_cible` et `::test_off001_hors_liste_cible_rien_et_rpt011_ca1`
- `mobile/__tests__/synchro.test.tsx`, test « OFF-001 CA1 : une passe garde la semaine, la suivante, la liste et l'historique »
- Non prouvé automatiquement : sept jours entiers en mode avion sur un vrai téléphone (recette-0.8.md, écart 1 ; essai T1 de docs/essais-terrain.md).

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-07 — Rapport envoyé une seule fois, même après coupure

**Énoncé** : « Le rapport se synchronise **une seule fois** après le retour de la connexion, y compris après une coupure pendant l'envoi. »
**Exigences couvertes** : OFF-003.

**Qui et matériel** : le délégué A sur son téléphone ; le superviseur SN sur le portail.

**Données de départ** : la fin de REC-06 (rapport soumis en mode avion, envois en attente).

**Étapes**
1. Onglet « Profil » : ouvrez « Envois en attente ». Notez leur nombre.
2. Désactivez le mode avion. Dès que la ligne commence à changer, **réactivez le mode avion pendant 5 secondes**, puis désactivez-le.
3. Attendez que la file se vide toute seule (une nouvelle tentative a lieu chaque minute). Ne touchez pas « Envoyer maintenant ».
4. Portail, superviseur SN : « Prospects », fiche du prospect visité en REC-06, section « Rapports de visite ».
5. Le lendemain (une journée n'entre dans « À traiter » qu'une fois finie) : « À traiter », « Ouvrir la journée » de la veille du délégué A.

**Résultat attendu**
- La file se vide sans aucun geste ; la ligne sous l'en-tête n'annonce plus d'envoi en attente.
- Sur la fiche du prospect, le rapport apparaît **une seule fois**.
- Dans la journée : la visite a une seule heure de début et de fin ; le rapport est unique et ne porte pas l'étiquette « 2 versions » ; l'heure retenue est celle du geste sur le téléphone.
- Aucune visite, aucun rapport en double.

**Preuve automatisée**
- `mobile/__tests__/horsLigne.test.tsx`, test « OFF-003 : au retour dans l’application, la file part d’elle-même, une seule fois »
- `mobile/__tests__/attente.test.ts`, tests « PLN-007 : deux rejeux simultanés n’envoient chaque visite qu’une fois » et « RPT-009 : saisie, soumission puis pièce partent dans l’ordre, une fois, avec l’heure du geste »
- `backend/apps/rapports/tests/test_soumission.py::test_rpt010_rejeu_du_meme_envoi_sans_seconde_version`
- `backend/apps/planning/tests/test_report.py::test_vis007_rejoue_depuis_la_file_sans_doublon` et `backend/apps/planning/tests/test_imprevue.py::test_vis008_rejoue_sans_doublon`
- `backend/apps/rapports/tests/test_pieces.py::test_rpt007_joindre_relire_et_rejouer_sans_doublon`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-08 — Correction sur une visite, reste validé, rapport corrigé validé

**Énoncé** : « Le superviseur demande une correction sur une visite, valide le reste de la journée, puis valide le rapport corrigé. »
**Exigences couvertes** : RPT-013, RPT-014, RPT-015.

**Qui et matériel** : le superviseur SN sur le portail ; le délégué A sur son téléphone, avec réseau.

**Données de départ** : base réinitialisée. « À traiter » contient les journées passées du délégué A, avec leurs rapports soumis. Choisissez une journée avec au moins deux rapports à valider.

**Étapes**
1. Portail, superviseur : « À traiter », onglet « Journées ». Sur la journée choisie, cliquez « Ouvrir la journée ».
2. Sous le premier rapport, cliquez « Demander une correction ». Laissez « Ce qu'il faut corriger » vide : constatez le bouton inactif.
3. Écrivez le commentaire. Dans « Parties à revoir (facultatif) », cochez « Résumé de l'échange ». Cliquez « Renvoyer au délégué ».
4. Sous le second rapport, cliquez « Valider ce rapport ».
5. Regardez le bouton « Valider la journée ».
6. Téléphone, délégué A : ouvrez la notification « … demande une correction de votre rapport du … », ou la liste « Rapports à corriger » de la Tournée.
7. Modifiez le « Résumé de l'échange ». Touchez « Soumettre le rapport ».
8. Portail, superviseur : ouvrez la notification « … a corrigé son rapport du … ».
9. Cliquez « Voir la version 1 ». Puis « Valider ce rapport » sur le rapport corrigé.

**Résultat attendu**
- Après l'étape 3 : « Correction demandée : le rapport est revenu au délégué. »
- Le second rapport porte « Validé seul le … par … ».
- « Valider la journée » reste inactif et la page dit : « 1 rapport est renvoyé au délégué : la journée se validera quand il sera soumis à nouveau. … »
- Le délégué voit la demande en tête du rapport (« Votre superviseur demande une correction. »).
- Le rapport corrigé affiche « Version 2, soumise le … après correction », la demande, « Modifié : Résumé de l'échange ». La version 1 reste lisible.
- Après validation : « Journée validée : son classement ne bouge plus et elle a quitté « À traiter ». »

**Preuve automatisée**
- `backend/apps/rapports/tests/test_recette_06.py::test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige` (le scénario de bout en bout)
- `backend/apps/rapports/tests/test_correction.py::test_rpt014_ca1_sans_commentaire_rien_ne_part` et `::test_rpt014_ca2_les_autres_rapports_se_valident`
- `backend/apps/rapports/tests/test_resoumission.py::test_rpt015_ca1_la_version_precedente_reste_consultable`
- `portail/src/pages/JourneeRapports.test.tsx`, tests « RPT-014 CA1 : … » et « RPT-015 CA1 : le rapport corrigé dit ce qui a changé ; la version 1 reste lisible »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-09 — Aucun accès aux données d'un autre pays

**Énoncé** : « Le responsable d'un pays ne peut ni rechercher, ni consulter, ni exporter les données d'un autre pays (API, portail, Grafana). »
**Exigences couvertes** : USR-002, SEC-008, DSH-010.

**Qui et matériel** : `responsable_pays (TG)` puis `responsable_pays (SN)`, sur le portail. Téléphone d'authentification. Pour la partie Grafana : un compte Grafana du Sénégal (créé par l'administrateur technique).

**Données de départ** : base réinitialisée (Sénégal et Togo).

**Étapes**
1. Connectez-vous avec `responsable_pays (TG)`. Menu « Prospects » : notez le nom d'un prospect du Togo. Déconnectez-vous.
2. Connectez-vous avec `responsable_pays (SN)`. Ouvrez la liste « Pays » de l'en-tête.
3. Menu « Prospects » : cherchez le nom noté, avec le filtre « Tout le pays ».
4. Menu « Pilotage » : ouvrez les filtres « Zone », « Réseau », « Délégué ».
5. « Exporter » : « Indicateurs par délégué » en « Classeur Excel », puis « Rapports de visite » en « Fichier CSV ». Ouvrez les deux fichiers.
6. Menu « Journal d'audit » : regardez la colonne « Pays ».
7. Grafana (si installé) : connectez-vous dans l'organisation du Sénégal. Dans le tableau « pilotage du pays », remplacez la variable « Code du pays » par `tg`.
8. Partie API : l'administrateur technique joint à la fiche le résultat de la suite d'isolation de la version jouée (CI de l'étiquette, ou `make isolation`).

**Résultat attendu**
- La liste « Pays », si elle s'affiche, ne propose que le Sénégal.
- La recherche répond « Aucune fiche ne correspond ».
- Les filtres du pilotage ne proposent que des zones, réseaux et délégués du Sénégal.
- Les exports ne contiennent aucune ligne du Togo.
- Le journal ne montre que des événements du Sénégal.
- Grafana n'affiche aucune donnée du Togo (« permission denied » ou tableau vide).
- La suite d'isolation est verte.

**Preuve automatisée**
- `backend/apps/perimetre/tests/test_isolation_complete.py::test_sec008_aucune_lecture_d_aucun_role_ne_sort_de_son_pays`, `::test_sec008_recherche_et_ressemblances`, `::test_sec008_les_exports_d_un_pays_ne_portent_que_lui`, `::test_sec008_une_piece_jointe_d_un_autre_pays`
- `backend/apps/perimetre/tests/test_isolation_routes.py` ; `backend/apps/perimetre/tests/test_matrice.py::test_chaque_role_chaque_action` ; `backend/apps/perimetre/tests/test_securite_lignes.py::test_toute_table_rattachee_a_un_pays_est_protegee`
- `backend/apps/pilotage/tests/test_exports.py::test_rpt019_ca1_le_perimetre_seulement`
- `backend/apps/audit/tests/test_consultation.py::test_aud002_ca1_l_administrateur_pays_ne_voit_que_son_pays`
- `backend/apps/pilotage/tests/test_grafana.py::test_dsh010_ca1_ca2_chaque_pays_ne_lit_que_ses_vues` (rôles réels de la base)

**Limite** : sans Grafana installé, l'étape 7 ne se joue pas. Notez « Grafana non installé » dans la fiche ; le scénario ne peut alors pas être déclaré conforme en entier.

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-10 — Indicateurs consolidés du siège, descente nominative auditée

**Énoncé** : « Le siège consulte les indicateurs consolidés, filtre par pays, descend au nominatif : la consultation est auditée. »
**Exigences couvertes** : DSH-004.

**Qui et matériel** : `direction_siege` sur le portail, puis `admin_siege` pour lire le journal. Téléphone d'authentification.

**Données de départ** : base réinitialisée ; le worker a tourné au moins une fois (tableaux recalculés toutes les 4 minutes).

**Étapes**
1. Connectez-vous avec `direction_siege`. Dans la liste « Pays », gardez « Tous les pays » (« Vue consolidée »).
2. Menu « Pilotage ». Lisez le tableau par pays et la ligne de total.
3. Changez la « Période » (par exemple « 30 derniers jours »).
4. Sur la ligne « Sénégal », cliquez « Voir les délégués ».
5. Lisez le bandeau en haut de la page.
6. Déconnectez-vous. Connectez-vous avec `admin_siege`. « Journal d'audit », famille « Pilotage ».

**Résultat attendu**
- Le tableau consolidé montre les pays, sans aucun nom de délégué.
- « Voir les délégués » ouvre le détail du Sénégal seulement.
- Le bandeau dit : « Consultation nominative du siège : chaque ouverture de cette page est inscrite au journal d'audit. »
- Le journal montre une consultation nominative, avec la personne, la date et le pays.

**Preuve automatisée**
- `backend/apps/pilotage/tests/test_siege.py::test_dsh004_comparaison_et_total_par_pays_sans_aucun_nom` et `::test_dsh004_ca1_la_descente_nominative_du_siege_est_auditee`
- `portail/src/pages/Pilotage.test.tsx`, tests « DSH-004 : le siège voit les pays sans aucun nom, et descend au nominatif d'un pays » et « DSH-004 CA1 : en descente nominative, le siège est prévenu de l'audit »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-11 — Motif obligatoire pour chaque écart, report lié

**Énoncé** : « Une visite annulée, reportée, prospect absent ou non réalisée exige un motif ; le report crée une visite liée. »
**Exigences couvertes** : VIS-005 à VIS-009.

**Qui et matériel** : le délégué A sur son téléphone, avec réseau ; le superviseur SN sur le portail.

**Données de départ** : base réinitialisée, un mardi ou un mercredi. Une visite passée restée « prévue » apparaît sous « À justifier ».

**Étapes**
1. Tournée, prochaine visite du jour : touchez « Prospect absent ». Sans motif, essayez « Confirmer l'absence ». Puis choisissez un motif et confirmez.
2. Onglet « Semaine », une visite de jeudi : « Annuler la visite ». Sans motif, essayez « Confirmer l'annulation ». Puis choisissez un motif et confirmez.
3. Une autre visite à venir : « Reporter ». Sans motif ni « Nouveau jour (obligatoire) », essayez « Confirmer le report ». Puis choisissez le motif, le nouveau jour, l'heure, et confirmez.
4. Tournée, « À justifier » : ouvrez la visite. « Justifier : non réalisée ». Sans motif, essayez « Confirmer ». Puis choisissez un motif et confirmez.
5. Sous le programme, « Visite imprévue » : choisissez un prospect et son lieu. Sans « Justification (obligatoire) », essayez « Démarrer la visite imprévue ».
6. Portail, superviseur : « Plannings à valider ». Ouvrez la modification du délégué A. Approuvez-la.
7. Téléphone : ouvrez le nouveau jour du report.

**Résultat attendu**
- Sans motif, chaque bouton de confirmation reste inactif.
- Avec motif : « Prospect absent · motif », « Annulée · motif », « Non réalisée · motif ». La visite justifiée quitte « À justifier ».
- Le report affiche « … Le nouveau jour attend l'accord de votre superviseur. » La visite d'origine se lit « Reportée au … ».
- Après approbation, la nouvelle visite apparaît au nouveau jour, avec le même prospect, le même lieu et le même objectif.
- La visite imprévue ne démarre pas sans justification.

**Preuve automatisée**
- `backend/apps/planning/tests/test_prospect_absent.py::test_vis005_ca1_impossible_sans_motif`
- `backend/apps/planning/tests/test_annulation_non_realisation.py::test_vis006_ca1_impossible_sans_motif` et `::test_vis009_ca1_sans_motif_impossible`
- `backend/apps/planning/tests/test_report.py::test_vis007_impossible_sans_motif`, `::test_vis007_ca1_la_nouvelle_visite_reference_l_originale`, `::test_vis007_ca2_le_superviseur_trouve_et_approuve_le_report_de_la_semaine`
- `backend/apps/planning/tests/test_imprevue.py::test_vis008_ca1_impossible_sans_justification`
- `mobile/__tests__/absent.test.tsx`, `ecarts.test.tsx`, `report.test.tsx`, `imprevue.test.tsx` (un test par écart, avec et sans motif)

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-12 — Audit de chaque validation

**Énoncé** : « Le journal d'audit identifie l'auteur, la date, le mode et la décision pour chaque validation. »
**Exigences couvertes** : AUD-001, RG-034.

**Qui et matériel** : `admin_pays (SN)` ou `responsable_pays (SN)`, sur le portail.

**Données de départ** : REC-05, REC-08, REC-15 et REC-16 joués : il existe une approbation directe, une approbation par escalade, des validations seules, par journée, par lot et en remplacement.

**Étapes**
1. Menu « Journal d'audit ». Famille « Plannings » : ouvrez la ligne de l'approbation de REC-05.
2. Ouvrez la ligne de l'approbation par escalade de REC-16.
3. Famille « Rapports » : ouvrez une validation seule (REC-08), une validation de journée, une validation par lot (REC-15), une validation en remplacement (REC-16).
4. Filtrez sur « Personne (identifiant) » : l'identifiant du superviseur SN. Puis sur une période (« Du », « Au »).

**Résultat attendu**
- Chaque ligne donne la personne, la date et l'heure, et le résultat « Réussi ».
- Le code de l'action dit la décision (par exemple `planning.approbation`, `planning.revision`, `rapport.validation`, `rapport.validation_journee`).
- Le détail (« Détails ») donne le mode : `direct`, `escalade` ou `remplacement` pour les plannings ; `unitaire`, `journee`, `lot`, `escalade` ou `remplacement` pour les rapports.
- Le détail rappelle : « Cet événement est immuable : la base refuse toute modification ou suppression. »
- Aucun bouton ne permet de modifier ou supprimer une ligne.

**Preuve automatisée**
- `backend/apps/rapports/tests/test_recette_06.py::test_rg034_validations_par_journee_et_par_lot_auditees_avec_auteur_et_mode`
- `backend/apps/rapports/tests/test_validation.py::test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode`
- `backend/apps/planning/tests/test_approbation.py::test_pln012_ca1_l_approbation_fige_la_version` (événement `planning.approbation`)
- `backend/apps/planning/tests/test_echeances.py::test_pln016_ca2_la_decision_du_dm_porte_le_mode_escalade`
- `backend/apps/planning/tests/test_remplacements.py::test_ca1_ca2_le_remplacant_decide_en_remplacement`
- `backend/apps/audit/tests/test_audit.py::test_aucun_role_ne_peut_modifier_ni_supprimer_un_evenement`
- `portail/src/pages/JournalAudit.test.tsx` (liste, filtres, détail)

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-13 — Fusion automatique, homonyme en file, défusion

**Énoncé** : « Un délégué crée un prospect déjà existant avec le même numéro d'ordre : fusion automatique ; un homonyme sans identifiant fort entre dans la file ; l'administrateur pays défusionne une fusion. »
**Exigences couvertes** : PRP-008 à PRP-010.

**Qui et matériel** : le délégué A **sur le portail** (le formulaire du téléphone n'a pas de champ « N° d'ordre professionnel ») ; l'administrateur pays SN sur le portail.

**Données de départ** : l'administrateur pays crée d'abord une fiche témoin : « Nouveau prospect », nom inventé (par exemple « EXEMPLE », prénom « Moussa »), « Type de prospect », « N° d'ordre professionnel » inventé (par exemple `FICT-0001`).

**Étapes**
1. Portail, délégué A : menu « Prospects », « Nouveau prospect ». Même nom, même type, même « N° d'ordre professionnel » que la fiche témoin. Enregistrez.
2. Encore « Nouveau prospect » : même nom et même prénom que la fiche témoin, **sans** numéro d'ordre ni mobile. Lisez les « Fiches ressemblantes » qui s'affichent, puis enregistrez quand même.
3. Portail, administrateur pays : menu « Doublons », onglet « À trancher ». Ouvrez la paire.
4. Onglet « Fusions » : repérez la fusion de l'étape 1 (« Fusion automatique »). Cliquez « Défaire », puis confirmez dans « Défaire la fusion ».
5. Revenez sur la fiche témoin : « Historique des modifications ».

**Résultat attendu**
- Étape 1 : « Cette fiche existait déjà : votre saisie y a été rattachée. » Aucune seconde fiche n'apparaît.
- Étape 2 : « Fiche enregistrée à valider : elle ressemble à une fiche existante, l'administrateur pays tranchera. »
- La paire montre « Fiche saisie » et « Fiche existante » côte à côte, avec « Ressemblance … / 100 » et le critère « nom similaire ».
- Après « Défaire », les deux fiches sont de nouveau distinctes ; la fusion porte « Défaite le … ».
- L'historique garde la trace de la fusion et de la défusion.

**Preuve automatisée**
- `backend/apps/prospects/tests/test_doublons.py::test_meme_numero_d_ordre_fusion_automatique`, `::test_homonyme_sans_identifiant_fort_entre_dans_la_file`, `::test_fusionner_puis_defusionner`, `::test_defusion_d_une_fusion_automatique_par_numero`
- `portail/src/App.test.tsx`, tests « compare les deux fiches côte à côte et garde la paire séparée (PRP-009) » et « défait une fusion après confirmation (PRP-010) »

**Variante téléphone** : sur le téléphone, la fusion automatique se produit avec le même mobile et un nom très proche (`backend/apps/prospects/tests/test_doublons.py::test_meme_mobile_et_nom_similaire_fusionnent`). Elle ne remplace pas l'étape 1.

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-14 — Visites d'un autre réseau invisibles

**Énoncé** : « Un délégué ne voit pas les visites d'un délégué d'un autre réseau sur le même médecin. »
**Exigences couvertes** : RG-040.

**Qui et matériel** : le délégué A ; un délégué C d'un **autre réseau** ; l'administrateur pays SN (portail). Deux téléphones, ou un téléphone utilisé l'un après l'autre.

**Données de départ** : un prospect P de la liste cible du délégué A, avec des visites et des rapports passés (données de démonstration). Le délégué C : dans « Organisation », onglet « Postes », trouvez un poste occupé d'un autre réseau que celui du délégué A ; notez l'identifiant de son occupant.

**Étapes**
1. Portail, administrateur pays : « Listes cibles », poste du délégué C. « Ajouter des prospects » : ajoutez P.
2. Téléphone, délégué C : connectez-vous, synchronisez. Onglet « Prospects », « Ma liste » : ouvrez P.
3. Lisez « Visites précédentes ».
4. Onglet « Semaine », « Semaine suivante » : ajoutez une visite chez P. Ouvrez-la : lisez « Dernières visites » et « Préparer ma visite ».
5. Comparez avec le téléphone du délégué A, sur la même fiche P.

**Résultat attendu**
- Le délégué C voit la même fiche P (la fiche est commune au pays).
- Le délégué C ne voit aucune visite ni aucun rapport du délégué A : « Aucun rapport de visite pour l'instant. », « Aucune visite précédente chez ce prospect. »
- Le délégué A voit toujours ses propres visites chez P.

**Preuve automatisée (partielle)**
- `backend/apps/planning/tests/test_detail_visite.py::test_vis002_ca1_l_historique_ne_montre_que_les_visites_du_delegue` (un collègue sur le même médecin, mais du même réseau)
- `backend/apps/rapports/tests/test_chronologie.py::test_rpt011_ca1_un_autre_delegue_ne_voit_rien`
- `backend/apps/perimetre/tests/test_isolation_complete.py::test_sec008_un_autre_delegue_ou_superviseur_n_ouvre_rien_du_delegue` (délégué d'un autre réseau, toutes les routes du planning, des visites et des rapports)
- Aucun test ne combine « autre réseau » et « même médecin » dans un seul cas : la recette manuelle le vérifie.

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-15 — Validation par lot, journée « à vérifier » en attente

**Énoncé** : « Le superviseur valide par lot les journées conformes ; une journée « à vérifier » reste en attente. »
**Exigences couvertes** : RPT-013, RG-035.

**Qui et matériel** : le superviseur SN, sur le portail.

**Données de départ** : base réinitialisée. « À traiter » contient des journées « Conforme » et au moins une « À vérifier · … écarts ».

**Étapes**
1. « À traiter », onglet « Journées ». Notez les journées « Conforme » et les journées « À vérifier ».
2. Cliquez « Valider les … journées conformes ».
3. Lisez la confirmation, puis confirmez.
4. Relisez la liste.
5. Ouvrez une journée validée : lisez la mention sous un rapport.

**Résultat attendu**
- La confirmation dit : « Seules les journées conformes, dont tous les rapports sont soumis et sans horodatage douteux, sont validées. Les autres restent ici, à ouvrir une par une. »
- Message « … journées validées, … ».
- Les journées « À vérifier » restent dans la liste, non validées. Une journée conforme avec un rapport en brouillon ou un horodatage douteux reste aussi.
- Sous chaque rapport validé : « Validé avec les journées conformes le … par … ».
- Rien ne se valide sans un geste du superviseur, même après plusieurs jours.

**Preuve automatisée**
- `backend/apps/rapports/tests/test_validation.py::test_rpt013_ca1_le_lot_ne_prend_que_les_journees_conformes`, `::test_rpt013_le_lot_valide_les_journees_conformes`, `::test_23a_le_lot_ecarte_l_horodatage_douteux`
- `backend/apps/rapports/tests/test_recette_06.py::test_23a_le_lot_ecarte_une_journee_dont_un_rapport_n_est_pas_soumis` et `::test_rg035_aucune_validation_automatique`
- `portail/src/pages/ATraiter.test.tsx`, tests « RPT-013 CA1, 23.A : « Valider les n conformes » n’envoie que les journées éligibles » et « 23.A : sans journée éligible, pas de bouton de lot »

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-16 — Escalade au DM, décision d'un remplaçant

**Énoncé** : « Sans décision 24 h ouvrées, le DM reçoit l'escalade et décide ; un remplaçant décide pendant sa période. »
**Exigences couvertes** : PLN-016, ORG-013.

**Qui et matériel** : l'administrateur pays SN, le superviseur SN, `dm (SN)`, un second superviseur (le remplaçant), sur le portail. L'administrateur technique sur le serveur. Téléphone d'authentification pour le DM.

**Données de départ** : base réinitialisée, un jour ouvré. Le planning de la semaine suivante du délégué B est soumis et attend la décision du superviseur SN. Le second superviseur : son identifiant se trouve dans « Équipe ».

**Vérification préalable** : l'escalade va au DM dont les réseaux couvrent le poste du délégué B. Les réseaux sont répartis entre plusieurs DM fictifs. Connectez-vous avec `dm (SN)`, menu « Pilotage », filtre « Délégué » : le délégué B doit y figurer. Sinon, cherchez avec l'administrateur pays, dans « Équipe », un autre compte au rôle DM et refaites la vérification.

**Partie A — escalade**
1. Administrateur pays : « Paramètres », carte « Planning », « Délai avant escalade au DM (heures ouvrées) » : « Modifier », mettez 1. (Pour un essai fidèle, gardez 24 et attendez 24 heures ouvrées.)
2. Attendez au moins une heure après la soumission. Le superviseur ne décide pas.
3. Attendez la passe du worker (15 minutes au plus), ou demandez à l'administrateur technique de lancer `python manage.py executer_echeances`.
4. Connectez-vous avec `dm (SN)`. Ouvrez la notification « Escalade : le planning de … (semaine …) attend une décision depuis … h ouvrées ».
5. Dans « Plannings à valider », lisez la ligne, puis « Approuver » et « Approuver le planning ».
6. Remettez le paramètre à 24.

**Partie B — remplaçant**
1. Superviseur SN : « Remplaçants », « Désigner un remplaçant ». « Remplaçant » : le second superviseur. « Du » : aujourd'hui. « Au (inclus) » : demain. Validez.
2. Second superviseur : connectez-vous. Ouvrez la notification « Vous remplacez … du … au … ».
3. « À traiter » : ouvrez une journée d'un délégué du superviseur SN. Cliquez « Valider ce rapport ».
4. Superviseur SN : « Remplaçants », « Terminer » sur ce remplacement.
5. Second superviseur : rechargez « À traiter ».

**Résultat attendu**
- Le DM voit la ligne « Escaladé : sans décision de … depuis le … » et peut décider. Sa décision est inscrite « par escalade » (vérifiable en REC-12).
- Avant l'escalade, le DM ne peut pas décider ; après, le superviseur garde la main.
- Le remplaçant voit « Vous validez en remplacement du superviseur de ce délégué. » Le rapport porte « Validé en remplacement le … par … ».
- Après « Terminer », le remplaçant ne voit plus les journées de l'équipe remplacée.

**Preuve automatisée**
- `backend/apps/planning/tests/test_echeances.py::test_pln016_ca1_sans_decision_24_h_ouvrees_le_dm_est_notifie`, `::test_heures_ouvrees_sans_le_week_end`, `::test_pln016_ca2_la_decision_du_dm_porte_le_mode_escalade`
- `backend/apps/rapports/tests/test_validation.py::test_rpt018_le_dm_valide_par_escalade_apres_le_delai` et `::test_rpt018_le_remplacant_valide_en_mode_remplacement`
- `backend/apps/rapports/tests/test_recette_06.py::test_25a_apres_l_escalade_le_superviseur_garde_la_main`
- `backend/apps/planning/tests/test_remplacements.py::test_ca1_ca2_le_remplacant_decide_en_remplacement` et `::test_ca3_a_la_fin_de_la_periode_l_acces_cesse`
- `portail/src/pages/Validation.test.tsx`, test « CA1 : le DM voit le planning escaladé et qui n’a pas décidé » ; `portail/src/pages/Remplacements.test.tsx`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-17 — Téléphone révoqué effacé ; 8ᵉ jour sans synchronisation

**Énoncé** : « Un téléphone révoqué efface ses données locales à la connexion suivante ; au 8ᵉ jour sans synchronisation, les données sont inaccessibles. »
**Exigences couvertes** : SEC-006, OFF-007.

**Qui et matériel** : l'administrateur pays SN sur le portail ; deux téléphones de test (un Android, un iPhone) ; un délégué par téléphone. Jouez ce scénario **en dernier** : un téléphone révoqué ne se reconnecte plus avec son enregistrement.

**Données de départ** : téléphone 1 connecté avec le délégué A, synchronisé, avec au moins un envoi en attente (faites une saisie en mode avion). Téléphone 2 connecté avec un autre délégué, synchronisé. Délai du pays : 7 jours (valeur par défaut).

**Partie A — révocation (téléphone 1)**
1. Portail, administrateur pays : « Équipe », onglet « Téléphones ». Repérez le téléphone 1 (« Dernier contact »). Cliquez « Révoquer » et confirmez.
2. Téléphone 1 : désactivez le mode avion. Rouvrez l'application.

**Partie B — 8ᵉ jour (téléphone 2)**

Variante plus simple depuis 0.9.8 : l'administrateur pays règle « Masquage des données hors ligne (jours) » à 1 (« Paramètres », carte « Téléphone »), puis le téléphone reste deux jours sans réseau. Remettre ensuite 7. Sinon :

1. Passez le téléphone 2 en mode avion.
2. Dans les réglages du téléphone, coupez l'heure automatique et avancez la date de 6 jours. Ouvrez l'application.
3. Avancez la date de 8 jours au total. Rouvrez l'application.
4. Remettez la date et l'heure automatiques. Désactivez le mode avion. Touchez « Synchroniser maintenant ».

**Résultat attendu**
- Téléphone 1 : « Ce téléphone a été révoqué ou votre compte désactivé : ses données ont été effacées. Contactez votre administrateur pays. » Retour à l'écran de connexion. L'envoi en attente n'arrive jamais au portail.
- Portail : le téléphone porte « Révoqué le … ».
- Téléphone 2, au 6ᵉ jour : les données s'affichent encore.
- Téléphone 2, au 8ᵉ jour : écran « Synchronisation nécessaire », aucune donnée lisible. S'il y a des envois en attente, l'écran dit qu'ils sont gardés.
- Après la synchronisation, les données reviennent.

**Preuve automatisée**
- `mobile/__tests__/horsLigne.test.tsx`, tests « SEC-006 CA1 : un téléphone révoqué efface ses données et revient à la connexion », « OFF-007 CA1 : au 8ᵉ jour sans synchronisation, les données ne s’affichent plus », « OFF-007 : avant le délai, rien n’est masqué », « OFF-007 CA2 : la file est gardée et part à la synchronisation qui rend les données »
- `backend/apps/identite/tests/test_appareils_langue.py::test_un_appareil_revoque_ne_peut_plus_se_connecter_ni_rafraichir` et `::test_sec006_un_compte_suspendu_le_dit_au_telephone`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-18 — Affectation supplémentaire, un pays à la fois, fin datée

**Énoncé** : « Un utilisateur avec une affectation supplémentaire bascule de pays et ne voit jamais les deux à la fois ; l'accès cesse à la date de fin. »
**Exigences couvertes** : ORG-009.

**Qui et matériel** : `admin_siege` et `df (SN)`, sur le portail. Téléphone d'authentification pour les deux.

**Données de départ** : base réinitialisée. Le DF SN n'a aucune affectation au Togo.

**Étapes**
1. `admin_siege` : « Équipe ». Ouvrez la fiche de `df (SN)`. Section « Affectations dans d’autres pays » : « Accorder une affectation ».
2. « Pays » : Togo. « Rôle » : DF. « Motif » : par exemple « Intérim de recette ». « Début » : aujourd'hui. « Fin (facultative) » : demain. Validez.
3. `df (SN)` : connectez-vous. Ouvrez la liste « Pays » de l'en-tête.
4. Choisissez Togo. Ouvrez « Organisation » et « Pilotage ».
5. Revenez au Sénégal. Ouvrez les mêmes pages.
6. Le lendemain (date de fin), reconnectez-vous avec `df (SN)` et ouvrez la liste « Pays ».
7. Optionnel, pour un résultat immédiat : refaites les étapes 1 et 2, puis cliquez « Terminer » sur l'affectation.

**Résultat attendu**
- La liste « Pays » propose Sénégal et Togo, jamais « Tous les pays ».
- Au Togo, seules les données du Togo s'affichent ; au Sénégal, seules celles du Sénégal.
- À la date de fin (ou après « Terminer »), le Togo n'est plus proposé.
- Le journal d'audit (famille « Affectations ») montre l'octroi et la fin.

**Preuve automatisée**
- `backend/apps/organisation/tests/test_affectations_transferts.py::test_l_affecte_choisit_le_pays_et_ne_voit_que_ses_donnees`, `::test_a_la_fin_de_l_affectation_l_acces_est_retire`, `::test_terminer_une_affectation_termine_ses_roles`
- `backend/apps/audit/tests/test_audit.py::test_les_affectations_et_transferts_sont_audites`

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-19 — Interface et notifications en français et en anglais

**Énoncé** : « Toute l'interface et les notifications existent en français et en anglais. »
**Exigences couvertes** : USR-004.

**Qui et matériel** : chaque testeur, pendant ses autres scénarios. Portail et téléphones. Un compte de test avec une boîte de courriel de test pour la partie courriel.

**Données de départ** : n'importe quel compte de test.

**Étapes**
1. Écran de connexion du portail : choisissez « English ». Lisez l'écran.
2. Connectez-vous. « Mon profil », « Langue de l'interface » : English.
3. Parcourez chaque page de votre menu. Ouvrez au moins un dialogue et provoquez au moins un message d'erreur (par exemple un champ obligatoire vide).
4. Téléphone : onglet « Profil », « Langue de l'interface » : English. Parcourez les cinq onglets.
5. Faites envoyer une notification (par exemple, le superviseur approuve un planning ou demande une correction). Lisez-la dans le centre de notifications et, si le push est actif, sur l'écran verrouillé.
6. Compte avec boîte de test : « Mot de passe oublié ? » en anglais. Lisez le courriel reçu.
7. Remettez « Français » et vérifiez que tout revient en français.

**Résultat attendu**
- Tous les textes passent en anglais (par exemple « Sign in », « To review », « Plans to approve » ; onglets « Round », « Week », « Prospects », « My figures », « Profile »).
- Les notifications sont en anglais (par exemple « Your planning for week … is approved »).
- Le courriel est dans la langue de la personne.
- Aucun texte ne reste en français dans l'interface anglaise. Chaque texte oublié est un défaut ; notez l'écran exact.

**Preuve automatisée**
- `packages/i18n/src/index.test.ts` (mêmes clés en français et en anglais, aucune traduction vide, chaque clé utilisée existe)
- `backend/tests/test_traductions.py::test_aucun_message_sans_traduction_anglaise` et `::test_chaque_message_du_code_est_dans_le_catalogue`
- Règle `no-restricted-syntax` de `eslint.config.mjs` (aucun texte codé en dur), bloquante en CI
- `backend/apps/identite/tests/test_push.py::test_not002_dans_la_langue_de_la_personne` ; `backend/apps/identite/tests/test_recuperation.py::test_demande_envoie_un_lien_dans_la_langue_de_l_utilisateur` ; `backend/apps/identite/tests/test_appareils_langue.py::test_l_utilisateur_choisit_sa_langue` ; `backend/apps/identite/tests/test_connexion.py::test_message_traduit_selon_la_langue`
- `portail/src/App.test.tsx`, test « change la langue et la mémorise sur le compte (USR-004) »

**Limites** : les comptes de démonstration (`@demo.invalid`) ne reçoivent aucun courriel ; sans push actif, l'écran verrouillé ne se vérifie pas.

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

### REC-20 — Restauration complète dans le délai RTO

**Énoncé** : « Restauration complète de la production sur un environnement jetable dans le délai RTO. »
**Exigences couvertes** : NFR-006 (RPO ≤ 1 h ; RTO ≤ 4 h).

**Qui et matériel** : l'administrateur technique, avec un accès à la base source et à un serveur PostgreSQL jetable. Le responsable produit assiste et signe la fiche.

**Données de départ** : l'hébergement de production installé (offres payantes, sauvegarde de nuit, R2). La phrase de chiffrement `SAUVEGARDE_PHRASE` disponible au coffre. En préproduction : la base de préproduction comme source.

**Étapes** (docs/exploitation.md §8)
1. Vérifiez que la sauvegarde de la nuit est verte dans Render et présente dans R2 (datée de moins de 24 h).
2. Lancez `SOURCE_URL=… CIBLE_ADMIN_URL=… scripts/tester_restauration.sh`. Les adresses se saisissent sur le serveur, jamais dans la fiche.
3. Notez la sortie des quatre étapes et la durée.
4. Pour la restauration de la sauvegarde de nuit elle-même : lancez le workflow GitHub « Test de restauration » (`.github/workflows/restauration.yml`, « Run workflow »), ou suivez §7.2 (`scripts/restaurer.sh`) dans une base jetable.
5. Sur la base restaurée : `/api/health/` d'une instance qui la lit, une connexion au portail, le journal d'audit.

**Résultat attendu**
- « 3/4 Contrôles » : « … tables, nombres de lignes identiques », « migrations : aucune en attente », politiques de sécurité au niveau des lignes et protections de l'audit présentes.
- « 4/4 Restauration complète en … s (RTO : 14400 s) », puis « Restauration conforme. ».
- La durée totale, de la décision à la base contrôlée, est inférieure à 4 heures.
- La base jetable est effacée à la fin.

**Preuve automatisée**
- Job « Test de restauration » de `.github/workflows/ci.yml` : lance `scripts/tester_restauration.sh` à chaque livraison, sur la base de test de la CI
- `.github/workflows/restauration.yml` : chaque mois, sur la vraie sauvegarde de nuit, une fois les secrets déclarés
- `backend/tests/test_hebergement.py::test_les_scripts_d_exploitation_sont_valides`
- Non prouvé automatiquement : la restauration de la **production** elle-même, tant que l'hébergement payant et les secrets ne sont pas en place.

| Date | Environnement | Joué par | Résultat (conforme / non conforme) | Défaut n° |
|---|---|---|---|---|
| | Préproduction | | | |
| | Pilote | | | |

---

## 3. Critères de sortie

La recette utilisateur est terminée quand **toutes** ces conditions sont réunies :

1. Les 20 scénarios sont « conformes » en préproduction, sur la version livrée pour le pilote.
2. Les 20 scénarios sont rejoués **pendant le pilote** et restent conformes. Pendant le pilote :
   - les scénarios du travail courant (REC-03 à REC-08, REC-11, REC-12, REC-15, REC-16, REC-19) se constatent sur l'activité réelle, sans créer de fausse donnée ;
   - les scénarios qui touchent à la structure ou à la sécurité (REC-01, REC-02, REC-09, REC-10, REC-13, REC-14, REC-17, REC-18, REC-20) se rejouent en préproduction, à la même version, pendant la période du pilote.
3. Aucun défaut **critique** ou **majeur** n'est ouvert. Cela vaut en particulier pour l'authentification, les permissions, l'isolation, la synchronisation, les workflows de validation et l'audit (prd.md §21.2, condition 2).
4. Chaque défaut mineur ouvert est noté, avec sa version de correction prévue.
5. Chaque fiche porte une date, un environnement, un nom et un résultat. Une fiche partielle (par exemple Grafana non installé, push non actif) est notée « non conforme » tant que la partie manquante n'est pas jouée.

---

## 4. Signatures

| Rôle | Nom | Date | Décision (recette prononcée / refusée) | Signature |
|---|---|---|---|---|
| Responsable produit | | | | |
| Responsable pays | | | | |

Réserves éventuelles :

&nbsp;

&nbsp;

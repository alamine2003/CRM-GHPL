# Dossier pour la Commission de protection des données personnelles (CDP, Sénégal)

Ce dossier prépare les formalités prévues par la loi n° 2008-12 sur la protection des données à caractère personnel avant le pilote (prd.md NFR-012, RSK-03, condition d'entrée de 0.9.7). Il décrit le traitement tel qu'il est construit dans INNOV CRM. **La démarche elle-même revient au responsable du traitement** : choisir la formalité (déclaration ou demande d'autorisation), remplir les formulaires en vigueur de la CDP, signer et déposer. Les passages entre crochets sont à compléter par l'entreprise ; aucune donnée réelle ne figure ici.

> À vérifier avant dépôt : les formulaires et la procédure en vigueur sur le site de la CDP, la formalité exacte attendue pour un traitement de gestion de la relation avec des professionnels de santé, et la position de la CDP sur un hébergement hors du Sénégal (prd.md O-03).

## 1. Responsable du traitement

| Rubrique | Contenu |
|---|---|
| Raison sociale | [à compléter] |
| Adresse au Sénégal | [à compléter] |
| Représentant légal | [à compléter] |
| Contact pour les personnes concernées | [adresse électronique dédiée, à créer] |
| Sous-traitant de développement | [à compléter si un prestataire maintient l'application] |

## 2. Finalités

1. Organiser l'activité des délégués médicaux : planning hebdomadaire, visites, rapports de visite.
2. Encadrer cette activité : validation des plannings et des rapports par l'encadrement, contrôles de conformité (heure, lieu de la visite).
3. Piloter l'activité : indicateurs agrégés par équipe, réseau, pays ; le siège ne voit que des agrégats sans nom, sauf consultation nominative tracée (RG-061).
4. Tenir un référentiel des professionnels de santé et des établissements visités.

Le traitement n'a pas pour finalité de collecter des données de santé de patients : aucune photo n'est possible (DC-48), les documents joints sont des PDF professionnels (fiches produit, études), et les textes de notification ne contiennent ni nom de prospect ni donnée de santé (RG-062).

## 3. Personnes concernées et données traitées

| Personnes | Données | Origine |
|---|---|---|
| Collaborateurs (délégués, superviseurs, encadrement, administrateurs) | Identité professionnelle, identifiant, courriel professionnel, rôles et périmètre, langue ; téléphones enregistrés (modèle, système, version, dernier contact) ; journal de connexion et d'audit | Saisie par l'administrateur pays, l'application |
| Délégués, pendant les visites | Heure et position GPS au début et à la fin de chaque visite, précision de la position, si le pays active la géolocalisation (RG-028) | Téléphone du délégué |
| Professionnels de santé (prospects) | Civilité, nom, prénom, spécialité, catégorie, potentiel, lieux d'exercice, numéro d'ordre professionnel, coordonnées professionnelles (le portable personnel est protégé, R10), historique des visites, retours exprimés sur des produits, actions prévues | Fichier existant (import), saisie et propositions de correction des délégués validées par l'administration |
| Établissements | Nom, type, adresse, téléphone, position de référence | Saisie, pointages des visites (DC-52) |

## 4. Licéité et information

- Collaborateurs : exécution du contrat de travail et intérêt légitime de l'entreprise à organiser son activité commerciale ; une notice d'information est remise à chaque délégué avant le premier usage, en particulier sur la géolocalisation (modèle en annexe A).
- Professionnels de santé : intérêt légitime de l'entreprise à entretenir une relation professionnelle d'information médicale ; une notice d'information est tenue à disposition (modèle en annexe B) [mode de remise à décider].

## 5. Destinataires

L'accès est limité par rôle et par pays (contrôle dans l'application et au niveau de la base de données, ADR-003) :

| Destinataire | Accès |
|---|---|
| Délégué | Son planning, ses rapports, sa liste de prospects |
| Superviseur, DM, DF | Les plannings et rapports de leur équipe ou de leurs réseaux |
| Responsable pays, administrateur pays | Le pays ; l'administrateur gère les comptes et les référentiels |
| Siège | Indicateurs agrégés par pays, sans nom ; consultation nominative exceptionnelle et tracée |
| Prestataires techniques | Hébergeur de l'application et des fichiers, service d'envoi des notifications sur téléphone ; détail au §7 |

## 6. Durées de conservation (RG-060, réglables par pays)

| Données | Durée |
|---|---|
| Activité (plannings, visites, rapports) et journal d'audit | 5 ans, puis anonymisation |
| Positions GPS des visites | 12 mois |
| Pièces jointes des rapports | 3 ans |
| Comptes des collaborateurs | Durée de l'emploi, puis archivage [durée à fixer] |
| Données gardées sur le téléphone | Effacées à la déconnexion, à la révocation du téléphone ou à la suspension du compte ; masquées après 7 jours sans synchronisation |

## 7. Transferts hors du Sénégal

| Service | Données | Lieu | Garanties |
|---|---|---|---|
| Hébergement de l'application et de la base (Render) | Toutes les données du traitement | [région à confirmer, Europe envisagée] | Chiffrement en transit (TLS 1.2+), accès restreint, sauvegardes [à confirmer avec l'offre retenue en 0.9.5] |
| Stockage des pièces jointes (Cloudflare R2) | Documents PDF des rapports | [région à confirmer] | Accès par l'application seulement, lecture tracée |
| Notifications sur téléphone (Expo, puis Apple et Google) | Une phrase générique (« Une correction de rapport est demandée. ») et des identifiants techniques | États-Unis | Aucun nom ni donnée de santé (RG-062, NOT-002 CA2) |
| Suivi des erreurs (Sentry), s'il est activé | Erreurs techniques, sans donnée personnelle en clair | [à confirmer] | Journaux pseudonymisés (architecture §16.3) |

Ces transferts appellent une **demande d'autorisation de transfert** auprès de la CDP (prd.md O-03), à déposer avec la formalité principale.

## 8. Mesures de sécurité

| Mesure | Où elle est vérifiée |
|---|---|
| Mots de passe de 12 caractères minimum, mots de passe compromis refusés, verrouillage après 5 échecs | SEC-001, SEC-002, tests automatisés |
| Double authentification obligatoire pour les rôles sensibles | SEC-003 |
| Sessions limitées, révocables ; verrouillage du téléphone après le délai du pays | SEC-004 |
| Base du téléphone chiffrée (SQLCipher), clé dans le magasin sécurisé | SEC-005 |
| Effacement à distance d'un téléphone perdu ou d'un compte suspendu | SEC-006 |
| Chiffrement des communications, aucun secret dans le code | SEC-007 |
| Isolation des pays dans la base (sécurité au niveau des lignes) et tests d'isolation | SEC-008, ADR-003 |
| Journal d'audit immuable des actions sensibles, des exports et des consultations nominatives | RG-061 |
| Courriels limités à la sécurité du compte | NOT-004 |
| Sauvegardes et restauration testées | Avant le pilote (0.9.5) |

## 9. Droits des personnes

Accès, rectification, opposition et effacement selon la loi : la demande est adressée au contact du §1 ; l'administrateur pays y répond dans l'application (correction de la fiche, archivage). Un professionnel de santé peut demander la correction de ses données ; les délégués proposent aussi des corrections, validées par l'administration (PRP-014). [Délai de réponse et procédure interne à fixer.]

## 10. Pièces à joindre et étapes

| # | Étape | Qui |
|---|---|---|
| 1 | Vérifier la formalité et les formulaires en vigueur de la CDP | Responsable du traitement |
| 2 | Compléter les rubriques entre crochets de ce dossier | Responsable du traitement |
| 3 | Confirmer l'hébergeur, la région et l'offre (0.9.5) et mettre à jour le §7 | Responsable du traitement, avec l'équipe technique |
| 4 | Déposer la formalité principale et la demande d'autorisation de transfert | Responsable du traitement |
| 5 | Remettre la notice aux délégués (annexe A) avant le pilote | Encadrement pays |
| 6 | Conserver le récépissé ou l'autorisation : condition d'entrée de 0.9.7 | Responsable du traitement |

## Annexe A — Notice aux délégués (modèle)

> INNOV CRM organise vos plannings, vos visites et vos rapports. Quand le pays l'active, l'application enregistre votre position **au début et à la fin de chaque visite seulement** (jamais en continu), pour vérifier le lieu de la visite ; ces positions sont gardées 12 mois. Votre encadrement voit vos plannings et vos rapports ; le siège ne voit que des chiffres d'ensemble, sauf consultation exceptionnelle, enregistrée. Les données gardées sur votre téléphone sont chiffrées et s'effacent si le téléphone est déclaré perdu. Pour exercer vos droits : [contact].

## Annexe B — Notice aux professionnels de santé (modèle)

> [Raison sociale] tient un fichier des professionnels de santé visités par ses délégués médicaux : identité et coordonnées professionnelles, lieux d'exercice, historique des visites et des échanges sur ses produits. Ces données servent à organiser l'information médicale ; elles ne contiennent aucune donnée sur vos patients. Elles sont conservées [durée] et ne sont pas cédées. Pour y accéder, les corriger ou vous opposer à leur traitement : [contact].

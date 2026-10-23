# INNOV CRM — Règles essentielles (contexte permanent des agents)

> Liste de contrôle **non négociable** pour toute personne ou tout agent qui modifie le projet. En cas de doute : [`prd.md`](prd.md) fait foi pour le métier, [`architecture.md`](architecture.md) pour la technique. Une règle d'ici ne change qu'avec l'accord du responsable produit, dans le même commit que `prd.md` / `architecture.md`.

## 1. Produit en bref

- CRM multi-pays des délégués médicaux de Generic Healthcare ; remplace BirdNotes.
- Délégué sur **mobile** (Android + iOS) : planning hebdomadaire → visites → rapport par visite.
- Superviseur sur **portail web** : approuve les plannings, valide les rapports.
- **Objectif n° 1 : prouver l'activité terrain.** Objectif n° 2 : simplicité pour le délégué.
- Pilote : pays **Sénégal** (distinct du siège). Capacité : **≥ 500 délégués par pays**, 17 pays à terme.

## 2. Rôles (codes exacts)

`admin_siege` · `direction_siege` (lecture seule) · `responsable_pays` (DG, consulte) · `admin_pays` (gère comptes, organisation, référentiels, doublons) · `df` · `dm` (consultent leurs réseaux ; le DM décide par escalade, remplacement, ou pour un superviseur-visiteur) · `superviseur` (décide) · `delegue` (types de poste `vm`, `vm_otc`, `kam`, `dermo`) · `admin_technique` (jamais de décision métier).

Matrice de référence : `prd.md` §6.3. Aucun nouveau rôle sans décision.

## 3. Vocabulaire imposé

Division (GHPL 1…) · Client (pharmacie, parapharmacie, grossiste) · Vente · Réseau (LEAP GYN…, porte un portefeuille) · Classe thérapeutique (Cardio…) · Zone · Secteur · Poste · Occupation · Rattachement · Périmètre · Prospect · Établissement · Exercice · Liste cible · Planning · Version · Passage · Visite · Rapport · Présentation · Remise. **Ne jamais écrire « gamme » seul.** Statuts : `prd.md` §17, sans variante.

## 4. Frontières fonctionnelles de la 1.0.0

- **Dans** : `prd.md` §8.
- **Hors** : stocks (seule la *remise* d'échantillons est saisie), notes de frais et montants (seul le *kilométrage* est affiché), commandes, facturation, paie, marketing, SMS, WhatsApp (après 1.0.0), GPS continu, signature électronique, gestion RH des congés.
- **Ajouté après la 1.0.0** (décision du 20 octobre 2026, `prd.md` §14.84) : le **suivi des ventes** des délégués au portail (import Excel ou saisie ; YTD, mensuel, ventes éclatées, objectifs par réseau). Il ne gère ni commande, ni facture, ni stock : il observe des totaux mensuels.

## 5. Règles multi-pays

- [ ] Toute table métier a `pays_id` ; le pays d'un objet ne change jamais.
- [ ] Le siège n'est pas un pays (pas de prospects, plannings, visites).
- [ ] Un utilisateur : un pays principal + affectations **datées** accordées par le siège ; un seul pays actif à la fois (en-tête `X-Pays`).
- [ ] Transfert : autorisé par le siège ; l'historique reste dans le pays d'origine.
- [ ] Toute variation entre pays est une **donnée** (`ParametrePays`, référentiels). Jamais de `if pays == …`.
- [ ] Dates en UTC, affichées dans le fuseau du pays.

## 6. Règles d'autorisation

- [ ] Le **serveur** décide seul ; portail et mobile ne font que masquer.
- [ ] Toute vue d'API hérite de la classe de base à périmètre ; tout accès passe par les `selectors`.
- [ ] Hors périmètre → `404` (ne pas révéler l'existence).
- [ ] Fiche prospect **commune** au pays ; visites et rapports **privés** au délégué ; superviseur = postes rattachés ; DM/DF = leurs réseaux.
- [ ] Toute consultation nominative par le siège (pilotage, ventes par délégué) et tout export sont audités.
- [ ] Toute modification de la matrice commence par `prd.md` §6.3, puis les tests d'isolation.

## 7. Règles des workflows

- [ ] **Aucune approbation ni validation automatique.** Le lot ne valide que les journées `conforme`.
- [ ] Commentaire obligatoire pour révision et correction ; motif obligatoire pour tout écart de visite et toute réouverture.
- [ ] Planning : soumission jeudi 18 h, approbation vendredi 18 h (paramétrables) ; escalade au DM après 24 h ouvrées ; remplaçant daté.
- [ ] Après approbation : mineure (heure, même jour) libre et tracée ; majeure = nouvelle version.
- [ ] Une visite = un prospect + un établissement + un rapport ; GPS au début et à la fin seulement.
- [ ] Rapport attendu le jour même avant 23 h 59 ; réouverture : superviseur ≤ 30 j, DM au-delà.
- [ ] Chaque soumission crée une **version figée** ; chaque décision porte auteur, date et mode.
- [ ] Doublons : fusion automatique seulement si **certaine** ; sinon file de l'`admin_pays` ; toute fusion est réversible.

## 8. Composants et responsabilités

| Composant | Technologie | Règle |
|---|---|---|
| API | Django 5.2 + DRF, `/api/v1`, OpenAPI versionné | Seule autorité métier |
| Worker / beat | Celery + Redis | Tâches à l'heure du pays, avec le pays en paramètre |
| Base | PostgreSQL 16, UUID v7, RLS sur `pays_id` | Une base, isolation par ligne |
| Portail | React 19 + TS + Vite + MUI, site statique Render (1.0.1) | Jetons de `packages/design` |
| Mobile | React Native + Expo, SQLite chiffrée (SQLCipher) | Base locale = source de l'écran |
| Fichiers | Cloudflare R2 privé, URL signées | Clés sans donnée personnelle |
| BI | Grafana sur schéma `pilotage`, un rôle par pays | Agrégats, jamais de texte libre |

Modules serveur : `socle`, `identite`, `organisation`, `perimetre`, `referentiel`, `prospects`, `planning`, `visites`, `rapports`, `notifications`, `pilotage`, `ventes`, `synchro`, `audit`, `imports`.

## 9. Séparation des responsabilités

- [ ] Un module n'écrit jamais dans les tables d'un autre : il appelle ses `services`.
- [ ] Transitions d'état définies une fois (`etats.py`), miroir TypeScript dans `packages/domaine` vérifié par test.
- [ ] Changement d'état = **commande** métier (soumettre, approuver, démarrer…), jamais un champ modifié librement.
- [ ] Commande = périmètre + garde + transition + version + audit + événement, **dans une transaction**.
- [ ] Types TypeScript de l'API **générés** depuis le schéma OpenAPI, jamais écrits à la main.

## 10. Sécurité

- [ ] Aucun secret, mot de passe, jeton ou donnée réelle dans le dépôt.
- [ ] Argon2id ; 12 caractères minimum ; verrouillage après 5 échecs.
- [ ] TOTP obligatoire : `admin_siege`, `direction_siege`, `responsable_pays`, `admin_pays`, `df`, `dm`.
- [ ] JWT 15 min ; rafraîchissement rotatif lié à l'appareil (cookie `HttpOnly` sur le portail, magasin sécurisé sur le mobile). Jamais de jeton dans `localStorage`.
- [ ] Mobile : base chiffrée, clé dans Keychain/Keystore, verrouillage biométrique, effacement à distance.
- [ ] TLS partout, CSP stricte, CORS limité, limitation de débit.

## 11. Protection des données

- [ ] Données **fictives** uniquement hors production (démo, tests, exemples, documents).
- [ ] Aucun nom de prospect ni donnée de santé dans une notification push, un journal technique, une clé de fichier ou une URL.
- [ ] Conservation : activité et audit 5 ans puis anonymisation ; GPS 12 mois ; pièces jointes 3 ans (paramétrable par pays).
- [ ] Utilisateurs désactivés, jamais supprimés ; suppressions métier logiques.
- [ ] Formalités CDP avant le pilote ; formalités du pays avant chaque ouverture.

## 12. Hors connexion

- [ ] 7 jours sans réseau : semaine, liste cible, portefeuilles, brouillons, rapports, historique des 3 dernières visites.
- [ ] Au-delà de 7 jours sans synchronisation réussie : données inaccessibles, file conservée.
- [ ] État de synchronisation et éléments en attente **toujours visibles**.
- [ ] Brouillons sauvegardés automatiquement ; rien ne se perd à la fermeture de l'application.

## 13. Synchronisation

- [ ] UUID générés par le créateur ; chaque opération a un `id_operation` ; rejouer = aucun effet supplémentaire.
- [ ] **Les décisions du serveur gagnent toujours.** Un objet soumis est en lecture seule sur le téléphone.
- [ ] Version périmée = conflit présenté au délégué ; **jamais de fusion silencieuse**.
- [ ] Tirer par curseur (`JournalChangement`) dans la portée de l'appareil, avec pierres tombales.
- [ ] Double horodatage local/serveur ; écart d'horloge détecté.
- [ ] `appareil_revoque` / `compte_desactive` → effacement local complet.

## 14. Audit

- [ ] `evenement_audit` append-only (INSERT seul, déclencheur anti-modification), écrit dans la transaction métier.
- [ ] Audités au minimum : connexions et échecs, décisions et leur mode, escalades, remplacements, rôles, affectations, transferts, fusions/défusions, imports, exports, consultations nominatives du siège, paramètres, révocations.
- [ ] Jamais de mot de passe, jeton ou contenu de rapport dans l'audit.

## 15. Conventions de développement

- [ ] Code, interface, documentation et messages de commit en **français** ; textes affichés externalisés (`fr` et `en`), jamais codés en dur.
- [ ] Versions : `0.0.1`…`0.0.9`, `0.1.1`…`0.9.9`, puis `1.0.0` ; jamais de `x.y.0` avant `1.0.0` ; étiquette `vX.Y.Z` ; même version affichée par l'API, le portail et l'application ; `CHANGELOG.md` à chaque version.
- [ ] Toute exigence citée par son identifiant (`PLN-004`, `RG-018`) dans le commit ou la PR qui la livre.
- [ ] Migrations « étendre puis contracter » ; migration de données volumineuse en tâche worker.
- [ ] Fonctionnalité incomplète derrière un drapeau de configuration.
- [ ] Interface conforme à la maquette INNOV CRM (bleu marine `#1B2A5B`, orange `#F26B1D`, Plus Jakarta Sans / DM Sans, thème clair et sombre) ; statuts jamais indiqués par la seule couleur.

## 16. Stratégie de tests

- [ ] **Suite d'isolation** (rôle × action × autre pays / réseau / délégué, y compris recherche, export, pièce jointe, notification, synchronisation, Grafana) : bloquante, toujours.
- [ ] Test qui échoue si une route d'API n'utilise pas la classe de base à périmètre.
- [ ] Tests des machines à états, des règles `RG-*`, du détecteur de doublons, de la synchronisation (rejeu, coupure, conflits).
- [ ] Chaque critère d'acceptation livré a un test automatisé ou une procédure de recette écrite.
- [ ] Couverture ≥ 90 % sur `perimetre`, `synchro`, `planning`, `visites`, `rapports`, `audit`.

## 17. Obligatoire avant toute livraison

- [ ] CI au vert : lint, types, tests, isolation, schéma OpenAPI à jour, analyse de secrets, builds.
- [ ] Critères d'acceptation des exigences livrées vérifiés.
- [ ] Migrations répétées en préproduction (à partir de l'existence de la préproduction).
- [ ] `CHANGELOG.md` et version mis à jour ; instance de démonstration déployée.
- [ ] `prd.md`, `architecture.md` et ce fichier mis à jour si une décision a changé.
- [ ] Fin de cycle (`x.y.9`) : démonstration à un référent métier. `1.0.0` : autorisation de la direction générale (`prd.md` §21.2).

## 18. Décisions déjà validées

Monolithe modulaire (ADR-001) · pile AMM : Django/DRF/PostgreSQL/Redis/Celery + React/MUI (ADR-002) · base unique isolée par `pays_id` (ADR-003) · React Native + Expo, pas de PWA (ADR-004) · Render (Francfort, API et portail) + R2 (ADR-007, révisé en 1.0.1) · aucune validation automatique (ADR-010) · configuration par pays en données (ADR-017) · convention de version (ADR-018) · `fr` + `en` (ADR-019) · données fictives hors production (ADR-020). Recommandations à confirmer : `architecture.md` §28 (statut [R]).

## 19. Interdictions

- ❌ Valider ou approuver automatiquement un planning ou un rapport.
- ❌ Renvoyer, rechercher, exporter ou notifier une donnée hors du périmètre de l'utilisateur.
- ❌ Écraser une décision du serveur par une donnée du téléphone ; fusionner deux versions en silence.
- ❌ Supprimer physiquement un utilisateur, un prospect, une visite, un rapport ou un événement d'audit.
- ❌ Modifier un rapport validé sans réouverture motivée et auditée.
- ❌ Coder une règle propre à un pays.
- ❌ Suivre la position GPS en continu ou en arrière-plan.
- ❌ Ajouter stocks, notes de frais, commandes, SMS ou WhatsApp avant décision explicite.
- ❌ Mettre un secret, un mot de passe ou une donnée personnelle réelle dans le code, les tests, la démo ou la documentation.
- ❌ Désactiver, ignorer ou marquer « à corriger plus tard » un test d'isolation pour livrer.
- ❌ Utiliser `localStorage` pour un jeton, ou une PWA à la place de l'application mobile.

# Dossier de décision de lancement — INNOV CRM 1.0.0 (version candidate 0.9.9)

Ce dossier s'adresse à la **direction générale**, qui seule autorise le passage de la 0.9.9 à la 1.0.0 (prd.md §21.3). Il reprend les neuf conditions du PRD (§21.2) et dit, pour chacune, où l'on en est, sur quelle preuve, et ce qui reste à faire. Il est écrit franchement : ce qui ne peut se faire que sur le terrain, ou par l'entreprise, est dit comme tel.

## 1. Où en est le produit

- **Périmètre** : tout le périmètre de la 1.0.0 (prd.md §8) est livré, version par version, de 0.0.1 à 0.9.9. Chaque version a son journal (`CHANGELOG.md`) et sa section « mise en œuvre » dans le PRD (§14).
- **Gel fonctionnel** : depuis la 0.9.9, plus aucune fonction nouvelle avant la 1.0.0. Seules entrent les corrections de défauts relevés en recette ou pendant le pilote.
- **Qualité vérifiée à chaque livraison** (intégration continue) :
  - 1 122 tests du serveur ;
  - 180 tests du portail ;
  - 211 tests de l'application mobile ;
  - la suite d'isolation entre pays, rôles, réseaux et délégués ;
  - un test de restauration de la base ;
  - l'audit des dépendances.

## 2. Les neuf conditions

| # | Condition (prd.md §21.2) | État | Preuve | Ce qui reste |
|---|---|---|---|---|
| 1 | Scénarios REC-01 à REC-20 passés en préproduction et pendant le pilote | **Prêt à jouer** | Chaque scénario a une preuve automatisée (`docs/recette-utilisateur.md`) | Les jouer à la main en préproduction, puis pendant le pilote, et signer le kit |
| 2 | Aucun défaut critique ou majeur ouvert (authentification, permissions, isolation, synchronisation, validation, audit) | **Atteint à ce jour** | Revue de sécurité (`docs/revue-securite.md`), suite d'isolation, tests | Test d'intrusion indépendant ; défauts éventuels de la recette et du pilote |
| 3 | Tests de non-régression, d'isolation, de sécurité, de charge et de restauration concluants | **Atteint** | CI verte ; charge sur 500 délégués (tous les écrans sous 500 ms, `docs/charge.md`) ; restauration en 21 s pour 400 Mo | Mesure par le réseau (k6) sur la préproduction ; 2 s perçues en 3G sur le téléphone, aux essais de terrain |
| 4 | Pilote d'au moins 4 semaines au Sénégal avec un réseau complet ; KPI-01 à KPI-07 mesurés et présentés | **À faire sur le terrain** | Protocole `docs/pilote.md` ; mesure `rapport_pilote` | Le pilote lui-même, ses indicateurs réels, la décision d'extension |
| 5 | Formalités CDP accomplies | **À faire par l'entreprise** | Dossier prêt (`docs/dossier-cdp.md`) | Dépôt par le responsable du traitement ; récépissé ; autorisation de transfert hors du Sénégal |
| 6 | Hébergement sur offres payantes, base persistante, sauvegardes, restauration testée | **Prêt à déployer** | Plan `render.yaml`, sauvegarde de nuit chiffrée, test de restauration (CI et mensuel), guide `docs/exploitation.md` | Souscrire les offres (Render, Cloudflare R2, Sentry), appliquer le plan, réussir un premier test de restauration en production |
| 7 | Applications publiées sur Google Play et l'App Store | **Prêt à publier** | Profil de construction `production`, guide `docs/publication-magasins.md` | Comptes de développeur de l'entreprise, choix de distribution (O-06), politique de confidentialité en ligne, relecture des magasins |
| 8 | Guide utilisateur (délégué, superviseur, administrateur pays) et guide d'exploitation | **Atteint** | `docs/guides/`, `docs/exploitation.md`, `docs/mise-a-jour.md` | Les relire avec les premiers utilisateurs pendant le pilote |
| 9 | Autorisation formelle de la direction générale | **À décider** | Ce dossier | La signature ci-dessous |

## 3. Ordre conseillé jusqu'à la 1.0.0

1. **Formalités CDP** (condition 5) : rien de réel ne peut commencer avant.
2. **Hébergement payant** (condition 6) : souscrire, appliquer `render.yaml`, réussir un test de restauration.
3. **Préproduction** : dérouler la recette utilisateur (condition 1) ; mesurer par le réseau (k6) ; faire faire un test d'intrusion indépendant.
4. **Essais de terrain** (`docs/essais-terrain.md`), puis **reprise de BirdNotes** : répétition à blanc, puis jour J (`docs/mise-a-jour.md` §5).
5. **Publication des applications** (condition 7), au moins en piste interne ou en distribution privée pour le pilote.
6. **Pilote de 4 semaines** (condition 4), avec les indicateurs chaque semaine.
7. **Corrections** des défauts du pilote, en 0.9.x.
8. **Décision de la direction générale** (condition 9) au vu de ce dossier mis à jour.

## 4. Risques à connaître

| Risque | Effet | Ce qui le réduit |
|---|---|---|
| Retard des formalités CDP | Le pilote ne peut pas commencer | Dossier prêt ; à déposer au plus tôt |
| Réseau très faible dans certaines zones | Envois tardifs, rapports « en retard » | Travail hors ligne de 7 jours (réglable par pays), envois rejoués sans doublon |
| Adoption lente par les délégués | KPI-05 bas | Formation, guides, point quotidien la première semaine |
| Données de BirdNotes de qualité inégale | Fiches à corriger | Rapport d'anomalies, file des doublons, répétition à blanc |
| Un seul administrateur technique | Dépendance à une personne | Guide d'exploitation ; désigner une suppléance |

## 5. Décision

Au vu de ce dossier, la direction générale :

- [ ] autorise le passage à la 1.0.0 et la mise en production au Sénégal ;
- [ ] autorise le pilote seulement, la 1.0.0 étant décidée à son bilan ;
- [ ] demande les compléments suivants : …

Date : …………………… Nom et fonction : …………………………………… Signature : ……………………

# Mise à jour, retour arrière et migration BirdNotes (version 0.9.6)

Ce guide complète le guide d'exploitation (`docs/exploitation.md`). Il dit comment livrer une nouvelle version sans interrompre le travail, comment revenir en arrière si elle pose problème, et comment se déroule la reprise des données de BirdNotes. Il s'adresse à l'administrateur technique. La conception de référence est dans `architecture.md` §21.

## 1. Principes

- **Une version à la fois**, dans l'ordre : `0.9.5`, puis `0.9.6`… (ADR-018). Chaque version a son étiquette git `vX.Y.Z`, sa section dans `CHANGELOG.md`, et l'API l'affiche (`/api/health/`).
- **Préproduction d'abord.** Une version n'arrive en production qu'après avoir tourné en préproduction, avec les mêmes réglages, au moins une journée.
- **Migrations « étendre puis contracter ».** Une version ajoute (colonne, table) sans retirer ce que la précédente lit. Le retrait vient à la version suivante. Ainsi l'ancienne et la nouvelle version tournent sur la même base, et le retour arrière ne demande pas de restauration.
- **Chaque migration se défait.** Un test le vérifie à chaque livraison (`tests/test_migrations.py`) : aucune opération sans retour.
- **Les téléphones suivent.** Une mise à jour de l'application passe par EAS Update quand le code natif n'a pas changé, sinon par une nouvelle version sur les magasins. Le téléphone envoie sa version ; quand une livraison change le protocole, l'exploitation relève `INNOV_VERSION_MIN_APP` et l'API refuse (code `426`, « mise à jour requise ») une application plus ancienne, qui garde ses données en lecture (architecture §14.8). [D, 9 octobre 2026, délégation] On ne la relève que deux semaines après la publication de la version qui l'exige, le temps que les téléphones se mettent à jour.

## 2. Livrer une version

| Étape | Qui | Comment | Contrôle |
|---|---|---|---|
| 1. CI verte | Développement | Pull request : lint, types, tests, isolation, schéma | Aucune vérification rouge |
| 2. Étiquette | Responsable technique | `git tag vX.Y.Z` sur `main`, puis push | La CI de l'étiquette est verte |
| 3. Sauvegarde | Administrateur technique | Vérifier la sauvegarde de la nuit (Render, R2) | Datée de moins de 24 h |
| 4. Préproduction | Administrateur technique | Déployer l'étiquette ; Render lance `migrate` avant de basculer | `/api/health/` donne la nouvelle version ; parcours clés (§4) |
| 5. Annonce | Responsable produit | Prévenir les utilisateurs si un écran change (notes de version courtes) | Message envoyé |
| 6. Production | Administrateur technique | Déployer la même étiquette, hors des heures de tournée (après 20 h, heure du pays) | Même contrôles qu'en 4 |
| 7. Portail | Automatique | Render publie la construction de l'étiquette (site statique `innov-portail`) | L'accueil du portail affiche la nouvelle version du service |
| 8. Téléphones | Responsable technique | `eas update --channel production` (ou nouvelle version sur les magasins ; `EAS_PROJECT_ID` déclaré, `docs/publication-magasins.md`) | Un téléphone de test reçoit la mise à jour |
| 9. Surveillance | Administrateur technique | Sentry et UptimeRobot pendant 24 h | Pas d'erreur nouvelle |

Durée habituelle : 15 minutes de déploiement, aucune coupure (Render bascule quand la nouvelle instance répond à `/api/health/`).

## 3. Revenir en arrière

On revient en arrière quand une version provoque une erreur bloquante que l'on ne sait pas corriger dans l'heure.

1. **API, worker, ordonnanceur** : dans Render, sur chaque service, « Rollback » vers le déploiement précédent. Les migrations de la version retirée restent appliquées : grâce à « étendre puis contracter », l'ancienne version les tolère.
2. **Portail** : dans Render, service `innov-portail`, « Rollback » vers le déploiement précédent.
3. **Téléphones** : `eas update:republish` de la mise à jour précédente sur le canal `production`.
4. **Si une migration doit vraiment être défaite** (rare : une donnée mal transformée) :
   ```bash
   python manage.py showmigrations <application>
   python manage.py migrate <application> <migration_précédente>
   ```
   Toujours sur une base sauvegardée juste avant, et d'abord en préproduction.
5. **Si des données ont été abîmées** : restaurer (guide d'exploitation §7.2), puis rejouer depuis les téléphones ce qui a été saisi après.
6. Consigner l'incident : version, heure, cause, retour arrière, correction prévue.

## 4. Parcours à vérifier après chaque livraison

- Se connecter au portail (compte de test de l'environnement), ouvrir l'accueil.
- Superviseur : « Plannings à valider », « À traiter », tableau d'équipe.
- Administrateur pays : « Organisation », « Journal d'audit ».
- Téléphone de test : synchroniser, ouvrir le programme du jour, rédiger un rapport (en préproduction seulement).
- `/api/health/` : base et file joignables, bonne version.

## 5. Migration des données de BirdNotes

La reprise des données de BirdNotes (prospects, établissements, secteurs, produits ; PRP-013, prd.md §14.7) se fait une fois, avant l'ouverture aux utilisateurs. Elle se **répète à blanc** avant le jour J.

### 5.1 Répétition à blanc (préproduction)

```bash
python manage.py repeter_migration Export.json.zip --pays SN --auteur prenom.nom
```

La commande enchaîne, sur la base où elle tourne :
1. une **simulation** : tout est calculé puis annulé, le rapport d'anomalies est produit ;
2. l'**import** réel, chronométré ;
3. un **second import** du même fichier, qui ne doit rien créer (chaque ligne est reconnue par son identifiant BirdNotes) ;
4. le **rapprochement** : pour chaque table, le nombre de lignes du fichier, le nombre repris, le nombre écarté avec son motif ; la commande échoue si une ligne n'est ni reprise ni expliquée.

Avec l'export fictif (`generer_export_birdnotes`, même structure que le vrai, valeurs inventées), la répétition se rejoue partout sans donnée réelle. Un test la rejoue à chaque livraison sur un petit export fictif.

Répétition du 9 octobre 2026 (export fictif au volume du vrai, base neuve) :

| Table | Lignes du fichier | Créées | Écart |
|---|---|---|---|
| Secteurs | 49 | 48 (1 variante fusionnée) | 0 |
| Localités | 240 | 240 | 0 |
| Produits | 156 | 156 | 0 |
| Établissements | 1 499 | 1 478 (les autres écartés avec leur motif) | 0 |
| Prospects | 6 050 | 6 011 (les autres écartés avec leur motif) | 0 |

Simulation : 42 secondes ; import : 43 secondes ; second import : 12 secondes, sans rien créer ; 653 anomalies dans le rapport. La migration tient donc largement dans la soirée du jour J.

**Le vrai fichier BirdNotes ne se dépose jamais dans le dépôt ni en préproduction avant les formalités CDP.**

### 5.2 Jour J (production)

| Moment | Action | Responsable |
|---|---|---|
| J − 7 | Répétition à blanc en préproduction avec le dernier export ; lecture du rapport d'anomalies avec l'administrateur pays | Administrateur technique, administrateur pays |
| J − 1, 18 h | Gel de BirdNotes : plus de saisie | Responsable pays |
| J − 1, 19 h | Export de BirdNotes, déposé dans le coffre de l'entreprise (jamais par courriel) | Administrateur pays |
| J − 1, 20 h | Sauvegarde de la base de production, puis simulation ; si le rapport est conforme à la répétition, import réel | Administrateur technique |
| J − 1, 21 h | Contrôles : nombres du rapprochement, quelques fiches tirées au hasard comparées à BirdNotes | Administrateur pays |
| J, 7 h | Ouverture aux délégués du pilote ; BirdNotes reste consultable en lecture seule | Responsable pays |

**Retour arrière de la migration** : si les contrôles échouent, restaurer la sauvegarde de 20 h (guide d'exploitation §7.2) ; BirdNotes reprend le lendemain, rien n'est perdu.

## 6. Ce que l'entreprise doit fournir

- Le dernier export de BirdNotes, à J − 7 puis à J − 1, après les formalités CDP.
- Une personne de l'administration pays pour lire le rapport d'anomalies et contrôler les fiches.
- La date du gel de BirdNotes, annoncée aux délégués.

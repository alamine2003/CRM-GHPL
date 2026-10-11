# Grafana d'INNOV CRM

Mise en place des tableaux de bord analytiques (DSH-010, DSH-011 ; architecture §25.2). Aucun secret dans ce dépôt : les mots de passe se donnent sur le serveur, jamais dans un fichier versionné.

## Ce que Grafana lit

- Le schéma `pilotage` de la base : la table `agregat_jour` (comptages par pays, jour et réseau) et ses vues. Aucun nom de délégué, aucun texte de rapport (DSH-010 CA3).
- Les agrégats sont recalculés **chaque heure** par le worker (tâche `apps.pilotage.taches.rafraichir_grafana`, à la minute 7) sur les 35 derniers jours (DSH-011). Le panneau « Fraîcheur des données » affiche l'heure du dernier calcul.
- Pour reprendre un historique plus long : `python manage.py rafraichir_grafana --jours 365`.

## Isolation par pays

| Rôle PostgreSQL | Lit | Organisation Grafana |
|---|---|---|
| `innov_grafana_<pays>` (ex. `innov_grafana_sn`) | `pilotage.<pays>_pays_jour`, `pilotage.<pays>_reseau_jour`, `pilotage.<pays>_fraicheur` | Une par pays |
| `innov_grafana_siege` | `pilotage.indicateurs_pays_jour`, `pilotage.fraicheur` (agrégat par pays, sans réseau) | Siège |

Aucun de ces rôles ne lit les tables métier. La descente nominative reste dans le portail, où elle est auditée (DSH-004).

## Étapes

1. **Vues et rôles** (après chaque création de pays) :
   ```bash
   python manage.py grafana_acces              # relire les instructions
   python manage.py grafana_acces --appliquer  # les exécuter
   ```
   Les rôles sont créés **sans connexion**.
2. **Mot de passe de chaque rôle**, par l'administrateur technique, dans une session `psql` sur le serveur (jamais dans un fichier) :
   ```sql
   ALTER ROLE innov_grafana_sn LOGIN PASSWORD '…';
   ```
   Si l'hébergeur refuse la création de rôles (hypothèse HT-07), demander à son support, ou créer un utilisateur par pays depuis sa console et lui accorder les mêmes droits (`GRANT USAGE ON SCHEMA pilotage`, `GRANT SELECT` sur les vues du pays).
3. **Service Grafana** (Render ou Grafana Cloud, O-04) : copier `deploiement/grafana/provisioning` dans `/etc/grafana/provisioning` et `deploiement/grafana/tableaux` dans `/etc/grafana/tableaux`, puis définir dans l'environnement du service :
   - `INNOV_GRAFANA_HOTE` (hôte:port de la base), `INNOV_GRAFANA_BASE` ;
   - `INNOV_GRAFANA_SIEGE_MDP`, `INNOV_GRAFANA_SN_MDP`, `INNOV_GRAFANA_TG_MDP`.
4. **Organisations** : 1 = siège, 2 = Sénégal, 3 = Togo (à créer dans Grafana avant le premier démarrage). Dans le tableau « pilotage du pays », la variable « Code du pays » vaut le code de l'organisation (`sn`, `tg`) ; changer de code n'ouvre rien : le rôle de la source n'a pas les droits.
5. **Comptes** : nominatifs, créés par l'administrateur technique sur demande de l'administrateur du siège ou du pays [H], avec le rôle « Viewer ».

## Vérifier

- `pytest apps/pilotage/tests/test_grafana.py` : un rôle de pays ne lit que ses vues, le siège que l'agrégat, aucune table métier ; les sommes des jours égalent le tableau du portail.
- Dans Grafana, organisation d'un pays : les tableaux s'affichent ; une requête sur la vue d'un autre pays répond « permission denied ».

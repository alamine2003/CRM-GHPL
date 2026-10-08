"""Schéma `pilotage` pour Grafana (DSH-010, DSH-011 ; architecture §25.2, 0.7.9).

Une table d'agrégats par pays, jour et réseau, sans nom de délégué ni texte libre (DSH-010
CA3), recalculée chaque heure ; des vues en lecture seule par-dessus. Les vues propres à un
pays et les rôles `innov_grafana_<pays>` sont posés par `manage.py grafana_acces`.
"""

from django.db import migrations

SQL = """
CREATE SCHEMA IF NOT EXISTS pilotage;

CREATE TABLE pilotage.agregat_jour (
  pays_code text NOT NULL,
  jour date NOT NULL,
  -- NULL : l'ensemble du pays, chaque délégué compté une fois ; sinon un réseau (DSH-003).
  reseau_id uuid,
  reseau text NOT NULL DEFAULT '',
  delegues_actifs integer NOT NULL,
  visites_prevues integer NOT NULL,
  visites_echues integer NOT NULL,
  visites_effectuees_prevues integer NOT NULL,
  visites_effectuees integer NOT NULL,
  visites_imprevues integer NOT NULL,
  ecarts integer NOT NULL,
  ecarts_justifies integer NOT NULL,
  visites_geolocalisees integer NOT NULL,
  rapports_soumis integer NOT NULL,
  rapports_dans_delai integer NOT NULL,
  rapports_valides integer NOT NULL,
  calcule_le timestamptz NOT NULL
);
CREATE UNIQUE INDEX agregat_jour_unique ON pilotage.agregat_jour
  (pays_code, jour, coalesce(reseau_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Vues de lecture : le pays entier (siège, agrégé), le détail par réseau, la fraîcheur.
CREATE VIEW pilotage.indicateurs_pays_jour WITH (security_barrier) AS
  SELECT pays_code, jour, delegues_actifs, visites_prevues, visites_echues,
         visites_effectuees_prevues, visites_effectuees, visites_imprevues, ecarts,
         ecarts_justifies, visites_geolocalisees, rapports_soumis, rapports_dans_delai,
         rapports_valides, calcule_le
  FROM pilotage.agregat_jour WHERE reseau_id IS NULL;
CREATE VIEW pilotage.indicateurs_reseau_jour WITH (security_barrier) AS
  SELECT pays_code, jour, reseau, delegues_actifs, visites_prevues, visites_echues,
         visites_effectuees_prevues, visites_effectuees, visites_imprevues, ecarts,
         ecarts_justifies, visites_geolocalisees, rapports_soumis, rapports_dans_delai,
         rapports_valides, calcule_le
  FROM pilotage.agregat_jour WHERE reseau_id IS NOT NULL;
CREATE VIEW pilotage.fraicheur WITH (security_barrier) AS
  SELECT pays_code, max(calcule_le) AS calcule_le FROM pilotage.agregat_jour GROUP BY pays_code;
"""

RETOUR = "DROP SCHEMA IF EXISTS pilotage CASCADE;"


class Migration(migrations.Migration):
    dependencies = [("pilotage", "0002_securite_lignes")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

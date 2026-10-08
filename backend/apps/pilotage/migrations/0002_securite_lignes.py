"""Sécurité au niveau des lignes sur `pilotage_objectif` (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE pilotage_objectif ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilotage_objectif FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON pilotage_objectif
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON pilotage_objectif;
ALTER TABLE pilotage_objectif NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pilotage_objectif DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("pilotage", "0001_objectifs")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

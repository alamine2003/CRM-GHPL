"""Sécurité au niveau des lignes sur `planning_conformitejournee` (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE planning_conformitejournee ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_conformitejournee FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON planning_conformitejournee
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON planning_conformitejournee;
ALTER TABLE planning_conformitejournee NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_conformitejournee DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("planning", "0021_conformite_journee")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

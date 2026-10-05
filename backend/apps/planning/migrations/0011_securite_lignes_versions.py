"""Sécurité au niveau des lignes sur `planning_versionplanning` (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE planning_versionplanning ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_versionplanning FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON planning_versionplanning
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON planning_versionplanning;
ALTER TABLE planning_versionplanning NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_versionplanning DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("planning", "0010_versions_decisions")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

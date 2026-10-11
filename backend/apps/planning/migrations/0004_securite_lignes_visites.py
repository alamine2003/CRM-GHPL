"""Sécurité au niveau des lignes sur les visites planifiées (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE planning_visite ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_visite FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON planning_visite
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON planning_visite;
ALTER TABLE planning_visite NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_visite DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("planning", "0003_visites")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

"""Sécurité au niveau des lignes sur les versions figées des rapports (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE rapports_versionrapport ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports_versionrapport FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON rapports_versionrapport
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON rapports_versionrapport;
ALTER TABLE rapports_versionrapport NO FORCE ROW LEVEL SECURITY;
ALTER TABLE rapports_versionrapport DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("rapports", "0008_soumission_versions")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

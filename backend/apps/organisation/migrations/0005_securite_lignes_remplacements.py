"""Sécurité au niveau des lignes sur `organisation_remplacement` (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE organisation_remplacement ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_remplacement FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON organisation_remplacement
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON organisation_remplacement;
ALTER TABLE organisation_remplacement NO FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_remplacement DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("organisation", "0004_remplacements")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

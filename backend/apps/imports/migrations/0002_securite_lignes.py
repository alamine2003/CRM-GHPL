"""Sécurité au niveau des lignes sur les lots d'import et les références externes (ADR-003)."""

from django.db import migrations

TABLES = ["imports_lotimport", "imports_referenceexterne"]


def activer(table: str) -> str:
    return f"""
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON {table}
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""


def desactiver(table: str) -> str:
    return f"""
DROP POLICY IF EXISTS isolation_pays ON {table};
ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;
ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("imports", "0001_imports"), ("organisation", "0002_securite_lignes")]

    operations = [migrations.RunSQL(activer(t), desactiver(t)) for t in TABLES]

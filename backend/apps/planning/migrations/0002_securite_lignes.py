"""Sécurité au niveau des lignes sur les jours fériés et les plannings (ADR-003)."""

from django.db import migrations

TABLES = ["planning_jourferie", "planning_planning"]


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
    dependencies = [("planning", "0001_calendrier_planning")]

    operations = [migrations.RunSQL(activer(t), desactiver(t)) for t in TABLES]

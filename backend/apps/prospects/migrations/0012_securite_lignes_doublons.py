"""Sécurité au niveau des lignes sur les fusions, doublons, historique et propositions
(ADR-003, architecture §12)."""

from django.db import migrations

TABLES = [
    "prospects_fusion",
    "prospects_doublonprobable",
    "prospects_changement",
    "prospects_proposition",
]


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
    dependencies = [("prospects", "0011_doublons_historique_propositions")]

    operations = [migrations.RunSQL(activer(t), desactiver(t)) for t in TABLES]

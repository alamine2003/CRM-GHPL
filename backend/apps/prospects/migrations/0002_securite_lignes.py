"""Sécurité au niveau des lignes sur les fiches prospects (ADR-003, architecture §12)."""

from django.db import migrations

TABLES = ["prospects_prospect"]


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
    dependencies = [
        ("prospects", "0001_prospects"),
        ("organisation", "0002_securite_lignes"),
    ]

    operations = [
        migrations.RunSQL(activer(t), desactiver(t)) for t in TABLES
    ] + [
        # Recherche tolérante (accents, fautes de frappe) : index trigramme sur le nom normalisé.
        migrations.RunSQL(
            "CREATE INDEX prospect_nom_trgm ON prospects_prospect "
            "USING gin (nom_normalise gin_trgm_ops);",
            "DROP INDEX IF EXISTS prospect_nom_trgm;",
        )
    ]

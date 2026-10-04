"""Sécurité au niveau des lignes sur les établissements (ADR-003) et recherche tolérante."""

from django.db import migrations


TABLE = "prospects_etablissement"


class Migration(migrations.Migration):
    dependencies = [("prospects", "0004_etablissements")]

    operations = [
        migrations.RunSQL(
            f"""
ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON {TABLE}
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
CREATE INDEX etablissement_nom_trgm ON {TABLE} USING gin (nom_normalise gin_trgm_ops);
""",
            f"""
DROP INDEX IF EXISTS etablissement_nom_trgm;
DROP POLICY IF EXISTS isolation_pays ON {TABLE};
ALTER TABLE {TABLE} NO FORCE ROW LEVEL SECURITY;
ALTER TABLE {TABLE} DISABLE ROW LEVEL SECURITY;
""",
        )
    ]

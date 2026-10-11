"""Sécurité au niveau des lignes sur les exercices (ADR-003, architecture §12)."""

from django.db import migrations

TABLE = "prospects_exercice"


class Migration(migrations.Migration):
    dependencies = [("prospects", "0007_exercices")]

    operations = [
        migrations.RunSQL(
            f"""
ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON {TABLE}
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
""",
            f"""
DROP POLICY IF EXISTS isolation_pays ON {TABLE};
ALTER TABLE {TABLE} NO FORCE ROW LEVEL SECURITY;
ALTER TABLE {TABLE} DISABLE ROW LEVEL SECURITY;
""",
        )
    ]

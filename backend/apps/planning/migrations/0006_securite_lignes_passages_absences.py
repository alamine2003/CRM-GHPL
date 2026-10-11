"""Sécurité au niveau des lignes sur les passages et les absences (ADR-003)."""

from django.db import migrations

TABLES = ("planning_passage", "planning_absence")
SQL = "".join(
    f"""
ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {t} FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON {t}
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
    for t in TABLES
)
RETOUR = "".join(
    f"""
DROP POLICY IF EXISTS isolation_pays ON {t};
ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY;
ALTER TABLE {t} DISABLE ROW LEVEL SECURITY;
"""
    for t in TABLES
)


class Migration(migrations.Migration):
    dependencies = [("planning", "0005_passages_absences_ordre")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

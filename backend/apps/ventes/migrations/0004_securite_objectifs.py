"""Sécurité au niveau des lignes sur `ventes_objectifvente` (ADR-003)."""

from django.db import migrations

T = "ventes_objectifvente"

SQL = f"""
ALTER TABLE {T} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {T} FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON {T}
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = f"""
DROP POLICY IF EXISTS isolation_pays ON {T};
ALTER TABLE {T} NO FORCE ROW LEVEL SECURITY;
ALTER TABLE {T} DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("ventes", "0003_objectifs_ventes")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

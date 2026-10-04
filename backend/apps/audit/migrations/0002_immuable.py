"""AUD-001 CA2 : la base refuse UPDATE, DELETE et TRUNCATE sur le journal d'audit.

Les déclencheurs s'appliquent à tous les rôles, propriétaire de la table compris.
Seule la commande de démonstration les suspend, le temps de vider une base fictive.
"""

from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION audit_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Journal d''audit immuable (AUD-001) : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER audit_immuable
  BEFORE UPDATE OR DELETE ON audit_evenementaudit
  FOR EACH ROW EXECUTE FUNCTION audit_interdire_modification();
CREATE TRIGGER audit_sans_troncature
  BEFORE TRUNCATE ON audit_evenementaudit
  FOR EACH STATEMENT EXECUTE FUNCTION audit_interdire_modification();
"""

ANNULATION = """
DROP TRIGGER IF EXISTS audit_sans_troncature ON audit_evenementaudit;
DROP TRIGGER IF EXISTS audit_immuable ON audit_evenementaudit;
DROP FUNCTION IF EXISTS audit_interdire_modification();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_evenements")]
    operations = [migrations.RunSQL(SQL, ANNULATION)]

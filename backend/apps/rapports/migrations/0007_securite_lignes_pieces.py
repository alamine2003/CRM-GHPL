"""Sécurité au niveau des lignes sur les pièces jointes des rapports (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE rapports_piecejointe ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports_piecejointe FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON rapports_piecejointe
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON rapports_piecejointe;
ALTER TABLE rapports_piecejointe NO FORCE ROW LEVEL SECURITY;
ALTER TABLE rapports_piecejointe DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("rapports", "0006_pieces_jointes")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

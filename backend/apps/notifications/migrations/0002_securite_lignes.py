"""Sécurité au niveau des lignes sur `notifications_notification` (ADR-003)."""

from django.db import migrations

SQL = """
ALTER TABLE notifications_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_notification FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_pays ON notifications_notification
  USING (innov_pays_autorise(pays_id)) WITH CHECK (innov_pays_autorise(pays_id));
"""
RETOUR = """
DROP POLICY IF EXISTS isolation_pays ON notifications_notification;
ALTER TABLE notifications_notification NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications_notification DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [("notifications", "0001_notifications"), ("organisation", "0002_securite_lignes")]

    operations = [migrations.RunSQL(SQL, RETOUR)]

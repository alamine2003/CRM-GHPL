"""Sécurité au niveau des lignes (RLS) sur les tables rattachées à un pays (ADR-003).

Deuxième barrière d'isolation (architecture §12, couche 2) : même si une requête
oublie le filtre du périmètre, PostgreSQL ne renvoie ni n'accepte une ligne d'un
autre pays. Chaque requête métier fixe `innov.pays` (voir apps.perimetre.isolation) :

- un identifiant de pays : seules ses lignes sont visibles et modifiables ;
- `*` : le siège, autorisé sur tous les pays ;
- `aucun` : un utilisateur sans rôle dans le pays actif, qui ne voit rien ;
- vide : hors requête métier (migrations, commandes, authentification).

FORCE soumet aussi le propriétaire des tables à ces règles. Un super-utilisateur
PostgreSQL les contourne toujours : en production, l'application se connecte avec
un rôle ordinaire (vérifié par `manage.py check --deploy`).
"""

from django.db import migrations

TABLES = [
    "socle_parametrepays",
    "socle_journalchangement",
    "organisation_division",
    "organisation_reseau",
    "organisation_zone",
    "organisation_secteur",
    "organisation_poste",
    "organisation_occupation",
    "organisation_rattachement",
    "organisation_perimetrereseau",
]

FONCTION = """
CREATE OR REPLACE FUNCTION innov_pays_autorise(pays uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE coalesce(current_setting('innov.pays', true), '')
    WHEN '' THEN true
    WHEN '*' THEN true
    ELSE pays::text = ANY (string_to_array(current_setting('innov.pays', true), ','))
  END
$$;
"""


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
        ("organisation", "0001_organisation"),
        ("socle", "0002_extensions_et_journal_partitionne"),
    ]

    operations = [
        migrations.RunSQL(FONCTION, "DROP FUNCTION IF EXISTS innov_pays_autorise(uuid);"),
        *[migrations.RunSQL(activer(t), desactiver(t)) for t in TABLES],
    ]

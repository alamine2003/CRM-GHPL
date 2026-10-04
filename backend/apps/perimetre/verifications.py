"""Vérification de déploiement : la base doit appliquer la sécurité au niveau des lignes.

Un super-utilisateur PostgreSQL, ou un rôle BYPASSRLS, ignore les politiques (ADR-003) :
`python manage.py check --deploy --database default` le signale.
"""

from django.core.checks import Error, Tags, register
from django.db import connection


@register(Tags.database, deploy=True)
def role_soumis_a_la_securite_des_lignes(app_configs, databases=None, **kwargs):
    if not databases or "default" not in databases:
        return []
    with connection.cursor() as curseur:
        curseur.execute(
            "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user"
        )
        contourne = curseur.fetchone()[0]
    if not contourne:
        return []
    return [
        Error(
            "Le rôle PostgreSQL de l'application contourne la sécurité au niveau des lignes.",
            hint="Connecter l'application avec un rôle sans SUPERUSER ni BYPASSRLS (ADR-003).",
            id="innov.E001",
        )
    ]

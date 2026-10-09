"""0.9.6 : retour arrière (docs/mise-a-jour.md §3, architecture §21).

Chaque migration de l'application se défait : une opération sans retour (RunPython sans
`reverse_code`, RunSQL sans `reverse_sql`) bloquerait le retour à la version précédente. Et
la dernière migration de chaque application se défait puis se rejoue réellement sur la base."""

import pytest
from django.apps import apps
from django.core.management import call_command
from django.db import connection
from django.db.migrations.loader import MigrationLoader

NOS_APPLICATIONS = {a.label for a in apps.get_app_configs() if a.name.startswith("apps.")}


def test_chaque_operation_de_migration_se_defait():
    chargeur = MigrationLoader(None, ignore_no_migrations=True)
    sans_retour = [
        f"{app}.{nom} : {type(op).__name__}"
        for (app, nom), migration in chargeur.disk_migrations.items()
        if app in NOS_APPLICATIONS
        for op in migration.operations
        if not op.reversible
    ]
    assert sans_retour == []


@pytest.mark.django_db
def test_la_derniere_migration_de_chaque_application_se_defait_et_se_rejoue():
    chargeur = MigrationLoader(connection)
    for app in sorted(NOS_APPLICATIONS):
        feuilles = chargeur.graph.leaf_nodes(app)
        if not feuilles:
            continue
        (derniere,) = feuilles
        parents = [p for p in chargeur.graph.node_map[derniere].parents if p[0] == app]
        if not parents:
            continue
        precedente = parents[0][1]
        call_command("migrate", app, precedente, verbosity=0)
        call_command("migrate", app, derniere[1], verbosity=0)
    call_command("migrate", verbosity=0)

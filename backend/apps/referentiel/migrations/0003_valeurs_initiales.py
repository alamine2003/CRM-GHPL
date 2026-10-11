"""Listes initiales pour les pays déjà ouverts (PRP-001) ; les nouveaux pays les reçoivent
à leur création (apps.referentiel.services.initialiser_pays)."""

from django.db import migrations


def initialiser(apps, schema_editor):
    from apps.referentiel.catalogue import INITIALES
    from apps.socle.identifiants import uuid7

    Pays = apps.get_model("socle", "Pays")
    Valeur = apps.get_model("referentiel", "Valeur")
    for pays in Pays.objects.all():
        anglais = pays.langue == "en"
        codes = {}
        for liste, entrees in INITIALES.items():
            for ordre, entree in enumerate(entrees, start=1):
                code, fr, en, *parent = entree
                if Valeur.objects.filter(pays=pays, liste=liste, code=code).exists():
                    continue
                valeur = Valeur.objects.create(
                    id=uuid7(), pays=pays, liste=liste, code=code, libelle=en if anglais else fr,
                    ordre=ordre, version=1,
                    parent=codes.get(("type_prospect", parent[0])) if parent else None,
                )  # fmt: skip
                codes[(liste, code)] = valeur
                # Journal des changements (synchronisation) : la table est partitionnée et
                # non gérée par l'ORM, on l'alimente directement.
                with schema_editor.connection.cursor() as curseur:
                    curseur.execute(
                        "INSERT INTO socle_journalchangement "
                        "(pays_id, entite, entite_id, version, operation, le) "
                        "VALUES (%s, 'referentiel.valeur', %s, 1, 'creation', now())",
                        [pays.pk, valeur.pk],
                    )


class Migration(migrations.Migration):
    dependencies = [
        ("referentiel", "0002_securite_lignes"),
        ("socle", "0002_extensions_et_journal_partitionne"),
    ]

    operations = [migrations.RunPython(initialiser, migrations.RunPython.noop)]

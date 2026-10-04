# Liste fermée des types de prospect : médecin, paramédical, pharmacie, grossiste.

from django.db import migrations


def synchroniser(apps, schema_editor):
    """Liste fermée des types de prospect (décision du 4 octobre 2026) : « grossiste »
    remplace « autre », archivé mais lisible là où il a servi."""
    from apps.referentiel.catalogue import synchroniser as aligner

    Pays = apps.get_model("socle", "Pays")
    Valeur = apps.get_model("referentiel", "Valeur")

    def journal(valeur, creation):
        with schema_editor.connection.cursor() as curseur:
            curseur.execute(
                "INSERT INTO socle_journalchangement "
                "(pays_id, entite, entite_id, version, operation, le) "
                "VALUES (%s, 'referentiel.valeur', %s, %s, %s, now())",
                [valeur.pays_id, valeur.pk, valeur.version or 1,
                 'creation' if creation else 'modification'],
            )

    for pays in Pays.objects.all():
        aligner(Valeur, pays, journal=journal)


class Migration(migrations.Migration):
    dependencies = [
        ("referentiel", "0004_grades"),
    ]

    operations = [
        migrations.RunPython(synchroniser, migrations.RunPython.noop),
    ]

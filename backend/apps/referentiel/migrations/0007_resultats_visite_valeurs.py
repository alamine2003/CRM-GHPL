# Liste courte des résultats de visite du rapport (RPT-002, 0.5.1).

from django.db import migrations


def synchroniser(apps, schema_editor):
    """Ajoute à chaque pays les résultats de visite proposés par défaut [H]."""
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
        ("referentiel", "0006_resultats_visite"),
    ]

    operations = [
        migrations.RunPython(synchroniser, migrations.RunPython.noop),
    ]

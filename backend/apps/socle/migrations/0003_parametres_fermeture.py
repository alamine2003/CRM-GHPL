"""Décision du 6 octobre 2026 : l'échéance de soumission se lit désormais dans la semaine du
planning (lundi 0 h par défaut), et non plus dans la semaine précédente. Une valeur enregistrée
avec l'ancien sens donnerait une date fausse : elle est retirée, le défaut s'applique."""

from django.db import migrations


def retirer_ancien_sens(apps, schema_editor):
    ParametrePays = apps.get_model("socle", "ParametrePays")
    ParametrePays.objects.filter(cle="echeance_soumission_planning").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("socle", "0002_extensions_et_journal_partitionne"),
    ]

    operations = [migrations.RunPython(retirer_ancien_sens, migrations.RunPython.noop)]

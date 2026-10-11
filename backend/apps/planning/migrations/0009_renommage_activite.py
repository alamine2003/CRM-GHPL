"""Renommage du modèle `Absence` en `Activite` (0.3.2) : il porte aussi les activités avec
visites (PLN-018). La table devient `planning_activite` ; sa politique `isolation_pays` et la
sécurité au niveau des lignes la suivent (ADR-003)."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("planning", "0008_activites_connexes")]

    operations = [
        migrations.RenameModel("Absence", "Activite"),
        migrations.AlterField(
            model_name="activite",
            name="planning",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="activites",
                to="planning.planning",
            ),
        ),
    ]

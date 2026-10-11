# Produits présentés avec le retour du prescripteur (RPT-004) et remises (RPT-005), 0.5.3.

import uuid

from django.db import migrations, models


def presentations(apps, schema_editor):
    """Les produits des rapports de 0.5.1 et 0.5.2 deviennent des présentations sans retour."""
    Rapport = apps.get_model("rapports", "Rapport")
    Produit = apps.get_model("referentiel", "Produit")
    for rapport in Rapport.objects.exclude(produits=[]):
        ids = [uuid.UUID(p) for p in rapport.produits]
        libelles = dict(Produit.objects.filter(pk__in=ids).values_list("pk", "libelle"))
        rapport.presentations = [
            {"produit": str(p), "libelle": libelles.get(p, ""), "retour": None} for p in ids
        ]
        rapport.save(update_fields=["presentations"])


class Migration(migrations.Migration):
    dependencies = [
        ("rapports", "0003_objectif_resultat_obtenu"),
        ("referentiel", "0009_articles_promotionnels_valeurs"),
    ]

    operations = [
        migrations.AddField(
            model_name="rapport",
            name="presentations",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="rapport",
            name="remises",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(presentations, migrations.RunPython.noop),
        migrations.RemoveField(model_name="rapport", name="produits"),
    ]

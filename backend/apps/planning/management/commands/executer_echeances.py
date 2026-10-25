"""Rejoue la passe périodique du planning (rappels, escalades, alertes du lundi), comme le
worker toutes les quinze minutes : utile sans Redis, en démonstration ou pour un rattrapage."""

from django.core.management.base import BaseCommand

from apps.planning.echeances import executer


class Command(BaseCommand):
    help = ("Rappels, escalades, alertes du lundi et rapports en retard (NOT-006, PLN-016, "
            "RG-019, RPT-017) ; objectifs de ventes en retard (1.8.0).")  # fmt: skip

    def handle(self, *args, **options):
        bilan = executer()
        self.stdout.write(
            f"{bilan['rappels']} rappel(s), {bilan['escalades']} escalade(s), "
            f"{bilan['alertes']} alerte(s), {bilan['rapports']} rapport(s) en retard signalé(s), "
            f"{bilan['rappels_rapport']} rappel(s) de rapport, "
            f"{bilan['journees_escaladees']} journée(s) escaladée(s), "
            f"{bilan['objectifs_ventes']} alerte(s) d'objectif de ventes."
        )

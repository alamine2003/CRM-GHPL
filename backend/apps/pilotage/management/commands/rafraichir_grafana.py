"""Recalculer les agrégats de Grafana (DSH-011) ; le worker le fait chaque heure.

python manage.py rafraichir_grafana --jours 365
"""

from django.core.management.base import BaseCommand

from apps.pilotage.grafana import JOURS, rafraichir


class Command(BaseCommand):
    help = "Recalcule les agrégats quotidiens du schéma pilotage."

    def add_arguments(self, parser):
        parser.add_argument("--jours", type=int, default=JOURS)

    def handle(self, *args, jours=JOURS, **options):
        for code, lignes in rafraichir(jours).items():
            self.stdout.write(f"{code} : {lignes} lignes")

"""Isoler Grafana par pays (DSH-010, architecture §25.2).

    python manage.py grafana_acces            # affiche les instructions SQL
    python manage.py grafana_acces --appliquer

Les rôles sont créés sans connexion ; l'exploitation leur donne un mot de passe hors du dépôt.
"""

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from apps.pilotage.grafana import acces_sql
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Vues et rôles en lecture seule de Grafana, un par pays, et celui du siège."

    def add_arguments(self, parser):
        parser.add_argument("--appliquer", action="store_true",
                            help="Exécuter les instructions au lieu de les afficher.")  # fmt: skip

    def handle(self, *args, appliquer=False, **options):
        instructions = acces_sql(Pays.objects.order_by("code"))
        if not appliquer:
            self.stdout.write("\n".join(instructions))
            return
        with transaction.atomic(), connection.cursor() as c:
            for sql in instructions:
                c.execute(sql)
        self.stdout.write(self.style.SUCCESS(f"{len(instructions)} instructions appliquées."))

"""Crée un pays depuis le catalogue des filiales (ORG-001).

En attendant le portail du siège, l'administrateur technique l'utilise sur
demande de l'administrateur du siège : ``python manage.py creer_pays SN``.
"""

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.socle.catalogue_pays import CATALOGUE
from apps.socle.services import creer_pays


class Command(BaseCommand):
    help = "Crée un pays depuis le catalogue des filiales (code ISO, ex. SN)."

    def add_arguments(self, parser):
        parser.add_argument("codes", nargs="*", help="Codes ISO des pays à créer.")
        parser.add_argument("--liste", action="store_true", help="Afficher le catalogue.")

    def handle(self, *args, codes, liste, **options):
        if liste or not codes:
            for modele in CATALOGUE.values():
                self.stdout.write(
                    f"{modele.code}  {modele.nom}  ({modele.fuseau}, {modele.devise})"
                )
            return
        for code in codes:
            try:
                pays = creer_pays(code)
            except ValidationError as erreur:
                raise CommandError("; ".join(erreur.messages)) from erreur
            self.stdout.write(self.style.SUCCESS(f"Pays créé : {pays}"))

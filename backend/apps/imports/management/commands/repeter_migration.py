"""0.9.6 : `manage.py repeter_migration Export.json --pays SN --auteur prenom.nom` — répétition
à blanc de la migration BirdNotes sur la base courante (préproduction) : simulation, import,
second import, rapprochement (docs/mise-a-jour.md §5). Échoue si le second import recrée
quelque chose ou si une ligne du fichier n'est ni reprise ni expliquée."""

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import Utilisateur
from apps.imports.repetition import repeter
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Répète la migration BirdNotes et rapproche le fichier de ce qui a été repris."

    def add_arguments(self, parser):
        parser.add_argument("fichier")
        parser.add_argument("--pays", required=True)
        parser.add_argument("--auteur", required=True)

    def handle(self, *args, fichier, pays, auteur, **options):
        if settings.ENVIRONNEMENT == "production":
            raise CommandError("Refusé en production : la répétition se fait en préproduction.")
        chemin = Path(fichier)
        if not chemin.is_file():
            raise CommandError(f"Fichier introuvable : {chemin}")
        try:
            pays_obj = Pays.objects.get(code=pays.upper())
            auteur_obj = Utilisateur.objects.get(username=auteur)
        except (Pays.DoesNotExist, Utilisateur.DoesNotExist) as erreur:
            raise CommandError("Pays ou auteur inconnu.") from erreur
        r = repeter(pays_obj, auteur_obj, chemin.read_bytes(), chemin.name)
        self.stdout.write(f"Simulation {r.simulation_s} s, import {r.import_s} s, "
                          f"second import {r.reimport_s} s ; {r.anomalies} anomalies")  # fmt: skip
        self.stdout.write(f"{'Table':<16}{'Fichier':>9}{'Créées':>9}{'Écart':>7}")
        for ligne in r.rapprochement:
            self.stdout.write(f"{ligne['table']:<16}{ligne['fichier']:>9}"
                              f"{ligne.get('crees', 0):>9}{ligne['ecart']:>7}")  # fmt: skip
        if r.recrees:
            raise CommandError(f"Le second import a recréé : {r.recrees}")
        if not r.conforme:
            raise CommandError("Des lignes du fichier ne sont ni reprises ni expliquées.")
        self.stdout.write(self.style.SUCCESS("Répétition conforme."))

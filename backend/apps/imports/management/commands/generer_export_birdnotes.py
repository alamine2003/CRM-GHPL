"""0.9.6 : `manage.py generer_export_birdnotes export-fictif.json [--prospects 6000]` — un
export BirdNotes entièrement fictif, à la structure du vrai, pour répéter la migration sans
donnée réelle (docs/mise-a-jour.md §5)."""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.imports.fictif import export_fictif


class Command(BaseCommand):
    help = "Écrit un export BirdNotes fictif (JSON)."

    def add_arguments(self, parser):
        parser.add_argument("sortie")
        parser.add_argument("--prospects", type=int, default=6000)

    def handle(self, *args, sortie, prospects, **options):
        donnees = export_fictif(prospects=prospects)
        Path(sortie).write_text(json.dumps(donnees, ensure_ascii=False), encoding="utf-8")
        lignes = {t: len(v) for t, v in donnees["donnees"].items()}
        self.stdout.write(self.style.SUCCESS(f"Export fictif écrit : {sortie}"))
        for table, n in lignes.items():
            self.stdout.write(f"  {table:<22} {n}")

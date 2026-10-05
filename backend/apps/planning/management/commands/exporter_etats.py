"""Écrit la table des états partagée avec les clients (ADR-011) : `make schema` l'appelle."""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.planning.etats import exporter

FICHIER = Path(__file__).resolve().parents[5] / "packages" / "domaine" / "src" / "etats.json"


def contenu() -> str:
    return json.dumps(exporter(), ensure_ascii=False, indent=2) + "\n"


class Command(BaseCommand):
    help = "Exporte la machine à états du planning vers packages/domaine (ADR-011)."

    def handle(self, *args, **options):
        FICHIER.write_text(contenu(), encoding="utf-8")
        self.stdout.write(f"États écrits dans {FICHIER}")

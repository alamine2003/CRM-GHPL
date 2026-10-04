"""Importe l'export du CRM en place (BirdNotes) dans un pays (PRP-013).

    python manage.py importer_birdnotes Export.json.zip --pays SN --auteur prenom.nom --simulation
    python manage.py importer_birdnotes Export.json.zip --pays SN --auteur prenom.nom

Le fichier reste hors du dépôt. Simulez d'abord : le rapport dit ce qui serait créé,
corrigé ou écarté, sans rien écrire d'autre que le lot.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import Utilisateur
from apps.imports.birdnotes import importer, rapport_csv
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Importe un export BirdNotes (JSON ou ZIP) dans un pays."

    def add_arguments(self, parser):
        parser.add_argument("fichier")
        parser.add_argument("--pays", required=True, help="Code ISO du pays (SN).")
        parser.add_argument("--auteur", required=True, help="Identifiant de l'administrateur.")
        parser.add_argument("--simulation", action="store_true", help="Ne rien écrire (CA1).")
        parser.add_argument("--rapport", help="Chemin du rapport d'anomalies (CSV).")

    def handle(self, *args, fichier, pays, auteur, simulation, rapport, **options):
        chemin = Path(fichier)
        if not chemin.is_file():
            raise CommandError(f"Fichier introuvable : {chemin}")
        try:
            pays_obj = Pays.objects.get(code=pays.upper())
            auteur_obj = Utilisateur.objects.get(username=auteur)
        except (Pays.DoesNotExist, Utilisateur.DoesNotExist) as erreur:
            raise CommandError("Pays ou auteur inconnu.") from erreur
        lot = importer(
            pays_obj, auteur_obj, chemin.read_bytes(), chemin.name, simulation=simulation
        )
        titre = "Simulation terminée" if simulation else "Import terminé"
        self.stdout.write(self.style.SUCCESS(f"{titre} ({lot.fin - lot.debut})."))
        for entite, compteurs in sorted(lot.compteurs.items()):
            details = ", ".join(f"{k} {v}" for k, v in sorted(compteurs.items()))
            self.stdout.write(f"  {entite:<22} {details}")
        self.stdout.write(f"Anomalies : {len(lot.anomalies)}")
        if rapport:
            Path(rapport).write_text(rapport_csv(lot), encoding="utf-8")
            self.stdout.write(f"Rapport : {rapport}")

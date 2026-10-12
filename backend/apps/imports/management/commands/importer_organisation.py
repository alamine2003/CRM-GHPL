"""Importe le fichier d'organisation (classeur Excel) dans un pays (ORG-014 ; 1.0.9).

    python manage.py importer_organisation ORGA.xlsx --pays SN --auteur prenom.nom --simulation
    python manage.py importer_organisation ORGA.xlsx --pays SN --auteur prenom.nom

Même import que la page « Imports » du portail, en ligne de commande. Le pays est créé depuis le
catalogue des filiales s'il n'existe pas encore. Le fichier reste hors du dépôt.
"""

from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import Utilisateur
from apps.imports.birdnotes import rapport_csv
from apps.imports.organisation import importer
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import creer_pays


class Command(BaseCommand):
    help = "Importe le fichier d'organisation (.xlsx) dans un pays."

    def add_arguments(self, parser):
        parser.add_argument("fichier")
        parser.add_argument("--pays", required=True, help="Code ISO du pays (SN).")
        parser.add_argument("--auteur", required=True, help="Identifiant de l'administrateur.")
        parser.add_argument("--simulation", action="store_true", help="Ne rien écrire (CA1).")
        parser.add_argument("--rapport", help="Chemin du rapport d'anomalies (CSV).")

    def handle(self, *args, fichier, pays, auteur, simulation, rapport, **options):
        chemin = Path(fichier).expanduser()
        if not chemin.is_file():
            raise CommandError(f"Fichier introuvable : {chemin}")
        auteur_obj = Utilisateur.objects.filter(username=auteur.lower()).first()
        if auteur_obj is None:
            raise CommandError(f"Compte inconnu : {auteur}.")
        pays_obj = Pays.objects.filter(code=pays.upper()).first()
        if pays_obj is None:
            try:
                pays_obj = creer_pays(pays.upper())
            except ValidationError as erreur:
                raise CommandError("; ".join(erreur.messages)) from erreur
            self.stdout.write(f"Pays créé : {pays_obj}")
        try:
            lot = importer(
                pays_obj, auteur_obj, chemin.read_bytes(), chemin.name, simulation=simulation
            )
        except ErreurMetier as erreur:
            raise CommandError(str(erreur.detail)) from erreur
        titre = "Simulation terminée (rien n'est écrit)" if simulation else "Import terminé"
        self.stdout.write(self.style.SUCCESS(f"{titre}."))
        for entite, compteurs in sorted(lot.compteurs.items()):
            details = ", ".join(f"{k} {v}" for k, v in sorted(compteurs.items()))
            self.stdout.write(f"  {entite:<16} {details}")
        self.stdout.write(f"Anomalies : {len(lot.anomalies)}")
        if rapport:
            Path(rapport).expanduser().write_text(rapport_csv(lot), encoding="utf-8")
            self.stdout.write(f"Rapport : {rapport}")

"""Prépare l'instance de démonstration gratuite au démarrage (1.0.3, DEM-001, render-demo.yaml).

    python manage.py preparer_demo

Lancée à chaque démarrage du service, juste après les migrations : si la base est vide (premier
démarrage, ou base gratuite recréée), elle la remplit de données fictives ; sinon elle ne touche
à rien. Le mot de passe des comptes vient de INNOV_DEMO_MOT_DE_PASSE, jamais du dépôt.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.demonstration.generateur import Generateur, Volumes
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Remplit de données fictives une base de démonstration vide ; sinon ne fait rien."

    def handle(self, *args, **options):
        if settings.ENVIRONNEMENT != "demonstration":
            raise CommandError(
                f"Refusé : environnement « {settings.ENVIRONNEMENT} ». "
                "Seule l'instance de démonstration se remplit d'elle-même."
            )
        if Pays.objects.exists():
            self.stdout.write("Démonstration déjà prête : rien à faire.")
            return
        mot_de_passe = os.environ.get("INNOV_DEMO_MOT_DE_PASSE", "")
        if len(mot_de_passe) < 12:
            raise CommandError(
                "INNOV_DEMO_MOT_DE_PASSE manque ou fait moins de 12 caractères : "
                "c'est le mot de passe des comptes de démonstration."
            )
        echelle = float(os.environ.get("INNOV_DEMO_ECHELLE", "0.1"))
        volumes = Volumes() if echelle >= 1 else Volumes().reduits(echelle)
        bilan = Generateur(mot_de_passe, 2026).tout(volumes)
        self.stdout.write(self.style.SUCCESS("Démonstration prête (données fictives)."))
        for role, identifiant in bilan.comptes.items():
            self.stdout.write(f"  {role:<26} {identifiant}")

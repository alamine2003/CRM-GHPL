"""0.9.4 (NFR-001) : `manage.py generer_charge --delegues 500 --oui` — vide la base et la
remplit au volume d'un pays de 500 délégués, avec leur activité. Jamais en production."""

import os
import secrets

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.demonstration.charge import VISITES_PAR_JOUR, GenerateurCharge
from apps.demonstration.generateur import vider

from .reinitialiser_demo import ENVIRONNEMENTS_PERMIS


class Command(BaseCommand):
    help = "Base de charge fictive (NFR-001) : efface la base, puis la remplit."

    def add_arguments(self, parser):
        parser.add_argument("--delegues", type=int, default=500)
        parser.add_argument("--visites-par-jour", type=int, default=VISITES_PAR_JOUR)
        parser.add_argument("--oui", action="store_true", help="Confirme l'effacement de la base.")

    def handle(self, *args, delegues, visites_par_jour, oui, **options):
        if settings.ENVIRONNEMENT not in ENVIRONNEMENTS_PERMIS:
            raise CommandError(f"Refusé : environnement « {settings.ENVIRONNEMENT} ».")
        if not oui:
            raise CommandError("Ajoutez --oui : toutes les données de cette base seront effacées.")
        mot_de_passe = os.environ.get("INNOV_DEMO_MOT_DE_PASSE") or (
            "Demo-" + secrets.token_urlsafe(12)
        )
        vider()

        def avancement(i, total):
            if i % 25 == 0 or i == total:
                self.stdout.write(f"  {i}/{total} délégués")

        bilan = GenerateurCharge(mot_de_passe, visites_par_jour).charger(delegues, avancement)
        self.stdout.write(self.style.SUCCESS(
            f"Base de charge prête : {bilan['delegues']} délégués, {bilan['visites']} visites, "
            f"{bilan['rapports']} rapports, en {bilan['secondes']} s."
        ))  # fmt: skip

"""Réinitialise l'instance de démonstration avec des données fictives (DEM-001 CA1).

    python manage.py reinitialiser_demo --oui
    INNOV_DEMO_MOT_DE_PASSE=… python manage.py reinitialiser_demo --oui

Le mot de passe des comptes de démonstration n'est jamais écrit dans le dépôt :
il vient de la variable d'environnement, ou il est tiré au hasard et affiché une fois.
"""

import os
import secrets

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.demonstration.generateur import Generateur, Volumes, vider
from apps.identite.double_auth import ROLES_DOUBLE_AUTH

ENVIRONNEMENTS_PERMIS = {"developpement", "demonstration", "test"}


class Command(BaseCommand):
    help = "Vide la base et la remplit de données fictives (instance de démonstration)."

    def add_arguments(self, parser):
        parser.add_argument("--oui", action="store_true", help="Confirme l'effacement de la base.")
        parser.add_argument("--graine", type=int, default=2026, help="Graine du tirage au hasard.")
        parser.add_argument(
            "--echelle", type=float, default=1.0, help="Fraction des volumes réels (0.1 = 10 %%)."
        )

    def handle(self, *args, oui, graine, echelle, **options):
        if settings.ENVIRONNEMENT not in ENVIRONNEMENTS_PERMIS:
            raise CommandError(
                f"Refusé : environnement « {settings.ENVIRONNEMENT} ». "
                "La démonstration efface toute la base."
            )
        if not oui:
            raise CommandError("Ajoutez --oui : toutes les données de cette base seront effacées.")
        mot_de_passe = os.environ.get("INNOV_DEMO_MOT_DE_PASSE") or (
            "Demo-" + secrets.token_urlsafe(12)
        )
        volumes = Volumes() if echelle >= 1 else Volumes().reduits(echelle)
        vider()
        bilan = Generateur(mot_de_passe, graine).tout(volumes)
        self.stdout.write(self.style.SUCCESS("Démonstration prête (données fictives)."))
        for code, chiffres in bilan.pays.items():
            details = ", ".join(f"{v} {k}" for k, v in chiffres.items())
            self.stdout.write(f"  {code} : {details}")
        self.stdout.write("Comptes (même mot de passe pour tous) :")
        sensibles = {str(r) for r in ROLES_DOUBLE_AUTH}
        for role, identifiant in bilan.comptes.items():
            marque = " *" if role.split(" ")[0] in sensibles else ""
            self.stdout.write(f"  {role:<26} {identifiant}{marque}")
        self.stdout.write(
            "  * double authentification à activer à la première connexion (SEC-003) : "
            "prévoir un téléphone avec une application d'authentification."
        )
        if "INNOV_DEMO_MOT_DE_PASSE" not in os.environ:
            self.stdout.write(f"Mot de passe tiré au hasard : {mot_de_passe}")

"""Crée un compte nominatif (USR-001, USR-003).

Tant que les écrans d'administration n'existent pas (0.0.4 à 0.0.6),
l'administrateur technique crée les premiers comptes ainsi, sur demande de
l'administrateur du siège. Aucun mot de passe n'est saisi ni affiché : un
lien de définition du mot de passe, valable 30 minutes, est envoyé par
courriel (ou affiché avec --afficher-lien s'il n'y a pas de courriel).

    python manage.py creer_utilisateur awa.diallo --prenom Awa --nom Diallo \\
        --courriel awa.diallo@exemple.org --pays SN
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.identite.services import creer_utilisateur, demander_reinitialisation
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Crée un compte nominatif et envoie le lien de définition du mot de passe."

    def add_arguments(self, parser):
        parser.add_argument("identifiant", help="Identifiant nominatif, au format prenom.nom")
        parser.add_argument("--prenom", required=True)
        parser.add_argument("--nom", required=True)
        parser.add_argument("--courriel", default="")
        parser.add_argument("--pays", help="Code du pays principal ; absent = compte du siège.")
        parser.add_argument("--langue", choices=["fr", "en"])
        parser.add_argument(
            "--afficher-lien",
            action="store_true",
            help="Afficher le lien de définition du mot de passe (à transmettre en main propre).",
        )

    def handle(self, *args, **options):
        pays = None
        if options["pays"]:
            pays = Pays.objects.filter(code=options["pays"].upper()).first()
            if pays is None:
                raise CommandError(f"Pays inconnu : {options['pays']}.")
        try:
            utilisateur = creer_utilisateur(
                options["identifiant"],
                prenom=options["prenom"],
                nom=options["nom"],
                courriel=options["courriel"],
                pays=pays,
                langue=options["langue"],
            )
        except ValidationError as erreur:
            raise CommandError("; ".join(erreur.messages)) from erreur
        jeton = demander_reinitialisation(utilisateur, par_administrateur=True)
        portee = f"pays {pays.code}" if pays else "siège"
        self.stdout.write(self.style.SUCCESS(f"Compte créé : {utilisateur.username} ({portee})"))
        if options["afficher_lien"] or not utilisateur.email:
            self.stdout.write(f"{settings.PORTAIL_URL}/reinitialisation?jeton={jeton}")
            self.stdout.write("Lien valable 30 minutes, à usage unique.")
        else:
            self.stdout.write(f"Lien de définition du mot de passe envoyé à {utilisateur.email}.")

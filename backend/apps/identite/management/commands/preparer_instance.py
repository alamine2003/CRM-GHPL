"""Crée le premier compte d'une instance vide (1.0.8, remplace preparer_demo).

    INNOV_ADMIN_IDENTIFIANT=prenom.nom INNOV_ADMIN_MOT_DE_PASSE=… python manage.py preparer_instance

Lancée à chaque démarrage, juste après les migrations (backend/demarrer_demo.sh). Tant que la base
n'a aucun compte, elle crée un administrateur du siège à partir de ces deux variables ; il crée
ensuite les pays et les autres comptes depuis le portail. Dès qu'un compte existe, elle ne fait
plus rien. Aucune donnée fictive ; le mot de passe vient de la configuration, jamais du dépôt.
"""

import os

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import Role, Utilisateur
from apps.identite.services import attribuer_role, creer_utilisateur


class Command(BaseCommand):
    help = "Crée l'administrateur du siège d'une instance sans compte ; sinon ne fait rien."

    def handle(self, *args, **options):
        if Utilisateur.objects.exists():
            self.stdout.write("Instance déjà prête : rien à faire.")
            return
        identifiant = os.environ.get("INNOV_ADMIN_IDENTIFIANT", "").strip().lower()
        mot_de_passe = os.environ.get("INNOV_ADMIN_MOT_DE_PASSE", "")
        if not identifiant or not mot_de_passe:
            self.stdout.write(
                self.style.WARNING(
                    "Aucun compte : renseignez INNOV_ADMIN_IDENTIFIANT et "
                    "INNOV_ADMIN_MOT_DE_PASSE pour créer l'administrateur du siège."
                )
            )
            return
        prenom, _, nom = identifiant.partition(".")
        try:
            compte = creer_utilisateur(
                identifiant,
                prenom=prenom.capitalize(),
                nom=nom.capitalize(),
                mot_de_passe=mot_de_passe,
            )
        except ValidationError as erreur:
            raise CommandError("; ".join(erreur.messages)) from erreur
        attribuer_role(compte, Role.ADMIN_SIEGE, None, par=None)
        self.stdout.write(
            self.style.SUCCESS(
                f"Administrateur du siège créé : {compte.username}. "
                "Double authentification à activer à la première connexion."
            )
        )

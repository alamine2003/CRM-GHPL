"""Attribue un rôle à un compte existant.

Sert à nommer le premier administrateur du siège, qui attribue ensuite les
autres rôles depuis l'API (ORG-002) :

    python manage.py attribuer_role moussa.ndiaye admin_siege
    python manage.py attribuer_role awa.diallo delegue
"""

from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import ROLES_SANS_PAYS, Role, Utilisateur
from apps.identite.services import attribuer_role
from apps.socle.erreurs import ErreurMetier


class Command(BaseCommand):
    help = "Attribue un rôle (dans le pays principal du compte, ou au siège)."

    def add_arguments(self, parser):
        parser.add_argument("identifiant")
        parser.add_argument("role", choices=Role.values)

    def handle(self, *args, identifiant, role, **options):
        compte = Utilisateur.objects.filter(username=identifiant.lower()).first()
        if compte is None:
            raise CommandError(f"Compte inconnu : {identifiant}.")
        pays = None if role in ROLES_SANS_PAYS else compte.pays_principal
        try:
            attribue = attribuer_role(compte, role, pays, par=None)
        except ErreurMetier as erreur:
            raise CommandError(str(erreur.detail)) from erreur
        self.stdout.write(self.style.SUCCESS(f"Rôle attribué : {attribue}"))

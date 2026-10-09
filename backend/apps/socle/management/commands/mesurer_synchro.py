"""OFF-006 : `manage.py mesurer_synchro <identifiant>` — poids de la synchronisation quotidienne
d'un délégué, route par route, compressée comme par l'API."""

from django.core.management.base import BaseCommand, CommandError

from apps.identite.models import Utilisateur
from apps.socle.mesure_synchro import SEUIL_OCTETS, mesurer


def _ko(octets: int) -> str:
    return f"{octets / 1024:.1f} Ko"


class Command(BaseCommand):
    help = "Mesure ce que pèse la synchronisation quotidienne d'un délégué (OFF-006)."

    def add_arguments(self, parser):
        parser.add_argument("identifiant")

    def handle(self, identifiant, **options):
        utilisateur = Utilisateur.objects.filter(username=identifiant).first()
        if utilisateur is None:
            raise CommandError(f"Compte inconnu : {identifiant}")
        m = mesurer(utilisateur)
        for route, (appels, brut, compresse) in sorted(m["routes"].items()):
            self.stdout.write(
                f"{route:<18} {appels:>4} appel(s)  {_ko(brut):>10}  → {_ko(compresse):>9}"
            )
        self.stdout.write(
            f"{'Total':<18} {m['appels']:>4} appel(s)  {_ko(m['brut']):>10}  → "
            f"{_ko(m['compresse']):>9} (seuil {_ko(SEUIL_OCTETS)})"
        )
        if m["compresse"] >= SEUIL_OCTETS:
            raise CommandError("Au-dessus du seuil d'OFF-006.")

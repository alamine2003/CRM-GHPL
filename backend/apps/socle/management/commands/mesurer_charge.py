"""0.9.4 (NFR-002, DC-56) : `manage.py mesurer_charge [--pays SN]` — temps de réponse côté
serveur des écrans courants, route par route, comparés à 500 ms au 95e centile."""

from django.core.management.base import BaseCommand, CommandError

from apps.socle.mesure_charge import AVANCE_S, SEUIL_MS, mesurer
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Mesure les temps de réponse des écrans courants (NFR-002)."

    def add_arguments(self, parser):
        parser.add_argument("--pays", default="SN")
        parser.add_argument("--comptes", type=int, default=5, help="Comptes par rôle.")
        parser.add_argument("--repetitions", type=int, default=3)

    def handle(self, *args, pays, comptes, repetitions, **options):
        cible = Pays.objects.filter(code=pays.upper()).first()
        if cible is None:
            raise CommandError(f"Pays inconnu : {pays}")
        avance: dict = {}
        resultats = mesurer(cible, comptes, repetitions, avance)
        self.stdout.write("Calculs d'avance du worker (tableaux du pays entier et du siège) :")
        for portee, secondes in avance.items():
            self.stdout.write(f"  {portee:<8}{secondes:>8} s")
        self.stdout.write(f"{'Route':<22}{'n':>4}{'p50':>8}{'p95':>8}{'max':>8}{'SQL':>6}")
        lents = []
        for route, r in resultats.items():
            marque = "  ← au-dessus" if r["p95"] > SEUIL_MS else ""
            self.stdout.write(f"{route:<22}{r['n']:>4}{r['p50']:>6}ms{r['p95']:>6}ms"
                              f"{r['max']:>6}ms{r['requetes']:>6}{marque}")  # fmt: skip
            if marque:
                lents.append(route)
        lents += [f"calcul d'avance {p}" for p, x in avance.items() if x > AVANCE_S]
        if lents:
            raise CommandError(f"Au-dessus de {SEUIL_MS} ms au 95e centile : {', '.join(lents)}")
        self.stdout.write(self.style.SUCCESS(f"Toutes les routes sous {SEUIL_MS} ms (p95)."))

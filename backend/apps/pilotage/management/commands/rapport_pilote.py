"""0.9.7 : `manage.py rapport_pilote --pays SN --du 2026-11-02 --au 2026-11-29 [--reseau ID]`
— les indicateurs de succès du pilote (KPI-01 à KPI-09, prd.md §5), à présenter chaque semaine
et en fin de pilote (docs/pilote.md). `--json` pour les garder."""

import json
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from apps.pilotage.kpi import kpi
from apps.socle.models import Pays


class Command(BaseCommand):
    help = "Indicateurs de succès du pilote sur une période (prd.md §5)."

    def add_arguments(self, parser):
        parser.add_argument("--pays", required=True)
        parser.add_argument("--du", required=True, type=date.fromisoformat)
        parser.add_argument("--au", required=True, type=date.fromisoformat)
        parser.add_argument("--reseau", help="Identifiant d'un réseau : ses délégués seulement.")
        parser.add_argument("--json", action="store_true", dest="en_json")

    def handle(self, *args, pays, du, au, reseau, en_json, **options):
        from apps.organisation.models import Reseau

        cible = Pays.objects.filter(code=pays.upper()).first()
        if cible is None or du > au:
            raise CommandError("Pays inconnu ou période vide.")
        r = Reseau.objects.filter(pays=cible, pk=reseau).first() if reseau else None
        if reseau and r is None:
            raise CommandError("Réseau inconnu dans ce pays.")
        resultat = kpi(cible, du, au, r)
        if en_json:
            self.stdout.write(json.dumps(resultat, default=str, ensure_ascii=False, indent=2))
            return
        n = resultat["delegues"]
        self.stdout.write(f"Pilote {cible.code}, du {du} au {au} : {n} délégué{'s' * (n > 1)}")
        for x in resultat["indicateurs"]:
            etat = {True: "atteint", False: "non atteint", None: "—"}[x["atteinte"]]
            valeur = "—" if x["valeur"] is None else x["valeur"]
            self.stdout.write(f"  {x['code']}  {x['libelle']:<52} {valeur!s:>7}  "
                              f"(cible {x['cible']} {x['mesure']}) {etat}")  # fmt: skip
            if x["detail"]:
                self.stdout.write(f"          {x['detail']}")

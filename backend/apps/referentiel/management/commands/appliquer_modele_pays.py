"""Applique le modèle d'un pays (le Sénégal) à d'autres pays (1.1.0, prd.md §14.81).

    python manage.py appliquer_modele_pays --depuis SN --vers CI TG

Copie listes de valeurs, gammes, réseaux, produits, portefeuilles et paramètres ; jamais le
terrain (secteurs, établissements, prospects, postes, personnes). Un pays absent est créé depuis
le catalogue des filiales. Relancer la commande ne crée aucun doublon.
"""

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.referentiel.modele_pays import appliquer_modele
from apps.socle.models import Pays
from apps.socle.services import creer_pays


class Command(BaseCommand):
    help = "Copie la structure commerciale d'un pays modèle vers d'autres pays."

    def add_arguments(self, parser):
        parser.add_argument("--depuis", default="SN", help="Pays modèle (SN par défaut).")
        parser.add_argument("--vers", nargs="+", required=True, help="Codes ISO des pays cibles.")

    def handle(self, *args, depuis, vers, **options):
        source = Pays.objects.filter(code=depuis.upper()).first()
        if source is None:
            raise CommandError(f"Pays modèle inconnu : {depuis}.")
        for code in (c.upper() for c in vers):
            if code == source.code:
                continue
            cible = Pays.objects.filter(code=code).first()
            if cible is None:
                try:
                    cible = creer_pays(code)
                except ValidationError as erreur:
                    raise CommandError("; ".join(erreur.messages)) from erreur
                self.stdout.write(f"Pays créé : {cible}")
            bilan = appliquer_modele(source, cible)
            details = ", ".join(f"{n} {k}" for k, n in sorted(bilan.items())) or "rien à ajouter"
            self.stdout.write(self.style.SUCCESS(f"{cible} ← modèle {source.code} : {details}"))

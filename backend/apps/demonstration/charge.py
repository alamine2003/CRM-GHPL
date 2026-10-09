"""Base de charge (0.9.4, NFR-001) : un pays au volume cible, avec son activité.

La démonstration (`generateur.py`) ne fait vivre que deux délégués. Ici, chaque délégué qui
occupe un poste reçoit deux semaines terminées et la semaine en cours approuvées, ses visites
passées faites et leurs rapports : le volume de visites, de rapports, de versions et d'audit
qu'aura un pays de 500 délégués. Données fictives seulement ; jamais en production.

La densité est celle du PRD (NFR-001) : environ 70 000 visites par jour pour 8 500 délégués,
soit 8 visites par jour et par délégué (`visites_par_jour`), prises dans sa liste cible.
"""

import time
from datetime import datetime, timedelta

from apps.identite.models import Role
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .generateur import Generateur, Volumes


def volumes(delegues: int) -> Volumes:
    """Les proportions de la démonstration, rapportées au nombre de délégués."""
    return Volumes(
        delegues=delegues,
        postes=delegues + max(3, delegues // 10),
        superviseurs=max(2, round(delegues / 8.6)),
        dm=max(2, delegues // 30),
        prospects=max(1200, delegues * 12),
    )


#: NFR-001 : 70 000 visites par jour pour 8 500 délégués.
VISITES_PAR_JOUR = 8


class GenerateurCharge(Generateur):
    def __init__(self, mot_de_passe: str, visites_par_jour: int = VISITES_PAR_JOUR):
        super().__init__(mot_de_passe)
        self.visites_par_jour = visites_par_jour

    def _visites(self, planning, jours, reseau, cibles, a_completer: bool) -> int:
        """Une journée pleine : `visites_par_jour` prospects de la liste cible, toutes les
        65 minutes à partir de 8 h 15 (des heures qui ne croisent ni le passage ni la visite
        hors liste cible de la démonstration), une liste qui tourne d'une semaine à l'autre."""
        from apps.planning import services as pln
        from apps.prospects.models import Cible

        cibles = list(
            Cible.objects.filter(fin__isnull=True, poste__occupations__utilisateur=planning.delegue,
                                 prospect__statut="actif")
            .select_related("prospect").order_by("prospect__nom").distinct()
        )  # fmt: skip
        if not cibles or not jours:
            return 0
        debut = datetime(2000, 1, 1, 8, 15)
        heures = [(debut + timedelta(minutes=65 * k)).time() for k in range(self.visites_par_jour)]
        rang = planning.semaine.isocalendar().week * len(jours) * len(heures)
        nombre = 0
        for jour in jours:
            for heure in heures:
                cible = cibles[rang % len(cibles)]
                rang += 1
                lieu = pln.lieu_principal(cible.prospect, jour, planning.delegue)
                if lieu is None:
                    continue
                pln.ajouter_visite(planning, date=jour, prospect=cible.prospect,
                                   etablissement=lieu, reseau=reseau, heure=heure,
                                   objectif="Présenter le produit du mois")  # fmt: skip
                nombre += 1
        return nombre

    def charger(self, delegues: int, avancement=None) -> dict:
        from apps.organisation.models import Occupation
        from apps.planning.calendrier import lundi
        from apps.planning.etats import StatutPlanning
        from apps.planning.models import Planning

        debut = time.monotonic()
        self.tout(volumes(delegues), pays_secondaires=())
        pays = Pays.objects.get(code="SN")
        courante = lundi(aujourdhui(pays))
        deja = set(Planning.objects.values_list("delegue_id", flat=True))
        actifs = (
            Occupation.objects.filter(fin__isnull=True, poste__pays=pays,
                                      utilisateur__roles__role=Role.DELEGUE)
            .exclude(utilisateur_id__in=deja)
            .values_list("utilisateur_id", flat=True).distinct()
        )  # fmt: skip
        from apps.identite.models import Utilisateur

        comptes = list(Utilisateur.objects.filter(pk__in=list(actifs)).order_by("username"))
        for i, delegue in enumerate(comptes, start=1):
            for recul in (14, 7):
                self.semaine_approuvee(pays, delegue, courante - timedelta(days=recul),
                                       statut=StatutPlanning.TERMINE)  # fmt: skip
            self.semaine_approuvee(pays, delegue, courante)
            self.passe_execute(pays, delegue)
            self.conformite(delegue)
            self.rapports(pays, delegue)
            self.valider_le_passe(pays, delegue, courante)
            if avancement:
                avancement(i, len(comptes))
        from apps.planning.models import Visite
        from apps.rapports.models import Rapport

        return {
            "delegues": len(comptes) + len(deja),
            "visites": Visite.objects.count(),
            "rapports": Rapport.objects.count(),
            "secondes": round(time.monotonic() - debut),
        }

    @staticmethod
    def conformite(delegue) -> None:
        """Comme en production, où chaque action du téléphone la recalcule (VIS-010) : la
        conformité des journées passées est déjà là quand le superviseur ouvre sa file."""
        from apps.planning import conformite
        from apps.planning.models import Planning

        for planning in Planning.objects.filter(delegue=delegue).select_related("pays"):
            conformite.de_la_semaine(planning)

    @staticmethod
    def valider_le_passe(pays, delegue, courante) -> None:
        """Comme en régime de croisière : le superviseur a validé les journées complètes
        d'avant la semaine en cours ; celles de la semaine attendent encore (« À traiter »)."""
        from apps.planning.models import Planning
        from apps.planning.services import responsables
        from apps.rapports import validation
        from apps.socle.erreurs import ErreurMetier

        for planning in Planning.objects.filter(delegue=delegue, semaine__lt=courante):
            superviseurs = responsables(planning)
            if not superviseurs:
                continue
            from apps.identite.models import Utilisateur

            par = Utilisateur.objects.get(pk=next(iter(superviseurs)))
            jours = sorted(set(planning.visites.filter(archive_le__isnull=True)
                               .values_list("date", flat=True)))  # fmt: skip
            for jour in jours:
                try:
                    validation.valider_journee(planning, jour, par, "direct")
                except ErreurMetier:
                    continue  # un rapport encore attendu : la journée reste dans la file

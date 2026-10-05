"""Semaine de travail d'un pays (RG-014, ORG-012, PLN-001 CA2).

Une semaine est identifiée par son lundi. Ses jours sont les jours ouvrés du pays (paramètre
`jours_ouvres`, lundi–vendredi par défaut) ; un jour férié y figure, marqué et non planifiable,
et sort des contrôles « semaine complète » et des seuils (ORG-012 CA1, RG-022).
"""

from dataclasses import dataclass
from datetime import date, timedelta

from apps.socle.models import Pays
from apps.socle.services import valeur_parametre

from .models import JourFerie


def lundi(jour: date) -> date:
    return jour - timedelta(days=jour.weekday())


@dataclass(frozen=True)
class Jour:
    date: date
    ferie: JourFerie | None

    @property
    def planifiable(self) -> bool:
        return self.ferie is None


def feries(pays: Pays, debut: date, fin: date) -> dict[date, JourFerie]:
    qs = JourFerie.objects.filter(
        pays=pays, archive_le__isnull=True, date__gte=debut, date__lte=fin
    )
    return {j.date: j for j in qs}


def jours_de_la_semaine(pays: Pays, semaine: date) -> list[Jour]:
    """Jours ouvrés de la semaine, dans l'ordre, avec leur éventuel jour férié."""
    debut = lundi(semaine)
    ouvres = sorted(valeur_parametre(pays, "jours_ouvres"))
    jours = [debut + timedelta(days=n - 1) for n in ouvres]
    connus = feries(pays, debut, debut + timedelta(days=6))
    return [Jour(j, connus.get(j)) for j in jours]


def jours_planifiables(pays: Pays, semaine: date) -> list[date]:
    """Jours qui comptent pour les contrôles de la semaine (ORG-012 CA1)."""
    return [j.date for j in jours_de_la_semaine(pays, semaine) if j.planifiable]

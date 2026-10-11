"""Kilométrage estimé de la semaine (PLN-010, 0.2.6).

CA1 : calculé à partir des coordonnées des établissements, ici à vol d'oiseau [H] — aucun
service d'itinéraire n'est appelé, l'estimation tient hors ligne et ne coûte rien. Chaque jour,
on enchaîne les lieux dans l'ordre de la journée ; un passage compte pour un seul arrêt.
Le point de départ (domicile, agence) n'est pas connu : le trajet commence au premier lieu [H].
Un lieu sans coordonnées est sauté et compté, pour dire que l'estimation est partielle.
CA2 : aucun montant n'est calculé ni affiché.
"""

import math
from dataclasses import dataclass
from datetime import date

from .models import Planning

RAYON_TERRE_KM = 6371.0


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance à vol d'oiseau (formule de haversine)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)  # fmt: skip
    return 2 * RAYON_TERRE_KM * math.asin(math.sqrt(h))


@dataclass
class Etape:
    """Distance depuis l'arrêt précédent, pour l'itinéraire du jour."""

    visite: str
    km: float | None


@dataclass
class JourKm:
    date: date
    km: float
    #: Visites dont le lieu n'a pas de coordonnées : l'estimation du jour est partielle.
    sans_coordonnees: int
    etapes: list[Etape]


@dataclass
class Kilometrage:
    total_km: float
    sans_coordonnees: int
    jours: list[JourKm]


def estimer(planning: Planning) -> Kilometrage:
    visites = (
        planning.visites.filter(archive_le__isnull=True, est_imprevue=False)
        .select_related("etablissement")
        .order_by("date", "ordre")
    )
    par_jour: dict[date, list] = {}
    for v in visites:
        par_jour.setdefault(v.date, []).append(v)
    jours: list[JourKm] = []
    for jour, liste in sorted(par_jour.items()):
        km, sans, etapes = 0.0, 0, []
        precedent = None
        passage_precedent = None
        for v in liste:
            lieu = v.etablissement
            if lieu is None or not lieu.a_coordonnees:
                sans += 1
                etapes.append(Etape(str(v.pk), None))
                continue
            point = (float(lieu.latitude), float(lieu.longitude))
            if v.passage_id is not None and v.passage_id == passage_precedent:
                etapes.append(Etape(str(v.pk), 0.0))  # même arrêt que la visite précédente
                continue
            pas = distance_km(precedent, point) if precedent else 0.0
            km += pas
            etapes.append(Etape(str(v.pk), round(pas, 1) if precedent else None))
            precedent, passage_precedent = point, v.passage_id
        jours.append(JourKm(jour, round(km, 1), sans, etapes))
    return Kilometrage(
        total_km=round(sum(j.km for j in jours), 1),
        sans_coordonnees=sum(j.sans_coordonnees for j in jours),
        jours=jours,
    )

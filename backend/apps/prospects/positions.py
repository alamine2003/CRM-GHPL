"""Position de référence proposée d'un établissement (DC-52, §14.18, cycle 0.8.8).

Un établissement sans position de référence en reçoit une proposée à partir des pointages de
démarrage de ses visites : le point médian (latitude et longitude prises chacune au milieu)
des trois premiers pointages utilisables, qui doivent venir d'**au moins deux personnes
différentes** ; un délégué seul ne fixe jamais la référence de son propre contrôle. Un
pointage plus imprécis que la distance de pointage du lieu (rayon propre ou distance du pays,
DC-55) ne compte pas. L'administrateur pays valide le point sur une carte, en le déplaçant au
besoin ; la validation est auditée et inscrite à l'historique de la fiche.

Les visites déjà faites gardent leur « distance inconnue » : la référence vaut pour la suite
(une journée validée ne change pas après coup).
"""

from statistics import median

from django.db import transaction
from django.db.models import Count, F, Q, QuerySet, Value
from django.db.models.functions import Coalesce
from django.utils.translation import gettext as _

from apps.planning.kilometrage import distance_km
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import valeur_parametre

from . import services
from .models import Etablissement

#: Pointages retenus pour le point médian ; DC-52 exige au moins deux personnes parmi eux.
POINTAGES, PERSONNES = 3, 2


def _seuil(etablissement: Etablissement) -> int:
    return etablissement.rayon_pointage_m or valeur_parametre(
        etablissement.pays, "distance_pointage_m"
    )


def pointages(etablissement: Etablissement) -> list[dict]:
    """Les pointages de démarrage utilisables, du plus ancien au plus récent."""
    from apps.planning.models import Visite

    seuil = _seuil(etablissement)
    visites = (
        Visite.objects.filter(
            etablissement=etablissement, archive_le__isnull=True,
            debut_latitude__isnull=False, debut_longitude__isnull=False,
        )
        .order_by("debut_le")
        .values("debut_latitude", "debut_longitude", "debut_precision_m", "debut_le",
                "planning__delegue_id")
    )  # fmt: skip
    return [
        {"latitude": float(v["debut_latitude"]), "longitude": float(v["debut_longitude"]),
         "precision_m": v["debut_precision_m"], "le": v["debut_le"],
         "personne": v["planning__delegue_id"]}
        for v in visites
        if v["debut_precision_m"] is None or v["debut_precision_m"] <= seuil
    ]  # fmt: skip


def _retenus(liste: list[dict]) -> list[dict]:
    """Les trois premiers pointages ; s'ils viennent tous de la même personne, le troisième
    cède la place au premier pointage d'une autre."""
    retenus = liste[:POINTAGES]
    if len(retenus) < POINTAGES:
        return []
    if len({p["personne"] for p in retenus}) >= PERSONNES:
        return retenus
    autre = next((p for p in liste[POINTAGES:] if p["personne"] != retenus[0]["personne"]), None)
    return [*retenus[: POINTAGES - 1], autre] if autre else []


def a_valider(qs: QuerySet, pays) -> QuerySet:
    """Les établissements sans position qui en ont une proposée : la même règle, en une
    requête (trois pointages utilisables ou plus, d'au moins deux personnes)."""
    seuil = Coalesce(F("rayon_pointage_m"), Value(valeur_parametre(pays, "distance_pointage_m")))
    utilisable = Q(
        visites__archive_le__isnull=True,
        visites__debut_latitude__isnull=False,
        visites__debut_longitude__isnull=False,
    ) & (Q(visites__debut_precision_m__isnull=True) | Q(visites__debut_precision_m__lte=seuil))
    return (
        qs.filter(latitude__isnull=True)
        .annotate(
            pointages_utiles=Count("visites", filter=utilisable, distinct=True),
            personnes_utiles=Count("visites__planning__delegue", filter=utilisable,
                                   distinct=True),
        )
        .filter(pointages_utiles__gte=POINTAGES, personnes_utiles__gte=PERSONNES)
    )  # fmt: skip


def _distance_m(a: dict, b: dict) -> int:
    km = distance_km((a["latitude"], a["longitude"]), (b["latitude"], b["longitude"]))
    return round(km * 1000)


def proposition(etablissement: Etablissement) -> dict:
    """Ce que montre la carte : le point proposé (ou rien) et les pointages qui le fondent."""
    liste = pointages(etablissement)
    retenus = _retenus(liste)
    resultat = {
        "latitude": None, "longitude": None, "ecart_max_m": None,
        "pointages": [{k: p[k] for k in ("latitude", "longitude", "precision_m", "le")}
                      for p in (retenus or liste[:POINTAGES])],
        "utilisables": len(liste),
        "personnes": len({p["personne"] for p in liste}),
        "seuil_m": _seuil(etablissement),
    }  # fmt: skip
    if retenus and not etablissement.a_coordonnees:
        point = {
            "latitude": round(median(p["latitude"] for p in retenus), 6),
            "longitude": round(median(p["longitude"] for p in retenus), 6),
        }
        resultat.update(point, ecart_max_m=max(_distance_m(point, p) for p in retenus))
    return resultat


@transaction.atomic
def valider(etablissement: Etablissement, par, latitude=None, longitude=None) -> Etablissement:
    """L'administrateur pays retient le point proposé, ou le point qu'il a placé sur la carte."""
    etablissement = Etablissement.objects.select_for_update().get(pk=etablissement.pk)
    if etablissement.a_coordonnees:
        raise ErreurMetier(
            "position_deja_fixee",
            _("Cet établissement a déjà une position de référence."),
            409,
        )
    propose = proposition(etablissement)
    if propose["latitude"] is None:
        raise ErreurMetier(
            "position_non_proposee",
            _("Il faut trois pointages, d'au moins deux personnes, pour proposer une position."),
            409,
        )
    if (latitude is None) != (longitude is None):
        raise ErreurMetier(
            "coordonnees_incompletes",
            _("Indiquez la latitude et la longitude, ou aucune des deux."),
        )
    choisi = {"latitude": propose["latitude"], "longitude": propose["longitude"]}
    if latitude is not None:
        choisi = {"latitude": float(latitude), "longitude": float(longitude)}
    services.modifier_etablissement(etablissement, auteur=par, origine="position_proposee",
                                    **choisi)  # fmt: skip
    services._auditer(
        "position_validee", etablissement,
        pointages=len(propose["pointages"]),
        personnes=len({p["personne"] for p in _retenus(pointages(etablissement))}),
        deplacee_m=_distance_m(propose, choisi),
    )  # fmt: skip
    return etablissement

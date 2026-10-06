"""Exécution des visites (cycle 0.4, prd.md §12 et §17.2).

Terminer (VIS-004) : la visite passe « effectuée » à l'heure réelle de fin, après son début
(CA1), avec la position du moment, aux mêmes règles qu'au début.


Démarrer (VIS-003) : la visite passe « en cours » à l'heure réelle donnée par le téléphone,
avec la position du moment si le pays active la géolocalisation (RG-028). Le téléphone peut
démarrer sans réseau : l'envoi part plus tard, et le rejouer ne change rien (OFF-003). Sans
position, la visite démarre quand même, marquée « sans GPS » (CA2) ; avec une position, la
distance au lieu est gardée (CA3).
"""

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status

from apps.socle.erreurs import ErreurMetier
from apps.socle.services import valeur_parametre

from .etats import StatutVisite, exiger_transition_visite
from .kilometrage import distance_km
from .models import Visite

#: L'horloge du téléphone peut avancer un peu sur celle du serveur.
TOLERANCE_HORLOGE = timedelta(minutes=5)


def _date_approuvee(visite: Visite):
    """La date de la visite dans la version approuvée, ou rien si elle n'y est pas."""
    from . import services

    ref = services.reference(visite.planning)
    if ref is None:
        return None
    figee = next((v for v in services.contenu_effectif(ref).get("visites", [])
                  if v["id"] == str(visite.pk)), None)  # fmt: skip
    return figee and figee["date"]


def _distance_m(visite: Visite, latitude, longitude) -> int | None:
    lieu = visite.etablissement
    if lieu is None or lieu.latitude is None or lieu.longitude is None:
        return None
    km = distance_km((float(latitude), float(longitude)),
                     (float(lieu.latitude), float(lieu.longitude)))  # fmt: skip
    return round(km * 1000)


def _position(pays, latitude, longitude, precision_m):
    """La position à garder selon le pays (RG-028) : `(lat, lon, précision, sans_gps)`."""
    if not valeur_parametre(pays, "geolocalisation_active"):
        return None, None, None, False
    if latitude is None or longitude is None:
        return None, None, None, True
    return (Decimal(str(round(latitude, 6))), Decimal(str(round(longitude, 6))),
            round(precision_m) if precision_m is not None else None, False)  # fmt: skip


def _verrouiller(visite: Visite) -> Visite:
    return (
        Visite.objects.select_for_update(of=("self",))
        .select_related("planning__pays", "etablissement")
        .get(pk=visite.pk)
    )


def _exiger_passe(moment: datetime, champ: str) -> None:
    if moment > timezone.now() + TOLERANCE_HORLOGE:
        raise ErreurMetier("moment_futur", _("Cette heure est dans le futur."), champ=champ)


@transaction.atomic
def terminer(visite: Visite, fin_le: datetime, latitude=None, longitude=None,
             precision_m=None) -> Visite:  # fmt: skip
    """VIS-004 : « effectuée », heure réelle de fin, position ; CA1 : la fin suit le début."""
    from .services import _auditer

    visite = _verrouiller(visite)
    if visite.statut == StatutVisite.EFFECTUEE and visite.fin_le == fin_le:
        return visite
    exiger_transition_visite(visite.statut, StatutVisite.EFFECTUEE)
    _exiger_passe(fin_le, "fin_le")
    if fin_le <= visite.debut_le:
        raise ErreurMetier(
            "fin_avant_debut",
            _("L'heure de fin doit suivre l'heure de début de la visite."),
            champ="fin_le",
            debut_le=visite.debut_le.isoformat(),
        )
    lat, lon, precision, sans_gps = _position(visite.planning.pays, latitude, longitude,
                                              precision_m)  # fmt: skip
    visite.statut = StatutVisite.EFFECTUEE
    visite.fin_le = fin_le
    visite.fin_latitude, visite.fin_longitude, visite.fin_precision_m = lat, lon, precision
    visite.fin_sans_gps = sans_gps
    visite.distance_fin_m = _distance_m(visite, lat, lon) if lat is not None else None
    visite.save(update_fields=["statut", "fin_le", "fin_latitude", "fin_longitude",
                               "fin_precision_m", "fin_sans_gps", "distance_fin_m",
                               "modifie_le"])  # fmt: skip
    _auditer("visite.fin", visite, fin_le=fin_le.isoformat(), sans_gps=sans_gps,
             distance_m=visite.distance_fin_m,
             duree_min=round((fin_le - visite.debut_le).total_seconds() / 60))  # fmt: skip
    return visite


@transaction.atomic
def demarrer(visite: Visite, debut_le: datetime, latitude=None, longitude=None,
             precision_m=None) -> Visite:  # fmt: skip
    """VIS-003 : « en cours », heure réelle de début, position si le pays l'active."""
    from .services import _auditer

    visite = _verrouiller(visite)
    # Un envoi rejoué depuis la file du téléphone : déjà fait, rien ne change.
    if visite.statut == StatutVisite.EN_COURS and visite.debut_le == debut_le:
        return visite
    exiger_transition_visite(visite.statut, StatutVisite.EN_COURS)
    pays = visite.planning.pays
    date_approuvee = _date_approuvee(visite)
    if date_approuvee is None:
        raise ErreurMetier(
            "visite_non_approuvee",
            _("Cette visite n'est pas dans le planning approuvé : elle ne se démarre pas."),
            status.HTTP_409_CONFLICT,
        )
    _exiger_passe(debut_le, "debut_le")
    jour = debut_le.astimezone(ZoneInfo(pays.fuseau)).date().isoformat()
    if jour != date_approuvee:
        raise ErreurMetier(
            "autre_jour",
            _("Une visite se démarre le jour prévu par le planning approuvé."),
            status.HTTP_409_CONFLICT,
            prevue_le=date_approuvee,
        )
    # Un pays qui n'enregistre pas la position (RG-028) : rien à garder, rien à signaler.
    lat, lon, precision, visite.sans_gps = _position(pays, latitude, longitude, precision_m)
    visite.statut = StatutVisite.EN_COURS
    visite.debut_le = debut_le
    visite.debut_latitude, visite.debut_longitude, visite.debut_precision_m = lat, lon, precision
    visite.distance_debut_m = _distance_m(visite, lat, lon) if lat is not None else None
    visite.save(update_fields=["statut", "debut_le", "debut_latitude", "debut_longitude",
                               "debut_precision_m", "sans_gps", "distance_debut_m",
                               "modifie_le"])  # fmt: skip
    _auditer("visite.demarrage", visite, debut_le=debut_le.isoformat(), sans_gps=visite.sans_gps,
             distance_m=visite.distance_debut_m)  # fmt: skip
    return visite

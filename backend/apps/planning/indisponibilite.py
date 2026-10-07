"""Indisponibilité imprévue (PLN-009, DC-51, décision du 7 octobre 2026).

Elle remplace « maladie » : aucun motif médical n'est demandé ni gardé. Le délégué la déclare
le jour même, depuis la Tournée, même semaine fermée et planning approuvé ; elle justifie d'un
coup les visites de la période (journée, matin ou après-midi), qui ne sont plus « à justifier »
(VIS-009) et ne sont plus proposées comme prochaine visite. Elle réduit l'objectif du jour
comme toute absence.
"""

from datetime import time

from django.db import transaction
from django.utils.translation import gettext as _

from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from .calendrier import lundi
from .models import Activite, Periode, Planning, TypeActivite, Visite

#: Limite entre le matin et l'après-midi pour rattacher une visite à une demi-journée.
MIDI = time(13, 0)


def couverte(visite: Visite, activites) -> bool:
    """La visite tombe-t-elle dans une indisponibilité imprévue déclarée ?"""
    for a in activites:
        if a.type != TypeActivite.INDISPONIBILITE or a.date != visite.date:
            continue
        if a.periode == Periode.JOURNEE:
            return True
        apres_midi = visite.heure is not None and visite.heure >= MIDI
        if (a.periode == Periode.APRES_MIDI) == apres_midi:
            return True
    return False


def du_planning(planning: Planning):
    return list(planning.activites.filter(archive_le__isnull=True,
                                          type=TypeActivite.INDISPONIBILITE))  # fmt: skip


@transaction.atomic
def declarer(delegue, pays, periode: str = Periode.JOURNEE, id=None) -> Activite:
    """Aujourd'hui seulement ; rejouer le même envoi ne crée rien de plus."""
    from .services import _auditer

    if id is not None and (existante := Activite.objects.filter(pk=id).first()):
        return existante
    jour = aujourdhui(pays)
    planning = Planning.objects.filter(pays=pays, delegue=delegue, semaine=lundi(jour)).first()
    if planning is None:
        raise ErreurMetier("sans_planning", _("Aucun planning cette semaine."))
    if periode not in Periode.values:
        raise ErreurMetier("valeur_invalide", _("Période inconnue."), champ="periode")
    deja = planning.activites.filter(archive_le__isnull=True, date=jour,
                                     type=TypeActivite.INDISPONIBILITE)  # fmt: skip
    if any(Periode.JOURNEE in (a.periode, periode) or a.periode == periode for a in deja):
        raise ErreurMetier(
            "deja_declaree", _("Une indisponibilité est déjà déclarée pour cette période.")
        )
    activite = Activite(pays=pays, planning=planning, date=jour, periode=periode,
                        type=TypeActivite.INDISPONIBILITE)  # fmt: skip
    if id is not None:
        activite.pk = id
    activite.save()
    _auditer("activite.indisponibilite", activite, planning=str(planning.pk), date=str(jour),
             periode=periode)  # fmt: skip
    return activite


def exiger_pas_au_planning(type_activite: str) -> None:
    """Elle ne se prévoit pas : on ne tombe pas malade sur rendez-vous."""
    if type_activite == TypeActivite.INDISPONIBILITE:
        raise ErreurMetier(
            "indisponibilite_du_jour",
            _("L'indisponibilité imprévue se déclare le jour même, depuis la Tournée."),
            champ="type",
        )

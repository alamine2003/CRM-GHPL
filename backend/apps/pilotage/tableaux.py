"""Les tableaux de pilotage d'un pays entier et du siège, calculés d'avance (0.9.4, NFR-002,
DSH-011).

Le tableau d'un pays de 500 délégués, au volume du PRD (NFR-001 : 8 visites par jour), demande
plusieurs secondes de calcul (docs/charge.md) : trop pour un écran courant (500 ms). DSH-011
tolère 5 minutes de retard au portail, et chaque tableau affiche l'heure de son calcul.

[D, 9 octobre 2026, délégation] Les tableaux qui ne dépendent pas de la personne qui les lit
— le pays entier (responsable pays, siège qui descend dans un pays) et la consolidation du
siège — sont gardés 5 minutes (`DUREE`) ; le worker recalcule toutes les 4 minutes ceux de la
période par défaut (`prechauffer`), qui sont donc toujours prêts. Une autre période ou un
filtre se calcule à la première demande, puis se garde 5 minutes. Les tableaux d'une équipe
(superviseur, DM, DF) restent calculés à chaque demande : ils sont rapides, et une validation
doit s'y voir aussitôt.

Isolation : un tableau gardé ne sert qu'à la portée qui l'a calculé (le pays et ses
paramètres, ou la liste des pays du siège), jamais à une autre ; le calcul d'avance se fait
dans l'isolation du pays (ADR-003).
"""

from __future__ import annotations

import hashlib
import json

from django.core.cache import cache
from django.db import connection, transaction

from apps.identite.models import Role
from apps.perimetre.perimetre import Perimetre
from apps.socle.models import Pays

from . import serializers as s

#: DSH-011 : le portail à moins de 5 minutes.
DUREE = 5 * 60


def _cle(nature: str, *parties) -> str:
    brut = json.dumps([nature, *parties], default=str, sort_keys=True)
    return f"pilotage:{nature}:{hashlib.sha256(brut.encode()).hexdigest()}"


def _garde(cle: str, calcul):
    donnees = cache.get(cle)
    if donnees is None:
        donnees = calcul()
        cache.set(cle, donnees, DUREE)
    return donnees


def _choix(choix: dict) -> dict:
    return {k: v for k, v in choix.items() if v not in (None, "")}


def pays_entier(perimetre: Perimetre) -> bool:
    """Le tableau du pays entier, le même pour qui le lit : celui du responsable pays et du
    siège, sauf s'ils occupent eux-mêmes un poste du pays (le tableau les exclurait)."""
    from apps.organisation.models import Occupation

    if not (perimetre.est_siege or Role.RESPONSABLE_PAYS in perimetre.roles):
        return False
    return not Occupation.objects.filter(
        utilisateur=perimetre.utilisateur, poste__pays=perimetre.pays_actif
    ).exists()


def perimetre_du_pays(pays: Pays) -> Perimetre:
    """La portée « tout le pays », sans personne : celle du calcul d'avance."""
    return Perimetre(None, pays, frozenset({Role.RESPONSABLE_PAYS}), (pays,))


def _equipe(perimetre: Perimetre, choix: dict) -> dict:
    from .indicateurs import FILTRES, tableau_pilotage

    filtres = {k: choix[k] for k in (*FILTRES, "statut") if choix.get(k)}
    donnees = tableau_pilotage(perimetre, choix.get("semaine"), choix["par"], choix["periode"],
                               choix.get("du"), choix.get("au"), filtres)  # fmt: skip
    return s.TableauEquipeSerializer(donnees).data


def equipe(perimetre: Perimetre, choix: dict) -> dict:
    """Le tableau sérialisé (DSH-002, DSH-003) ; gardé quand il couvre le pays entier."""
    if not pays_entier(perimetre):
        return _equipe(perimetre, choix)
    pays = perimetre.pays_actif
    return _garde(_cle("equipe", pays.code, _choix(choix)),
                  lambda: _equipe(perimetre_du_pays(pays), choix))  # fmt: skip


def _prescription(perimetre: Perimetre, choix: dict) -> dict:
    from .indicateurs import FILTRES, bornes, pilotes_retenus
    from .prescription import prescription

    pays = perimetre.pays_actif
    filtres = {k: choix[k] for k in FILTRES if choix.get(k)}
    debut, fin = bornes(pays, choix["periode"], choix.get("semaine"), choix.get("du"),
                        choix.get("au"))  # fmt: skip
    _, _, pilotes = pilotes_retenus(perimetre, debut, fin, filtres)
    donnees = {"debut": debut, "fin": fin, **prescription(pays, pilotes, debut, fin)}
    return s.PrescriptionSerializer(donnees).data


def prescription(perimetre: Perimetre, choix: dict) -> dict:
    """DC-53, DC-57 : la tendance et les points d'attention ; gardés pour le pays entier."""
    if not pays_entier(perimetre):
        return _prescription(perimetre, choix)
    pays = perimetre.pays_actif
    return _garde(_cle("prescription", pays.code, _choix(choix)),
                  lambda: _prescription(perimetre_du_pays(pays), choix))  # fmt: skip


def _siege(perimetre: Perimetre, choix: dict) -> dict:
    from .indicateurs import tableau_siege

    donnees = tableau_siege(perimetre, choix.get("semaine"), choix["periode"], choix.get("du"),
                            choix.get("au"))  # fmt: skip
    return s.TableauSiegeSerializer(donnees).data


def siege(perimetre: Perimetre, choix: dict) -> dict:
    """DSH-004 : la consolidation, sans aucun nom ; la même pour tout le siège."""
    codes = sorted(p.code for p in perimetre.pays_accessibles)
    return _garde(_cle("siege", codes, _choix(choix)), lambda: _siege(perimetre, choix))


def _defaut(serializer) -> dict:
    choix = serializer(data={})
    choix.is_valid(raise_exception=True)
    return choix.validated_data


def prechauffer() -> dict:
    """Recalcule les tableaux de la période par défaut : chaque pays actif, dans son isolation
    (ADR-003), puis la consolidation du siège. Rend la durée de chaque calcul, en secondes."""
    import time

    durees = {}
    equipe_defaut = _defaut(s.ChoixPilotageSerializer)
    for pays in Pays.objects.filter(statut=Pays.Statut.ACTIF):
        debut = time.monotonic()
        with transaction.atomic():
            with connection.cursor() as curseur:
                curseur.execute("SELECT set_config('innov.pays', %s, true)", [str(pays.pk)])
            perimetre = perimetre_du_pays(pays)
            cache.set(_cle("equipe", pays.code, _choix(equipe_defaut)),
                      _equipe(perimetre, equipe_defaut), DUREE)  # fmt: skip
            cache.set(_cle("prescription", pays.code, _choix(equipe_defaut)),
                      _prescription(perimetre, equipe_defaut), DUREE)  # fmt: skip
        durees[pays.code] = round(time.monotonic() - debut, 1)
    debut = time.monotonic()
    accessibles = tuple(Pays.objects.exclude(statut=Pays.Statut.ARCHIVE).order_by("nom"))
    siege_defaut = _defaut(s.ChoixPeriodeSerializer)
    perimetre = Perimetre(None, None, frozenset({Role.DIRECTION_SIEGE}), accessibles)
    with transaction.atomic():
        # Le siège lit tous ses pays (même dans une transaction déjà ouverte).
        with connection.cursor() as curseur:
            codes = ",".join(str(p.pk) for p in accessibles) or "aucun"
            curseur.execute("SELECT set_config('innov.pays', %s, true)", [codes])
        cache.set(_cle("siege", sorted(p.code for p in accessibles), _choix(siege_defaut)),
                  _siege(perimetre, siege_defaut), DUREE)  # fmt: skip
    durees["siege"] = round(time.monotonic() - debut, 1)
    return durees

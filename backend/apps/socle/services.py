"""Services du module socle : cycle de vie des pays et paramètres (ORG-001, ORG-011).

Les autres modules passent par ces fonctions, jamais par les tables directement
(architecture §7.2). L'audit des changements de statut et de paramètres
(ORG-001 CA4, ORG-011 CA2) sera écrit ici quand le journal d'audit existera
(version 0.0.8, AUD-001).
"""

from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .catalogue_pays import CATALOGUE as CATALOGUE_PAYS
from .models import ParametrePays, Pays
from .parametres import definition

# Transitions autorisées du statut d'un pays (prd.md §17.5).
TRANSITIONS_PAYS: dict[str, set[str]] = {
    Pays.Statut.ACTIF: {Pays.Statut.SUSPENDU, Pays.Statut.ARCHIVE},
    Pays.Statut.SUSPENDU: {Pays.Statut.ACTIF, Pays.Statut.ARCHIVE},
    Pays.Statut.ARCHIVE: set(),
}


@transaction.atomic
def creer_pays(code: str, **surcharges: Any) -> Pays:
    """Crée un pays depuis le catalogue, au statut actif (ORG-001 CA1)."""
    code = code.upper()
    modele = CATALOGUE_PAYS.get(code)
    if modele is None:
        raise ValidationError(f"Le pays {code} n'est pas dans le catalogue des filiales.")
    if Pays.objects.filter(code=code).exists():
        raise ValidationError(f"Le pays {code} existe déjà.")
    valeurs = {
        "nom": modele.nom,
        "fuseau": modele.fuseau,
        "langue": modele.langue,
        "devise": modele.devise,
        **surcharges,
    }
    pays = Pays(code=code, statut=Pays.Statut.ACTIF, **valeurs)
    pays.full_clean()
    pays.save()
    return pays


@transaction.atomic
def changer_statut_pays(pays: Pays, statut: str) -> Pays:
    """Active, suspend ou archive un pays selon les transitions de prd.md §17.5."""
    pays = Pays.objects.select_for_update().get(pk=pays.pk)
    if statut not in TRANSITIONS_PAYS[pays.statut]:
        raise ValidationError(
            f"Transition interdite : {pays.get_statut_display()} → {Pays.Statut(statut).label}."
        )
    pays.statut = statut
    if statut == Pays.Statut.ARCHIVE:
        pays.archive_le = timezone.now()
    pays.save(update_fields=["statut", "archive_le"])
    return pays


def suspendre_pays(pays: Pays) -> Pays:
    return changer_statut_pays(pays, Pays.Statut.SUSPENDU)


def activer_pays(pays: Pays) -> Pays:
    return changer_statut_pays(pays, Pays.Statut.ACTIF)


def archiver_pays(pays: Pays) -> Pays:
    return changer_statut_pays(pays, Pays.Statut.ARCHIVE)


def valeur_parametre(pays: Pays, cle: str, a: datetime | None = None) -> Any:
    """Valeur d'un paramètre en vigueur à l'instant donné (par défaut : maintenant).

    Sans valeur définie pour le pays, renvoie la valeur par défaut (ORG-011 CA1).
    """
    defn = definition(cle)
    a = a or timezone.now()
    ligne = (
        ParametrePays.objects.filter(pays=pays, cle=cle, debut__lte=a)
        .order_by("-debut")
        .values_list("valeur", flat=True)
        .first()
    )
    return defn.defaut if ligne is None else ligne


def parametres_en_vigueur(pays: Pays, a: datetime | None = None) -> dict[str, Any]:
    from .parametres import CATALOGUE

    return {cle: valeur_parametre(pays, cle, a) for cle in CATALOGUE}


@transaction.atomic
def definir_parametre(
    pays: Pays, cle: str, valeur: Any, debut: datetime | None = None
) -> ParametrePays:
    """Définit une nouvelle valeur datée, sans effacer les précédentes (ORG-011 CA3)."""
    defn = definition(cle)
    defn.valider(valeur)
    if pays.statut == Pays.Statut.ARCHIVE:
        raise ValidationError("Un pays archivé est en lecture seule (ORG-001 CA3).")
    return ParametrePays.objects.create(
        pays=pays, cle=cle, valeur=valeur, debut=debut or timezone.now()
    )


def aujourdhui(pays: Pays) -> date:
    """Date du jour dans le fuseau du pays (RG-006)."""
    return timezone.now().astimezone(ZoneInfo(pays.fuseau)).date()


def debut_du_jour(pays: Pays, jour: date) -> datetime:
    """Minuit, heure du pays, du jour donné (en UTC côté base)."""
    return datetime.combine(jour, time.min, tzinfo=ZoneInfo(pays.fuseau))

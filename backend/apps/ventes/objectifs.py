"""Objectifs de ventes par réseau et leur suivi (décision du 23 octobre 2026, prd.md §14.88).

Un objectif est le chiffre d'affaires TTC d'une année pour un réseau, ou pour un produit de ce
réseau. Le réalisé est le cumul de l'année (YTD) des ventes du réseau (ou du produit dans ce
réseau) ; il se compare à la cible de l'année et à l'attendu à la fin du mois choisi, selon la
répartition mensuelle (à parts égales si elle n'est pas précisée).
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Sum
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import Role
from apps.organisation.models import PerimetreReseau, Reseau, actif_le
from apps.pilotage.objectifs import reseaux_geres
from apps.referentiel.models import Portefeuille
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from .models import EtatObjectifVente, ObjectifVente, Vente
from .services import nombre

CENTIME = Decimal("0.01")


def reseaux_lus(perimetre):
    """Qui lit un objectif : le siège et le pays voient tous les réseaux du pays ; le DF (le
    DO) et le DM, ceux de leur périmètre."""
    pays = perimetre.pays_actif
    reseaux = Reseau.objects.filter(pays=pays)
    if perimetre.est_siege or perimetre.roles & {Role.ADMIN_PAYS, Role.RESPONSABLE_PAYS}:
        return reseaux
    mes = PerimetreReseau.objects.filter(
        actif_le(aujourdhui(pays)), utilisateur=perimetre.utilisateur
    )
    return reseaux.filter(pk__in=mes.values("reseau_id"))


def objectifs_visibles(perimetre, annee: int | None = None):
    qs = ObjectifVente.objects.filter(
        pays=perimetre.pays_actif, archive_le__isnull=True, reseau__in=reseaux_lus(perimetre)
    ).select_related("reseau", "produit")
    return qs.filter(annee=annee) if annee else qs


def _arrondi(n: Decimal) -> Decimal:
    return n.quantize(CENTIME, rounding=ROUND_HALF_UP)


def repartition(cible: Decimal, mois: list | None) -> list[Decimal]:
    """Les douze montants de l'année : ceux précisés, sinon la cible à parts égales (le centime
    d'arrondi tombe sur décembre, la somme reste la cible)."""
    if mois:
        return [Decimal(str(m)) for m in mois]
    part = _arrondi(cible / 12)
    return [part] * 11 + [cible - part * 11]


def _lire_mois(mois) -> list[Decimal] | None:
    if mois in (None, []):
        return None
    if not isinstance(mois, list) or len(mois) != 12:
        raise ErreurMetier("repartition_invalide", _("Donnez les douze mois, de janvier à "
                                                     "décembre."), champ="mois")  # fmt: skip
    valeurs = [_arrondi(nombre(m, "mois")) for m in mois]
    if any(v < 0 for v in valeurs):
        raise ErreurMetier("repartition_invalide", _("Un mois ne peut pas être négatif."),
                           champ="mois")  # fmt: skip
    return valeurs


def _reseau_geree(perimetre, reseau: Reseau) -> None:
    if not reseaux_geres(perimetre).filter(pk=reseau.pk).exists():
        raise ErreurMetier(
            "objectif_hors_perimetre",
            _("Seul l'administrateur pays fixe les objectifs de ventes."),
            status.HTTP_403_FORBIDDEN,
        )


def _verifier_produit(reseau, produit) -> None:
    """Un produit du portefeuille du réseau, à n'importe quelle date : les portefeuilles se
    saisissent souvent après coup (comme pour le réseau d'une ligne de vente)."""
    if produit is None:
        return
    liens = Portefeuille.objects.filter(reseau=reseau, produit=produit, archive_le__isnull=True)
    if not liens.exists():
        raise ErreurMetier(
            "produit_hors_portefeuille",
            _("Choisissez un produit du portefeuille du réseau."),
            champ="produit",
        )


def _cible(cible, mois) -> tuple[Decimal, list[Decimal] | None]:
    """La cible de l'année et sa répartition : l'une ou l'autre suffit ; si les deux sont
    données, la somme des mois doit être la cible."""
    repartie = _lire_mois(mois)
    if cible in (None, ""):
        if repartie is None:
            raise ErreurMetier(
                "cible_invalide",
                _("Donnez la cible de l'année ou ses douze mois."),
                champ="cible",
            )
        cible_n = sum(repartie, Decimal("0"))
    else:
        cible_n = _arrondi(nombre(cible, "cible"))
        if repartie is not None and sum(repartie, Decimal("0")) != cible_n:
            raise ErreurMetier(
                "repartition_invalide",
                _("La somme des douze mois doit être la cible de l'année."),
                champ="mois",
            )
    if cible_n <= 0:
        raise ErreurMetier("cible_invalide", _("La cible est un montant positif."), champ="cible")
    return cible_n, repartie


def _auditer(action: str, objectif: ObjectifVente, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"ventes.objectif_{action}", objet=objectif, pays=objectif.pays, details={
        "reseau": str(objectif.reseau_id), "produit": str(objectif.produit_id or ""),
        "annee": objectif.annee, **details,
    })  # fmt: skip


def creer(perimetre, *, reseau, annee, cible=None, mois=None, produit=None) -> ObjectifVente:
    _reseau_geree(perimetre, reseau)
    _verifier_produit(reseau, produit)
    cible_n, repartie = _cible(cible, mois)
    existe = ObjectifVente.objects.filter(
        pays=reseau.pays, reseau=reseau, produit=produit, annee=annee, archive_le__isnull=True
    ).exists()
    if existe:
        raise ErreurMetier(
            "objectif_existant",
            _("Un objectif existe déjà pour ce réseau, ce produit et cette année : modifiez-le."),
        )  # fmt: skip
    objectif = ObjectifVente.objects.create(
        pays=reseau.pays, reseau=reseau, produit=produit, annee=annee, cible=cible_n,
        mois=[str(m) for m in repartie] if repartie else None, cree_par=perimetre.utilisateur,
    )  # fmt: skip
    _auditer("creation", objectif, cible=str(cible_n))
    return objectif


def modifier(perimetre, objectif: ObjectifVente, champs: dict) -> ObjectifVente:
    """Corrige la cible ou sa répartition. Des mois donnés remplacent l'ancienne répartition
    (la cible est leur somme si elle n'est pas donnée) ; sans mois, la cible se répartit de
    nouveau à parts égales."""
    _reseau_geree(perimetre, objectif.reseau)
    avant = {"cible": str(objectif.cible), "mois": objectif.mois}
    if champs.get("mois"):
        cible, repartie = _cible(champs.get("cible"), champs["mois"])
    else:
        cible, repartie = _cible(champs.get("cible") or objectif.cible, None)
    objectif.cible = cible
    objectif.mois = [str(m) for m in repartie] if repartie else None
    objectif.save(update_fields=["cible", "mois", "modifie_le"])
    _auditer("modification", objectif, avant=avant,
             apres={"cible": str(objectif.cible), "mois": objectif.mois})  # fmt: skip
    return objectif


def archiver(perimetre, objectif: ObjectifVente) -> None:
    _reseau_geree(perimetre, objectif.reseau)
    objectif.archiver()
    _auditer("archivage", objectif)


def suivi(objectif: ObjectifVente, mois_fin: int) -> dict:
    """Le réalisé de l'année jusqu'au mois choisi, l'attendu à la même date, l'état."""
    repartie = repartition(objectif.cible, objectif.mois)
    attendu = sum(repartie[:mois_fin], Decimal("0"))
    ventes = Vente.objects.filter(
        pays=objectif.pays_id, reseau=objectif.reseau_id, archive_le__isnull=True,
        mois__gte=date(objectif.annee, 1, 1), mois__lte=date(objectif.annee, mois_fin, 1),
    )  # fmt: skip
    if objectif.produit_id:
        ventes = ventes.filter(produit=objectif.produit_id)
    realise = ventes.aggregate(m=Sum("montant_ttc"))["m"] or Decimal("0")
    jour = aujourdhui(objectif.pays)
    if objectif.annee > jour.year:
        etat = EtatObjectifVente.A_VENIR
    elif realise >= objectif.cible:
        etat = EtatObjectifVente.ATTEINT
    elif objectif.annee < jour.year:
        etat = EtatObjectifVente.NON_ATTEINT
    elif realise >= attendu:
        etat = EtatObjectifVente.EN_AVANCE
    else:
        etat = EtatObjectifVente.EN_RETARD

    def taux(a, b):
        return round(float(a / b) * 100, 1) if b else None

    return {
        "cible": objectif.cible, "attendu": attendu, "realise": realise,
        "taux_cible": taux(realise, objectif.cible), "taux_attendu": taux(realise, attendu),
        "ecart": realise - attendu, "etat": etat,
        "mois": [str(m) for m in repartie],
    }  # fmt: skip

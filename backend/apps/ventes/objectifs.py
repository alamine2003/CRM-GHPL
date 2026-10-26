"""Objectifs de ventes par réseau et leur suivi (décisions des 23 et 25 octobre 2026, prd.md
§14.88, §14.89).

Un objectif est le chiffre d'affaires TTC d'une année pour un réseau, pour un produit de ce
réseau, ou (1.8.0) pour un délégué de ce réseau. Le réalisé est le cumul de l'année (YTD) des
ventes du réseau (du produit dans ce réseau, du délégué dans ce réseau) ; il se compare à la
cible de l'année et à l'attendu à la fin du mois choisi, selon la répartition mensuelle (à
parts égales si elle n'est pas précisée).
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q, Sum
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import Role
from apps.organisation.models import Occupation, PerimetreReseau, Rattachement, Reseau, actif_le
from apps.referentiel.models import Portefeuille
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from .models import EtatObjectifVente, ObjectifVente, Vente
from .services import nombre

CENTIME = Decimal("0.01")


def _mes_reseaux(perimetre):
    """Les réseaux du périmètre du DF ou du DM (ORG-008), aujourd'hui."""
    pays = perimetre.pays_actif
    mes = PerimetreReseau.objects.filter(
        actif_le(aujourdhui(pays)), utilisateur=perimetre.utilisateur
    )
    return Reseau.objects.filter(pays=pays, pk__in=mes.values("reseau_id"))


def _tout_le_pays(perimetre) -> bool:
    return perimetre.est_siege or bool(perimetre.roles & {Role.ADMIN_PAYS, Role.RESPONSABLE_PAYS})


def reseaux_lus(perimetre):
    """Qui lit les objectifs d'un réseau entier : le siège et le pays, tous les réseaux du pays ;
    le DF (le DO) et le DM, ceux de leur périmètre."""
    if _tout_le_pays(perimetre):
        return Reseau.objects.filter(pays=perimetre.pays_actif)
    if perimetre.roles & {Role.DF, Role.DM}:
        return _mes_reseaux(perimetre)
    return Reseau.objects.none()


def reseaux_geres(perimetre):
    """[D, 25 octobre 2026] L'administrateur pays (et le siège dans un pays choisi) fixe les
    objectifs de tous les réseaux du pays ; le DM, ceux des réseaux de son périmètre."""
    reseaux = Reseau.objects.filter(pays=perimetre.pays_actif, archive_le__isnull=True)
    if Role.ADMIN_PAYS in perimetre.roles:
        return reseaux
    if Role.DM in perimetre.roles:
        return reseaux.filter(pk__in=_mes_reseaux(perimetre).values("pk"))
    return reseaux.none()


def delegues_supervises(perimetre, annee: int):
    """Le superviseur : les délégués des postes qui lui sont rattachés pendant l'année, ou
    aujourd'hui (un rattachement saisi après coup ne cache pas l'année passée)."""
    debut = date(annee, 1, 1)
    fin = max(date(annee, 12, 31), aujourdhui(perimetre.pays_actif))
    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    postes = Rattachement.objects.filter(pendant, superviseur=perimetre.utilisateur,
                                         debut__lte=fin)  # fmt: skip
    return Occupation.objects.filter(
        pendant, poste__in=postes.values("poste_id"), debut__lte=fin
    ).values("utilisateur_id")


def delegues_du_reseau(reseau, annee: int):
    """Les délégués qui ont occupé, pendant l'année, un poste du réseau."""
    from apps.identite.models import Utilisateur

    debut, fin = date(annee, 1, 1), date(annee, 12, 31)
    occupations = Occupation.objects.filter(
        Q(fin__isnull=True) | Q(fin__gt=debut), poste__reseaux=reseau, debut__lte=fin
    )
    return Utilisateur.objects.filter(pk__in=occupations.values("utilisateur_id")).order_by(
        "last_name", "first_name"
    )


def objectifs_visibles(perimetre, annee: int | None = None):
    """Le pays et l'encadrement des réseaux voient les objectifs de leurs réseaux (réseau,
    produit, délégué) ; le superviseur (1.8.0), ceux des seuls délégués qui lui sont
    rattachés."""
    qs = ObjectifVente.objects.filter(pays=perimetre.pays_actif, archive_le__isnull=True)
    vus = Q(reseau__in=reseaux_lus(perimetre))
    if Role.SUPERVISEUR in perimetre.roles:
        annee_sup = annee or aujourdhui(perimetre.pays_actif).year
        vus |= Q(delegue__in=delegues_supervises(perimetre, annee_sup))
    qs = qs.filter(vus).select_related("reseau", "produit", "delegue")
    return qs.filter(annee=annee) if annee else qs


def gerable(perimetre, objectif: ObjectifVente) -> bool:
    return reseaux_geres(perimetre).filter(pk=objectif.reseau_id).exists()


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
            _("Vous ne fixez les objectifs de ventes que des réseaux de votre périmètre."),
            status.HTTP_403_FORBIDDEN,
        )


def _verifier_delegue(reseau, delegue, annee: int) -> None:
    if delegue is None:
        return
    if not delegues_du_reseau(reseau, annee).filter(pk=delegue.pk).exists():
        raise ErreurMetier(
            "delegue_hors_reseau",
            _("Choisissez un délégué qui occupe un poste de ce réseau cette année-là."),
            champ="delegue",
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
        "delegue": str(objectif.delegue_id or ""), "annee": objectif.annee, **details,
    })  # fmt: skip


def creer(
    perimetre, *, reseau, annee, cible=None, mois=None, produit=None, delegue=None
) -> ObjectifVente:
    _reseau_geree(perimetre, reseau)
    if produit is not None and delegue is not None:
        raise ErreurMetier(
            "portee_invalide",
            _("Un objectif vise tout le réseau, un produit ou un délégué : un seul à la fois."),
        )
    _verifier_produit(reseau, produit)
    _verifier_delegue(reseau, delegue, annee)
    cible_n, repartie = _cible(cible, mois)
    existe = ObjectifVente.objects.filter(
        pays=reseau.pays, reseau=reseau, produit=produit, delegue=delegue, annee=annee,
        archive_le__isnull=True,
    ).exists()  # fmt: skip
    if existe:
        raise ErreurMetier(
            "objectif_existant",
            _("Un objectif existe déjà pour ce réseau, cette portée et cette année : "
              "modifiez-le."),
        )  # fmt: skip
    objectif = ObjectifVente.objects.create(
        pays=reseau.pays, reseau=reseau, produit=produit, delegue=delegue, annee=annee,
        cible=cible_n, mois=[str(m) for m in repartie] if repartie else None,
        cree_par=perimetre.utilisateur,
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


def ventes_de(objectif: ObjectifVente):
    """Les lignes de vente qui comptent pour l'objectif : celles du réseau, et du produit ou
    du délégué quand l'objectif les vise."""
    ventes = Vente.objects.filter(
        pays=objectif.pays_id, reseau=objectif.reseau_id, archive_le__isnull=True,
        mois__year=objectif.annee,
    )  # fmt: skip
    if objectif.produit_id:
        ventes = ventes.filter(produit=objectif.produit_id)
    if objectif.delegue_id:
        ventes = ventes.filter(delegue=objectif.delegue_id)
    return ventes


def suivi(objectif: ObjectifVente, mois_fin: int) -> dict:
    """Le réalisé de l'année jusqu'au mois choisi, l'attendu à la même date, l'état, et le
    réalisé de chaque mois (pour la courbe cible / réalisé)."""
    repartie = repartition(objectif.cible, objectif.mois)
    attendu = sum(repartie[:mois_fin], Decimal("0"))
    par_mois = {
        m["mois"].month: m["total"]
        for m in ventes_de(objectif).values("mois").annotate(total=Sum("montant_ttc"))
    }
    realise_mois = [par_mois.get(n, Decimal("0")) for n in range(1, 13)]
    realise = sum(realise_mois[:mois_fin], Decimal("0"))
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
        "realise_mois": [str(m) for m in realise_mois],
    }  # fmt: skip

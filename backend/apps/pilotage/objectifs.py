"""Objectifs par réseau et leur suivi (DSH-009, prd.md §14.56).

[D, 8 octobre 2026, délégation] Le réalisé se compare à l'attendu à la date du jour, au
prorata du temps écoulé de la période (une cible de 100 visites sur 10 semaines attend 30
visites au bout de 3 semaines) : « en avance » ou « en retard » (CA2) ; « atteint » dès que la
cible l'est ; « non atteint » à la fin de la période ; « à venir » avant son début.
"""

from datetime import date, timedelta

from django.db.models import Q
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import Role
from apps.organisation.models import Occupation, PerimetreReseau, Reseau, actif_le
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from .indicateurs import Lot, somme, taux
from .models import Indicateur, Objectif


def reseaux_geres(perimetre, jour: date | None = None):
    """DSH-009 : l'administrateur pays fixe les objectifs de tous les réseaux du pays (1.3.0 :
    le DM ne fait plus que les lire)."""
    pays = perimetre.pays_actif
    reseaux = Reseau.objects.filter(pays=pays, archive_le__isnull=True)
    if Role.ADMIN_PAYS in perimetre.roles:
        return reseaux
    return reseaux.none()


def reseaux_visibles(perimetre, jour: date | None = None):
    """Qui lit un objectif : le pays (administration, responsable, siège), DF et DM pour
    leurs réseaux, le superviseur pour les réseaux des postes qui lui sont rattachés."""
    from apps.organisation.models import Rattachement

    pays = perimetre.pays_actif
    reseaux = Reseau.objects.filter(pays=pays)
    if perimetre.est_siege or perimetre.roles & {Role.ADMIN_PAYS, Role.RESPONSABLE_PAYS}:
        return reseaux
    jour = jour or aujourdhui(pays)
    choisis = Q(pk__in=[])
    if perimetre.roles & {Role.DF, Role.DM}:
        mes = PerimetreReseau.objects.filter(actif_le(jour), utilisateur=perimetre.utilisateur)
        choisis |= Q(pk__in=mes.values("reseau_id"))
    if Role.SUPERVISEUR in perimetre.roles:
        postes = Rattachement.objects.filter(actif_le(jour), superviseur=perimetre.utilisateur)
        choisis |= Q(postes__in=postes.values("poste_id"))
    return reseaux.filter(choisis).distinct()


def _exiger_gestion(perimetre, reseau: Reseau) -> None:
    if not reseaux_geres(perimetre).filter(pk=reseau.pk).exists():
        raise ErreurMetier(
            "objectif_hors_perimetre",
            _("Seul l'administrateur pays fixe ses objectifs."),
            status.HTTP_403_FORBIDDEN,
        )


def _verifier(reseau, indicateur, produit, debut, fin, cible) -> None:
    from apps.referentiel.models import Portefeuille

    if fin < debut:
        raise ErreurMetier("periode_invalide", _("La fin vient après le début."), champ="fin")
    if cible < 1:
        raise ErreurMetier("cible_invalide", _("La cible est un nombre positif."),
                           champ="cible")  # fmt: skip
    if indicateur == Indicateur.COUVERTURE_AB and cible > 100:
        raise ErreurMetier("cible_invalide", _("Une couverture se donne en pourcentage, 100 au "
                                               "plus."), champ="cible")  # fmt: skip
    if indicateur == Indicateur.PRESENTATIONS:
        portefeuille = Portefeuille.objects.filter(
            Q(fin__isnull=True) | Q(fin__gt=debut), reseau=reseau, debut__lte=fin,
            produit=produit,
        )  # fmt: skip
        if produit is None or not portefeuille.exists():
            raise ErreurMetier(
                "produit_hors_portefeuille",
                _("Choisissez un produit du portefeuille du réseau."), champ="produit",
            )  # fmt: skip


def creer(perimetre, *, reseau, indicateur, debut, fin, cible, produit=None) -> Objectif:
    from apps.audit.services import enregistrer

    _exiger_gestion(perimetre, reseau)
    if indicateur != Indicateur.PRESENTATIONS:
        produit = None
    _verifier(reseau, indicateur, produit, debut, fin, cible)
    objectif = Objectif.objects.create(
        pays=reseau.pays, reseau=reseau, indicateur=indicateur, produit=produit, debut=debut,
        fin=fin, cible=cible, cree_par=perimetre.utilisateur,
    )  # fmt: skip
    enregistrer("objectif.creation", objet=objectif, details={
        "reseau": str(reseau.pk), "indicateur": indicateur, "cible": cible,
        "debut": debut.isoformat(), "fin": fin.isoformat(),
    })  # fmt: skip
    return objectif


def modifier(perimetre, objectif: Objectif, **champs) -> Objectif:
    from apps.audit.services import enregistrer

    _exiger_gestion(perimetre, objectif.reseau)
    avant = {k: getattr(objectif, k) for k in champs}
    for cle, valeur in champs.items():
        setattr(objectif, cle, valeur)
    _verifier(objectif.reseau, objectif.indicateur, objectif.produit, objectif.debut,
              objectif.fin, objectif.cible)  # fmt: skip
    objectif.save(update_fields=list(champs))
    enregistrer("objectif.modification", objet=objectif, details={
        k: {"avant": str(avant[k]), "apres": str(v)} for k, v in champs.items()
    })  # fmt: skip
    return objectif


def archiver(perimetre, objectif: Objectif) -> Objectif:
    from apps.audit.services import enregistrer

    _exiger_gestion(perimetre, objectif.reseau)
    objectif.archiver()
    enregistrer("objectif.archivage", objet=objectif)
    return objectif


def delegues_du_reseau(reseau, debut: date, fin: date) -> list:
    """Les occupants, sur la période, des postes du réseau."""
    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    occupations = (
        Occupation.objects.filter(pendant, poste__reseaux=reseau, debut__lte=fin)
        .select_related("utilisateur")
        .order_by("utilisateur_id")
    )
    vus = {}
    for o in occupations:
        vus.setdefault(o.utilisateur_id, o.utilisateur)
    return list(vus.values())


def _presentations(lot: Lot, delegues, debut, fin, produit) -> int:
    from apps.planning.etats import StatutVisite
    from apps.rapports.models import Rapport

    faites = [
        v.pk for d in delegues for liste in lot.visites(d, debut, fin) for v in liste
        if v.statut == StatutVisite.EFFECTUEE
    ]  # fmt: skip
    rapports = Rapport.objects.filter(visite_id__in=faites, soumis_le__isnull=False)
    cle = str(produit.pk)
    return sum(
        1 for presentations in rapports.values_list("presentations", flat=True)
        if any(str(p.get("produit")) == cle for p in presentations or [])
    )  # fmt: skip


def suivi(objectif: Objectif, today: date | None = None) -> dict:
    """CA2 : le réalisé depuis le début de la période, l'attendu à ce jour, l'état."""
    today = today or aujourdhui(objectif.pays)
    debut, fin = objectif.debut, objectif.fin
    if today < debut:
        return {"realise": 0, "attendu": 0, "etat": "a_venir", "taux": 0.0,
                "delegues": 0}  # fmt: skip
    jusqu_a = min(today, fin)
    delegues = delegues_du_reseau(objectif.reseau, debut, jusqu_a)
    lot = Lot(objectif.pays, delegues, debut, jusqu_a)
    comptes = somme([lot.calculer(d, debut, jusqu_a) for d in delegues])
    if objectif.indicateur == Indicateur.VISITES:
        realise = comptes["visites"]["effectuees"]
    elif objectif.indicateur == Indicateur.COUVERTURE_AB:
        realise = round((comptes["taux"]["couverture_ab"] or 0) * 100)
    else:
        realise = _presentations(lot, delegues, debut, jusqu_a, objectif.produit)
    duree = (fin - debut).days + 1
    ecoule = (jusqu_a - debut).days + 1
    attendu = round(objectif.cible * ecoule / duree)
    if realise >= objectif.cible:
        etat = "atteint"
    elif today > fin:
        etat = "non_atteint"
    elif realise >= attendu:
        etat = "en_avance"
    else:
        etat = "en_retard"
    return {"realise": realise, "attendu": attendu, "etat": etat,
            "taux": taux(realise, objectif.cible) or 0.0, "delegues": len(delegues)}  # fmt: skip


def objectifs_visibles(perimetre, en_cours: bool = True):
    """Les objectifs des réseaux visibles ; en cours (non terminés depuis plus de 90 jours)
    ou tous."""
    qs = Objectif.objects.filter(pays=perimetre.pays_actif, archive_le__isnull=True,
                                 reseau__in=reseaux_visibles(perimetre))  # fmt: skip
    if en_cours:
        qs = qs.filter(fin__gte=aujourdhui(perimetre.pays_actif) - timedelta(days=90))
    return qs.select_related("reseau", "produit").order_by("reseau__libelle", "-debut")

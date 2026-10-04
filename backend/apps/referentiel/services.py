"""Services du référentiel (PRP-001) et des portefeuilles (ORG-004).

Les vues vérifient les droits (matrice) ; les règles métier et l'audit sont ici
(architecture §7.2). Rien ne se supprime : on archive (RG-005, PRP-001 CA2).
"""

import re
import unicodedata
from datetime import date

from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils.translation import gettext as _

from apps.organisation.models import Reseau, actif_le
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .catalogue import INITIALES
from .models import Liste, Portefeuille, Produit, Valeur

#: Listes dont une valeur peut avoir un parent, et la liste de ce parent.
PARENTS = {Liste.SPECIALITE: Liste.TYPE_PROSPECT}


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"referentiel.{action}", objet=objet, pays=objet.pays, details=details)


def _texte(valeur: str | None, champ: str) -> str:
    valeur = (valeur or "").strip()
    if not valeur:
        raise ErreurMetier("champ_requis", _("Ce champ est obligatoire."), champ=champ)
    return valeur


def code_depuis(libelle: str) -> str:
    """Code stable tiré d'un libellé : « Gynécologie » → `gynecologie`."""
    sans_accents = unicodedata.normalize("NFKD", libelle).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", sans_accents.lower()).strip("_")[:40] or "valeur"


def _enregistrer(objet, action: str, **details):
    try:
        with transaction.atomic():
            objet.save()
    except IntegrityError as erreur:
        raise ErreurMetier(
            "libelle_deja_utilise", _("Ce libellé ou ce code est déjà utilisé dans cette liste.")
        ) from erreur
    _auditer(action, objet, **details)
    return objet


def _du_pays(objet, pays: Pays, code: str, liste: str | None = None):
    if objet is None:
        return None
    if objet.pays_id != pays.pk or objet.est_archive or (liste and objet.liste != liste):
        raise ErreurMetier(code, _("Élément inconnu ou archivé dans ce pays."))
    return objet


def _parent(pays: Pays, liste: str, parent: Valeur | None) -> Valeur | None:
    if parent is None:
        return None
    attendu = PARENTS.get(liste)
    if attendu is None:
        raise ErreurMetier("parent_interdit", _("Cette liste n'a pas de valeur parente."))
    return _du_pays(parent, pays, "parent_invalide", attendu)


# --- Listes (PRP-001) ------------------------------------------------------------------------


def initialiser_pays(pays: Pays) -> None:
    """Listes proposées à l'ouverture d'un pays, dans sa langue ; l'administrateur les ajuste."""
    anglais = pays.langue == "en"
    parents: dict[str, Valeur] = {}
    for liste, entrees in INITIALES.items():
        for ordre, (code, fr, en, *parent) in enumerate(entrees, start=1):
            valeur = Valeur(
                pays=pays, liste=liste, code=code, libelle=en if anglais else fr, ordre=ordre,
                parent=parents.get(parent[0]) if parent else None,
            )  # fmt: skip
            valeur.save()
            if liste == Liste.TYPE_PROSPECT:
                parents[code] = valeur


def creer_valeur(
    pays: Pays,
    liste: str,
    libelle: str,
    code: str | None = None,
    ordre: int | None = None,
    parent: Valeur | None = None,
) -> Valeur:
    """PRP-001 CA1 : l'administrateur pays complète chaque liste."""
    if liste not in Liste.values:
        raise ErreurMetier("liste_inconnue", _("Liste inconnue."))
    libelle = _texte(libelle, "libelle")
    if ordre is None:
        dernier = Valeur.objects.filter(pays=pays, liste=liste).order_by("-ordre").first()
        ordre = (dernier.ordre if dernier else 0) + 1
    valeur = Valeur(
        pays=pays, liste=liste, libelle=libelle, ordre=ordre,
        code=code_depuis((code or "").strip() or libelle),
        parent=_parent(pays, liste, parent),
    )  # fmt: skip
    return _enregistrer(valeur, "valeur.creation", liste=liste, libelle=libelle)


def modifier_valeur(valeur: Valeur, **champs) -> Valeur:
    """Libellé, ordre ou parent ; le code reste stable (imports, échanges)."""
    if valeur.est_archive:
        raise ErreurMetier("archive", _("Un élément archivé ne se modifie plus."))
    avant = {"libelle": valeur.libelle, "ordre": valeur.ordre, "parent": str(valeur.parent_id)}
    if "libelle" in champs:
        valeur.libelle = _texte(champs["libelle"], "libelle")
    if champs.get("ordre") is not None:
        valeur.ordre = champs["ordre"]
    if "parent" in champs:
        valeur.parent = _parent(valeur.pays, valeur.liste, champs["parent"])
    apres = {"libelle": valeur.libelle, "ordre": valeur.ordre, "parent": str(valeur.parent_id)}
    changes = {k: {"ancien": avant[k], "nouveau": apres[k]} for k in avant if avant[k] != apres[k]}
    return _enregistrer(valeur, "valeur.modification", **changes)


def est_utilisee(objet) -> bool:
    """Une valeur sert-elle ailleurs ? (PRP-001 CA2.)"""
    if isinstance(objet, Valeur):
        return (
            objet.enfants.exists()
            or objet.produits.exists()
            or objet.prospects_du_type.exists()
            or objet.prospects_de_la_specialite.exists()
            or objet.etablissements_du_type.exists()
        )
    if isinstance(objet, Produit):
        return objet.portefeuilles.exists()
    return False


def archiver(objet):
    """PRP-001 CA2 : rien ne se supprime ; une valeur archivée n'est plus proposée mais reste
    lisible partout où elle a servi. Archiver un produit le retire aujourd'hui des portefeuilles."""
    if objet.est_archive:
        return objet
    if isinstance(objet, Valeur) and objet.enfants.filter(archive_le__isnull=True).exists():
        raise ErreurMetier(
            "elements_actifs", _("Archivez d'abord les valeurs qui dépendent de celle-ci.")
        )
    if isinstance(objet, Valeur) and objet.produits.filter(archive_le__isnull=True).exists():
        raise ErreurMetier(
            "elements_actifs", _("Changez d'abord la classe des produits de cette classe.")
        )
    if isinstance(objet, Produit):
        jour = aujourdhui(objet.pays)
        for lien in objet.portefeuilles.filter(Q(fin__isnull=True) | Q(fin__gt=jour)):
            _terminer(lien, jour)
    objet.archiver()
    _auditer(f"{type(objet).__name__.lower()}.archivage", objet, utilisee=est_utilisee(objet))
    return objet


def reactiver(objet):
    """Une valeur archivée par erreur redevient proposée (si son libellé est encore libre)."""
    if not objet.est_archive:
        return objet
    objet.archive_le = None
    try:
        with transaction.atomic():
            objet.save(update_fields=["archive_le"])
    except IntegrityError as erreur:
        raise ErreurMetier(
            "libelle_deja_utilise", _("Une valeur active porte déjà ce libellé ou ce code.")
        ) from erreur
    _auditer(f"{type(objet).__name__.lower()}.reactivation", objet)
    return objet


# --- Produits --------------------------------------------------------------------------------


def creer_produit(
    pays: Pays, libelle: str, code: str | None = None, classe: Valeur | None = None
) -> Produit:
    libelle = _texte(libelle, "libelle")
    produit = Produit(
        pays=pays, libelle=libelle,
        code=(code or "").strip().upper() or code_depuis(libelle).upper(),
        classe=_du_pays(classe, pays, "classe_invalide", Liste.CLASSE_THERAPEUTIQUE),
    )  # fmt: skip
    return _enregistrer(produit, "produit.creation", libelle=libelle)


def modifier_produit(produit: Produit, **champs) -> Produit:
    if produit.est_archive:
        raise ErreurMetier("archive", _("Un élément archivé ne se modifie plus."))
    avant = {"libelle": produit.libelle, "classe": str(produit.classe_id)}
    if "libelle" in champs:
        produit.libelle = _texte(champs["libelle"], "libelle")
    if "classe" in champs:
        produit.classe = _du_pays(
            champs["classe"], produit.pays, "classe_invalide", Liste.CLASSE_THERAPEUTIQUE
        )
    apres = {"libelle": produit.libelle, "classe": str(produit.classe_id)}
    changes = {k: {"ancien": avant[k], "nouveau": apres[k]} for k in avant if avant[k] != apres[k]}
    return _enregistrer(produit, "produit.modification", **changes)


# --- Portefeuilles (ORG-004) ----------------------------------------------------------------


def portefeuille_actif(reseaux, jour: date) -> QuerySet:
    """Liens réseau ↔ produit en cours le jour donné."""
    return Portefeuille.objects.filter(actif_le(jour), reseau__in=reseaux).select_related(
        "produit__classe", "reseau"
    )


def _terminer(lien: Portefeuille, jour: date) -> None:
    # Retiré le jour même de son ajout : la période est vide, le lien est annulé.
    lien.fin = max(jour, lien.debut)
    lien.save(update_fields=["fin"])
    _auditer("portefeuille.retrait", lien.reseau, produit=lien.produit.libelle, fin=str(lien.fin))


@transaction.atomic
def definir_portefeuille(reseau: Reseau, produits: list[Produit]) -> list[Portefeuille]:
    """Fixe le portefeuille d'un réseau à partir d'aujourd'hui : ajoute ce qui manque, retire
    le reste. Le passé ne change pas : un rapport d'hier garde les produits d'hier."""
    if reseau.est_archive:
        raise ErreurMetier("archive", _("Ce réseau est archivé."))
    for produit in produits:
        _du_pays(produit, reseau.pays, "produit_invalide")
    jour = aujourdhui(reseau.pays)
    en_cours = {lien.produit_id: lien for lien in portefeuille_actif([reseau], jour)}
    voulus = {p.pk: p for p in produits}
    for produit_id, lien in en_cours.items():
        if produit_id not in voulus:
            _terminer(lien, jour)
    for produit_id, produit in voulus.items():
        if produit_id not in en_cours:
            lien = Portefeuille(pays=reseau.pays, reseau=reseau, produit=produit, debut=jour)
            lien.save()
            _auditer("portefeuille.ajout", reseau, produit=produit.libelle, debut=str(jour))
    return list(portefeuille_actif([reseau], jour))


def produits_du_portefeuille(reseaux, jour: date) -> QuerySet:
    """Produits proposables pour des réseaux donnés (ORG-004 CA3, RG-033)."""
    return (
        Produit.objects.filter(
            archive_le__isnull=True,
            portefeuilles__in=Portefeuille.objects.filter(actif_le(jour), reseau__in=reseaux),
        )
        .select_related("classe")
        .distinct()
        .order_by("libelle")
    )


@transaction.atomic
def definir_reseaux_du_produit(produit: Produit, reseaux: list[Reseau]) -> None:
    """Fixe, à partir d'aujourd'hui, les réseaux qui portent un produit (ORG-004 CA2)."""
    if produit.est_archive:
        raise ErreurMetier("archive", _("Un élément archivé ne se modifie plus."))
    jour = aujourdhui(produit.pays)
    voulus = {r.pk: r for r in reseaux}
    for reseau in reseaux:
        if reseau.pays_id != produit.pays_id or reseau.est_archive:
            raise ErreurMetier("reseau_invalide", _("Élément inconnu ou archivé dans ce pays."))
    en_cours = {lien.reseau_id: lien for lien in produit.portefeuilles.filter(actif_le(jour))}
    for reseau_id, lien in en_cours.items():
        if reseau_id not in voulus:
            _terminer(lien, jour)
    for reseau_id, reseau in voulus.items():
        if reseau_id not in en_cours:
            Portefeuille(pays=produit.pays, reseau=reseau, produit=produit, debut=jour).save()
            _auditer("portefeuille.ajout", reseau, produit=produit.libelle, debut=str(jour))

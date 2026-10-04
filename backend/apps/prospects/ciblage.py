"""Listes cibles par poste et fréquences cibles (prd.md §14.5, PRP-011, RG-043, RG-024).

- La liste d'un poste est tenue par l'administrateur pays, ou par le superviseur auquel le
  poste est rattaché.
- Chaque ajout, retrait ou changement de fréquence est audité (CA1).
- La fréquence par défaut suit le potentiel du prospect (paramètres `frequence_cible_a|b|c`).
- Affectation territoriale : un prospect hors des secteurs du poste reste ciblable, mais il
  est signalé (RG-024).
"""

from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils.translation import gettext as _

from apps.identite.models import Role, Utilisateur
from apps.organisation.models import Occupation, Poste, Rattachement, actif_le
from apps.organisation.selecteurs import postes_visibles
from apps.perimetre.perimetre import Perimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui, valeur_parametre

from .models import Cible, Exercice, Prospect, StatutFiche


def _auditer(action: str, cible: Cible, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(
        f"cible.{action}", objet=cible,
        details={"poste": str(cible.poste_id), "prospect": str(cible.prospect_id), **details},
    )  # fmt: skip


def frequence_par_defaut(pays, potentiel: str) -> int:
    return int(valeur_parametre(pays, f"frequence_cible_{potentiel.lower()}"))


def _frequence(valeur) -> int:
    try:
        frequence = int(valeur)
    except (TypeError, ValueError):
        frequence = 0
    if not 1 <= frequence <= 20:
        raise ErreurMetier(
            "frequence_invalide",
            _("La fréquence cible va de 1 à 20 visites par cycle."),
            champ="frequence",
        )
    return frequence


# --- Qui voit, qui gère --------------------------------------------------------------------


def postes_geres(perimetre: Perimetre) -> QuerySet:
    """RG-043 : l'administrateur pays gère toutes les listes du pays ; le superviseur, celles
    des postes qui lui sont rattachés."""
    postes = perimetre.filtrer_par_pays(Poste.objects.all())
    if Role.ADMIN_PAYS in perimetre.roles:
        return postes
    if Role.SUPERVISEUR in perimetre.roles and perimetre.pays_actif is not None:
        jour = aujourdhui(perimetre.pays_actif)
        rattaches = Rattachement.objects.filter(actif_le(jour), superviseur=perimetre.utilisateur)
        return postes.filter(pk__in=rattaches.values("poste_id"))
    return postes.none()


def postes_occupes(utilisateur: Utilisateur, pays) -> QuerySet:
    jour = aujourdhui(pays)
    occupations = Occupation.objects.filter(actif_le(jour), utilisateur=utilisateur)
    return Poste.objects.filter(pays=pays, pk__in=occupations.values("poste_id"))


def postes_lisibles(perimetre: Perimetre) -> QuerySet:
    return postes_visibles(perimetre)


def exiger_gestion(perimetre: Perimetre, poste: Poste) -> None:
    from rest_framework import status

    if not postes_geres(perimetre).filter(pk=poste.pk).exists():
        raise ErreurMetier(
            "cible_hors_perimetre",
            _("Seuls le superviseur du poste et l'administrateur pays tiennent cette liste."),
            status.HTTP_403_FORBIDDEN,
        )


# --- Écritures -------------------------------------------------------------------------------


def ajouter(poste: Poste, prospects, auteur: Utilisateur, frequence=None) -> dict:
    """Ajoute des prospects actifs du pays à la liste du poste. Un prospect déjà ciblé est
    laissé tel quel ; renvoie les cibles créées et le nombre de prospects déjà présents."""
    if poste.est_archive:
        raise ErreurMetier("poste_invalide", _("Élément inconnu ou archivé dans ce pays."))
    jour = aujourdhui(poste.pays)
    deja = set(
        Cible.objects.filter(poste=poste, fin__isnull=True).values_list("prospect_id", flat=True)
    )
    creees, presents = [], 0
    for prospect in prospects:
        if prospect.pays_id != poste.pays_id or prospect.statut != StatutFiche.ACTIF:
            raise ErreurMetier(
                "prospect_invalide",
                _("Seule une fiche active du pays entre dans une liste cible."),
                champ="prospects",
            )
        if prospect.pk in deja:
            presents += 1
            continue
        cible = Cible(
            pays=poste.pays, poste=poste, prospect=prospect, debut=jour, ajoute_par=auteur,
            frequence=_frequence(frequence) if frequence
            else frequence_par_defaut(poste.pays, prospect.potentiel),
        )  # fmt: skip
        try:
            with transaction.atomic():
                cible.save()
        except IntegrityError:
            presents += 1
            continue
        deja.add(prospect.pk)
        _auditer("ajout", cible, frequence=cible.frequence)
        creees.append(cible)
    return {"creees": creees, "deja_presents": presents}


def modifier_frequence(cible: Cible, frequence) -> Cible:
    if cible.fin is not None:
        raise ErreurMetier("cible_retiree", _("Ce prospect n'est plus dans la liste cible."))
    frequence = _frequence(frequence)
    if frequence != cible.frequence:
        ancienne, cible.frequence = cible.frequence, frequence
        cible.save(update_fields=["frequence"])
        _auditer("frequence", cible, ancienne=ancienne, nouvelle=frequence)
    return cible


def retirer(cible: Cible, motif: str = "") -> Cible:
    """CA1 : le retrait est audité ; la cible reste dans l'historique du poste."""
    if cible.fin is not None:
        raise ErreurMetier("cible_retiree", _("Ce prospect n'est plus dans la liste cible."))
    cible.fin = aujourdhui(cible.pays)
    cible.save(update_fields=["fin"])
    _auditer("retrait", cible, motif=(motif or "").strip()[:200])
    return cible


def retirer_partout(prospect: Prospect, motif: str) -> None:
    """Un prospect archivé sort de toutes les listes cibles."""
    for cible in prospect.cibles.filter(fin__isnull=True):
        retirer(cible, motif)


# --- Lectures --------------------------------------------------------------------------------


def secteurs_du_prospect(prospect: Prospect) -> set:
    """Secteur de la fiche et secteurs de ses lieux d'exercice en cours."""
    secteurs = {prospect.secteur_id} if prospect.secteur_id else set()
    en_cours = getattr(prospect, "exercices_en_cours", None)
    if en_cours is None:
        en_cours = prospect.exercices.filter(fin__isnull=True).select_related("etablissement")
    secteurs |= {e.etablissement.secteur_id for e in en_cours}
    return secteurs


def hors_secteur(prospect: Prospect, secteurs_poste: set) -> bool:
    """RG-024 : hors des secteurs du poste, le prospect est signalé (pas refusé). Un prospect
    sans aucun secteur connu n'est pas signalé : on ne sait pas."""
    siens = secteurs_du_prospect(prospect)
    return bool(siens) and not (siens & secteurs_poste)


def candidats(poste: Poste) -> QuerySet:
    """Affectation territoriale : prospects actifs des secteurs du poste (par leur fiche ou par
    un lieu d'exercice en cours) qui ne sont pas encore dans sa liste."""
    secteurs = poste.secteurs.values("pk")
    exercent = Exercice.objects.filter(fin__isnull=True, etablissement__secteur__in=secteurs)
    deja = Cible.objects.filter(poste=poste, fin__isnull=True).values("prospect_id")
    return (
        Prospect.objects.filter(pays=poste.pays, statut=StatutFiche.ACTIF)
        .filter(Q(secteur__in=secteurs) | Q(pk__in=exercent.values("prospect_id")))
        .exclude(pk__in=deja)
        .distinct()
    )

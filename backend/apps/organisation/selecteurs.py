"""Sélecteurs de l'organisation filtrés par le périmètre (architecture §11.2).

- siège, responsable pays, administrateur pays : tous les postes du pays ;
- DF, DM : postes dont un réseau est dans leur périmètre daté (ORG-008 CA1) ;
- superviseur : postes qui lui sont rattachés ;
- délégué : les postes qu'il occupe.
"""

from django.db.models import Prefetch, Q, QuerySet

from apps.identite.models import Role
from apps.perimetre.matrice import PAYS_CONSULTATION, SIEGE
from apps.perimetre.perimetre import Perimetre
from apps.socle.services import aujourdhui

from .models import Occupation, PerimetreReseau, Poste, Rattachement, actif_le


def postes_visibles(perimetre: Perimetre) -> QuerySet:
    postes = perimetre.filtrer_par_pays(Poste.objects.all())
    if perimetre.roles & (SIEGE | PAYS_CONSULTATION):
        return postes
    if perimetre.pays_actif is None:
        return postes.none()
    jour = aujourdhui(perimetre.pays_actif)
    moi = perimetre.utilisateur
    visibles = Q(pk__in=[])
    if perimetre.roles & {Role.DF, Role.DM}:
        reseaux = PerimetreReseau.objects.filter(actif_le(jour), utilisateur=moi)
        visibles |= Q(reseaux__in=reseaux.values("reseau_id"))
    if Role.SUPERVISEUR in perimetre.roles or Role.DM in perimetre.roles:
        rattaches = Rattachement.objects.filter(actif_le(jour), superviseur=moi)
        visibles |= Q(pk__in=rattaches.values("poste_id"))
    if perimetre.roles & {Role.DELEGUE, Role.SUPERVISEUR}:
        occupes = Occupation.objects.filter(actif_le(jour), utilisateur=moi)
        visibles |= Q(pk__in=occupes.values("poste_id"))
    return postes.filter(visibles).distinct()


def avec_details(postes: QuerySet) -> QuerySet:
    """Précharge ce que l'affichage d'un poste demande, sans requête par ligne."""
    return postes.prefetch_related(
        "reseaux",
        "secteurs__zone",
        Prefetch(
            "occupations",
            queryset=Occupation.objects.select_related("utilisateur").order_by("-debut"),
        ),
        Prefetch(
            "rattachements",
            queryset=Rattachement.objects.select_related("superviseur").order_by("-debut"),
        ),
    ).order_by("libelle")

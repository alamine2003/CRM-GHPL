"""Chronologie des rapports d'un prospect (RPT-011, 0.5.8).

Les rapports se lisent dans le périmètre : le délégué ne voit que les siens (CA1), brouillons
compris ; les autres ne voient que les rapports soumis (ou au-delà) des délégués qui occupent
aujourd'hui un poste de leur périmètre [H] ; le responsable pays voit tout le pays.
"""

from django.db.models import Q, QuerySet

from apps.identite.models import Role
from apps.organisation.models import Occupation, actif_le
from apps.organisation.selecteurs import postes_visibles
from apps.perimetre.perimetre import Perimetre
from apps.socle.services import aujourdhui

from .models import Rapport, StatutRapport

#: Nombre de rapports rendus, du plus récent au plus ancien.
LIMITE = 30


def rapports_visibles(perimetre: Perimetre) -> QuerySet:
    qs = perimetre.filtrer_par_pays(Rapport.objects.all())
    moi = perimetre.utilisateur
    if Role.RESPONSABLE_PAYS in perimetre.roles:
        return qs.filter(Q(delegue=moi) | ~Q(statut=StatutRapport.BROUILLON))
    if perimetre.pays_actif is None:
        return qs.none()
    visibles = Q(delegue=moi)
    if perimetre.roles & {Role.SUPERVISEUR, Role.DM, Role.DF}:
        occupants = Occupation.objects.filter(
            actif_le(aujourdhui(perimetre.pays_actif)), poste__in=postes_visibles(perimetre)
        ).values("utilisateur_id")
        visibles |= Q(delegue__in=occupants) & ~Q(statut=StatutRapport.BROUILLON)
    return qs.filter(visibles)


def chronologie(perimetre: Perimetre, prospect) -> QuerySet:
    return (
        rapports_visibles(perimetre)
        .filter(visite__prospect=prospect)
        .select_related("visite", "delegue", "resultat", "prochaine_action_type")
        .order_by("-visite__date", "-visite__heure")[:LIMITE]
    )

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


def visites_proposees(delegue) -> QuerySet:
    """DC-61 : les rapports soumis du délégué qui proposent une nouvelle visite, tant que ce
    prospect n'a pas reçu de visite planifiée après celle du rapport. Un rapport par prospect :
    le plus récent."""
    from django.db.models import Exists, OuterRef

    from apps.planning.models import Visite

    replanifiee = Visite.objects.filter(
        planning__delegue=delegue, prospect=OuterRef("visite__prospect"),
        date__gt=OuterRef("visite__date"), archive_le__isnull=True,
    )  # fmt: skip
    rapports = (
        Rapport.objects.filter(delegue=delegue, visite_proposee=True)
        .exclude(statut=StatutRapport.BROUILLON)
        .filter(~Exists(replanifiee))
        .select_related(
            "visite__prospect__specialite", "visite__prospect__type", "prochaine_action_type"
        )  # fmt: skip
        .order_by("visite__prospect_id", "-visite__date")
        .distinct("visite__prospect_id")
    )
    return sorted(rapports, key=lambda r: r.visite.date, reverse=True)

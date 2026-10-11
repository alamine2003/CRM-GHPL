"""Qualité des données du pays actif (0.1.9, cycle 0.1 « Référentiel »).

Un bilan pour l'administrateur pays, qui tient le référentiel (§6.3) : chaque chiffre compte des
fiches à compléter ou à trancher, et ouvre leur liste (mêmes filtres que la recherche, PRP-005).
Seules les fiches actives comptent pour la complétude ; les fiches `a_valider`, la file des
doublons et les propositions en attente sont ce qui reste à trancher.
"""

from django.db.models import QuerySet

from . import recherche as rch
from .models import (
    Cible,
    DoublonProbable,
    Exercice,
    Proposition,
    StatutDoublon,
    StatutFiche,
    StatutProposition,
)


def bilan(prospects: QuerySet, etablissements: QuerySet, pays) -> dict[str, int]:
    """`prospects` et `etablissements` : fiches visibles du pays actif (RLS et périmètre)."""
    actifs = prospects.filter(statut=StatutFiche.ACTIF)
    en_cours = Exercice.objects.filter(fin__isnull=True).values("prospect_id")
    ciblees = Cible.objects.filter(fin__isnull=True).values("prospect_id")
    etab_actifs = etablissements.filter(statut=StatutFiche.ACTIF)
    return {
        "prospects": actifs.count(),
        "sans_lieu": actifs.exclude(pk__in=en_cours).count(),
        "sans_telephone": actifs.filter(telephone_mobile="", telephone_pro="").count(),
        "sans_specialite": rch.sans_specialite(actifs).count(),
        "hors_cible": actifs.exclude(pk__in=ciblees).count(),
        "a_valider": prospects.filter(statut=StatutFiche.A_VALIDER).count(),
        "etablissements": etab_actifs.count(),
        "sans_coordonnees": etab_actifs.filter(latitude__isnull=True).count(),
        "etablissements_a_valider": etablissements.filter(statut=StatutFiche.A_VALIDER).count(),
        "doublons": DoublonProbable.objects.filter(
            pays=pays, statut=StatutDoublon.EN_ATTENTE
        ).count(),
        "propositions": Proposition.objects.filter(
            pays=pays, statut=StatutProposition.EN_ATTENTE
        ).count(),
    }

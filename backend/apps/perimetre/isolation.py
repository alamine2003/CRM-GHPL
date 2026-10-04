"""Isolation par pays dans la base (ADR-003, architecture §12, couche 2).

Chaque requête métier fixe `innov.pays` pour la durée de sa transaction ; les
politiques RLS (migration organisation.0002) s'y réfèrent.
"""

from django.db import connection

from .perimetre import Perimetre

TOUS = "*"
AUCUN = "aucun"


def valeur_isolation(perimetre: Perimetre) -> str:
    """Le siège est autorisé sur tous les pays ; un pays n'en voit qu'un, le pays actif."""
    if perimetre.est_siege:
        return TOUS
    if perimetre.pays_actif is None or not perimetre.roles:
        return AUCUN
    return str(perimetre.pays_actif.pk)


def appliquer(perimetre: Perimetre) -> str:
    """À appeler dans une transaction : la valeur disparaît à sa fin (pas de fuite entre
    requêtes qui partagent une connexion)."""
    valeur = valeur_isolation(perimetre)
    with connection.cursor() as curseur:
        curseur.execute("SELECT set_config('innov.pays', %s, true)", [valeur])
    return valeur

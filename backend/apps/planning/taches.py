"""Tâches du worker pour le planning (architecture §7.5)."""

from celery import shared_task

from . import echeances as e


@shared_task(name="apps.planning.taches.echeances")
def echeances() -> dict:
    """Rappels, escalades et alertes du lundi (NOT-006, PLN-016, RG-019), toutes les 15 min."""
    return e.executer()

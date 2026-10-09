"""Tâches du worker pour le pilotage (architecture §7.5)."""

from celery import shared_task

from . import grafana


@shared_task(name="apps.pilotage.taches.rafraichir_grafana")
def rafraichir_grafana() -> dict:
    """DSH-011 : agrégats de Grafana à jour à moins d'une heure."""
    return grafana.rafraichir()


@shared_task(name="apps.pilotage.taches.prechauffer_tableaux")
def prechauffer_tableaux() -> dict:
    """DSH-011, NFR-002 (0.9.4) : les tableaux du pays entier et du siège, toujours prêts."""
    from . import tableaux

    return tableaux.prechauffer()

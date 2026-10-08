"""Tâches du worker pour le pilotage (architecture §7.5)."""

from celery import shared_task

from . import grafana


@shared_task(name="apps.pilotage.taches.rafraichir_grafana")
def rafraichir_grafana() -> dict:
    """DSH-011 : agrégats de Grafana à jour à moins d'une heure."""
    return grafana.rafraichir()

"""Tâches du worker pour les notifications (architecture §7.5)."""

from celery import shared_task

from . import push as p


@shared_task(name="apps.notifications.taches.push")
def push() -> int:
    """NOT-002, NOT-003 : les push dus, regroupés, toutes les 5 minutes."""
    return p.envoyer()

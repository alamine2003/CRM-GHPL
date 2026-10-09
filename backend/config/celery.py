"""Worker et ordonnanceur Celery (architecture §5 et §7.5, ADR-002).

La file passe par Redis (`REDIS_URL`). Sans Redis (tests, poste sans Docker), les tâches
s'exécutent sur place et la commande `executer_echeances` rejoue la passe périodique.
"""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("innov")
app.config_from_object("django.conf:settings", namespace="CELERY")
# Les tâches vivent dans les modules `taches` de chaque application (pas `tasks`, le nom par
# défaut de Celery) : sans ce nom, le worker ne les connaîtrait pas.
app.autodiscover_tasks(related_name="taches")

#: Tâches périodiques (architecture §7.5) : évaluées à l'heure de chaque pays par la tâche
#: elle-même ; l'ordonnanceur ne fait que la réveiller.
app.conf.beat_schedule = {
    # NOT-002, NOT-003 : les push regroupés partent toutes les 5 minutes.
    "notifications-push": {
        "task": "apps.notifications.taches.push",
        "schedule": crontab(minute="*/5"),
    },
    "echeances-planning": {
        "task": "apps.planning.taches.echeances",
        "schedule": crontab(minute="*/15"),
    },
    # DSH-011 : Grafana à jour à moins d'une heure.
    "agregats-grafana": {
        "task": "apps.pilotage.taches.rafraichir_grafana",
        "schedule": crontab(minute=7),
    },
}

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
app.autodiscover_tasks()

#: Tâches périodiques (architecture §7.5) : évaluées à l'heure de chaque pays par la tâche
#: elle-même ; l'ordonnanceur ne fait que la réveiller.
app.conf.beat_schedule = {
    "echeances-planning": {
        "task": "apps.planning.taches.echeances",
        "schedule": crontab(minute="*/15"),
    },
}

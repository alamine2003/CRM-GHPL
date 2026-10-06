from django.utils import timezone

from .models import Notification


def notifier(destinataire, type: str, pays, **donnees) -> Notification:
    """Inscrit une notification au centre du destinataire (prd.md §18)."""
    return Notification.objects.create(
        pays=pays, destinataire=destinataire, type=type, donnees=donnees
    )


def notifier_une_fois(destinataire, type: str, pays, cle: str, **donnees) -> Notification | None:
    """Pour les rappels et alertes de la tâche périodique : une seule fois par clé (semaine…),
    même si la tâche repasse toutes les quinze minutes."""
    if Notification.objects.filter(destinataire=destinataire, type=type, donnees__cle=cle).exists():
        return None
    return notifier(destinataire, type, pays, cle=cle, **donnees)


def marquer_lues(notifications) -> int:
    maintenant = timezone.now()
    nombre = 0
    for notification in notifications.filter(lue_le__isnull=True):
        notification.lue_le = maintenant
        notification.save(update_fields=["lue_le"])
        nombre += 1
    return nombre

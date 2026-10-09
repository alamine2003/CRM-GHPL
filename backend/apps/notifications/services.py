from django.utils import timezone

from .models import Notification


def notifier(destinataire, type: str, pays, **donnees) -> Notification:
    """Inscrit une notification au centre du destinataire (prd.md §18)."""
    return Notification.objects.create(
        pays=pays, destinataire=destinataire, type=type, donnees=donnees, push_du=timezone.now()
    )


def notifier_une_fois(destinataire, type: str, pays, cle: str, **donnees) -> Notification | None:
    """Pour les rappels et alertes de la tâche périodique : une seule fois par clé (semaine…),
    même si la tâche repasse toutes les quinze minutes."""
    if Notification.objects.filter(destinataire=destinataire, type=type, donnees__cle=cle).exists():
        return None
    return notifier(destinataire, type, pays, cle=cle, **donnees)


def notifier_regroupe(destinataire, type: str, pays, cle: str, **donnees) -> Notification:
    """NOT-003 (0.6.8) : les événements d'un même jour s'ajoutent à la notification encore non
    lue (« 3 rapports à valider ») au lieu d'en créer une par événement. Lue, la suivante repart
    de un."""
    existante = Notification.objects.filter(
        destinataire=destinataire, type=type, donnees__cle=cle, lue_le__isnull=True
    ).first()
    if existante is None:
        return notifier(destinataire, type, pays, cle=cle, nombre=1, **donnees)
    existante.donnees = {**existante.donnees, **donnees,
                         "nombre": existante.donnees.get("nombre", 1) + 1}  # fmt: skip
    existante.cree_le = timezone.now()
    # NOT-003 : déjà poussée, elle redevient due ; encore due, elle garde son premier instant.
    existante.push_du = existante.push_du or existante.cree_le
    existante.save(update_fields=["donnees", "cree_le", "push_du"])
    return existante


def marquer_lues(notifications) -> int:
    maintenant = timezone.now()
    nombre = 0
    for notification in notifications.filter(lue_le__isnull=True):
        notification.lue_le = maintenant
        notification.save(update_fields=["lue_le"])
        nombre += 1
    return nombre

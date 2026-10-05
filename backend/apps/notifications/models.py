"""Centre de notifications (prd.md §18, architecture §10).

Une ligne par événement et par destinataire, écrite dans la transaction de l'événement. Le
texte n'est pas stocké : le client le compose dans la langue de l'utilisateur à partir du type
et des données, sans donnée de santé. L'envoi push (Expo) arrive en 0.3.8.
"""

from django.conf import settings
from django.db import models

from apps.socle.models import ModeleDePays


class TypeNotification(models.TextChoices):
    PLANNING_APPROUVE = "planning_approuve", "Planning approuvé"


class Notification(ModeleDePays):
    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notifications"
    )
    type = models.CharField(max_length=32, choices=TypeNotification.choices)
    #: Ce qu'il faut pour composer le texte et ouvrir l'objet (semaine, planning…).
    donnees = models.JSONField(default=dict)
    lue_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["destinataire", "lue_le"])]

    def __str__(self):
        return f"{self.destinataire} {self.type}"

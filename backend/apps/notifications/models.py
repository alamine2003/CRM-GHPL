"""Centre de notifications (prd.md §18, architecture §10).

Une ligne par événement et par destinataire, écrite dans la transaction de l'événement. Le
texte n'est pas stocké : le client le compose dans la langue de l'utilisateur à partir du type
et des données, sans donnée de santé. Le push (NOT-002, 0.8.5) part de `push.py`, regroupé.
"""

from django.conf import settings
from django.db import models

from apps.socle.models import ModeleDePays


class TypeNotification(models.TextChoices):
    PLANNING_SOUMIS = "planning_soumis", "Planning soumis"
    PLANNING_APPROUVE = "planning_approuve", "Planning approuvé"
    REVISION_DEMANDEE = "revision_demandee", "Révision demandée"
    REMPLACEMENT_ATTRIBUE = "remplacement_attribue", "Remplacement attribué"
    #: Rappels et escalade (NOT-006, PLN-016, 0.3.8).
    RAPPEL_PLANNING = "rappel_planning", "Planning non soumis"
    ESCALADE = "escalade", "Escalade"
    PLANNINGS_NON_APPROUVES = "plannings_non_approuves", "Plannings non approuvés"
    #: Fermeture de la semaine (décision du 6 octobre 2026, 0.3.9).
    REOUVERTURE_DEMANDEE = "reouverture_demandee", "Réouverture demandée"
    REDACTION_ROUVERTE = "redaction_rouverte", "Rédaction rouverte"
    #: RPT-014 (0.6.4) : le superviseur demande une correction d'un rapport.
    CORRECTION_DEMANDEE = "correction_demandee", "Correction demandée"
    #: RPT-015, 28.A (0.6.5) : le délégué a soumis le rapport corrigé.
    RAPPORT_CORRIGE = "rapport_corrige", "Rapport corrigé"
    #: RPT-016 (0.6.6) : un rapport validé est rouvert ; le délégué, et le superviseur quand
    #: c'est le DM qui rouvre (31.A).
    RAPPORT_ROUVERT = "rapport_rouvert", "Rapport rouvert"
    #: RPT-017, 34.A (0.6.7) : un rapport toujours pas soumis 48 h après la visite.
    RAPPORT_EN_RETARD = "rapport_en_retard", "Rapport en retard"
    #: prd.md §18 (0.6.8) : rapports soumis au superviseur, validés au délégué (regroupés par
    #: jour) ; rappel de 18 h au délégué (NOT-006, 37.A) ; journée escaladée à l'administrateur
    #: (38.A).
    RAPPORTS_SOUMIS = "rapports_soumis", "Rapports soumis"
    RAPPORTS_VALIDES = "rapports_valides", "Rapports validés"
    RAPPEL_RAPPORT = "rappel_rapport", "Rapport à soumettre"
    JOURNEE_ESCALADEE = "journee_escaladee", "Journée escaladée"


class Notification(ModeleDePays):
    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notifications"
    )
    type = models.CharField(max_length=32, choices=TypeNotification.choices)
    #: Ce qu'il faut pour composer le texte et ouvrir l'objet (semaine, planning…).
    donnees = models.JSONField(default=dict)
    lue_le = models.DateTimeField(null=True, blank=True)
    #: NOT-003 : depuis quand un push est dû (premier événement non poussé), et quand il est
    #: parti ; la tâche périodique regroupe les dus par destinataire et par type.
    push_du = models.DateTimeField(null=True, blank=True)
    push_le = models.DateTimeField(null=True, blank=True)
    #: NOT-004 (0.8.6) : depuis quand la décision attend (premier événement non lu, que le
    #: regroupement ne repousse pas), et quand le courriel de secours est parti.
    en_attente_depuis = models.DateTimeField(null=True, blank=True)
    secours_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [
            models.Index(fields=["destinataire", "lue_le"]),
            models.Index(fields=["push_du"]),
        ]

    def __str__(self):
        return f"{self.destinataire} {self.type}"

"""Calendrier du pays et plannings hebdomadaires (cycle 0.2).

- `JourFerie` (ORG-012) : tenu par l'administrateur pays ; exclu des contrôles « semaine
  complète » et des seuils (CA1, RG-022) ; non planifiable (PLN-001 CA2).
- `Planning` (PLN-001) : un seul par délégué et par semaine (RG-012), identifiée par son
  lundi. Ses versions, passages, absences et visites arrivent de 0.2.2 à 0.2.8.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.socle.modeles_base import ModeleDePays

from .etats import StatutPlanning


class JourFerie(ModeleDePays):
    date = models.DateField()
    libelle = models.CharField(max_length=120)
    #: Fête à date variable (Korité, Tabaski…) : la date se confirme peu avant (ORG-012 CA2).
    variable = models.BooleanField(default=False)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["pays", "date"],
                condition=Q(archive_le__isnull=True),
                name="jour_ferie_unique",
            )
        ]

    def __str__(self):
        return f"{self.date} {self.libelle}"


class Planning(ModeleDePays):
    delegue = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="plannings"
    )
    #: Lundi de la semaine planifiée.
    semaine = models.DateField()
    statut = models.CharField(
        max_length=12, choices=StatutPlanning.choices, default=StatutPlanning.BROUILLON
    )

    class Meta:
        ordering = ["-semaine"]
        constraints = [
            models.UniqueConstraint(fields=["delegue", "semaine"], name="planning_unique"),
        ]

    def __str__(self):
        return f"{self.delegue} {self.semaine}"

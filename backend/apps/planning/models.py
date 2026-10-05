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

from .etats import StatutPlanning, StatutVisite


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


class Visite(ModeleDePays):
    """Visite planifiée (PLN-002) : date, heure, prospect, établissement, objectif, réseau ;
    note facultative. Une visite en préparation peut rester incomplète ; la soumission du
    planning la refuse alors avec la liste des champs manquants (CA1)."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="visites")
    #: Poste occupé au titre duquel la visite est faite ; déduit du réseau choisi.
    poste = models.ForeignKey(
        "organisation.Poste", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reseau = models.ForeignKey(
        "organisation.Reseau", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    prospect = models.ForeignKey(
        "prospects.Prospect", null=True, blank=True, on_delete=models.PROTECT,
        related_name="visites",
    )  # fmt: skip
    etablissement = models.ForeignKey(
        "prospects.Etablissement", null=True, blank=True, on_delete=models.PROTECT,
        related_name="visites",
    )  # fmt: skip
    date = models.DateField()
    heure = models.TimeField(null=True, blank=True)
    objectif = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=500, blank=True)
    statut = models.CharField(
        max_length=16, choices=StatutVisite.choices, default=StatutVisite.PREVUE
    )
    est_imprevue = models.BooleanField(default=False)

    class Meta:
        ordering = ["date", "heure"]
        indexes = [models.Index(fields=["planning", "date"])]

    def __str__(self):
        return f"{self.date} {self.heure or ''} {self.prospect or ''}"

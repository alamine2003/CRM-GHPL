"""Calendrier du pays et plannings hebdomadaires (cycle 0.2).

- `JourFerie` (ORG-012) : tenu par l'administrateur pays ; exclu des contrôles « semaine
  complète » et des seuils (CA1, RG-022) ; non planifiable (PLN-001 CA2).
- `Planning` (PLN-001) : un seul par délégué et par semaine (RG-012), identifiée par son
  lundi. Ses versions, passages, absences et visites arrivent de 0.2.2 à 0.2.8.
- `Visite` (PLN-002), rangée dans sa journée par `ordre` (0.2.3).
- `Passage` (PLN-003) : plusieurs visites d'un même établissement le même jour, à une même heure.
- `Absence` (PLN-009) : congé, formation, réunion, maladie… sur une journée ou une demi-journée.
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
    #: Dernière soumission (PLN-008) ; « en retard » si elle a suivi l'échéance du pays (RG-013).
    soumis_le = models.DateTimeField(null=True, blank=True)
    en_retard = models.BooleanField(default=False)

    class Meta:
        ordering = ["-semaine"]
        constraints = [
            models.UniqueConstraint(fields=["delegue", "semaine"], name="planning_unique"),
        ]

    def __str__(self):
        return f"{self.delegue} {self.semaine}"


class Passage(ModeleDePays):
    """Regroupement de visites d'un même établissement le même jour (PLN-003) : une ligne
    « Établissement · n prescripteurs » ; chaque visite garde son prospect et son rapport (CA2).
    L'heure du passage est celle de toutes ses visites."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="passages")
    etablissement = models.ForeignKey(
        "prospects.Etablissement", on_delete=models.PROTECT, related_name="+"
    )
    date = models.DateField()
    heure = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["date", "heure"]
        constraints = [
            models.UniqueConstraint(
                fields=["planning", "date", "etablissement"],
                condition=Q(archive_le__isnull=True),
                name="passage_unique",
            )
        ]

    def __str__(self):
        return f"{self.date} {self.etablissement}"


class Periode(models.TextChoices):
    JOURNEE = "journee", "Journée"
    MATIN = "matin", "Matin"
    APRES_MIDI = "apres_midi", "Après-midi"


class TypeAbsence(models.TextChoices):
    CONGE = "conge", "Congé"
    FORMATION = "formation", "Formation"
    REUNION = "reunion", "Réunion"
    MALADIE = "maladie", "Maladie"
    AUTRE = "autre", "Autre"


class Absence(ModeleDePays):
    """Absence déclarée dans le planning (PLN-009) ; elle réduit les seuils du jour au prorata
    (CA1, RG-022, contrôles en 0.2.4) et se valide avec le planning (CA2, cycle 0.3)."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="absences")
    date = models.DateField()
    periode = models.CharField(max_length=12, choices=Periode.choices, default=Periode.JOURNEE)
    type = models.CharField(max_length=12, choices=TypeAbsence.choices)
    commentaire = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["date", "periode"]

    def __str__(self):
        return f"{self.date} {self.periode} {self.type}"


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
    passage = models.ForeignKey(
        Passage, null=True, blank=True, on_delete=models.SET_NULL, related_name="visites"
    )
    #: Rang dans la journée (0.2.3) : les visites à heure fixe suivent l'ordre chronologique,
    #: celles sans heure restent où le délégué les a placées.
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["date", "ordre", "heure"]
        indexes = [models.Index(fields=["planning", "date"])]

    def __str__(self):
        return f"{self.date} {self.heure or ''} {self.prospect or ''}"

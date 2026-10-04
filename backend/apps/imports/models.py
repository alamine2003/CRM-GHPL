"""Lots d'import et correspondances avec les systèmes sources (PRP-013, ORG-014).

- `LotImport` : un import lancé (ou simulé) dans un pays, ses compteurs et son rapport
  d'anomalies, téléchargeable (CA2). Une simulation n'écrit que son lot (CA1).
- `ReferenceExterne` : « la fiche BirdNotes 1234 est le prospect X d'INNOV CRM ». Un
  réimport retrouve ainsi ce qu'il a déjà créé et ne crée rien de nouveau (CA4). Les
  compléments gardent ce que la suite du cycle reprendra (établissement saisi en texte,
  délégués affectés, groupe de doublons, position GPS).
"""

from django.conf import settings
from django.db import models

from apps.socle.modeles_base import ModeleDePays


class Source(models.TextChoices):
    BIRDNOTES = "birdnotes", "BirdNotes"


class LotImport(ModeleDePays):
    class Statut(models.TextChoices):
        SIMULE = "simule", "Simulé"
        TERMINE = "termine", "Terminé"
        ECHEC = "echec", "Échec"

    source = models.CharField(max_length=20, choices=Source.choices)
    fichier = models.CharField(max_length=200)
    simulation = models.BooleanField()
    statut = models.CharField(max_length=10, choices=Statut.choices)
    lance_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="imports_lances"
    )
    debut = models.DateTimeField()
    fin = models.DateTimeField(null=True, blank=True)
    #: {"prospects": {"crees": 9630, "existants": 0, "rejetes": 0}, …}
    compteurs = models.JSONField(default=dict)
    #: Anomalies : [{"entite", "identifiant", "niveau" (rejet|avertissement), "motif"}].
    anomalies = models.JSONField(default=list)

    class Meta:
        ordering = ["-debut"]


class ReferenceExterne(ModeleDePays):
    source = models.CharField(max_length=20, choices=Source.choices)
    entite = models.CharField(max_length=40)
    identifiant = models.CharField(max_length=80)
    objet_type = models.CharField(max_length=60)
    objet_id = models.UUIDField()
    complements = models.JSONField(default=dict, blank=True)
    lot = models.ForeignKey(LotImport, on_delete=models.PROTECT, related_name="references")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["pays", "source", "entite", "identifiant"], name="reference_externe_unique"
            )
        ]
        indexes = [models.Index(fields=["objet_type", "objet_id"])]

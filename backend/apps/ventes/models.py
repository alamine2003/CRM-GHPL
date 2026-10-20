"""Suivi des ventes des délégués (décision du 20 octobre 2026, prd.md §14.84).

Une ligne de vente est un total **mensuel** : un délégué, un produit, un client, un mois, une
quantité et un chiffre d'affaires TTC. Elle vient d'un fichier Excel importé ou d'une saisie.
Le réseau et la zone sont fixés à l'enregistrement (le réseau par le portefeuille du produit,
la zone par le client) : un changement d'organisation ensuite ne réécrit pas l'histoire.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.socle.modeles_base import ModeleDePays


def _unique_hors_archives(champs: list[str], nom: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(fields=champs, condition=Q(archive_le__isnull=True), name=nom)


class TypeClient(models.TextChoices):
    PHARMACIE = "pharmacie", "Pharmacie"
    PARAPHARMACIE = "parapharmacie", "Parapharmacie"
    GROSSISTE = "grossiste", "Grossiste"


class Client(ModeleDePays):
    """Celui qui achète : une pharmacie, une parapharmacie ou un grossiste."""

    nom = models.CharField(max_length=160)
    type = models.CharField(max_length=14, choices=TypeClient.choices)
    zone = models.ForeignKey(
        "organisation.Zone", null=True, blank=True, on_delete=models.PROTECT,
        related_name="clients_ventes",
    )  # fmt: skip

    class Meta:
        ordering = ["nom"]
        constraints = [_unique_hors_archives(["pays", "type", "nom"], "client_vente_unique")]

    def __str__(self):
        return self.nom


class SourceVente(models.TextChoices):
    IMPORT = "import", "Fichier importé"
    SAISIE = "saisie", "Saisie"


class Vente(ModeleDePays):
    mois = models.DateField(help_text="Toujours le premier jour du mois.")
    delegue = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ventes"
    )
    #: Le poste que le délégué occupait ce mois-là, quand on le retrouve.
    poste = models.ForeignKey(
        "organisation.Poste", null=True, blank=True, on_delete=models.PROTECT,
        related_name="ventes",
    )  # fmt: skip
    produit = models.ForeignKey(
        "referentiel.Produit", on_delete=models.PROTECT, related_name="ventes"
    )
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="ventes")
    reseau = models.ForeignKey(
        "organisation.Reseau", null=True, blank=True, on_delete=models.PROTECT,
        related_name="ventes",
    )  # fmt: skip
    zone = models.ForeignKey(
        "organisation.Zone", null=True, blank=True, on_delete=models.PROTECT,
        related_name="ventes",
    )  # fmt: skip
    quantite = models.IntegerField(default=0)
    montant_ttc = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    source = models.CharField(max_length=10, choices=SourceVente.choices)
    lot = models.ForeignKey(
        "imports.LotImport", null=True, blank=True, on_delete=models.PROTECT,
        related_name="ventes",
    )  # fmt: skip
    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ventes_saisies"
    )

    class Meta:
        ordering = ["-mois", "delegue_id", "produit_id"]
        constraints = [
            _unique_hors_archives(
                ["pays", "mois", "delegue", "produit", "client"], "vente_ligne_unique"
            ),
            models.CheckConstraint(condition=Q(mois__day=1), name="vente_mois_premier_jour"),
        ]
        indexes = [
            models.Index(fields=["pays", "mois"]),
            models.Index(fields=["pays", "delegue", "mois"]),
            models.Index(fields=["pays", "produit", "mois"]),
        ]

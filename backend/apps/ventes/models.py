"""Suivi des ventes des délégués (décision du 20 octobre 2026, prd.md §14.84).

Une ligne de vente est un total **mensuel** : un délégué, un produit, un client, un mois, une
quantité et un chiffre d'affaires TTC. Elle vient d'un fichier Excel importé ou d'une saisie.
Le réseau et la zone sont fixés à l'enregistrement (le réseau par le portefeuille du produit,
la zone par le client) : un changement d'organisation ensuite ne réécrit pas l'histoire.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.socle.identifiants import uuid7
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


class EtatObjectifVente(models.TextChoices):
    """Où en est un objectif de ventes, à la fin du mois choisi."""

    A_VENIR = "a_venir", "À venir"
    ATTEINT = "atteint", "Atteint"
    NON_ATTEINT = "non_atteint", "Non atteint"
    EN_AVANCE = "en_avance", "En avance"
    EN_RETARD = "en_retard", "En retard"


class ObjectifVente(ModeleDePays):
    """Objectif de chiffre d'affaires TTC d'une année pour un réseau, pour un produit de ce
    réseau (décision du 23 octobre 2026, prd.md §14.88) ou pour un délégué de ce réseau (1.8.0,
    §14.89). `mois` répartit la cible sur les douze
    mois ; sans lui, la cible se répartit à parts égales."""

    reseau = models.ForeignKey(
        "organisation.Reseau", on_delete=models.PROTECT, related_name="objectifs_ventes"
    )
    produit = models.ForeignKey(
        "referentiel.Produit", null=True, blank=True, on_delete=models.PROTECT,
        related_name="objectifs_ventes",
    )  # fmt: skip
    #: 1.8.0 : l'objectif d'un délégué dans ce réseau (jamais avec un produit).
    delegue = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="objectifs_ventes",
    )  # fmt: skip
    annee = models.PositiveSmallIntegerField()
    cible = models.DecimalField(max_digits=14, decimal_places=2)
    #: Douze montants (janvier à décembre) en chaînes décimales, dont la somme est la cible.
    mois = models.JSONField(null=True, blank=True)
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="objectifs_ventes_crees"
    )

    class Meta:
        ordering = ["-annee", "reseau__libelle", "produit__libelle", "delegue__last_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["pays", "reseau", "annee"],
                condition=Q(archive_le__isnull=True, produit__isnull=True, delegue__isnull=True),
                name="objectif_vente_reseau_unique",
            ),
            models.UniqueConstraint(
                fields=["pays", "reseau", "delegue", "annee"],
                condition=Q(archive_le__isnull=True, delegue__isnull=False),
                name="objectif_vente_delegue_unique",
            ),
            models.CheckConstraint(
                condition=Q(produit__isnull=True) | Q(delegue__isnull=True),
                name="objectif_vente_produit_ou_delegue",
            ),
            models.UniqueConstraint(
                fields=["pays", "reseau", "produit", "annee"],
                condition=Q(archive_le__isnull=True, produit__isnull=False),
                name="objectif_vente_produit_unique",
            ),
            models.CheckConstraint(
                condition=Q(annee__gte=2000, annee__lte=2100), name="objectif_vente_annee"
            ),
            models.CheckConstraint(condition=Q(cible__gt=0), name="objectif_vente_cible_positive"),
        ]


#: La monnaie de la vue de tous les pays (décision du 26 octobre 2026, prd.md §14.90).
DEVISE_REFERENCE = "XOF"


class TauxChange(models.Model):
    """Le taux d'une monnaie vers le franc CFA de l'Ouest pour une année, fixé par le siège
    (1.9.0, prd.md §14.90) : 1 unité de `devise` vaut `taux` XOF. Il sert à la vue de tous les
    pays, à taux constant (l'an passé se convertit au taux de l'année choisie). Une table du
    siège, sans pays : elle ne contient aucune donnée d'un pays."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    annee = models.PositiveSmallIntegerField()
    devise = models.CharField(max_length=3)
    taux = models.DecimalField(max_digits=18, decimal_places=6)
    regle_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    modifie_le = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-annee", "devise"]
        constraints = [
            models.UniqueConstraint(fields=["annee", "devise"], name="taux_change_unique"),
            models.CheckConstraint(condition=Q(taux__gt=0), name="taux_change_positif"),
            models.CheckConstraint(
                condition=Q(annee__gte=2000, annee__lte=2100), name="taux_change_annee"
            ),
        ]

    def __str__(self):
        return f"{self.annee} 1 {self.devise} = {self.taux} {DEVISE_REFERENCE}"

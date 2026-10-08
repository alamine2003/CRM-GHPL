"""Objectifs par réseau (DSH-009, cycle 0.7)."""

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.socle.modeles_base import ModeleDePays


class Indicateur(models.TextChoices):
    """Ce qu'un objectif mesure ; la cible est un nombre, ou un pourcentage pour la
    couverture."""

    VISITES = "visites", "Visites faites"
    COUVERTURE_AB = "couverture_ab", "Couverture des potentiels A et B (%)"
    PRESENTATIONS = "presentations", "Présentations d'un produit"


class Objectif(ModeleDePays):
    """DSH-009 CA1 : une période, un réseau, un indicateur et une cible ; saisi par le DM du
    réseau ou l'administrateur pays."""

    reseau = models.ForeignKey("organisation.Reseau", on_delete=models.PROTECT,
                               related_name="objectifs")  # fmt: skip
    indicateur = models.CharField(max_length=20, choices=Indicateur.choices)
    produit = models.ForeignKey("referentiel.Produit", null=True, blank=True,
                                on_delete=models.PROTECT, related_name="objectifs")  # fmt: skip
    debut = models.DateField()
    fin = models.DateField()
    cible = models.PositiveIntegerField()
    cree_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                 related_name="objectifs_crees")  # fmt: skip

    class Meta:
        ordering = ["-debut", "reseau__libelle"]
        constraints = [
            models.CheckConstraint(condition=Q(fin__gte=F("debut")),
                                   name="objectif_fin_apres_debut"),
            models.CheckConstraint(
                condition=Q(indicateur="presentations", produit__isnull=False)
                | (~Q(indicateur="presentations") & Q(produit__isnull=True)),
                name="objectif_produit_des_presentations",
            ),
        ]  # fmt: skip

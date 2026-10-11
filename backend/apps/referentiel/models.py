"""Référentiels d'un pays (PRP-001) et portefeuilles de produits des réseaux (ORG-004).

Toute variation entre pays est une donnée (ADR-017) : chaque pays tient ses propres listes.

- Listes simples (`Valeur`) : types de prospect, spécialités, grades, types d'établissement,
  classes thérapeutiques, motifs d'écart. Une spécialité peut dépendre d'un type de prospect.
- Produits : spécialités promues, propres à un pays, classées par classe thérapeutique.
- Portefeuille : lien daté réseau ↔ produit ; un produit peut appartenir à plusieurs
  réseaux (ORG-004 CA2). Même convention que l'organisation : actif le jour `j` si
  `debut <= j < fin`.

Rien ne se supprime (RG-005) : une valeur s'archive (PRP-001 CA2) ; elle n'est plus
proposée mais reste lisible partout où elle a servi.
"""

from django.db import models
from django.db.models import F, Q

from apps.socle.modeles_base import ModeleDePays


class Liste(models.TextChoices):
    TYPE_PROSPECT = "type_prospect", "Types de prospect"
    SPECIALITE = "specialite", "Spécialités"
    TYPE_ETABLISSEMENT = "type_etablissement", "Types d'établissement"
    CLASSE_THERAPEUTIQUE = "classe_therapeutique", "Classes thérapeutiques"
    GRADE = "grade", "Grades"
    MOTIF_ECART = "motif_ecart", "Motifs d'écart"
    RESULTAT_VISITE = "resultat_visite", "Résultats de visite"
    ARTICLE_PROMOTIONNEL = "article_promotionnel", "Articles promotionnels"
    TYPE_ACTION = "type_action", "Types de prochaine action"


def _unique_hors_archives(champs: list[str], nom: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(fields=champs, condition=Q(archive_le__isnull=True), name=nom)


class Valeur(ModeleDePays):
    liste = models.CharField(max_length=30, choices=Liste.choices)
    #: Code stable, utilisé par les imports et les échanges ; le libellé peut changer.
    code = models.CharField(max_length=40)
    libelle = models.CharField(max_length=120)
    ordre = models.PositiveSmallIntegerField(default=0)
    #: Spécialité → type de prospect auquel elle s'applique (facultatif).
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="enfants"
    )

    class Meta:
        ordering = ["liste", "ordre", "libelle"]
        constraints = [
            _unique_hors_archives(["pays", "liste", "code"], "valeur_code_unique"),
            _unique_hors_archives(["pays", "liste", "libelle"], "valeur_libelle_unique"),
        ]
        indexes = [models.Index(fields=["pays", "liste"])]

    def __str__(self):
        return self.libelle


class Produit(ModeleDePays):
    code = models.CharField(max_length=40)
    libelle = models.CharField(max_length=160)
    classe = models.ForeignKey(
        Valeur, null=True, blank=True, on_delete=models.PROTECT, related_name="produits"
    )

    class Meta:
        ordering = ["libelle"]
        constraints = [
            _unique_hors_archives(["pays", "code"], "produit_code_unique"),
            _unique_hors_archives(["pays", "libelle"], "produit_libelle_unique"),
        ]

    def __str__(self):
        return self.libelle


class Portefeuille(ModeleDePays):
    """Un produit dans le portefeuille d'un réseau, pour une période (ORG-004)."""

    reseau = models.ForeignKey(
        "organisation.Reseau", on_delete=models.PROTECT, related_name="portefeuille"
    )
    produit = models.ForeignKey(Produit, on_delete=models.PROTECT, related_name="portefeuilles")
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["reseau", "produit__libelle"]
        constraints = [
            models.CheckConstraint(
                condition=Q(fin__isnull=True) | Q(fin__gte=F("debut")),
                name="portefeuille_fin_apres_debut",
            )
        ]
        indexes = [models.Index(fields=["reseau", "debut"])]

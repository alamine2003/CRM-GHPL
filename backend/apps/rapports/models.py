"""Rapports de visite (cycle 0.5, prd.md §13 et §15.6).

Une visite effectuée a exactement un rapport (RG-030, RPT-001). Son socle est commun à tous
les pays : produits présentés (portefeuille du réseau de la visite, RG-033), résultat (liste
courte du pays), résumé et prochaine action (RPT-002). Chaque pays y ajoute ses champs
(RPT-008) ; un rapport garde la définition des champs en vigueur à sa création, si bien qu'un
champ ajouté plus tard ne s'applique qu'aux nouveaux rapports (CA1).
"""

from django.db import models
from django.db.models import Q

from apps.socle.modeles_base import ModeleDePays


class TypeChamp(models.TextChoices):
    TEXTE = "texte", "Texte"
    NOMBRE = "nombre", "Nombre"
    LISTE = "liste", "Liste"
    CASE = "case", "Case à cocher"


class ChampRapport(ModeleDePays):
    """Champ supplémentaire du rapport, défini par l'administrateur pays (RPT-008)."""

    code = models.CharField(max_length=60)
    libelle = models.CharField(max_length=120)
    type = models.CharField(max_length=10, choices=TypeChamp.choices)
    #: Les choix d'un champ « liste ».
    options = models.JSONField(default=list, blank=True)
    obligatoire = models.BooleanField(default=False)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "champ du rapport"
        ordering = ["ordre", "libelle"]
        constraints = [
            models.UniqueConstraint(fields=["pays", "code"], condition=Q(archive_le__isnull=True),
                                    name="champ_rapport_code_unique"),
        ]  # fmt: skip

    def __str__(self):
        return self.libelle

    def definition(self) -> dict:
        return {"code": self.code, "libelle": self.libelle, "type": self.type,
                "options": list(self.options or []), "obligatoire": self.obligatoire}  # fmt: skip


class StatutRapport(models.TextChoices):
    """prd.md §13 : brouillon → soumis → validé ; correction et réouverture au cycle 0.6."""

    BROUILLON = "brouillon", "Brouillon"
    SOUMIS = "soumis", "Soumis"
    A_CORRIGER = "a_corriger", "À corriger"
    VALIDE = "valide", "Validé"
    ROUVERT = "rouvert", "Rouvert"


class RetourPrescripteur(models.TextChoices):
    """Retour du prescripteur sur un produit présenté (RPT-004)."""

    NON_PRESCRIT = "non_prescrit", "Ne prescrit pas"
    PEU = "peu", "Prescrit peu"
    PRESCRIT = "prescrit", "Prescrit"
    TRES_BIEN = "tres_bien", "Prescrit très bien"


class TypeRemise(models.TextChoices):
    """Ce qui est remis pendant la visite, sans gestion de stock (RPT-005, RG-038)."""

    ECHANTILLON = "echantillon", "Échantillon"
    CADEAU = "cadeau", "Cadeau"


class Rapport(ModeleDePays):
    visite = models.OneToOneField("planning.Visite", on_delete=models.PROTECT,
                                  related_name="rapport")  # fmt: skip
    delegue = models.ForeignKey("identite.Utilisateur", on_delete=models.PROTECT,
                                related_name="rapports")  # fmt: skip
    statut = models.CharField(max_length=12, choices=StatutRapport.choices,
                              default=StatutRapport.BROUILLON)  # fmt: skip
    #: Produits présentés, dans l'ordre de présentation (RPT-004 CA1) :
    #: [{"produit": id ou null pour un « autre », "libelle", "retour"}].
    presentations = models.JSONField(default=list, blank=True)
    #: Échantillons et cadeaux remis (RPT-005) :
    #: [{"type", "produit" (échantillon), "article" (cadeau), "libelle", "quantite"}].
    remises = models.JSONField(default=list, blank=True)
    resultat = models.ForeignKey("referentiel.Valeur", null=True, blank=True,
                                 on_delete=models.PROTECT, related_name="+")  # fmt: skip
    #: L'objectif planifié, relevé à l'ouverture du rapport (RPT-003 CA1).
    objectif_prevu = models.CharField(max_length=500, blank=True)
    #: Ce que la visite a obtenu, en clair, au regard de l'objectif (RPT-003).
    resultat_obtenu = models.CharField(max_length=1000, blank=True)
    resume = models.TextField(blank=True)
    prochaine_action = models.CharField(max_length=500, blank=True)
    #: RPT-006 : la prochaine action a un type (liste du pays), une échéance facultative et,
    #: au besoin, la proposition d'une nouvelle visite.
    prochaine_action_type = models.ForeignKey(
        "referentiel.Valeur", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    prochaine_action_echeance = models.DateField(null=True, blank=True)
    visite_proposee = models.BooleanField(default=False)
    #: Valeurs des champs du pays, par code.
    champs = models.JSONField(default=dict, blank=True)
    #: Les champs du pays tels qu'à la création du rapport (RPT-008 CA1).
    definitions = models.JSONField(default=list, blank=True)
    soumis_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["delegue", "statut"])]

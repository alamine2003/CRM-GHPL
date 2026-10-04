from zoneinfo import available_timezones

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from .modeles_base import ModeleBase, ModeleDePays

# Langues de l'interface (DC-12), communes aux pays, aux comptes et à l'API.
CHOIX_LANGUES = [("fr", "Français"), ("en", "Anglais")]


def valider_fuseau(valeur: str) -> None:
    if valeur not in available_timezones():
        raise ValidationError(f"Fuseau horaire inconnu : {valeur}.")


class Pays(ModeleBase):
    """Filiale opérationnelle, frontière d'isolation des données (prd.md §7, ORG-001).

    Le siège n'est pas un pays (RG-002).
    """

    class Statut(models.TextChoices):
        ACTIF = "actif", "Actif"
        SUSPENDU = "suspendu", "Suspendu"
        ARCHIVE = "archive", "Archivé"

    code = models.CharField(
        max_length=2,
        unique=True,
        validators=[RegexValidator(r"^[A-Z]{2}$", "Code ISO 3166-1 alpha-2 attendu.")],
    )
    nom = models.CharField(max_length=100)
    fuseau = models.CharField(max_length=64, validators=[valider_fuseau])
    langue = models.CharField(max_length=2, choices=CHOIX_LANGUES)
    devise = models.CharField(
        max_length=3, validators=[RegexValidator(r"^[A-Z]{3}$", "Code ISO 4217 attendu.")]
    )
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ACTIF)

    class Meta:
        verbose_name = "pays"
        verbose_name_plural = "pays"
        ordering = ["nom"]

    def pays_du_journal(self):
        return self

    def __str__(self):
        return f"{self.nom} ({self.code})"


class ParametrePays(ModeleDePays):
    """Valeur datée d'un paramètre du pays (ORG-011).

    Une modification ajoute une ligne : les valeurs passées restent lisibles
    pour appliquer à chaque objet la règle de son époque (ORG-011 CA3).
    """

    cle = models.CharField(max_length=64)
    valeur = models.JSONField()
    debut = models.DateTimeField()

    class Meta:
        verbose_name = "paramètre du pays"
        verbose_name_plural = "paramètres du pays"
        ordering = ["pays", "cle", "-debut"]
        constraints = [
            models.UniqueConstraint(fields=["pays", "cle", "debut"], name="parametre_unique_date")
        ]
        indexes = [models.Index(fields=["pays", "cle", "debut"])]


class JournalChangement(models.Model):
    """Journal des changements, support de la synchronisation (architecture §14.4).

    Chaque écriture d'un modèle métier y ajoute une ligne ; le téléphone tire
    les changements dont la séquence dépasse son curseur. La table est
    partitionnée par mois (migration 0002) : sa clé réelle est (sequence, le).
    """

    class Operation(models.TextChoices):
        CREATION = "creation", "Création"
        MODIFICATION = "modification", "Modification"

    sequence = models.BigAutoField(primary_key=True)
    pays = models.ForeignKey(Pays, on_delete=models.PROTECT, db_constraint=False, related_name="+")
    entite = models.CharField(max_length=100)
    entite_id = models.UUIDField()
    version = models.PositiveIntegerField()
    operation = models.CharField(max_length=12, choices=Operation.choices)
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "socle_journalchangement"
        ordering = ["sequence"]

    def __str__(self):
        return f"{self.sequence} {self.operation} {self.entite} v{self.version}"

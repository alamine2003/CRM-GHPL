"""Fiches prospects (prd.md §14.1, PRP-002, PRP-006).

La fiche est **commune** à tous les réseaux du pays (§14.4) ; les visites resteront
privées. Une fiche créée par un délégué est `a_valider` et visible par lui seul jusqu'à
devenir `actif` (RG-041). Les champs normalisés préparent la détection de doublons
(0.1.7) : nom sans accents ni titre, téléphones au format international (E.164).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.socle.modeles_base import ModeleDePays


class Civilite(models.TextChoices):
    DR = "dr", "Dr"
    PR = "pr", "Pr"
    M = "m", "M."
    MME = "mme", "Mme"


class Potentiel(models.TextChoices):
    A = "A", "A"
    B = "B", "B"
    C = "C", "C"


class StatutFiche(models.TextChoices):
    A_VALIDER = "a_valider", "À valider"
    ACTIF = "actif", "Actif"
    ARCHIVE = "archive", "Archivé"
    FUSIONNE = "fusionne", "Fusionné"


class Prospect(ModeleDePays):
    civilite = models.CharField(max_length=3, choices=Civilite.choices, blank=True)
    nom = models.CharField(max_length=80)
    prenom = models.CharField(max_length=80, blank=True)
    #: « Dr Aïssatou N'Diaye » → « aissatou ndiaye » : base de la recherche et des doublons.
    nom_normalise = models.CharField(max_length=170, db_index=True, editable=False)
    type = models.ForeignKey(
        "referentiel.Valeur", on_delete=models.PROTECT, related_name="prospects_du_type"
    )
    specialite = models.ForeignKey(
        "referentiel.Valeur",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prospects_de_la_specialite",
    )
    numero_ordre = models.CharField(max_length=40, blank=True)
    telephone_mobile = models.CharField(max_length=20, blank=True)
    telephone_pro = models.CharField(max_length=20, blank=True)
    courriel = models.EmailField(blank=True)
    potentiel = models.CharField(max_length=1, choices=Potentiel.choices)
    statut = models.CharField(
        max_length=10, choices=StatutFiche.choices, default=StatutFiche.A_VALIDER
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="prospects_crees"
    )
    valide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prospects_valides",
    )
    valide_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["nom", "prenom"]
        constraints = [
            # Le numéro d'ordre est un identifiant fort (§14.6) : unique dans un pays.
            models.UniqueConstraint(
                fields=["pays", "numero_ordre"],
                condition=~Q(numero_ordre="") & Q(statut__in=["a_valider", "actif"]),
                name="prospect_numero_ordre_unique",
            )
        ]
        indexes = [models.Index(fields=["pays", "statut"])]

    def __str__(self):
        return " ".join(x for x in (self.get_civilite_display(), self.prenom, self.nom) if x)

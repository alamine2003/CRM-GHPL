"""Fiches prospects et établissements (prd.md §14.1, §14.2 ; PRP-002, PRP-003, PRP-006).

La fiche est **commune** à tous les réseaux du pays (§14.4) ; les visites resteront
privées. Une fiche créée par un délégué est `a_valider` et visible par lui seul jusqu'à
devenir `actif` (RG-041). Les champs normalisés préparent la détection de doublons
(0.1.8) : nom sans accents ni titre, téléphones au format international (E.164).
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


class Activite(models.TextChoices):
    """Exercice hospitalier ou privé (H/P), tel que le terrain le distingue."""

    HOSPITALIER = "hospitalier", "Hospitalier"
    PRIVE = "prive", "Privé"


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
    activite = models.CharField(max_length=12, choices=Activite.choices, blank=True)
    grade = models.ForeignKey(
        "referentiel.Valeur",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prospects_du_grade",
    )
    #: Lieu d'exercice principal, quand il n'est pas encore relié à un établissement.
    secteur = models.ForeignKey(
        "organisation.Secteur",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prospects",
    )
    localite = models.ForeignKey(
        "organisation.Localite",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prospects",
    )
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


class Etablissement(ModeleDePays):
    """Lieu d'exercice : cabinet, hôpital, pharmacie… (§14.2, PRP-003).

    Il appartient à un secteur (CA1). Ses coordonnées GPS de référence sont facultatives
    mais nécessaires au contrôle de distance des visites (CA2, 0.4). Comme une fiche
    prospect, il est `a_valider` quand un délégué le crée (§14.6, RG-041).
    """

    nom = models.CharField(max_length=160)
    nom_normalise = models.CharField(max_length=170, db_index=True, editable=False)
    type = models.ForeignKey(
        "referentiel.Valeur", on_delete=models.PROTECT, related_name="etablissements_du_type"
    )
    secteur = models.ForeignKey(
        "organisation.Secteur", on_delete=models.PROTECT, related_name="etablissements"
    )
    adresse = models.CharField(max_length=200, blank=True)
    localite = models.ForeignKey(
        "organisation.Localite",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="etablissements",
    )
    activite = models.CharField(max_length=12, choices=Activite.choices, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    telephone = models.CharField(max_length=20, blank=True)
    statut = models.CharField(
        max_length=10, choices=StatutFiche.choices, default=StatutFiche.A_VALIDER
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="etablissements_crees"
    )
    valide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="etablissements_valides",
    )
    valide_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "établissement"
        ordering = ["nom"]
        constraints = [
            # Les deux coordonnées vont ensemble, dans des bornes valides.
            models.CheckConstraint(
                condition=(Q(latitude__isnull=True) & Q(longitude__isnull=True))
                | (
                    Q(latitude__gte=-90, latitude__lte=90)
                    & Q(longitude__gte=-180, longitude__lte=180)
                ),
                name="etablissement_coordonnees_valides",
            )
        ]
        indexes = [models.Index(fields=["pays", "statut"]), models.Index(fields=["secteur"])]

    def __str__(self):
        return self.nom

    @property
    def a_coordonnees(self) -> bool:
        return self.latitude is not None and self.longitude is not None

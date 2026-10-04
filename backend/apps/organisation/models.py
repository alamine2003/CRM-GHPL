"""Organisation matricielle d'un pays (prd.md §7.1, ORG-003 à ORG-008).

- Ligne produit : Division → Réseau (le portefeuille de produits arrive en 0.1.1).
- Ligne terrain : Zone → Secteur → Localité ; Secteur → Poste ← Occupation (personne) et
  Rattachement (superviseur).
- Périmètre de réseaux daté des DF et DM.

Les liens datés suivent une seule convention : actif le jour `j` si
`debut <= j < fin` (fin exclue, facultative). Un changement prend donc effet
le jour indiqué sans modifier le passé (ORG-007 CA2, ORG-008 CA2). Une période
vide (fin = début) est un lien annulé avant d'avoir commencé.
"""

from datetime import date

from django.db import models
from django.db.models import F, Q

from apps.socle.modeles_base import ModeleDePays


def actif_le(jour: date, prefixe: str = "") -> Q:
    """Condition « lien daté actif le jour donné »."""
    return Q(**{f"{prefixe}debut__lte": jour}) & (
        Q(**{f"{prefixe}fin__isnull": True}) | Q(**{f"{prefixe}fin__gt": jour})
    )


def _unique_hors_archives(champs: list[str], nom: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(fields=champs, condition=Q(archive_le__isnull=True), name=nom)


def _fin_apres_debut(nom: str) -> models.CheckConstraint:
    return models.CheckConstraint(condition=Q(fin__isnull=True) | Q(fin__gte=F("debut")), name=nom)


class Division(ModeleDePays):
    code = models.CharField(max_length=20)
    libelle = models.CharField(max_length=120)

    class Meta:
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["pays", "code"], "division_code_unique")]

    def __str__(self):
        return self.libelle


class Reseau(ModeleDePays):
    """Réseau d'une division. Le portefeuille de produits arrive avec ORG-004 (0.1.1)."""

    division = models.ForeignKey(Division, on_delete=models.PROTECT, related_name="reseaux")
    code = models.CharField(max_length=20)
    libelle = models.CharField(max_length=120)

    class Meta:
        verbose_name = "réseau"
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["pays", "code"], "reseau_code_unique")]

    def __str__(self):
        return self.libelle


class Zone(ModeleDePays):
    libelle = models.CharField(max_length=120)

    class Meta:
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["pays", "libelle"], "zone_libelle_unique")]

    def __str__(self):
        return self.libelle


class Secteur(ModeleDePays):
    """Un secteur appartient à une seule zone (ORG-003 CA1)."""

    zone = models.ForeignKey(Zone, on_delete=models.PROTECT, related_name="secteurs")
    libelle = models.CharField(max_length=120)

    class Meta:
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["pays", "libelle"], "secteur_libelle_unique")]

    def __str__(self):
        return self.libelle


class Localite(ModeleDePays):
    """Quartier, village ou ville d'un secteur (architecture §13.2) : situe établissements
    et prospects plus finement que le secteur. Décision du 4 octobre 2026 : référentiel
    plutôt que texte libre (le CRM en place en compte 430 au Sénégal)."""

    secteur = models.ForeignKey(Secteur, on_delete=models.PROTECT, related_name="localites")
    libelle = models.CharField(max_length=120)

    class Meta:
        verbose_name = "localité"
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["secteur", "libelle"], "localite_libelle_unique")]

    def __str__(self):
        return self.libelle


class TypePoste(models.TextChoices):
    """Types de poste du délégué (prd.md §6.2)."""

    VM = "vm", "Visiteur médical"
    VM_OTC = "vm_otc", "Visiteur médical OTC"
    KAM = "kam", "Key Account Manager"
    DERMO = "dermo", "Dermo-conseillère"


class Poste(ModeleDePays):
    """Poste de délégué, distinct de la personne qui l'occupe ; peut être vacant (ORG-005)."""

    type_poste = models.CharField(max_length=10, choices=TypePoste.choices)
    libelle = models.CharField(max_length=120)
    reseaux = models.ManyToManyField(Reseau, related_name="postes", blank=True)
    secteurs = models.ManyToManyField(Secteur, related_name="postes", blank=True)

    class Meta:
        ordering = ["libelle"]
        constraints = [_unique_hors_archives(["pays", "libelle"], "poste_libelle_unique")]

    def __str__(self):
        return self.libelle


class Occupation(ModeleDePays):
    """Une personne occupe un poste entre deux dates (ORG-006)."""

    poste = models.ForeignKey(Poste, on_delete=models.PROTECT, related_name="occupations")
    utilisateur = models.ForeignKey(
        "identite.Utilisateur", on_delete=models.PROTECT, related_name="occupations"
    )
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)
    #: Poste principal de la personne : son superviseur approuve le planning (RG-011).
    principal = models.BooleanField(default=True)

    class Meta:
        ordering = ["-debut"]
        constraints = [_fin_apres_debut("occupation_fin_apres_debut")]
        indexes = [
            models.Index(fields=["utilisateur", "fin"]),
            models.Index(fields=["poste", "fin"]),
        ]


class Rattachement(ModeleDePays):
    """Rattachement daté d'un poste à son superviseur (ORG-007)."""

    poste = models.ForeignKey(Poste, on_delete=models.PROTECT, related_name="rattachements")
    superviseur = models.ForeignKey(
        "identite.Utilisateur", on_delete=models.PROTECT, related_name="rattachements"
    )
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-debut"]
        constraints = [_fin_apres_debut("rattachement_fin_apres_debut")]
        indexes = [
            models.Index(fields=["superviseur", "fin"]),
            models.Index(fields=["poste", "fin"]),
        ]


class PerimetreReseau(ModeleDePays):
    """Réseau du périmètre daté d'un DF ou d'un DM (ORG-008)."""

    utilisateur = models.ForeignKey(
        "identite.Utilisateur", on_delete=models.PROTECT, related_name="perimetres_reseaux"
    )
    reseau = models.ForeignKey(Reseau, on_delete=models.PROTECT, related_name="perimetres")
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = "périmètre de réseau"
        ordering = ["-debut"]
        constraints = [_fin_apres_debut("perimetre_reseau_fin_apres_debut")]
        indexes = [models.Index(fields=["utilisateur", "fin"])]

"""Calendrier du pays et plannings hebdomadaires (cycle 0.2).

- `JourFerie` (ORG-012) : tenu par l'administrateur pays ; exclu des contrôles « semaine
  complète » et des seuils (CA1, RG-022) ; non planifiable (PLN-001 CA2).
- `Planning` (PLN-001) : un seul par délégué et par semaine (RG-012), identifiée par son
  lundi. Ses versions, passages, absences et visites arrivent de 0.2.2 à 0.2.8.
- `Visite` (PLN-002), rangée dans sa journée par `ordre` (0.2.3).
- `Passage` (PLN-003) : plusieurs visites d'un même établissement le même jour, à une même heure.
- `VersionPlanning` (RG-037, PLN-012) : état figé à chaque soumission, porteur de la décision.
- `Activite` (PLN-009, PLN-018) : activité connexe sur une journée ou une demi-journée, sans
  visite (congé, formation, réunion, indisponibilité…) ou avec visites (commando, déplacement…).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.socle.modeles_base import ModeleDePays

from .etats import StatutPlanning, StatutVisite


class JourFerie(ModeleDePays):
    date = models.DateField()
    libelle = models.CharField(max_length=120)
    #: Fête à date variable (Korité, Tabaski…) : la date se confirme peu avant (ORG-012 CA2).
    variable = models.BooleanField(default=False)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["pays", "date"],
                condition=Q(archive_le__isnull=True),
                name="jour_ferie_unique",
            )
        ]

    def __str__(self):
        return f"{self.date} {self.libelle}"


class Planning(ModeleDePays):
    delegue = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="plannings"
    )
    #: Lundi de la semaine planifiée.
    semaine = models.DateField()
    statut = models.CharField(
        max_length=12, choices=StatutPlanning.choices, default=StatutPlanning.BROUILLON
    )
    #: Dernière soumission (PLN-008) ; « en retard » si elle a suivi l'échéance du pays (RG-013).
    soumis_le = models.DateTimeField(null=True, blank=True)
    en_retard = models.BooleanField(default=False)
    #: Rédaction rouverte par le superviseur après la fermeture du lundi 0 h (décision du
    #: 6 octobre 2026) : on sait que le planning n'a pas été fait à temps.
    reouvert_le = models.DateTimeField(null=True, blank=True)
    reouvert_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="+",
    )  # fmt: skip

    class Meta:
        ordering = ["-semaine"]
        constraints = [
            models.UniqueConstraint(fields=["delegue", "semaine"], name="planning_unique"),
        ]

    def __str__(self):
        return f"{self.delegue} {self.semaine}"


class Passage(ModeleDePays):
    """Regroupement de visites d'un même établissement le même jour (PLN-003) : une ligne
    « Établissement · n prescripteurs » ; chaque visite garde son prospect et son rapport (CA2).
    L'heure du passage est celle de toutes ses visites."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="passages")
    etablissement = models.ForeignKey(
        "prospects.Etablissement", on_delete=models.PROTECT, related_name="+"
    )
    date = models.DateField()
    heure = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["date", "heure"]
        constraints = [
            models.UniqueConstraint(
                fields=["planning", "date", "etablissement"],
                condition=Q(archive_le__isnull=True),
                name="passage_unique",
            )
        ]

    def __str__(self):
        return f"{self.date} {self.etablissement}"


class Periode(models.TextChoices):
    JOURNEE = "journee", "Journée"
    MATIN = "matin", "Matin"
    APRES_MIDI = "apres_midi", "Après-midi"


class TypeActivite(models.TextChoices):
    """Type d'une activité connexe (PLN-009, PLN-018) : sans visite (absence) ou avec visites."""

    CONGE = "conge", "Congé"
    FORMATION = "formation", "Formation"
    REUNION = "reunion", "Réunion"
    #: DC-51 : remplace « maladie » ; sans motif médical, déclarée le jour même (Tournée).
    INDISPONIBILITE = "indisponibilite", "Indisponibilité imprévue"
    AUTRE = "autre", "Autre"
    COMMANDO = "commando", "Commando"
    DEPLACEMENT = "deplacement", "Déplacement"
    ACCOMPAGNEMENT = "accompagnement", "Accompagnement du superviseur"


#: Activités connexes pendant lesquelles le délégué visite (0.3.1, PLN-018) : elles ne
#: réduisent pas l'objectif du jour, exigent une explication, et couvrent les visites hors
#: secteur ou hors liste cible de leur journée.
AVEC_VISITES = frozenset({TypeActivite.COMMANDO, TypeActivite.DEPLACEMENT,
                          TypeActivite.ACCOMPAGNEMENT})  # fmt: skip


class Activite(ModeleDePays):
    """Activité connexe déclarée dans le planning (PLN-009, PLN-018). Sans visite (congé,
    formation, réunion, indisponibilité imprévue, autre), elle réduit les seuils du jour au
    prorata (CA1, RG-022) ; avec visites (commando, déplacement, accompagnement du
    superviseur), elle s'explique et justifie les visites hors secteur de sa journée. Elle se
    valide avec le planning (cycle 0.3)."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="activites")
    date = models.DateField()
    periode = models.CharField(max_length=12, choices=Periode.choices, default=Periode.JOURNEE)
    type = models.CharField(max_length=16, choices=TypeActivite.choices)
    #: Motif d'une absence « autre », ou explication d'une activité avec visites.
    commentaire = models.CharField(max_length=500, blank=True)
    #: Déplacement demandé par le superviseur (sinon justifié par le délégué).
    demande_superviseur = models.BooleanField(default=False)

    @property
    def avec_visites(self) -> bool:
        return self.type in AVEC_VISITES

    class Meta:
        ordering = ["date", "periode"]

    def __str__(self):
        return f"{self.date} {self.periode} {self.type}"


class Visite(ModeleDePays):
    """Visite planifiée (PLN-002) : date, heure, prospect, établissement, objectif, réseau ;
    note facultative. Une visite en préparation peut rester incomplète ; la soumission du
    planning la refuse alors avec la liste des champs manquants (CA1)."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="visites")
    #: Poste occupé au titre duquel la visite est faite ; déduit du réseau choisi.
    poste = models.ForeignKey(
        "organisation.Poste", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reseau = models.ForeignKey(
        "organisation.Reseau", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    prospect = models.ForeignKey(
        "prospects.Prospect", null=True, blank=True, on_delete=models.PROTECT,
        related_name="visites",
    )  # fmt: skip
    etablissement = models.ForeignKey(
        "prospects.Etablissement", null=True, blank=True, on_delete=models.PROTECT,
        related_name="visites",
    )  # fmt: skip
    date = models.DateField()
    heure = models.TimeField(null=True, blank=True)
    objectif = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=500, blank=True)
    statut = models.CharField(
        max_length=16, choices=StatutVisite.choices, default=StatutVisite.PREVUE
    )
    #: Visite faite hors du planning, le jour même (VIS-008, RG-027) : justifiée, sans
    #: approbation préalable ; elle n'entre dans aucune version.
    est_imprevue = models.BooleanField(default=False)
    justification = models.CharField(max_length=500, blank=True)
    passage = models.ForeignKey(
        Passage, null=True, blank=True, on_delete=models.SET_NULL, related_name="visites"
    )
    #: Rang dans la journée (0.2.3) : les visites à heure fixe suivent l'ordre chronologique,
    #: celles sans heure restent où le délégué les a placées.
    ordre = models.PositiveSmallIntegerField(default=0)
    # Exécution (VIS-003, 0.4.3) : l'heure réelle du début, prise par le téléphone, et la
    # position à ce moment, si le pays active la géolocalisation (RG-028).
    debut_le = models.DateTimeField(null=True, blank=True)
    debut_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    debut_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    #: Précision annoncée par le téléphone, en mètres.
    debut_precision_m = models.PositiveIntegerField(null=True, blank=True)
    #: Démarrée sans position (CA2) : refus, panne ou géolocalisation coupée par le pays.
    sans_gps = models.BooleanField(default=False)
    #: Distance entre la position du début et le lieu de la visite (CA3), en mètres.
    distance_debut_m = models.PositiveIntegerField(null=True, blank=True)
    # Fin (VIS-004, 0.4.4) : l'heure réelle et la position, comme au début.
    fin_le = models.DateTimeField(null=True, blank=True)
    fin_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    fin_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    fin_precision_m = models.PositiveIntegerField(null=True, blank=True)
    fin_sans_gps = models.BooleanField(default=False)
    distance_fin_m = models.PositiveIntegerField(null=True, blank=True)
    # Écart (VIS-005 à VIS-009) : un motif de la liste du pays, un commentaire facultatif, et
    # le moment où le délégué l'a déclaré (prd.md §12).
    motif_ecart = models.ForeignKey(
        "referentiel.Valeur", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    commentaire_ecart = models.CharField(max_length=500, blank=True)
    ecart_le = models.DateTimeField(null=True, blank=True)
    #: Visite reportée dont celle-ci prend la suite (VIS-007 CA1) ; une visite ne se reporte
    #: qu'une fois.
    reportee_de = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="report"
    )

    class Meta:
        ordering = ["date", "ordre", "heure"]
        indexes = [models.Index(fields=["planning", "date"])]

    def __str__(self):
        return f"{self.date} {self.heure or ''} {self.prospect or ''}"


class Decision(models.TextChoices):
    APPROUVE = "approuve", "Approuvé"
    A_REVISER = "a_reviser", "À réviser"


class ModeDecision(models.TextChoices):
    """Qui a décidé (prd.md §11) : le superviseur du poste (ou le DM d'un superviseur-visiteur,
    RG-023), son remplaçant daté (RG-020), ou l'administrateur pays par escalade (RG-019)."""

    DIRECT = "direct", "Décision du responsable du poste"
    REMPLACEMENT = "remplacement", "Décision du remplaçant"
    ESCALADE = "escalade", "Décision par escalade"


class MotifVersion(models.TextChoices):
    """Pourquoi une version a été soumise : première soumission, correction après une révision
    (PLN-014), ou modification majeure d'un planning approuvé (PLN-015, RG-018)."""

    SOUMISSION = "soumission", "Soumission"
    REVISION = "revision", "Après révision"
    MODIFICATION = "modification", "Modification après approbation"


class VersionPlanning(ModeleDePays):
    """État figé d'un planning à une soumission (RG-037, PLN-012 CA1) : son contenu ne change
    plus ; la décision s'y inscrit une fois, avec son auteur et son mode."""

    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="versions")
    numero = models.PositiveSmallIntegerField()
    #: Visites, passages et activités tels que soumis.
    contenu = models.JSONField()
    soumis_le = models.DateTimeField()
    en_retard = models.BooleanField(default=False)
    decision = models.CharField(max_length=12, choices=Decision.choices, blank=True)
    decide_le = models.DateTimeField(null=True, blank=True)
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="+",
    )  # fmt: skip
    mode = models.CharField(max_length=16, choices=ModeDecision.choices, blank=True)
    commentaire = models.CharField(max_length=1000, blank=True)
    #: Révision (PLN-013) : remarques sur des visites précises, `{"visite", "commentaire"}`.
    remarques = models.JSONField(default=list, blank=True)
    motif = models.CharField(
        max_length=12, choices=MotifVersion.choices, default=MotifVersion.SOUMISSION
    )
    #: Modifications mineures faites après l'approbation de cette version (PLN-015 CA1, RG-018) :
    #: l'heure d'une visite dans sa journée, `{"visite", "date", "avant", "apres", "le"}`. Le
    #: contenu soumis ne change pas ; la référence d'exécution les applique.
    modifications = models.JSONField(default=list, blank=True)
    #: Escaladée à l'administrateur pays, faute de décision dans le délai (PLN-016, RG-019).
    escalade_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["planning", "-numero"]
        constraints = [
            models.UniqueConstraint(fields=["planning", "numero"], name="version_planning_unique")
        ]

    def __str__(self):
        return f"{self.planning} v{self.numero}"


class Classement(models.TextChoices):
    CONFORME = "conforme", "Conforme"
    A_VERIFIER = "a_verifier", "À vérifier"


class ConformiteJournee(ModeleDePays):
    """Contrôles de conformité d'une journée d'un délégué (VIS-010, RG-029) : calculés par le
    serveur à la réception et recalculés tant que la journée n'est pas validée ; figée à la
    validation (cycle 0.6), elle ne change plus, même si les paramètres changent (CA3)."""

    delegue = models.ForeignKey("identite.Utilisateur", on_delete=models.PROTECT,
                                related_name="+")  # fmt: skip
    planning = models.ForeignKey(Planning, on_delete=models.PROTECT, related_name="conformites")
    date = models.DateField()
    classement = models.CharField(max_length=12, choices=Classement.choices)
    ecarts = models.JSONField(default=list)
    #: Les seuils appliqués, pour relire le calcul tel qu'il a été fait.
    seuils = models.JSONField(default=dict)
    calcule_le = models.DateTimeField()
    fige_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "conformité d'une journée"
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["delegue", "date"], name="conformite_journee_unique")
        ]

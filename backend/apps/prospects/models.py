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
    #: DC-58 : le prescripteur accepte d'être contacté sur son mobile personnel. Sans cet
    #: accord, le numéro sert à repérer les doublons mais ne s'affiche qu'à l'administration.
    contact_mobile_accepte = models.BooleanField(default=False)
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
    #: Fiche conservée quand celle-ci a été fusionnée (statut `fusionne`, PRP-008 à PRP-010).
    fusionne_dans = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="absorbees"
    )

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
    #: DC-55 : rayon de pointage propre (grand hôpital, campus) ; vide, celui du pays.
    rayon_pointage_m = models.PositiveIntegerField(null=True, blank=True)
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


class Exercice(ModeleDePays):
    """Lien daté entre un prospect et un établissement (§14.3, PRP-004).

    Un prospect exerce dans un ou plusieurs établissements (CA1). Un exercice est actif le
    jour `j` si `debut <= j < fin` (fin exclue, comme les liens de l'organisation). Une visite
    ne référencera qu'un couple lié par un exercice actif à sa date (CA2, RG-015, 0.4).
    """

    prospect = models.ForeignKey(Prospect, on_delete=models.PROTECT, related_name="exercices")
    etablissement = models.ForeignKey(
        Etablissement, on_delete=models.PROTECT, related_name="exercices"
    )
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)
    #: Lieu d'exercice principal du prospect, proposé en premier à la planification.
    principal = models.BooleanField(default=False)
    #: Jours et horaires de présence, en clair [H] (« lundi et jeudi matin »).
    presence = models.CharField(max_length=120, blank=True)
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="exercices_crees"
    )

    class Meta:
        ordering = ["-principal", "debut"]
        constraints = [
            models.CheckConstraint(
                condition=Q(fin__isnull=True) | Q(fin__gte=models.F("debut")),
                name="exercice_fin_apres_debut",
            ),
            # Un seul exercice en cours par couple prospect / établissement.
            models.UniqueConstraint(
                fields=["prospect", "etablissement"],
                condition=Q(fin__isnull=True),
                name="exercice_en_cours_unique",
            ),
        ]
        indexes = [models.Index(fields=["prospect", "debut"])]

    def __str__(self):
        return f"{self.prospect} → {self.etablissement}"

    def actif_le(self, jour) -> bool:
        return self.debut <= jour and (self.fin is None or jour < self.fin)


class Cible(ModeleDePays):
    """Prospect de la liste cible d'un poste, avec sa fréquence cible (§14.5, PRP-011).

    La liste est tenue par le superviseur du poste ou l'administrateur pays (RG-043). La
    fréquence se compte en visites par cycle (paramètre `cycle_visite_semaines`, 4 semaines
    au Sénégal). Une cible est en cours le jour `j` si `debut <= j < fin`.
    """

    poste = models.ForeignKey("organisation.Poste", on_delete=models.PROTECT, related_name="cibles")
    prospect = models.ForeignKey(Prospect, on_delete=models.PROTECT, related_name="cibles")
    frequence = models.PositiveSmallIntegerField()
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)
    ajoute_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cibles_ajoutees"
    )

    class Meta:
        ordering = ["prospect__nom", "prospect__prenom"]
        constraints = [
            models.CheckConstraint(
                condition=Q(frequence__gte=1) & Q(frequence__lte=20), name="cible_frequence_bornee"
            ),
            models.CheckConstraint(
                condition=Q(fin__isnull=True) | Q(fin__gte=models.F("debut")),
                name="cible_fin_apres_debut",
            ),
            models.UniqueConstraint(
                fields=["poste", "prospect"],
                condition=Q(fin__isnull=True),
                name="cible_en_cours_unique",
            ),
        ]
        indexes = [models.Index(fields=["poste", "fin"])]

    def __str__(self):
        return f"{self.poste} → {self.prospect}"


# --- Doublons, fusions, historique, propositions (0.1.8) ---------------------------------------


class Fusion(ModeleDePays):
    """Fusion d'une fiche dans une autre (PRP-008 CA1, PRP-009) ; réversible (PRP-010).

    `transferts` garde ce qui a suivi la fiche conservée (exercices, listes cibles, champs
    complétés) pour que la défusion rende à chacune ce qui était à elle.
    """

    conservee = models.ForeignKey(Prospect, on_delete=models.PROTECT, related_name="fusions")
    absorbee = models.ForeignKey(Prospect, on_delete=models.PROTECT, related_name="fusions_subies")
    automatique = models.BooleanField(default=False)
    score = models.PositiveSmallIntegerField(default=0)
    criteres = models.JSONField(default=list)
    #: Statut de la fiche absorbée avant la fusion, rétabli à la défusion.
    statut_avant = models.CharField(max_length=10, choices=StatutFiche.choices)
    transferts = models.JSONField(default=dict)
    par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="fusions_faites",
    )
    defaite_le = models.DateTimeField(null=True, blank=True)
    defaite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="fusions_defaites",
    )

    class Meta:
        ordering = ["-cree_le"]
        constraints = [
            models.UniqueConstraint(
                fields=["absorbee"],
                condition=Q(defaite_le__isnull=True),
                name="fusion_en_cours_unique",
            )
        ]


class StatutDoublon(models.TextChoices):
    EN_ATTENTE = "en_attente", "En attente"
    FUSIONNES = "fusionnes", "Fusionnés"
    SEPARES = "separes", "Gardés séparés"
    REFUSE = "refuse", "Refusé"


class DoublonProbable(ModeleDePays):
    """Paire de fiches que le détecteur juge probablement identiques (PRP-008, PRP-009).

    L'administrateur pays fusionne, garde séparées (la paire ne revient plus, CA2) ou refuse
    la fiche nouvelle (archivée).
    """

    fiche = models.ForeignKey(Prospect, on_delete=models.PROTECT, related_name="doublons")
    candidat = models.ForeignKey(
        Prospect, on_delete=models.PROTECT, related_name="doublons_candidats"
    )
    score = models.PositiveSmallIntegerField()
    criteres = models.JSONField(default=list)
    statut = models.CharField(
        max_length=10, choices=StatutDoublon.choices, default=StatutDoublon.EN_ATTENTE
    )
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="doublons_tranches",
    )
    decide_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-score", "cree_le"]
        constraints = [
            models.UniqueConstraint(fields=["fiche", "candidat"], name="doublon_paire_unique")
        ]


class Changement(ModeleDePays):
    """Historique champ par champ d'une fiche (PRP-012 CA1) : rien ne s'efface (CA2)."""

    class Objet(models.TextChoices):
        PROSPECT = "prospect", "Prospect"
        ETABLISSEMENT = "etablissement", "Établissement"

    objet = models.CharField(max_length=14, choices=Objet.choices)
    objet_id = models.UUIDField(db_index=True)
    champ = models.CharField(max_length=40)
    ancienne = models.CharField(max_length=300, blank=True)
    nouvelle = models.CharField(max_length=300, blank=True)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="changements",
    )
    #: Origine : saisie, proposition acceptée, fusion, défusion, import.
    origine = models.CharField(max_length=20, default="saisie")

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["objet", "objet_id", "cree_le"])]


class StatutProposition(models.TextChoices):
    EN_ATTENTE = "en_attente", "En attente"
    ACCEPTEE = "acceptee", "Acceptée"
    REFUSEE = "refusee", "Refusée"


class Proposition(ModeleDePays):
    """Modification d'une fiche commune proposée par un délégué (PRP-014).

    La fiche ne change pas avant l'acceptation (CA1) ; le délégué voit la décision dans ses
    propositions (CA2). `changements` : champs proposés de la fiche ; `etablissement` : un
    nouvel exercice proposé pour un prospect.
    """

    prospect = models.ForeignKey(
        Prospect, null=True, blank=True, on_delete=models.PROTECT, related_name="propositions"
    )
    etablissement = models.ForeignKey(
        Etablissement,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="propositions",
    )
    #: Pour un prospect : établissement où il exerce désormais (nouvel exercice proposé).
    nouvel_exercice = models.ForeignKey(
        Etablissement,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="exercices_proposes",
    )
    changements = models.JSONField(default=dict)
    commentaire = models.CharField(max_length=300, blank=True)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="propositions"
    )
    statut = models.CharField(
        max_length=10, choices=StatutProposition.choices, default=StatutProposition.EN_ATTENTE
    )
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="propositions_tranchees",
    )
    decide_le = models.DateTimeField(null=True, blank=True)
    motif = models.CharField(max_length=300, blank=True)
    #: Le délégué a vu la décision (notification lue).
    vue_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-cree_le"]
        constraints = [
            models.CheckConstraint(
                condition=Q(prospect__isnull=False) ^ Q(etablissement__isnull=False),
                name="proposition_une_fiche",
            )
        ]

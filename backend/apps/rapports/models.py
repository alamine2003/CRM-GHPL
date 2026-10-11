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


class ModeValidation(models.TextChoices):
    """RG-034 : comment un rapport a été validé."""

    UNITAIRE = "unitaire", "Validé seul"
    JOURNEE = "journee", "Validé avec sa journée"
    LOT = "lot", "Validé avec les journées conformes"
    ESCALADE = "escalade", "Validé par escalade"
    REMPLACEMENT = "remplacement", "Validé par le remplaçant"


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
    #: Heure de soumission retenue : celle du téléphone, sauf horodatage douteux (RPT-010).
    soumis_le = models.DateTimeField(null=True, blank=True)
    #: RG-032 : soumis après 23 h 59, heure du pays, le jour de la visite. Seule compte la
    #: première soumission.
    en_retard = models.BooleanField(default=False)
    #: RPT-010 CA1 [H] : l'heure du téléphone s'écartait de plus de 15 min de celle du serveur ;
    #: l'heure de réception a alors servi, et le superviseur le voit.
    horodatage_douteux = models.BooleanField(default=False)
    #: RPT-013 CA2, RG-034 : qui a validé, quand, et comment.
    valide_le = models.DateTimeField(null=True, blank=True)
    valide_par = models.ForeignKey("identite.Utilisateur", null=True, blank=True,
                                   on_delete=models.PROTECT, related_name="+")  # fmt: skip
    mode_validation = models.CharField(max_length=12, choices=ModeValidation.choices,
                                       blank=True)  # fmt: skip
    #: RPT-014 : la dernière demande de correction, motivée, sur des champs précis ; sans
    #: échéance (DC-60). Chaque demande est aussi au journal d'audit.
    correction_le = models.DateTimeField(null=True, blank=True)
    correction_par = models.ForeignKey("identite.Utilisateur", null=True, blank=True,
                                       on_delete=models.PROTECT, related_name="+")  # fmt: skip
    correction_commentaire = models.TextField(blank=True)
    correction_champs = models.JSONField(default=list, blank=True)
    #: RPT-016 (0.6.6) : la dernière réouverture d'un rapport validé ; qui, quand, pourquoi.
    rouvert_le = models.DateTimeField(null=True, blank=True)
    rouvert_par = models.ForeignKey("identite.Utilisateur", null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="+")  # fmt: skip
    rouvert_motif = models.TextField(blank=True)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["delegue", "statut"])]


class VersionRapport(ModeleDePays):
    """État figé d'un rapport à une soumission (RG-037) : son contenu ne change plus."""

    rapport = models.ForeignKey(Rapport, on_delete=models.PROTECT, related_name="versions")
    numero = models.PositiveSmallIntegerField()
    contenu = models.JSONField()
    #: Heure retenue (celle du téléphone, ou de réception si elle était douteuse).
    soumis_le = models.DateTimeField()
    #: Heure de soumission donnée par le téléphone : reconnaît un envoi rejoué (OFF-003).
    heure_telephone = models.DateTimeField()
    #: Heure de réception par le serveur.
    recu_le = models.DateTimeField()
    en_retard = models.BooleanField(default=False)
    horodatage_douteux = models.BooleanField(default=False)
    #: RPT-015 : la demande de correction à laquelle cette version répond (qui, quand, quoi).
    correction = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["rapport", "numero"]
        constraints = [
            models.UniqueConstraint(fields=["rapport", "numero"], name="version_rapport_unique")
        ]


def _chemin_piece(piece, nom: str) -> str:
    """Rangement par pays et par rapport ; le nom d'origine ne sert pas au chemin."""
    extension = nom.rsplit(".", 1)[-1].lower() if "." in nom else "bin"
    return f"pieces-jointes/{piece.pays_id}/{piece.rapport_id}/{piece.pk}.{extension}"


class PieceJointe(ModeleDePays):
    """Photo ou document joint au rapport (RPT-007). L'identifiant vient du téléphone : un
    envoi rejoué depuis la file d'attente ne crée pas de doublon."""

    rapport = models.ForeignKey(Rapport, on_delete=models.CASCADE, related_name="pieces_jointes")
    #: OFF-005 (0.8.7) : vide tant que la pièce est seulement annoncée ; le fichier arrive
    #: plus tard, quand le téléphone a du réseau pour l'envoyer.
    fichier = models.FileField(upload_to=_chemin_piece, max_length=300, blank=True)
    nom = models.CharField(max_length=200)
    type_mime = models.CharField(max_length=60)
    taille = models.PositiveIntegerField()
    #: Moment où le délégué a choisi le document, sur le téléphone : une
    #: pièce prise avant la soumission peut arriver après, faute de réseau.
    prise_le = models.DateTimeField()
    #: Arrivée du fichier ; vide, la pièce est « en attente » (OFF-005 CA1).
    recue_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["prise_le"]

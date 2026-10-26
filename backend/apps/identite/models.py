"""Comptes, sessions et récupération d'accès (USR-001, USR-003, USR-005, SEC-001, SEC-002).

Le modèle utilisateur a été déclaré en 0.0.2, avant toute migration du
module d'authentification de Django. Les rôles par pays arrivent en 0.0.4.
"""

import hashlib
import re
import secrets

from django.contrib.auth.models import AbstractUser, UserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.socle.identifiants import uuid7
from apps.socle.models import CHOIX_LANGUES

# Identifiant nominatif « prenom.nom » (USR-001 CA1) : pas de compte partagé ou générique.
FORMAT_IDENTIFIANT = re.compile(r"^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$")
IDENTIFIANTS_GENERIQUES = {
    "admin", "administrateur", "root", "test", "demo", "commun", "partage", "equipe",
    "delegue", "superviseur", "siege", "support", "info", "contact", "invite",
}  # fmt: skip


def valider_identifiant(valeur: str) -> None:
    if not FORMAT_IDENTIFIANT.match(valeur):
        raise ValidationError(
            "Identifiant nominatif attendu, au format prenom.nom (minuscules, sans accent)."
        )
    if set(valeur.split(".")) & IDENTIFIANTS_GENERIQUES:
        raise ValidationError("Les comptes partagés ou génériques sont interdits (USR-001).")


def empreinte(jeton: str) -> str:
    """Seule l'empreinte d'un jeton est stockée, jamais le jeton lui-même."""
    return hashlib.sha256(jeton.encode()).hexdigest()


def nouveau_jeton() -> str:
    return secrets.token_urlsafe(32)


class GestionnaireUtilisateurs(UserManager):
    def create_superuser(self, *args, **kwargs):
        raise TypeError(
            "Pas de super-utilisateur Django : les droits viennent des rôles (0.0.4). "
            "Utiliser la commande creer_utilisateur."
        )


class Utilisateur(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    username = models.CharField(
        "identifiant", max_length=150, unique=True, validators=[valider_identifiant]
    )
    email = models.EmailField("courriel", blank=True)
    pays_principal = models.ForeignKey(
        "socle.Pays",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Vide pour les comptes du siège (RG-002, RG-003).",
    )
    langue = models.CharField(max_length=2, choices=CHOIX_LANGUES, default="fr")
    #: NOT-005 (0.8.6) : les types de notification que la personne ne veut plus recevoir en
    #: push ; le centre les garde tous. Les obligatoires n'y entrent jamais.
    push_coupes = models.JSONField(default=list, blank=True)
    echecs_connexion = models.PositiveSmallIntegerField(default=0, editable=False)
    verrouille_jusqua = models.DateTimeField(null=True, blank=True, editable=False)

    objects = GestionnaireUtilisateurs()

    class Meta:
        verbose_name = "utilisateur"
        ordering = ["last_name", "first_name", "username"]
        constraints = [
            models.UniqueConstraint(
                fields=["email"], condition=~models.Q(email=""), name="courriel_unique"
            )
        ]

    def delete(self, *args, **kwargs):
        raise TypeError("Un utilisateur est désactivé, jamais supprimé (RG-007).")

    @property
    def est_siege(self) -> bool:
        return self.pays_principal_id is None

    @property
    def est_verrouille(self) -> bool:
        return self.verrouille_jusqua is not None and self.verrouille_jusqua > timezone.now()


class Appareil(models.Model):
    """Téléphone enregistré à la première connexion mobile (USR-006).

    L'identifiant d'installation est tiré au hasard par l'application et gardé
    dans son magasin sécurisé. Un appareil révoqué ne peut plus se connecter
    ni rafraîchir sa session, donc plus synchroniser (CA2).
    """

    class Plateforme(models.TextChoices):
        ANDROID = "android", "Android"
        IOS = "ios", "iOS"
        WEB = "web", "Web"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.PROTECT, related_name="appareils")
    identifiant_installation = models.CharField(max_length=64)
    plateforme = models.CharField(max_length=10, choices=Plateforme.choices)
    systeme = models.CharField("version du système", max_length=60, blank=True)
    modele = models.CharField(max_length=80, blank=True)
    version_app = models.CharField("version de l'application", max_length=20, blank=True)
    cree_le = models.DateTimeField(default=timezone.now, editable=False)
    #: Dernier échange avec le serveur (connexion ou rafraîchissement). La synchronisation
    #: des données arrive au cycle 0.8 ; ce contact en tient lieu jusque-là.
    dernier_contact = models.DateTimeField(default=timezone.now)
    revoque_le = models.DateTimeField(null=True, blank=True)
    revoque_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    #: NOT-002 (0.8.5) : l'adresse push d'Expo de ce téléphone, oubliée à la déconnexion et à
    #: la révocation.
    jeton_push = models.CharField(max_length=200, blank=True)
    jeton_push_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-dernier_contact"]
        constraints = [
            models.UniqueConstraint(
                fields=["utilisateur", "identifiant_installation"], name="appareil_unique"
            )
        ]

    def __str__(self):
        return f"{self.utilisateur} — {self.get_plateforme_display()} {self.modele}".strip()

    @property
    def est_revoque(self) -> bool:
        return self.revoque_le is not None


class JourDeContact(models.Model):
    """KPI-05 (0.9.7) : un jour où le téléphone d'un utilisateur a échangé avec le serveur
    (connexion ou rafraîchissement de session, ce que fait chaque synchronisation). Une ligne
    par personne et par jour, à la date de son pays : l'adoption se compte ainsi en jours de
    synchronisation par semaine, sans garder chaque échange."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name="+")
    jour = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["utilisateur", "jour"], name="jour_de_contact_unique")
        ]

    def __str__(self):
        return f"{self.utilisateur} — {self.jour}"


class Session(models.Model):
    """Session ouverte sur un client (portail ou mobile).

    Le jeton d'accès (JWT, 15 minutes) porte l'identifiant de session : une
    session révoquée invalide aussitôt ses jetons. Le jeton de
    rafraîchissement change à chaque usage ; présenter un ancien jeton
    signale un vol et révoque la session (architecture §11.1).
    """

    class Client(models.TextChoices):
        PORTAIL = "portail", "Portail web"
        MOBILE = "mobile", "Application mobile"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.PROTECT, related_name="sessions")
    client = models.CharField(max_length=10, choices=Client.choices)
    empreinte_rafraichissement = models.CharField(max_length=64, unique=True)
    empreinte_precedente = models.CharField(max_length=64, blank=True, db_index=True)
    cree_le = models.DateTimeField(default=timezone.now)
    utilisee_le = models.DateTimeField(default=timezone.now)
    expire_le = models.DateTimeField()
    revoquee_le = models.DateTimeField(null=True, blank=True)
    motif_revocation = models.CharField(max_length=40, blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    agent = models.CharField(max_length=300, blank=True)
    appareil = models.ForeignKey(
        Appareil, on_delete=models.PROTECT, null=True, blank=True, related_name="sessions"
    )
    #: Vrai si la session a été ouverte avec un code à usage unique (SEC-003).
    double_auth_validee = models.BooleanField(default=False)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["utilisateur", "revoquee_le"])]

    def __str__(self):
        return f"{self.utilisateur} — {self.client} — {self.cree_le:%Y-%m-%d %H:%M}"

    @property
    def est_active(self) -> bool:
        return self.revoquee_le is None and self.expire_le > timezone.now()


class JetonReinitialisation(models.Model):
    """Lien de récupération d'accès à usage unique, valable 30 minutes (USR-005)."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.PROTECT, related_name="+")
    empreinte = models.CharField(max_length=64, unique=True)
    cree_le = models.DateTimeField(default=timezone.now)
    expire_le = models.DateTimeField()
    utilise_le = models.DateTimeField(null=True, blank=True)
    demande_par_administrateur = models.BooleanField(default=False)

    class Meta:
        ordering = ["-cree_le"]

    def __str__(self):
        return f"Réinitialisation de {self.utilisateur} ({self.cree_le:%Y-%m-%d %H:%M})"

    @property
    def est_valide(self) -> bool:
        return self.utilise_le is None and self.expire_le > timezone.now()


class Role(models.TextChoices):
    """Les 9 rôles d'INNOV CRM (prd.md §6.1). Aucun autre rôle sans décision."""

    ADMIN_SIEGE = "admin_siege", "Administrateur du siège"
    DIRECTION_SIEGE = "direction_siege", "Direction du siège"
    RESPONSABLE_PAYS = "responsable_pays", "Responsable pays"
    ADMIN_PAYS = "admin_pays", "Administrateur pays"
    DF = "df", "DF"
    DM = "dm", "DM"
    SUPERVISEUR = "superviseur", "Superviseur"
    DELEGUE = "delegue", "Délégué"
    ADMIN_TECHNIQUE = "admin_technique", "Administrateur technique"


# Rôles portés par le siège ou la plateforme : sans pays (RG-002).
ROLES_SANS_PAYS = frozenset({Role.ADMIN_SIEGE, Role.DIRECTION_SIEGE, Role.ADMIN_TECHNIQUE})
# Rôles que seul l'administrateur du siège peut attribuer (ORG-002).
ROLES_DESIGNES_PAR_LE_SIEGE = frozenset({Role.RESPONSABLE_PAYS, Role.ADMIN_PAYS} | ROLES_SANS_PAYS)


class ReglageDO(models.Model):
    """Les droits que le siège a fermés à un compte DF, le DO (1.6.1, prd.md §14.85) : les clés
    des groupes de `perimetre.matrice.GROUPES_DROITS_DO`. Sans ligne, tout est ouvert."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.OneToOneField(
        Utilisateur, on_delete=models.PROTECT, related_name="reglage_do"
    )
    desactives = models.JSONField(default=list, blank=True)
    regle_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    modifie_le = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "réglage des droits du DO"

    def __str__(self):
        return f"droits du DO {self.utilisateur_id}"


class RoleUtilisateur(models.Model):
    """Rôle daté d'un utilisateur dans un pays (architecture §11.2).

    Un rôle n'est jamais supprimé : on le termine (fin), ce qui garde
    l'historique des désignations (ORG-002 CA2).
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.PROTECT, related_name="roles")
    pays = models.ForeignKey(
        "socle.Pays", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    debut = models.DateTimeField(default=timezone.now)
    fin = models.DateTimeField(null=True, blank=True)
    attribue_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    retire_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cree_le = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "rôle d'un utilisateur"
        ordering = ["-debut"]
        indexes = [
            models.Index(fields=["utilisateur", "fin"]),
            models.Index(fields=["pays", "role"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(role__in=sorted(ROLES_SANS_PAYS), pays__isnull=True)
                    | (~models.Q(role__in=sorted(ROLES_SANS_PAYS)) & models.Q(pays__isnull=False))
                ),
                name="role_pays_coherent",
            ),
            models.CheckConstraint(
                condition=models.Q(fin__isnull=True) | models.Q(fin__gte=models.F("debut")),
                name="role_fin_apres_debut",
            ),
        ]

    def __str__(self):
        portee = self.pays.code if self.pays_id else "siège"
        return f"{self.utilisateur} — {self.get_role_display()} ({portee})"

    def est_actif(self, a=None) -> bool:
        a = a or timezone.now()
        return self.debut <= a and (self.fin is None or self.fin > a)


class AffectationPays(models.Model):
    """Affectation supplémentaire d'un utilisateur dans un autre pays (ORG-009, RG-003).

    Accordée par le siège, datée (fin exclue, facultative) et motivée. Pendant
    l'affectation, l'utilisateur peut choisir ce pays comme pays actif ; ses
    rôles dans ce pays cessent avec elle.
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, related_name="affectations"
    )
    pays = models.ForeignKey("socle.Pays", on_delete=models.PROTECT, related_name="+")
    motif = models.CharField(max_length=300)
    debut = models.DateField()
    fin = models.DateField(null=True, blank=True)
    accorde_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    retire_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cree_le = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "affectation dans un pays"
        ordering = ["-debut"]
        indexes = [models.Index(fields=["utilisateur", "pays", "fin"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(fin__isnull=True) | models.Q(fin__gte=models.F("debut")),
                name="affectation_fin_apres_debut",
            )
        ]

    def __str__(self):
        return f"{self.utilisateur} — {self.pays_id} ({self.debut} → {self.fin or '…'})"

    def est_active(self, jour) -> bool:
        return self.debut <= jour and (self.fin is None or self.fin > jour)


class Transfert(models.Model):
    """Changement de pays principal autorisé par le siège (ORG-010, RG-004).

    L'historique (plannings, visites, rapports) reste dans le pays d'origine.
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    utilisateur = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, related_name="transferts"
    )
    pays_origine = models.ForeignKey("socle.Pays", on_delete=models.PROTECT, related_name="+")
    pays_destination = models.ForeignKey("socle.Pays", on_delete=models.PROTECT, related_name="+")
    motif = models.CharField(max_length=300)
    le = models.DateTimeField(default=timezone.now)
    autorise_par = models.ForeignKey(
        Utilisateur, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-le"]

    def __str__(self):
        return f"{self.utilisateur} : {self.pays_origine_id} → {self.pays_destination_id}"


class DoubleAuthentification(models.Model):
    """Code à usage unique par application d'authentification (TOTP, SEC-003).

    Le secret est chiffré en base ; les codes de secours ne sont gardés qu'en empreinte.
    `dernier_pas` empêche de rejouer un code déjà utilisé.
    """

    utilisateur = models.OneToOneField(
        Utilisateur, on_delete=models.PROTECT, primary_key=True, related_name="double_auth"
    )
    secret_chiffre = models.TextField()
    active_le = models.DateTimeField(null=True, blank=True)
    dernier_pas = models.BigIntegerField(default=0)
    codes_secours = models.JSONField(default=list, blank=True)
    cree_le = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "double authentification"

    def __str__(self):
        return f"{self.utilisateur} — {'active' if self.active_le else 'en attente'}"

    @property
    def est_active(self) -> bool:
        return self.active_le is not None

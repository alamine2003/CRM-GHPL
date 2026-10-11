"""Journal d'audit immuable (AUD-001, architecture §16.1).

Chaque événement porte l'auteur, ses rôles, le pays, l'action, l'objet, la date, le
contexte (adresse, appareil, client, référence de requête) et le résultat (CA1).
La base refuse toute modification, suppression ou troncature (CA2) : des déclencheurs
PostgreSQL l'imposent à tous les rôles, propriétaire compris.

Ni mot de passe, ni jeton, ni contenu de rapport n'y figure jamais.
"""

from django.db import models
from django.utils import timezone

from apps.socle.identifiants import uuid7


class EvenementAudit(models.Model):
    class Resultat(models.TextChoices):
        SUCCES = "succes", "Succès"
        ECHEC = "echec", "Échec"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    le = models.DateTimeField(default=timezone.now, editable=False)
    action = models.CharField(max_length=60)
    resultat = models.CharField(max_length=6, choices=Resultat.choices, default=Resultat.SUCCES)
    # Pas de contrainte de clé étrangère : l'audit doit survivre à tout, et rien ne
    # doit pouvoir le modifier en cascade.
    acteur = models.ForeignKey(
        "identite.Utilisateur",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
        db_constraint=False,
        related_name="+",
    )
    acteur_identifiant = models.CharField(max_length=150, blank=True)
    roles = models.JSONField(default=list, blank=True)
    pays = models.ForeignKey(
        "socle.Pays",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
        db_constraint=False,
        related_name="+",
    )
    objet_type = models.CharField(max_length=60, blank=True)
    objet_id = models.CharField(max_length=64, blank=True)
    details = models.JSONField(default=dict, blank=True)
    contexte = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "événement d'audit"
        ordering = ["-le"]
        indexes = [
            models.Index(fields=["pays", "le"]),
            models.Index(fields=["acteur", "le"]),
            models.Index(fields=["action", "le"]),
        ]

    def __str__(self):
        return f"{self.le:%Y-%m-%d %H:%M:%S} {self.action} {self.resultat}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Un événement d'audit ne se modifie jamais (AUD-001 CA2).")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Un événement d'audit ne se supprime jamais (AUD-001 CA2).")

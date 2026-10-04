"""Modèle utilisateur d'INNOV CRM.

Il est déclaré dès la version 0.0.2, avant toute migration du module
d'authentification de Django : changer de modèle utilisateur après coup
impose de refaire l'historique des migrations. Les comptes, la connexion et
les rôles arrivent en 0.0.3 et 0.0.4 (USR-001, USR-003).
"""

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.socle.identifiants import uuid7


class Utilisateur(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    pays_principal = models.ForeignKey(
        "socle.Pays",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Vide pour les comptes du siège (RG-002, RG-003).",
    )
    langue = models.CharField(
        max_length=2, choices=[("fr", "Français"), ("en", "Anglais")], default="fr"
    )

    class Meta:
        verbose_name = "utilisateur"
        ordering = ["last_name", "first_name", "username"]

    def delete(self, *args, **kwargs):
        raise TypeError("Un utilisateur est désactivé, jamais supprimé (RG-007).")

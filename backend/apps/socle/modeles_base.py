"""Modèles abstraits communs à toutes les tables métier (architecture §8).

Chaque enregistrement porte un identifiant UUID v7, un numéro de version
incrémenté à chaque écriture, ses horodatages UTC et une date d'archivage
(suppression logique, RG-005). Chaque écriture ajoute une ligne au journal
des changements, qui servira à la synchronisation mobile (architecture §14).
"""

from django.db import models, transaction
from django.utils import timezone

from .identifiants import uuid7


class ModeleBase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    version = models.PositiveIntegerField(default=0, editable=False)
    cree_le = models.DateTimeField(default=timezone.now, editable=False)
    modifie_le = models.DateTimeField(default=timezone.now, editable=False)
    archive_le = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        creation = self._state.adding
        self.version += 1
        self.modifie_le = timezone.now()
        champs = kwargs.get("update_fields")
        if champs is not None:
            kwargs["update_fields"] = {*champs, "version", "modifie_le"}
        with transaction.atomic():
            super().save(*args, **kwargs)
            from .models import JournalChangement

            JournalChangement.objects.create(
                pays_id=self.pays_du_journal().pk,
                entite=self._meta.label_lower,
                entite_id=self.pk,
                version=self.version,
                operation=JournalChangement.Operation.CREATION
                if creation
                else JournalChangement.Operation.MODIFICATION,
            )

    def delete(self, *args, **kwargs):
        raise TypeError("Suppression physique interdite (RG-005) : utiliser archiver().")

    def archiver(self) -> None:
        """Suppression logique (RG-005) : l'objet reste lisible dans l'historique."""
        if self.archive_le is None:
            self.archive_le = timezone.now()
            self.save(update_fields=["archive_le"])

    @property
    def est_archive(self) -> bool:
        return self.archive_le is not None

    def pays_du_journal(self):
        """Pays auquel rattacher la ligne du journal des changements."""
        raise NotImplementedError


class ModeleDePays(ModeleBase):
    """Donnée métier rattachée à un pays ; ce rattachement ne change jamais (RG-001)."""

    pays = models.ForeignKey("socle.Pays", on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            ancien = type(self).objects.filter(pk=self.pk).values_list("pays_id", flat=True).first()
            if ancien is not None and ancien != self.pays_id:
                raise ValueError("Le pays d'un objet ne change jamais (RG-001).")
        super().save(*args, **kwargs)

    def pays_du_journal(self):
        return self.pays

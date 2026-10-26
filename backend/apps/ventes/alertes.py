"""Alerte « objectif de ventes en retard » (1.8.0, prd.md §14.89).

À la fin d'un mois, un réseau dont le cumul de l'année est sous l'attendu de ce mois est signalé
au DM du réseau et à l'administrateur pays (à défaut, au siège : `recours_du_pays`). L'alerte ne
part qu'une fois les ventes du mois arrivées dans le pays (import ou saisie), et une seule fois
par objectif et par mois. Elle passe avec les autres échéances (`planning.echeances.executer`).
"""

from datetime import timedelta

from django.db.models import Q

from apps.identite.models import Role, RoleUtilisateur, Utilisateur
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier_une_fois
from apps.organisation.models import PerimetreReseau, actif_le
from apps.organisation.services import recours_du_pays
from apps.socle.services import aujourdhui

from .models import ObjectifVente, Vente
from .objectifs import suivi


def _dm_du_reseau(pays, reseau, jour) -> set:
    dm = RoleUtilisateur.objects.filter(
        Q(fin__isnull=True) | Q(fin__date__gt=jour), role=Role.DM, pays=pays,
        debut__date__lte=jour, utilisateur__is_active=True,
    ).values("utilisateur_id")  # fmt: skip
    return set(
        PerimetreReseau.objects.filter(
            actif_le(jour), reseau=reseau, utilisateur__in=dm
        ).values_list("utilisateur_id", flat=True)
    )


def objectifs_en_retard(pays, maintenant=None) -> int:
    """Les objectifs de réseau en retard à la fin du mois écoulé ; rend le nombre d'alertes."""
    jour = aujourdhui(pays)
    mois = (jour.replace(day=1) - timedelta(days=1)).replace(day=1)
    if not Vente.objects.filter(pays=pays, mois=mois, archive_le__isnull=True).exists():
        return 0
    objectifs = ObjectifVente.objects.filter(
        pays=pays, annee=mois.year, archive_le__isnull=True, produit__isnull=True,
        delegue__isnull=True,
    ).select_related("reseau", "pays")  # fmt: skip
    envoyees = 0
    recours = None
    for objectif in objectifs:
        etat = suivi(objectif, mois.month)
        if etat["realise"] >= etat["attendu"]:
            continue
        if recours is None:
            recours = recours_du_pays(pays, jour)
        destinataires = Utilisateur.objects.filter(
            pk__in=_dm_du_reseau(pays, objectif.reseau, jour) | recours
        )
        for destinataire in destinataires:
            if notifier_une_fois(
                destinataire, TypeNotification.OBJECTIF_VENTES_RETARD, pays,
                cle=f"objectif-ventes:{objectif.pk}:{mois:%Y-%m}",
                objectif=str(objectif.pk), reseau=objectif.reseau.libelle,
                mois=f"{mois:%Y-%m}", taux=etat["taux_attendu"],
            ):  # fmt: skip
                envoyees += 1
    return envoyees

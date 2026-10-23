"""Ce que chacun voit des ventes (architecture §11.2) : le siège (un pays choisi), le responsable
et l'administrateur pays voient tout le pays ; le DF (rôle du DO), le DM et le superviseur, les
ventes des postes de leur périmètre. Une ligne sans poste ne se voit qu'au niveau du pays."""

from django.db.models import QuerySet

from apps.organisation.selecteurs import postes_visibles
from apps.perimetre.matrice import PAYS_CONSULTATION, SIEGE
from apps.perimetre.perimetre import Perimetre

from .models import Client, Vente


def lignes_visibles(perimetre: Perimetre) -> QuerySet:
    lignes = perimetre.filtrer_par_pays(Vente.objects.filter(archive_le__isnull=True))
    if perimetre.roles & (SIEGE | PAYS_CONSULTATION):
        return lignes
    return lignes.filter(poste__in=postes_visibles(perimetre))


def clients_du_pays(perimetre: Perimetre) -> QuerySet:
    return perimetre.filtrer_par_pays(Client.objects.filter(archive_le__isnull=True))

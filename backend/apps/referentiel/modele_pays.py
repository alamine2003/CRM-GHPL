"""Modèle sénégalais appliqué aux autres pays (1.1.0, prd.md §14.81).

Décision du 12 octobre 2026 (responsable produit) : « jusqu'à nouvel ordre », chaque pays reprend
la structure commerciale d'un pays modèle (le Sénégal) : listes de valeurs, gammes (divisions),
réseaux, produits, portefeuilles et paramètres. Ce qui est propre au terrain n'est jamais copié :
zones, secteurs, localités, établissements, prospects, postes et personnes.

La copie est idempotente : ce que le pays cible a déjà (même code) est gardé tel quel.
"""

from collections import Counter

from django.db import transaction

from apps.organisation import services as org
from apps.organisation.models import Division, Reseau
from apps.socle.models import ParametrePays, Pays
from apps.socle.services import aujourdhui, definir_parametre

from .models import Produit, Valeur
from .services import creer_produit, creer_valeur, definir_portefeuille, portefeuille_actif


def _actifs(modele, pays):
    return modele.objects.filter(pays=pays, archive_le__isnull=True)


@transaction.atomic
def appliquer_modele(source: Pays, cible: Pays) -> Counter:
    """Copie la structure commerciale de `source` dans `cible` ; renvoie les compteurs."""
    bilan: Counter = Counter()

    # Listes de valeurs : les parents avant les enfants (spécialités, types…).
    valeurs = {(v.liste, v.code): v for v in _actifs(Valeur, cible)}
    sources = sorted(_actifs(Valeur, source), key=lambda v: (v.parent_id is not None, v.ordre))
    for v in sources:
        if (v.liste, v.code) in valeurs:
            continue
        parent = valeurs.get((v.parent.liste, v.parent.code)) if v.parent_id else None
        valeurs[(v.liste, v.code)] = creer_valeur(
            cible, v.liste, v.libelle, code=v.code, ordre=v.ordre, parent=parent
        )
        bilan["valeurs"] += 1

    divisions = {d.code: d for d in _actifs(Division, cible)}
    for d in _actifs(Division, source):
        if d.code not in divisions:
            divisions[d.code] = org.creer_division(cible, d.code, d.libelle)
            bilan["gammes"] += 1

    reseaux = {r.code: r for r in _actifs(Reseau, cible)}
    for r in _actifs(Reseau, source).select_related("division"):
        if r.code not in reseaux:
            reseaux[r.code] = org.creer_reseau(cible, divisions[r.division.code], r.code, r.libelle)
            bilan["reseaux"] += 1

    produits = {p.code: p for p in _actifs(Produit, cible)}
    for p in _actifs(Produit, source).select_related("classe"):
        if p.code not in produits:
            classe = valeurs.get((p.classe.liste, p.classe.code)) if p.classe_id else None
            produits[p.code] = creer_produit(cible, p.libelle, p.code, classe)
            bilan["produits"] += 1

    jour_source = aujourdhui(source)
    for r in _actifs(Reseau, source):
        cible_reseau = reseaux[r.code]
        if portefeuille_actif([cible_reseau], aujourdhui(cible)).exists():
            continue  # un portefeuille déjà défini dans le pays n'est pas remplacé
        liens = portefeuille_actif([r], jour_source).select_related("produit")
        voulus = [produits[lien.produit.code] for lien in liens]
        if voulus:
            definir_portefeuille(cible_reseau, voulus)
            bilan["portefeuilles"] += 1

    deja = set(ParametrePays.objects.filter(pays=cible).values_list("cle", flat=True))
    vus: set[str] = set()
    for p in ParametrePays.objects.filter(pays=source).order_by("cle", "-debut"):
        if p.cle in vus or p.cle in deja:
            continue
        vus.add(p.cle)
        definir_parametre(cible, p.cle, p.valeur)
        bilan["parametres"] += 1
    return bilan

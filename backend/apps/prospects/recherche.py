"""Recherche, filtres, tri et pagination des fiches (PRP-005).

- CA1 : la recherche tolère accents et casse (nom normalisé, `unaccent`).
- CA2 : les résultats ne contiennent que des fiches du pays actif et du périmètre :
  l'administration du pays et le siège cherchent dans tout le pays ; le délégué, le superviseur,
  le DM et le DF dans les secteurs de leurs postes (architecture §11.2), leurs listes cibles et
  les fiches qu'ils ont créées. Un prospect hors secteur reste planifiable (RG-024) : la portée
  « pays » se demande explicitement.
- CA3 : 20 résultats par page par défaut, 100 au plus.
"""

from django.db.models import F, Q, QuerySet
from django.db.models.functions import Lower
from django.utils.translation import gettext as _

from apps.organisation.models import Secteur
from apps.organisation.selecteurs import postes_visibles
from apps.perimetre.perimetre import Perimetre
from apps.referentiel.models import Liste, Valeur
from apps.socle.erreurs import ErreurMetier

from .models import Cible, Exercice, StatutFiche

TAILLE_PAGE = 20
TAILLE_MAX = 100


def _voit_tout(perimetre: Perimetre) -> bool:
    from .services import VOIENT_TOUT

    return bool(perimetre.roles & VOIENT_TOUT)


def _postes_et_secteurs(perimetre: Perimetre):
    postes = postes_visibles(perimetre).filter(archive_le__isnull=True)
    secteurs = Secteur.objects.filter(postes__in=postes).values("pk")
    return postes.values("pk"), secteurs


def prospects_du_perimetre(qs: QuerySet, perimetre: Perimetre) -> QuerySet:
    if _voit_tout(perimetre):
        return qs
    postes, secteurs = _postes_et_secteurs(perimetre)
    exercent = Exercice.objects.filter(fin__isnull=True, etablissement__secteur__in=secteurs)
    cibles = Cible.objects.filter(fin__isnull=True, poste__in=postes)
    return qs.filter(
        Q(secteur__in=secteurs)
        | Q(pk__in=exercent.values("prospect_id"))
        | Q(pk__in=cibles.values("prospect_id"))
        | Q(cree_par=perimetre.utilisateur)
    )


def etablissements_du_perimetre(qs: QuerySet, perimetre: Perimetre) -> QuerySet:
    if _voit_tout(perimetre):
        return qs
    _postes, secteurs = _postes_et_secteurs(perimetre)
    return qs.filter(Q(secteur__in=secteurs) | Q(cree_par=perimetre.utilisateur))


def statut(qs: QuerySet, valeur: str | None) -> QuerySet:
    if valeur:
        return qs.filter(statut=valeur)
    return qs.exclude(statut__in=[StatutFiche.ARCHIVE, StatutFiche.FUSIONNE])


def filtrer_prospects(qs: QuerySet, p) -> QuerySet:
    """Filtres de la liste : type, spécialité, potentiel, activité, secteur, localité (par la
    fiche ou par un lieu d'exercice en cours), délégué (liste cible de son poste), sans lieu."""
    for champ, cle in (("type_id", "type"), ("specialite_id", "specialite"),
                       ("potentiel", "potentiel"), ("activite", "activite")):  # fmt: skip
        if p.get(cle):
            qs = qs.filter(**{champ: p[cle]})
    en_cours = Exercice.objects.filter(fin__isnull=True)
    if p.get("secteur"):
        exercent = en_cours.filter(etablissement__secteur_id=p["secteur"])
        qs = qs.filter(Q(secteur_id=p["secteur"]) | Q(pk__in=exercent.values("prospect_id")))
    if p.get("localite"):
        exercent = en_cours.filter(etablissement__localite_id=p["localite"])
        qs = qs.filter(Q(localite_id=p["localite"]) | Q(pk__in=exercent.values("prospect_id")))
    if p.get("poste"):
        cibles = Cible.objects.filter(fin__isnull=True, poste_id=p["poste"])
        qs = qs.filter(pk__in=cibles.values("prospect_id"))
    if p.get("sans_lieu") == "1":
        qs = qs.exclude(pk__in=en_cours.values("prospect_id"))
    # Qualité des données (0.1.9) : chaque indicateur ouvre la liste des fiches concernées.
    if p.get("sans_telephone") == "1":
        qs = qs.filter(telephone_mobile="", telephone_pro="")
    if p.get("sans_specialite") == "1":
        qs = sans_specialite(qs)
    if p.get("hors_cible") == "1":
        qs = qs.exclude(pk__in=Cible.objects.filter(fin__isnull=True).values("prospect_id"))
    return qs


def sans_specialite(qs: QuerySet) -> QuerySet:
    """Fiches sans spécialité alors que leur type en propose (un médecin sans spécialité ;
    une sage-femme, dont le type n'en a pas, n'est pas comptée)."""
    types = Valeur.objects.filter(liste=Liste.SPECIALITE, archive_le__isnull=True,
                                  parent__isnull=False).values("parent_id")  # fmt: skip
    return qs.filter(specialite__isnull=True, type_id__in=types)


def filtrer_etablissements(qs: QuerySet, p) -> QuerySet:
    for champ, cle in (("type_id", "type"), ("secteur_id", "secteur"),
                       ("localite_id", "localite"), ("activite", "activite")):  # fmt: skip
        if p.get(cle):
            qs = qs.filter(**{champ: p[cle]})
    if p.get("sans_coordonnees") == "1":
        qs = qs.filter(latitude__isnull=True)
    return qs


TRIS_PROSPECTS = {
    "nom": (Lower("nom"), Lower("prenom")),
    "potentiel": ("potentiel", Lower("nom"), Lower("prenom")),
    "specialite": (F("specialite__libelle").asc(nulls_last=True), Lower("nom")),
    "secteur": (F("secteur__libelle").asc(nulls_last=True), Lower("nom")),
    "recents": ("-cree_le", Lower("nom")),
}
TRIS_ETABLISSEMENTS = {
    "nom": (Lower("nom"),),
    "type": ("type__libelle", Lower("nom")),
    "secteur": ("secteur__libelle", Lower("nom")),
    "recents": ("-cree_le", Lower("nom")),
}


def trier(qs: QuerySet, valeur: str | None, tris: dict) -> QuerySet:
    return qs.order_by(*tris.get(valeur or "nom", tris["nom"]))


def _entier(valeur, defaut: int) -> int:
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return defaut


def paginer(qs: QuerySet, p) -> tuple[list, dict]:
    """CA3 : 20 résultats par page par défaut. Une page au-delà de la dernière est vide."""
    taille = min(max(_entier(p.get("taille"), TAILLE_PAGE), 1), TAILLE_MAX)
    page = max(_entier(p.get("page"), 1), 1)
    total = qs.count()
    debut = (page - 1) * taille
    return list(qs[debut : debut + taille]), {"total": total, "page": page, "taille": taille}


def dans_portee(qs: QuerySet, p, perimetre: Perimetre, restreindre) -> QuerySet:
    """Portée « perimetre » par défaut (CA2) ; « pays » sur demande explicite (RG-024)."""
    valeur = p.get("portee") or "perimetre"
    if valeur not in ("perimetre", "pays"):
        raise ErreurMetier("portee_invalide", _("Portée de recherche inconnue."), champ="portee")
    return qs if valeur == "pays" else restreindre(qs, perimetre)

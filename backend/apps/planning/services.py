"""Jours fériés (ORG-012), planning de la semaine (PLN-001) et visites planifiées (PLN-002)."""

from datetime import date

from django.db import IntegrityError, transaction
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import Utilisateur
from apps.organisation.models import Occupation, actif_le
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .calendrier import jours_de_la_semaine, lundi
from .etats import MODIFIABLES
from .models import JourFerie, Planning, Visite


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(action, objet=objet, pays=objet.pays, details=details)


# --- Jours fériés (ORG-012) -------------------------------------------------------------------


def _exiger_a_venir(pays: Pays, jour: date) -> None:
    """CA2 : une date se modifie jusqu'à la veille ; le jour même, elle est acquise."""
    if jour <= aujourdhui(pays):
        raise ErreurMetier(
            "jour_ferie_passe",
            _(
                "Un jour férié ne se modifie plus à partir de son jour : seule une date à venir "
                "peut changer."
            ),  # fmt: skip
            status.HTTP_409_CONFLICT,
            champ="date",
        )


def _enregistrer(jour: JourFerie) -> JourFerie:
    try:
        with transaction.atomic():
            jour.save()
    except IntegrityError as erreur:
        raise ErreurMetier(
            "jour_ferie_existant",
            _("Ce jour est déjà férié dans ce pays."),
            status.HTTP_409_CONFLICT,
            champ="date",
        ) from erreur
    return jour


@transaction.atomic
def creer_jour_ferie(pays: Pays, *, date: date, libelle: str, variable: bool = False):
    libelle = libelle.strip()
    if not libelle:
        raise ErreurMetier("champ_requis", _("Le libellé est obligatoire."), champ="libelle")
    jour = _enregistrer(JourFerie(pays=pays, date=date, libelle=libelle, variable=variable))
    _auditer("jour_ferie.creation", jour, date=str(date), libelle=libelle, variable=variable)
    return jour


@transaction.atomic
def modifier_jour_ferie(jour: JourFerie, **champs) -> JourFerie:
    _exiger_a_venir(jour.pays, jour.date)
    if "date" in champs:
        _exiger_a_venir(jour.pays, champs["date"])
    if "libelle" in champs:
        champs["libelle"] = champs["libelle"].strip()
        if not champs["libelle"]:
            raise ErreurMetier("champ_requis", _("Le libellé est obligatoire."), champ="libelle")
    avant = {k: str(getattr(jour, k)) for k in champs}
    for cle, valeur in champs.items():
        setattr(jour, cle, valeur)
    _enregistrer(jour)
    _auditer("jour_ferie.modification", jour, avant=avant,
             apres={k: str(v) for k, v in champs.items()})  # fmt: skip
    return jour


@transaction.atomic
def retirer_jour_ferie(jour: JourFerie) -> JourFerie:
    _exiger_a_venir(jour.pays, jour.date)
    jour.archiver()
    _auditer("jour_ferie.retrait", jour, date=str(jour.date), libelle=jour.libelle)
    return jour


# --- Planning de la semaine (PLN-001) --------------------------------------------------------


def occupe_un_poste(utilisateur: Utilisateur, pays: Pays, jour: date) -> bool:
    return Occupation.objects.filter(
        actif_le(jour), utilisateur=utilisateur, poste__pays=pays, poste__archive_le__isnull=True
    ).exists()


@transaction.atomic
def creer_planning(pays: Pays, delegue: Utilisateur, semaine: date) -> Planning:
    """CA1 : un seul planning par délégué et par semaine (RG-012) ; la semaine en cours ou
    une semaine à venir, pour qui occupe un poste (prd.md §6.3)."""
    if semaine.weekday() != 0:
        raise ErreurMetier(
            "semaine_invalide", _("Une semaine se désigne par son lundi."), champ="semaine"
        )
    if semaine < lundi(aujourdhui(pays)):
        raise ErreurMetier(
            "semaine_passee", _("Une semaine passée ne se planifie plus."), champ="semaine"
        )
    if not occupe_un_poste(delegue, pays, semaine):
        raise ErreurMetier(
            "sans_poste",
            _("Vous n'occupez aucun poste cette semaine : pas de planning à préparer."),
            status.HTTP_403_FORBIDDEN,
        )
    existant = Planning.objects.filter(delegue=delegue, semaine=semaine).first()
    if existant:
        raise ErreurMetier(
            "planning_existant",
            _("Un planning existe déjà pour cette semaine."),
            status.HTTP_409_CONFLICT,
            planning=str(existant.pk),
        )
    try:
        with transaction.atomic():
            planning = Planning.objects.create(pays=pays, delegue=delegue, semaine=semaine)
    except IntegrityError as erreur:  # deux créations simultanées : la contrainte tranche
        raise ErreurMetier(
            "planning_existant",
            _("Un planning existe déjà pour cette semaine."),
            status.HTTP_409_CONFLICT,
        ) from erreur
    _auditer("planning.creation", planning, semaine=str(semaine))
    return planning


# --- Visites planifiées (PLN-002) ------------------------------------------------------------

#: Champs exigés d'une visite à la soumission (PLN-002 CA1), dans l'ordre de la fiche ; la
#: date est toujours connue (une visite est posée sur un jour).
CHAMPS_EXIGES = ("heure", "prospect", "etablissement", "reseau", "objectif")


def champs_manquants(visite: Visite) -> list[str]:
    return [champ for champ in CHAMPS_EXIGES if not getattr(visite, champ)]


def exiger_complet(planning: Planning) -> None:
    """CA1 : la soumission (0.2.8) refuse un planning dont une visite est incomplète, avec la
    liste des champs manquants de chacune."""
    incompletes = [
        {"visite": str(v.pk), "date": str(v.date), "manquants": manquants}
        for v in planning.visites.filter(archive_le__isnull=True)
        if (manquants := champs_manquants(v))
    ]
    if incompletes:
        raise ErreurMetier(
            "planning_incomplet",
            _("Des visites sont incomplètes : complétez les champs indiqués avant de soumettre."),
            status.HTTP_400_BAD_REQUEST,
            visites=incompletes,
        )


def _exiger_modifiable(planning: Planning) -> None:
    if planning.statut not in MODIFIABLES:
        raise ErreurMetier(
            "planning_non_modifiable",
            _("Ce planning n'est plus modifiable dans son état actuel."),
            status.HTTP_409_CONFLICT,
        )


def _exiger_jour_planifiable(planning: Planning, jour: date) -> None:
    """PLN-001 CA2 : un jour de la semaine du planning, ouvré et non férié."""
    jours = {j.date: j for j in jours_de_la_semaine(planning.pays, planning.semaine)}
    if jour not in jours:
        raise ErreurMetier(
            "jour_hors_semaine",
            _("Ce jour n'est pas un jour ouvré de la semaine du planning."),
            champ="date",
        )
    if not jours[jour].planifiable:
        raise ErreurMetier(
            "jour_ferie", _("Ce jour est férié : il ne se planifie pas."), champ="date"
        )


def postes_de_la_semaine(planning: Planning):
    """Postes occupés par l'auteur du planning pendant sa semaine (réseaux de ses visites)."""
    from apps.organisation.models import Poste

    return (
        Poste.objects.filter(
            actif_le(planning.semaine, "occupations__"),
            occupations__utilisateur=planning.delegue,
            pays=planning.pays,
            archive_le__isnull=True,
        )
        .prefetch_related("reseaux")
        .distinct()
    )


def _poste_du_reseau(planning: Planning, reseau) -> object:
    for poste in postes_de_la_semaine(planning):
        if any(r.pk == reseau.pk for r in poste.reseaux.all()):
            return poste
    raise ErreurMetier(
        "reseau_invalide",
        _("Ce réseau n'est pas celui d'un poste que vous occupez cette semaine."),
        champ="reseau",
    )


def _reseau_par_defaut(planning: Planning):
    """Un seul réseau possible : il est retenu d'office (le délégué n'a rien à choisir)."""
    reseaux = {r.pk: r for p in postes_de_la_semaine(planning) for r in p.reseaux.all()}
    return next(iter(reseaux.values())) if len(reseaux) == 1 else None


def _appliquer(visite: Visite, champs: dict) -> None:
    if "date" in champs:
        _exiger_jour_planifiable(visite.planning, champs["date"])
    if champs.get("reseau") is not None:
        visite.poste = _poste_du_reseau(visite.planning, champs["reseau"])
    elif "reseau" in champs:
        visite.poste = None
    for cle in ("date", "heure", "prospect", "etablissement", "reseau"):
        if cle in champs:
            setattr(visite, cle, champs[cle])
    for cle in ("objectif", "note"):
        if cle in champs:
            setattr(visite, cle, (champs[cle] or "").strip())


@transaction.atomic
def ajouter_visite(planning: Planning, **champs) -> Visite:
    _exiger_modifiable(planning)
    visite = Visite(pays=planning.pays, planning=planning, date=champs["date"])
    if "reseau" not in champs:
        champs["reseau"] = _reseau_par_defaut(planning)
    _appliquer(visite, champs)
    visite.save()
    _auditer("visite.planification", visite, planning=str(planning.pk), date=str(visite.date))
    return visite


@transaction.atomic
def modifier_visite(visite: Visite, **champs) -> Visite:
    _exiger_modifiable(visite.planning)
    _appliquer(visite, champs)
    visite.save()
    return visite


@transaction.atomic
def retirer_visite(visite: Visite) -> Visite:
    _exiger_modifiable(visite.planning)
    visite.archiver()
    _auditer("visite.retrait", visite, planning=str(visite.planning_id), date=str(visite.date))
    return visite

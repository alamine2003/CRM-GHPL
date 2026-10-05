"""Jours fériés (ORG-012), planning de la semaine (PLN-001), visites planifiées (PLN-002), ordre
de la journée, passages (PLN-003) et absences (PLN-009)."""

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
from .models import Absence, JourFerie, Passage, Periode, Planning, TypeAbsence, Visite


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
        _exiger_present(visite.planning, champs["date"])
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


def _visites_du_jour(planning: Planning, jour: date):
    return planning.visites.filter(archive_le__isnull=True, date=jour).order_by("ordre", "cree_le")


def ranger(planning: Planning, jour: date, ordre: list | None = None) -> None:
    """Ordre de la journée (0.2.3). Les visites d'un passage restent ensemble ; les visites à
    heure fixe occupent leurs places dans l'ordre chronologique, celles sans heure gardent la
    place que le délégué leur a donnée (`ordre`, liste d'identifiants de visites)."""
    visites = list(_visites_du_jour(planning, jour))
    if ordre is not None:
        rang = {str(i): n for n, i in enumerate(ordre)}
        visites.sort(key=lambda v: rang.get(str(v.pk), len(rang)))
    # Unités : une visite seule, ou toutes les visites d'un passage (à la place de la première).
    unites: list[list[Visite]] = []
    par_passage: dict = {}
    for v in visites:
        if v.passage_id is None:
            unites.append([v])
        elif v.passage_id in par_passage:
            par_passage[v.passage_id].append(v)
        else:
            par_passage[v.passage_id] = [v]
            unites.append(par_passage[v.passage_id])
    places = [n for n, u in enumerate(unites) if u[0].heure is not None]
    chronologiques = sorted((unites[n] for n in places), key=lambda u: u[0].heure)
    for n, unite in zip(places, chronologiques, strict=True):
        unites[n] = unite
    rang = 0
    for unite in unites:
        for v in unite:
            rang += 1
            if v.ordre != rang:
                Visite.objects.filter(pk=v.pk).update(ordre=rang)


def _dernier_rang(planning: Planning, jour: date) -> int:
    derniere = _visites_du_jour(planning, jour).order_by("-ordre").first()
    return derniere.ordre if derniere else 0


def _accorder_passage(visite: Visite) -> Passage | None:
    """Une visite quitte son passage si elle change de jour ou de lieu, et rejoint d'office le
    passage de son nouveau lieu ce jour-là ; elle en prend l'heure. Rend le passage quitté."""
    ancien = visite.passage
    if ancien and (
        ancien.date != visite.date or ancien.etablissement_id != visite.etablissement_id
    ):
        visite.passage = None
    if visite.passage is None and visite.etablissement_id:
        visite.passage = Passage.objects.filter(
            planning=visite.planning, date=visite.date, etablissement_id=visite.etablissement_id,
            archive_le__isnull=True,
        ).first()  # fmt: skip
    if visite.passage is not None:
        if visite.passage == ancien and visite.heure != ancien.heure:
            # L'heure d'une visite du passage est celle du passage : elle change pour toutes.
            ancien.heure = visite.heure
            ancien.save(update_fields=["heure", "modifie_le"])
            ancien.visites.filter(archive_le__isnull=True).update(heure=visite.heure)
        else:
            visite.heure = visite.passage.heure
    return ancien if ancien is not None and visite.passage != ancien else None


def _dissoudre_si_seul(passage: Passage | None) -> None:
    """Un passage n'a de sens qu'à partir de deux visites."""
    if passage is not None and passage.visites.filter(archive_le__isnull=True).count() < 2:
        passage.visites.update(passage=None)
        passage.archiver()


@transaction.atomic
def ajouter_visite(planning: Planning, **champs) -> Visite:
    _exiger_modifiable(planning)
    visite = Visite(pays=planning.pays, planning=planning, date=champs["date"])
    if "reseau" not in champs:
        champs["reseau"] = _reseau_par_defaut(planning)
    _appliquer(visite, champs)
    _accorder_passage(visite)
    visite.ordre = _dernier_rang(planning, visite.date) + 1
    visite.save()
    ranger(planning, visite.date)
    _auditer("visite.planification", visite, planning=str(planning.pk), date=str(visite.date))
    return visite


@transaction.atomic
def modifier_visite(visite: Visite, **champs) -> Visite:
    _exiger_modifiable(visite.planning)
    avant = visite.date
    _appliquer(visite, champs)
    quitte = _accorder_passage(visite)
    if visite.date != avant:
        visite.ordre = _dernier_rang(visite.planning, visite.date) + 1
    visite.save()
    _dissoudre_si_seul(quitte)
    ranger(visite.planning, visite.date)
    if visite.date != avant:
        ranger(visite.planning, avant)
    visite.refresh_from_db()
    return visite


@transaction.atomic
def retirer_visite(visite: Visite) -> Visite:
    _exiger_modifiable(visite.planning)
    passage = visite.passage
    visite.passage = None
    visite.save(update_fields=["passage", "modifie_le"])
    visite.archiver()
    _dissoudre_si_seul(passage)
    ranger(visite.planning, visite.date)
    _auditer("visite.retrait", visite, planning=str(visite.planning_id), date=str(visite.date))
    return visite


@transaction.atomic
def ordonner(planning: Planning, jour: date, visites: list) -> None:
    """Le délégué place ses visites dans la journée ; l'heure garde le dernier mot."""
    _exiger_modifiable(planning)
    du_jour = {str(v.pk) for v in _visites_du_jour(planning, jour)}
    if {str(v) for v in visites} != du_jour or len(visites) != len(du_jour):
        raise ErreurMetier(
            "ordre_invalide",
            _("L'ordre doit reprendre exactement les visites de ce jour."),
            champ="visites",
        )
    ranger(planning, jour, [str(v) for v in visites])


# --- Passages (PLN-003) -----------------------------------------------------------------------


@transaction.atomic
def regrouper(planning: Planning, visites: list[Visite]) -> Passage:
    """Regroupe en un passage des visites du même jour dans le même établissement. L'heure du
    passage est la plus matinale de ses visites ; un passage existant au même lieu les reçoit."""
    _exiger_modifiable(planning)
    if len({v.pk for v in visites}) < 2:
        raise ErreurMetier(
            "passage_trop_petit", _("Un passage regroupe au moins deux visites."), champ="visites"
        )
    lieux = {(v.date, v.etablissement_id) for v in visites}
    if len(lieux) != 1 or None in {e for _d, e in lieux}:
        raise ErreurMetier(
            "passage_disparate",
            _("Un passage regroupe des visites du même jour, dans le même établissement."),
            champ="visites",
        )
    jour, etablissement = lieux.pop()
    heures = [v.heure for v in visites if v.heure is not None]
    passage = Passage.objects.filter(
        planning=planning, date=jour, etablissement_id=etablissement, archive_le__isnull=True
    ).first()
    if passage is None:
        passage = Passage.objects.create(
            pays=planning.pays, planning=planning, date=jour, etablissement_id=etablissement,
            heure=min(heures) if heures else None,
        )  # fmt: skip
        _auditer("passage.creation", passage, planning=str(planning.pk), date=str(jour))
    Visite.objects.filter(pk__in=[v.pk for v in visites]).update(
        passage=passage, heure=passage.heure
    )
    ranger(planning, jour)
    return passage


@transaction.atomic
def dissocier(passage: Passage) -> Passage:
    """Les visites redeviennent indépendantes et gardent l'heure du passage."""
    _exiger_modifiable(passage.planning)
    passage.visites.update(passage=None)
    passage.archiver()
    _auditer("passage.dissociation", passage, planning=str(passage.planning_id),
             date=str(passage.date))  # fmt: skip
    ranger(passage.planning, passage.date)
    return passage


# --- Absences (PLN-009) -----------------------------------------------------------------------

#: Part de la journée travaillée selon les absences déclarées (CA1, RG-022) : une demi-journée
#: d'absence réduit de moitié les seuils du jour (contrôles en 0.2.4).
PART_ABSENTE = {Periode.JOURNEE: 1.0, Periode.MATIN: 0.5, Periode.APRES_MIDI: 0.5}


def part_travaillee(planning: Planning, jour: date) -> float:
    absences = planning.absences.filter(archive_le__isnull=True, date=jour)
    return max(0.0, 1.0 - sum(PART_ABSENTE[a.periode] for a in absences))


def _exiger_present(planning: Planning, jour: date) -> None:
    """Une journée entière d'absence ne reçoit pas de visite."""
    if planning.absences.filter(archive_le__isnull=True, date=jour,
                                periode=Periode.JOURNEE).exists():  # fmt: skip
        raise ErreurMetier(
            "jour_absent",
            _("Vous êtes absent toute cette journée : elle ne reçoit pas de visite."),
            champ="date",
        )


def _verifier_absence(absence: Absence) -> None:
    _exiger_jour_planifiable(absence.planning, absence.date)
    if absence.type == TypeAbsence.AUTRE and not absence.commentaire:
        raise ErreurMetier(
            "motif_requis",
            _("Précisez le motif d'une absence « autre »."),
            champ="commentaire",
        )
    autres = absence.planning.absences.filter(archive_le__isnull=True, date=absence.date).exclude(
        pk=absence.pk
    )
    if any(
        Periode.JOURNEE in (a.periode, absence.periode) or a.periode == absence.periode
        for a in autres
    ):
        raise ErreurMetier(
            "absence_chevauchement",
            _("Une absence est déjà déclarée sur cette période."),
            status.HTTP_409_CONFLICT,
            champ="periode",
        )
    if absence.periode == Periode.JOURNEE:
        nombre = _visites_du_jour(absence.planning, absence.date).count()
        if nombre:
            raise ErreurMetier(
                "absence_avec_visites",
                _("Des visites sont prévues ce jour-là : déplacez-les ou retirez-les d'abord."),
                status.HTTP_409_CONFLICT,
                champ="periode",
                visites=nombre,
            )


@transaction.atomic
def declarer_absence(planning: Planning, *, date: date, type: str, periode: str = Periode.JOURNEE,
                     commentaire: str = "") -> Absence:  # fmt: skip
    _exiger_modifiable(planning)
    absence = Absence(pays=planning.pays, planning=planning, date=date, type=type,
                      periode=periode, commentaire=(commentaire or "").strip())  # fmt: skip
    _verifier_absence(absence)
    absence.save()
    _auditer("absence.declaration", absence, planning=str(planning.pk), date=str(date),
             periode=periode, type=type)  # fmt: skip
    return absence


@transaction.atomic
def modifier_absence(absence: Absence, **champs) -> Absence:
    _exiger_modifiable(absence.planning)
    if "commentaire" in champs:
        champs["commentaire"] = (champs["commentaire"] or "").strip()
    for cle, valeur in champs.items():
        setattr(absence, cle, valeur)
    _verifier_absence(absence)
    absence.save()
    return absence


@transaction.atomic
def retirer_absence(absence: Absence) -> Absence:
    _exiger_modifiable(absence.planning)
    absence.archiver()
    _auditer("absence.retrait", absence, planning=str(absence.planning_id),
             date=str(absence.date))  # fmt: skip
    return absence

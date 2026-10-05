"""Jours fériés (ORG-012), planning de la semaine (PLN-001), visites planifiées (PLN-002), ordre
de la journée, passages (PLN-003) et activités connexes (PLN-009, PLN-018)."""

from datetime import date, datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import Utilisateur
from apps.organisation.models import Occupation, actif_le
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .calendrier import jours_de_la_semaine, jours_planifiables, lundi
from .etats import MODIFIABLES, StatutPlanning
from .models import (
    AVEC_VISITES,
    Activite,
    JourFerie,
    Passage,
    Periode,
    Planning,
    TypeActivite,
    VersionPlanning,
    Visite,
)


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


def _verrouiller(planning: Planning) -> None:
    """Sérialise les commandes sur un même planning (0.2.9) : une soumission et le rejeu de la
    file du téléphone, ou deux reprises lancées par un double clic, ne se croisent pas. Le
    statut est relu sous le verrou."""
    planning.statut = (
        Planning.objects.select_for_update().values_list("statut", flat=True).get(pk=planning.pk)
    )


def _exiger_modifiable(planning: Planning) -> None:
    _verrouiller(planning)
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


def _changer(visites, **champs) -> None:
    """Change quelques visites une à une, et non par `update()` : chacune garde sa version et
    sa ligne du journal des changements, dont la synchronisation tirera le fil (§13)."""
    for visite in visites:
        for cle, valeur in champs.items():
            setattr(visite, cle, valeur)
        visite.save(update_fields=list(champs))


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
                _changer([v], ordre=rang)


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
            _changer(ancien.visites.filter(archive_le__isnull=True).exclude(pk=visite.pk),
                     heure=visite.heure)  # fmt: skip
        else:
            visite.heure = visite.passage.heure
    return ancien if ancien is not None and visite.passage != ancien else None


def _dissoudre_si_seul(passage: Passage | None) -> None:
    """Un passage n'a de sens qu'à partir de deux visites."""
    if passage is not None and passage.visites.filter(archive_le__isnull=True).count() < 2:
        _changer(passage.visites.all(), passage=None)
        passage.archiver()


def _deja_envoye(modele, planning: Planning, identifiant):
    """Un objet créé hors connexion porte l'identifiant que lui a donné le téléphone (0.2.7,
    OFF-002 CA1) : renvoyé deux fois après une coupure, il n'est créé qu'une fois (OFF-003 CA2)."""
    if identifiant is None:
        return None
    existant = modele.objects.filter(pk=identifiant).first()
    if existant is not None and existant.planning_id != planning.pk:
        raise ErreurMetier(
            "identifiant_pris",
            _("Cet identifiant appartient déjà à un autre objet."),
            status.HTTP_409_CONFLICT,
        )
    return existant


@transaction.atomic
def ajouter_visite(planning: Planning, id=None, **champs) -> Visite:
    _verrouiller(planning)
    if existante := _deja_envoye(Visite, planning, id):
        return existante
    _exiger_modifiable(planning)
    visite = Visite(pays=planning.pays, planning=planning, date=champs["date"])
    if id is not None:
        visite.pk = id
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
    _auditer("visite.modification", visite, planning=str(visite.planning_id),
             champs=sorted(champs))  # fmt: skip
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


# --- Soumission (PLN-008) ---------------------------------------------------------------------


def echeance(planning: Planning) -> datetime:
    """Échéance de soumission (RG-013) : par défaut jeudi 18 h de la semaine précédente, à
    l'heure du pays ; jour et heure sont des paramètres du pays."""
    from zoneinfo import ZoneInfo

    from apps.socle.services import valeur_parametre

    regle = valeur_parametre(planning.pays, "echeance_soumission_planning")
    jour = planning.semaine - timedelta(days=7) + timedelta(days=regle["jour"] - 1)
    heure, minute = (int(x) for x in regle["heure"].split(":"))
    return datetime.combine(jour, time(heure, minute), tzinfo=ZoneInfo(planning.pays.fuseau))


def postes_sans_superviseur(planning: Planning) -> list:
    from apps.organisation.services import superviseur_du_poste

    return [p for p in postes_de_la_semaine(planning)
            if superviseur_du_poste(p, planning.semaine) is None]  # fmt: skip


def responsables(planning: Planning) -> set:
    """Responsables du planning cette semaine-là : le superviseur rattaché à chaque poste
    occupé, ou le DM pour le poste d'un superviseur-visiteur (RG-023)."""
    from apps.organisation.services import superviseur_du_poste

    return {
        r.pk
        for p in postes_de_la_semaine(planning)
        if (r := superviseur_du_poste(p, planning.semaine)) is not None
    }


def mode_de_decision(utilisateur, planning: Planning) -> str | None:
    """`direct` pour un responsable du poste, `remplacement` pour son remplaçant daté
    aujourd'hui (ORG-013, RG-020), sinon rien. Jamais sur son propre planning (PLN-017 CA1)."""
    from apps.organisation.services import remplaces_par

    from .models import ModeDecision

    if planning.delegue_id == utilisateur.pk:
        return None
    titulaires = responsables(planning)
    if utilisateur.pk in titulaires:
        return ModeDecision.DIRECT
    if any(r.pk in titulaires for r in remplaces_par(utilisateur, planning.pays)):
        return ModeDecision.REMPLACEMENT
    return None


def supervise(utilisateur, planning: Planning) -> bool:
    """Le planning est à la portée de cet utilisateur : responsable du poste, ou remplaçant."""
    return mode_de_decision(utilisateur, planning) is not None


def plannings_a_valider(superviseur, pays) -> list[Planning]:
    """PLN-011 : plannings soumis des délégués qu'il supervise cette semaine-là — et, pendant
    un remplacement, de ceux du superviseur remplacé (ORG-013 CA1) — du plus ancien au plus
    récent (CA1)."""
    from apps.organisation.services import remplaces_par

    titulaires = [superviseur.pk, *(r.pk for r in remplaces_par(superviseur, pays))]
    candidats = (
        Planning.objects.filter(pays=pays, statut=StatutPlanning.SOUMIS,
                                delegue__occupations__poste__rattachements__superviseur__in=titulaires)
        .exclude(delegue=superviseur)
        .select_related("delegue")
        .distinct()
    )  # fmt: skip
    return sorted((p for p in candidats if supervise(superviseur, p)), key=lambda p: p.soumis_le)


@transaction.atomic
def soumettre(planning: Planning) -> Planning:
    """PLN-008 : contrôle final, puis « Soumis au superviseur ». Après l'échéance, la soumission
    est acceptée et marquée en retard (CA1) ; le superviseur le voit (RG-016)."""
    from . import controles
    from .etats import exiger_transition

    # Seul un planning en préparation ou à réviser se soumet ici ; la modification d'un planning
    # approuvé (approuvé → soumis) relève du cycle 0.3.
    _exiger_modifiable(planning)
    exiger_transition(planning.statut, StatutPlanning.SOUMIS)
    if sans := postes_sans_superviseur(planning):
        raise ErreurMetier(
            "sans_superviseur",
            _("Votre poste n'est rattaché à aucun superviseur cette semaine : personne ne peut "
              "recevoir ce planning. Prévenez l'administrateur pays."),
            status.HTTP_409_CONFLICT,
            postes=[p.libelle for p in sans],
        )  # fmt: skip
    if not planning.visites.filter(archive_le__isnull=True).exists() and any(
        part_travaillee(planning, j) > 0
        for j in jours_planifiables(planning.pays, planning.semaine)
    ):
        raise ErreurMetier(
            "planning_vide",
            _("Le planning ne contient aucune visite : ajoutez-en, ou déclarez vos absences."),
        )
    controles.exiger_sans_bloquant(planning)
    maintenant = timezone.now()
    planning.statut = StatutPlanning.SOUMIS
    planning.soumis_le = maintenant
    planning.en_retard = maintenant > echeance(planning)
    planning.save(update_fields=["statut", "soumis_le", "en_retard", "modifie_le"])
    version = figer(planning)
    _auditer("planning.soumission", planning, semaine=str(planning.semaine),
             en_retard=planning.en_retard, numero=version.numero)  # fmt: skip
    return planning


# --- Versions et décision (RG-037, PLN-012, PLN-017) ------------------------------------------


def _contenu(planning: Planning) -> dict:
    """Ce que le délégué a soumis, lisible sans les fiches d'aujourd'hui (RG-037)."""

    def nom(p):
        return " ".join(x for x in (p.prenom, p.nom) if x) if p else None

    visites = planning.visites.filter(archive_le__isnull=True).select_related(
        "prospect", "etablissement", "reseau"
    )
    return {
        "visites": [
            {"id": str(v.pk), "date": v.date.isoformat(),
             "heure": v.heure.strftime("%H:%M") if v.heure else None, "ordre": v.ordre,
             "prospect": {"id": str(v.prospect_id), "nom": nom(v.prospect)} if v.prospect else None,
             "etablissement": {"id": str(v.etablissement_id), "nom": v.etablissement.nom}
             if v.etablissement else None,
             "reseau": str(v.reseau_id) if v.reseau_id else None,
             "objectif": v.objectif, "note": v.note,
             "passage": str(v.passage_id) if v.passage_id else None}
            for v in visites
        ],
        "passages": [
            {"id": str(p.pk), "date": p.date.isoformat(),
             "heure": p.heure.strftime("%H:%M") if p.heure else None,
             "etablissement": str(p.etablissement_id)}
            for p in planning.passages.filter(archive_le__isnull=True)
        ],
        "activites": [
            {"id": str(a.pk), "date": a.date.isoformat(), "periode": a.periode, "type": a.type,
             "commentaire": a.commentaire, "demande_superviseur": a.demande_superviseur}
            for a in planning.activites.filter(archive_le__isnull=True)
        ],
    }  # fmt: skip


def figer(planning: Planning) -> VersionPlanning:
    """RG-037 : chaque soumission crée une version figée et consultable, numérotée."""
    from django.db.models import Max

    numero = (planning.versions.aggregate(n=Max("numero"))["n"] or 0) + 1
    return VersionPlanning.objects.create(
        pays=planning.pays, planning=planning, numero=numero, contenu=_contenu(planning),
        soumis_le=planning.soumis_le or timezone.now(), en_retard=planning.en_retard,
    )  # fmt: skip


def version_a_decider(planning: Planning) -> VersionPlanning:
    """La dernière version soumise, sans décision. Un planning soumis avant 0.3.3 n'a pas de
    version : elle est figée à la décision, sur le contenu inchangé depuis la soumission."""
    derniere = planning.versions.first()
    if derniere is None or derniere.decision:
        return figer(planning)
    return derniere


def derniere_decision(planning: Planning) -> VersionPlanning | None:
    return planning.versions.exclude(decision="").select_related("decide_par").first()


def _exiger_decideur(planning: Planning, par) -> str:
    mode = mode_de_decision(par, planning)
    if mode is None:
        raise ErreurMetier(
            "non_decideur",
            _("Seul le responsable de ce poste cette semaine-là décide de ce planning."),
            status.HTTP_403_FORBIDDEN,
        )
    return mode


def _decider(planning: Planning, par, mode: str, decision: str, **champs) -> VersionPlanning:
    version = version_a_decider(planning)
    version.decision = decision
    version.decide_le = timezone.now()
    version.decide_par = par
    version.mode = mode
    for cle, valeur in champs.items():
        setattr(version, cle, valeur)
    version.save(update_fields=["decision", "decide_le", "decide_par", "mode", *champs])
    planning.statut = decision
    planning.save(update_fields=["statut"])
    return version


def _semaine_notifiee(planning: Planning) -> dict:
    return {"planning": str(planning.pk), "semaine": planning.semaine.isoformat(),
            "numero_semaine": planning.semaine.isocalendar().week}  # fmt: skip


@transaction.atomic
def approuver(planning: Planning, par) -> Planning:
    """PLN-012 : le responsable du poste — superviseur, DM d'un superviseur-visiteur (PLN-017,
    RG-023), ou leur remplaçant daté (ORG-013) — approuve un planning soumis et complet. La
    version est figée avec la décision (CA1) et le délégué en est notifié (CA2)."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    from . import controles
    from .etats import exiger_transition
    from .models import Decision

    _verrouiller(planning)
    exiger_transition(planning.statut, StatutPlanning.APPROUVE)
    mode = _exiger_decideur(planning, par)
    if anomalies := controles.bloquants(planning):
        raise ErreurMetier(
            "planning_bloque",
            _("Ce planning a des points bloquants : il ne peut pas être approuvé en l'état."),
            status.HTTP_409_CONFLICT,
            anomalies=[controles._detail(a) for a in anomalies],
        )
    version = _decider(planning, par, mode, Decision.APPROUVE)
    _auditer("planning.approbation", planning, semaine=str(planning.semaine),
             numero=version.numero, mode=mode)  # fmt: skip
    notifier(planning.delegue, TypeNotification.PLANNING_APPROUVE, planning.pays,
             **_semaine_notifiee(planning))  # fmt: skip
    return planning


@transaction.atomic
def demander_revision(planning: Planning, par, commentaire: str = "", remarques=()) -> Planning:
    """PLN-013 : révision demandée sur le planning ou sur des visites précises. Un commentaire
    est obligatoire (RG-017, CA1) : général, ou sur chaque visite visée ; le délégué le lit sur
    la visite concernée (CA2), puis corrige et soumet la version suivante."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    from .etats import exiger_transition
    from .models import Decision

    _verrouiller(planning)
    exiger_transition(planning.statut, StatutPlanning.A_REVISER)
    mode = _exiger_decideur(planning, par)
    commentaire = (commentaire or "").strip()
    par_visite: dict[str, str] = {}
    for remarque in remarques:
        texte = (remarque.get("commentaire") or "").strip()
        if not texte:
            raise ErreurMetier(
                "remarque_vide",
                _("Chaque visite visée par la révision demande un commentaire."),
                champ="remarques",
            )
        par_visite[str(remarque["visite"])] = texte
    if not commentaire and not par_visite:
        raise ErreurMetier(
            "commentaire_requis",
            _("Expliquez ce qui est à revoir : le commentaire est obligatoire."),
            champ="commentaire",
        )
    connues = {
        str(i)
        for i in planning.visites.filter(archive_le__isnull=True).values_list("pk", flat=True)
    }
    if inconnues := set(par_visite) - connues:
        raise ErreurMetier(
            "visite_inconnue",
            _("Une visite visée n'appartient pas à ce planning."),
            champ="remarques",
            visites=sorted(inconnues),
        )
    version = _decider(
        planning, par, mode, Decision.A_REVISER, commentaire=commentaire,
        remarques=[{"visite": v, "commentaire": t} for v, t in par_visite.items()],
    )  # fmt: skip
    _auditer("planning.revision", planning, semaine=str(planning.semaine),
             numero=version.numero, mode=mode, remarques=len(par_visite))  # fmt: skip
    notifier(planning.delegue, TypeNotification.REVISION_DEMANDEE, planning.pays,
             **_semaine_notifiee(planning))  # fmt: skip
    return planning


# --- Copier, reprendre, poser depuis la liste cible (PLN-005) ---------------------------------


def lieu_principal(prospect, jour: date, delegue=None):
    """Établissement principal du prospect ce jour-là, sinon son plus ancien lieu actif ; un
    lieu « à valider » ne compte que pour son auteur (PRP-006)."""
    from django.db.models import Q

    from apps.prospects.models import Exercice, StatutFiche

    exercice = (
        Exercice.objects.filter(
            actif_le(jour), prospect=prospect, etablissement__archive_le__isnull=True
        )
        .filter(
            Q(etablissement__statut=StatutFiche.ACTIF)
            | Q(etablissement__statut=StatutFiche.A_VALIDER, etablissement__cree_par=delegue)
        )  # fmt: skip
        .select_related("etablissement")
        .order_by("-principal", "debut")
        .first()
    )
    return exercice.etablissement if exercice else None


@transaction.atomic
def poser_depuis_cible(planning: Planning, jour: date, prospects: list) -> list[Visite]:
    """CA1 : des prospects de la liste cible posés sur un jour deviennent des visites
    pré-remplies — prospect et établissement principal ; le reste se complète ensuite."""
    return [
        ajouter_visite(
            planning, date=jour, prospect=p, etablissement=lieu_principal(p, jour, planning.delegue)
        )
        for p in prospects
    ]


@transaction.atomic
def copier_visite(visite: Visite, jour: date) -> Visite:
    """Copie d'une visite sur un autre jour de la même semaine (même prospect, lieu, heure,
    réseau, objectif et note)."""
    copie = ajouter_visite(
        visite.planning, date=jour, heure=visite.heure, prospect=visite.prospect,
        etablissement=visite.etablissement, reseau=visite.reseau, objectif=visite.objectif,
        note=visite.note,
    )  # fmt: skip
    return copie


#: Pourquoi une visite de la semaine précédente n'a pas trouvé de jour à la reprise.
RAISONS_REPRISE = ("jour_hors_semaine", "jour_ferie", "jour_absent")


def precedente(planning: Planning) -> Planning | None:
    return Planning.objects.filter(
        delegue=planning.delegue, semaine=planning.semaine - timedelta(days=7)
    ).first()


@transaction.atomic
def reprendre_semaine_precedente(planning: Planning) -> dict:
    """CA2 : les visites de la semaine précédente sont recopiées, jour pour jour, sur une
    semaine encore vide. Un jour devenu férié, ou d'absence toute la journée, est sauté et dit ;
    un réseau qui n'est plus celui d'un poste occupé reste à choisir. Les passages suivent ;
    les absences, non [H]."""
    _exiger_modifiable(planning)
    if planning.visites.filter(archive_le__isnull=True).exists():
        raise ErreurMetier(
            "semaine_non_vide",
            _("Cette semaine a déjà des visites : la reprise ne vaut que pour une semaine vide."),
            status.HTTP_409_CONFLICT,
        )
    source = precedente(planning)
    if source is None:
        raise ErreurMetier(
            "sans_semaine_precedente",
            _("Aucun planning la semaine précédente."),
            status.HTTP_404_NOT_FOUND,
        )
    jours = {j.date: j for j in jours_de_la_semaine(planning.pays, planning.semaine)}
    absents = {j for j in jours if jour_absent(planning, j)}
    copies: list[Visite] = []
    ignorees: list[dict] = []
    par_passage: dict = {}
    for v in source.visites.filter(archive_le__isnull=True).order_by("date", "ordre"):
        cible = v.date + timedelta(days=7)
        raison = (
            "jour_hors_semaine" if cible not in jours
            else "jour_ferie" if not jours[cible].planifiable
            else "jour_absent" if cible in absents
            else None
        )  # fmt: skip
        if raison:
            ignorees.append({"visite": str(v.pk), "date": str(cible), "raison": raison})
            continue
        champs = {
            "date": cible, "heure": v.heure, "prospect": v.prospect,
            "etablissement": v.etablissement, "objectif": v.objectif, "note": v.note,
        }  # fmt: skip
        if v.reseau_id and any(r.pk == v.reseau_id for p in postes_de_la_semaine(planning)
                               for r in p.reseaux.all()):  # fmt: skip
            champs["reseau"] = v.reseau
        copie = ajouter_visite(planning, **champs)
        copies.append(copie)
        if v.passage_id:
            par_passage.setdefault(v.passage_id, []).append(copie)
    for groupe in par_passage.values():
        if len(groupe) > 1 and groupe[0].passage_id is None:
            regrouper(planning, groupe)
    _auditer("planning.reprise", planning, source=str(source.pk), copiees=len(copies),
             ignorees=len(ignorees))  # fmt: skip
    return {"copiees": len(copies), "ignorees": ignorees}


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
    _changer(Visite.objects.filter(pk__in=[v.pk for v in visites]), passage=passage,
             heure=passage.heure)  # fmt: skip
    ranger(planning, jour)
    return passage


@transaction.atomic
def dissocier(passage: Passage) -> Passage:
    """Les visites redeviennent indépendantes et gardent l'heure du passage."""
    _exiger_modifiable(passage.planning)
    _changer(passage.visites.all(), passage=None)
    passage.archiver()
    _auditer("passage.dissociation", passage, planning=str(passage.planning_id),
             date=str(passage.date))  # fmt: skip
    ranger(passage.planning, passage.date)
    return passage


# --- Activités connexes (PLN-009, PLN-018) ---------------------------------------------------

#: Part de la journée travaillée selon les absences déclarées (CA1, RG-022) : une demi-journée
#: d'absence réduit de moitié les seuils du jour (contrôles en 0.2.4).
PART_ABSENTE = {Periode.JOURNEE: 1.0, Periode.MATIN: 0.5, Periode.APRES_MIDI: 0.5}


def _part_absente(absences) -> float:
    """Part du jour prise par des absences ; une activité avec visites n'en prend pas."""
    return sum(PART_ABSENTE[a.periode] for a in absences if a.type not in AVEC_VISITES)


def part_travaillee(planning: Planning, jour: date) -> float:
    absences = planning.activites.filter(archive_le__isnull=True, date=jour)
    return max(0.0, 1.0 - _part_absente(absences))


def jours_d_activite_avec_visites(planning: Planning) -> set[date]:
    """Jours couverts par un commando, un déplacement ou un accompagnement (PLN-018)."""
    return set(
        planning.activites.filter(archive_le__isnull=True, type__in=AVEC_VISITES).values_list(
            "date", flat=True
        )
    )


def jour_absent(planning: Planning, jour: date) -> bool:
    """Absent toute la journée : une absence « journée », ou matin et après-midi."""
    return part_travaillee(planning, jour) == 0


def _exiger_present(planning: Planning, jour: date) -> None:
    """Une journée entière d'absence ne reçoit pas de visite."""
    if jour_absent(planning, jour):
        raise ErreurMetier(
            "jour_absent",
            _("Vous êtes absent toute cette journée : elle ne reçoit pas de visite."),
            champ="date",
        )


def _verifier_activite(activite: Activite) -> None:
    _exiger_jour_planifiable(activite.planning, activite.date)
    if activite.type == TypeActivite.AUTRE and not activite.commentaire:
        raise ErreurMetier(
            "motif_requis",
            _("Précisez le motif d'une absence « autre »."),
            champ="commentaire",
        )
    if activite.avec_visites and not activite.commentaire:
        # PLN-018 CA1 : un commando ou un déplacement se renseigne en détail.
        raise ErreurMetier(
            "explication_requise",
            _("Expliquez cette activité : où, avec qui, et pourquoi."),
            champ="commentaire",
        )
    if activite.type != TypeActivite.DEPLACEMENT:
        activite.demande_superviseur = False
    autres = activite.planning.activites.filter(
        archive_le__isnull=True, date=activite.date
    ).exclude(pk=activite.pk)
    if any(
        Periode.JOURNEE in (a.periode, activite.periode) or a.periode == activite.periode
        for a in autres
    ):
        raise ErreurMetier(
            "activite_chevauchement",
            _("Une activité est déjà déclarée sur cette période."),
            status.HTTP_409_CONFLICT,
            champ="periode",
        )
    # Une absence qui couvre la journée entière (seule, ou avec l'autre demi-journée) ne
    # laisse pas de visite ce jour-là.
    if not activite.avec_visites and PART_ABSENTE[activite.periode] + _part_absente(autres) >= 1:
        nombre = _visites_du_jour(activite.planning, activite.date).count()
        if nombre:
            raise ErreurMetier(
                "activite_avec_visites",
                _("Des visites sont prévues ce jour-là : déplacez-les ou retirez-les d'abord."),
                status.HTTP_409_CONFLICT,
                champ="periode",
                visites=nombre,
            )


@transaction.atomic
def declarer_activite(planning: Planning, *, date: date, type: str, periode: str = Periode.JOURNEE,
                     commentaire: str = "", demande_superviseur: bool = False,
                     id=None) -> Activite:  # fmt: skip
    _verrouiller(planning)
    if existante := _deja_envoye(Activite, planning, id):
        return existante
    _exiger_modifiable(planning)
    activite = Activite(pays=planning.pays, planning=planning, date=date, type=type,
                      periode=periode, commentaire=(commentaire or "").strip(),
                      demande_superviseur=demande_superviseur)  # fmt: skip
    if id is not None:
        activite.pk = id
    _verifier_activite(activite)
    activite.save()
    _auditer("activite.declaration", activite, planning=str(planning.pk), date=str(date),
             periode=periode, type=type)  # fmt: skip
    return activite


@transaction.atomic
def modifier_activite(activite: Activite, **champs) -> Activite:
    _exiger_modifiable(activite.planning)
    if "commentaire" in champs:
        champs["commentaire"] = (champs["commentaire"] or "").strip()
    for cle, valeur in champs.items():
        setattr(activite, cle, valeur)
    _verifier_activite(activite)
    activite.save()
    _auditer("activite.modification", activite, planning=str(activite.planning_id),
             champs=sorted(champs))  # fmt: skip
    return activite


@transaction.atomic
def retirer_activite(activite: Activite) -> Activite:
    _exiger_modifiable(activite.planning)
    activite.archiver()
    _auditer("activite.retrait", activite, planning=str(activite.planning_id),
             date=str(activite.date))  # fmt: skip
    return activite

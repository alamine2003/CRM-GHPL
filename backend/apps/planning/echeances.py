"""Échéances du planning évaluées par la tâche périodique (0.3.8, architecture §7.5).

- Rappel du planning non soumis (NOT-006) : le vendredi 9 h de la semaine précédente, à l'heure
  du pays, au délégué dont la semaine suivante n'est pas encore soumise, jusqu'à la fermeture
  du lundi 0 h (décision du 6 octobre 2026).
- Escalade (PLN-016, RG-019) : un planning soumis sans décision depuis le délai du pays, compté
  en heures ouvrées, va au DM du périmètre, qui peut alors décider (mode `escalade`) ; un
  planning fermé n'escalade plus : seule sa réouverture le remet en jeu.
- Alerte du lundi (RG-019) : à la fermeture du lundi 0 h, les plannings de la semaine qui ne
  sont pas approuvés sont signalés au DM.

- Exécution (cycle 0.4, prd.md §17.1) : le premier jour de sa semaine, un planning approuvé
  passe « en cours » ; la semaine finie, « terminé ».

Chaque envoi est idempotent : la tâche peut tourner toutes les quinze minutes sans répéter.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import connection, transaction
from django.utils import timezone

from apps.organisation.models import Occupation, actif_le
from apps.socle.models import Pays
from apps.socle.services import valeur_parametre

from .calendrier import feries, lundi
from .etats import StatutPlanning
from .models import Planning

#: Statuts d'une semaine qui n'attend plus rien du DM le lundi matin.
DECIDES = (StatutPlanning.APPROUVE, StatutPlanning.EN_COURS, StatutPlanning.TERMINE,
           StatutPlanning.ANNULE)  # fmt: skip


def _moment(pays: Pays, semaine: date, cle: str) -> datetime:
    """Jour et heure d'un paramètre `{jour, heure}`, dans la semaine qui commence `semaine`."""
    regle = valeur_parametre(pays, cle)
    heure, minute = (int(x) for x in regle["heure"].split(":"))
    jour = semaine + timedelta(days=regle["jour"] - 1)
    return datetime.combine(jour, time(heure, minute), tzinfo=ZoneInfo(pays.fuseau))


def _aujourdhui(pays: Pays, maintenant: datetime) -> date:
    return maintenant.astimezone(ZoneInfo(pays.fuseau)).date()


def heures_ouvrees(pays: Pays, debut: datetime, fin: datetime,
                   calendrier: tuple[set, set] | None = None) -> float:  # fmt: skip
    """Heures écoulées entre deux instants, sur les seuls jours ouvrés du pays (RG-014), jours
    fériés exclus : un vendredi soir suivi d'un week-end n'escalade pas le samedi [H].
    `calendrier` (jours ouvrés, jours fériés) évite de le relire pour chaque calcul (DSH-007)."""
    if fin <= debut:
        return 0.0
    fuseau = ZoneInfo(pays.fuseau)
    debut, fin = debut.astimezone(fuseau), fin.astimezone(fuseau)
    if calendrier is None:
        ouvres = set(valeur_parametre(pays, "jours_ouvres"))
        exclus = set(feries(pays, debut.date(), fin.date()))
    else:
        ouvres, exclus = calendrier
    total = 0.0
    jour = debut.date()
    while jour <= fin.date():
        if jour.isoweekday() in ouvres and jour not in exclus:
            ouverture = datetime.combine(jour, time.min, tzinfo=fuseau)
            fermeture = ouverture + timedelta(days=1)
            total += (min(fin, fermeture) - max(debut, ouverture)).total_seconds()
        jour += timedelta(days=1)
    return total / 3600


def _occupants(pays: Pays, semaine: date) -> dict:
    """Qui occupe un poste cette semaine-là, et les réseaux de ses postes."""
    reseaux: dict = {}
    for occupation in (
        Occupation.objects.filter(actif_le(semaine), poste__pays=pays,
                                  poste__archive_le__isnull=True)
        .select_related("utilisateur", "poste")
        .prefetch_related("poste__reseaux")
    ):  # fmt: skip
        reseaux.setdefault(occupation.utilisateur, set()).update(
            r.pk for r in occupation.poste.reseaux.all()
        )
    return reseaux


def _nom(utilisateur) -> str:
    return f"{utilisateur.first_name} {utilisateur.last_name}".strip()


def rappels(pays: Pays, maintenant: datetime) -> int:
    """NOT-006 : planning de la semaine suivante non soumis, le vendredi à 9 h par défaut, et
    jusqu'à la fermeture du lundi 0 h ; un seul rappel par semaine."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier_une_fois

    from .services import fermeture

    cible = lundi(_aujourdhui(pays, maintenant)) + timedelta(days=7)
    debut = _moment(pays, cible - timedelta(days=7), "rappel_planning_non_soumis")
    echeance = fermeture(pays, cible)
    if not debut <= maintenant < echeance:
        return 0
    soumis = set(
        Planning.objects.filter(pays=pays, semaine=cible)
        .exclude(statut__in=(StatutPlanning.BROUILLON, StatutPlanning.A_REVISER))
        .values_list("delegue_id", flat=True)
    )
    envoyes = 0
    for delegue in _occupants(pays, cible):
        if delegue.pk in soumis:
            continue
        envoyes += notifier_une_fois(
            delegue, TypeNotification.RAPPEL_PLANNING, pays, cle=f"rappel:{cible}",
            semaine=cible.isoformat(), numero_semaine=cible.isocalendar().week,
            echeance=echeance.isoformat(),
        ) is not None  # fmt: skip
    return envoyes


def dms_du_planning(planning: Planning, jour: date | None = None) -> set:
    """DM du périmètre d'un planning : ceux dont les réseaux couvrent ses postes (PLN-016)."""
    from apps.organisation.services import dms_des_reseaux

    from .services import postes_de_la_semaine

    reseaux = {r.pk for p in postes_de_la_semaine(planning) for r in p.reseaux.all()}
    return dms_des_reseaux(planning.pays, reseaux, jour) - {planning.delegue_id}


@transaction.atomic
def escalader(planning: Planning, maintenant: datetime) -> set:
    """PLN-016 CA1 : la version en attente est marquée escaladée et le DM du périmètre est
    notifié ; il décidera en mode `escalade` (CA2)."""
    from apps.identite.models import Utilisateur
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    from .services import _auditer, _semaine_notifiee

    version = planning.versions.first()
    version.escalade_le = maintenant
    version.save(update_fields=["escalade_le", "modifie_le"])
    dms = dms_du_planning(planning, _aujourdhui(planning.pays, maintenant))
    delai = valeur_parametre(planning.pays, "delai_escalade_heures_ouvrees")
    for dm in Utilisateur.objects.filter(pk__in=dms):
        notifier(dm, TypeNotification.ESCALADE, planning.pays, **_semaine_notifiee(planning),
                 nom=_nom(planning.delegue), heures=delai, version=version.numero)  # fmt: skip
    _auditer("planning.escalade", planning, numero=version.numero, dms=sorted(map(str, dms)),
             heures=delai)  # fmt: skip
    return dms


def escalades(pays: Pays, maintenant: datetime) -> int:
    """Les plannings soumis restés sans décision au-delà du délai (24 h ouvrées par défaut)."""
    from .services import fermeture

    delai = valeur_parametre(pays, "delai_escalade_heures_ouvrees")
    nombre = 0
    for planning in Planning.objects.filter(pays=pays, statut=StatutPlanning.SOUMIS).select_related(
        "delegue", "pays"
    ):
        version = planning.versions.first()
        if version is None or version.decision or version.escalade_le:
            continue
        # Fermé le lundi 0 h sans réouverture : plus personne ne le décide, le DM non plus.
        if planning.reouvert_le is None and maintenant >= fermeture(pays, planning.semaine):
            continue
        if heures_ouvrees(pays, version.soumis_le, maintenant) >= delai:
            escalader(planning, maintenant)
            nombre += 1
    return nombre


def alertes_non_approuves(pays: Pays, maintenant: datetime) -> int:
    """RG-019 : à la fermeture du lundi 0 h (par défaut), chaque DM apprend combien de
    plannings de la semaine, dans ses réseaux, ne sont pas approuvés — absents compris."""
    from apps.identite.models import Utilisateur
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier_une_fois
    from apps.organisation.services import dms_des_reseaux

    semaine = lundi(_aujourdhui(pays, maintenant))
    if maintenant < _moment(pays, semaine, "alerte_planning_non_approuve"):
        return 0
    decides = set(
        Planning.objects.filter(pays=pays, semaine=semaine, statut__in=DECIDES).values_list(
            "delegue_id", flat=True
        )
    )
    par_dm: dict = {}
    for delegue, reseaux in _occupants(pays, semaine).items():
        if delegue.pk in decides:
            continue
        for dm in dms_des_reseaux(pays, reseaux, semaine) - {delegue.pk}:
            par_dm.setdefault(dm, []).append(delegue)
    envoyes = 0
    for dm in Utilisateur.objects.filter(pk__in=par_dm):
        envoyes += notifier_une_fois(
            dm, TypeNotification.PLANNINGS_NON_APPROUVES, pays, cle=f"non_approuves:{semaine}",
            semaine=semaine.isoformat(), numero_semaine=semaine.isocalendar().week,
            nombre=len(par_dm[dm.pk]),
        ) is not None  # fmt: skip
    return envoyes


def avancer_plannings(pays: Pays, maintenant: datetime) -> int:
    """Approuvé → en cours le premier jour de la semaine ; en cours → terminé la semaine
    finie (prd.md §17.1). Rend le nombre de plannings qui ont changé d'état."""
    from .etats import exiger_transition
    from .services import _auditer

    lundi_courant = lundi(_aujourdhui(pays, maintenant))
    nombre = 0
    for statut, vers, filtre in (
        # Dans cet ordre : une semaine approuvée déjà finie passe en cours, puis terminée.
        (StatutPlanning.APPROUVE, StatutPlanning.EN_COURS, {"semaine__lte": lundi_courant}),
        (StatutPlanning.EN_COURS, StatutPlanning.TERMINE, {"semaine__lt": lundi_courant}),
    ):
        for planning in Planning.objects.filter(pays=pays, statut=statut, **filtre):
            exiger_transition(planning.statut, vers)
            planning.statut = vers
            planning.save(update_fields=["statut", "modifie_le"])
            _auditer(f"planning.{vers}", planning, semaine=str(planning.semaine))
            nombre += 1
    return nombre


def executer(maintenant: datetime | None = None) -> dict:
    """Une passe sur chaque pays, chacun dans sa transaction et son isolation (ADR-003)."""
    maintenant = maintenant or timezone.now()
    from apps.notifications import secours
    from apps.rapports import retards

    bilan = {"rappels": 0, "escalades": 0, "alertes": 0, "plannings": 0, "rapports": 0,
             "rappels_rapport": 0, "journees_escaladees": 0, "courriels_secours": 0}  # fmt: skip
    for pays in Pays.objects.filter(statut=Pays.Statut.ACTIF):
        with transaction.atomic():
            with connection.cursor() as curseur:
                curseur.execute("SELECT set_config('innov.pays', %s, true)", [str(pays.pk)])
            bilan["rappels"] += rappels(pays, maintenant)
            bilan["escalades"] += escalades(pays, maintenant)
            bilan["alertes"] += alertes_non_approuves(pays, maintenant)
            bilan["plannings"] += avancer_plannings(pays, maintenant)
            bilan["rapports"] += retards.alertes(pays, maintenant)
            bilan["rappels_rapport"] += retards.rappels(pays, maintenant)
            bilan["journees_escaladees"] += retards.escalades(pays, maintenant)
            bilan["courriels_secours"] += secours.courriels(pays, maintenant)
    return bilan

"""File de travail du superviseur (RPT-012, 0.6.1 ; DC-47, engagement 3 « À traiter
aujourd'hui »).

Les journées terminées de ses délégués, pas encore validées, regroupées par délégué et
rangées de la plus ancienne à la plus récente. Chaque journée porte son classement de
conformité (« conforme » ou « à vérifier ») et le détail de ses écarts (CA1), ainsi que l'état
de ses rapports : soumis en attente de validation, encore attendus, en retard, à l'horodatage
douteux.

Qui voit quoi : les délégués dont il est le responsable cette semaine-là (superviseur du
poste, DM pour un superviseur-visiteur, RG-023), et ceux du superviseur qu'il remplace
(ORG-013) ; le DM du périmètre, les journées en escalade (0.6.3). Jamais ses propres journées.

[D, 20.A] La file remonte sur quatre semaines (`SEMAINES`) : au-delà, une journée non validée
relève des retards (RPT-017, 0.6.7).
"""

from collections import defaultdict
from datetime import timedelta

from django.db import models

from apps.planning import conformite
from apps.planning.calendrier import lundi
from apps.planning.echeances import recours_du_planning
from apps.planning.etats import StatutPlanning, StatutVisite
from apps.planning.indisponibilite import du_planning
from apps.planning.models import ConformiteJournee, ModeDecision, Planning
from apps.planning.services import mode_de_decision
from apps.socle.services import aujourdhui

from .models import Rapport, StatutRapport
from .validation import EN_REPRISE, eligible_au_lot, en_escalade, journee_validee

SEMAINES = 4
#: Plannings dont les visites s'exécutent : approuvés, en cours ou terminés.
EXECUTES = (StatutPlanning.APPROUVE, StatutPlanning.EN_COURS, StatutPlanning.TERMINE)
#: Rapports transmis au superviseur ; les autres sont encore entre les mains du délégué.
TRANSMIS = (StatutRapport.SOUMIS, StatutRapport.VALIDE)


def _plannings(utilisateur, pays, depuis=None) -> list[Planning]:
    from apps.organisation.services import recours_du_pays, remplaces_par

    titulaires = [utilisateur.pk, *(r.pk for r in remplaces_par(utilisateur, pays))]
    debut = depuis or lundi(aujourdhui(pays)) - timedelta(weeks=SEMAINES - 1)
    # 32.A : une journée dont un rapport a été rouvert revient, même plus ancienne.
    # Par sous-requête plutôt que par jointure : un OU sur une jointure parcourt toutes les
    # visites du pays (0.9.4).
    rouverts = Rapport.objects.filter(rouvert_le__isnull=False, statut__in=EN_REPRISE)
    reprises = models.Q(pk__in=rouverts.values("visite__planning_id"))
    executes = Planning.objects.filter(models.Q(semaine__gte=debut) | reprises, pays=pays,
                                       statut__in=EXECUTES)  # fmt: skip
    # Les postes rattachés (ou remplacés) ; pour l'administrateur pays (1.3.0 [D], à la place du
    # DM), tout le pays : escalade et postes rattachés à un DM, triés ensuite journée par journée.
    if utilisateur.pk not in recours_du_pays(pays):
        executes = executes.filter(
            delegue__occupations__poste__rattachements__superviseur__in=titulaires
        )
    candidats = executes.exclude(delegue=utilisateur).select_related("delegue", "pays").distinct()
    return list(candidats)


def journees_figees(planning: Planning, jours) -> set:
    """Les journées figées sans rapport repris depuis : validées, elles ont quitté la file
    (32.A) ; deux requêtes pour toutes les journées du planning (0.9.4)."""
    figees = set(
        ConformiteJournee.objects.filter(delegue_id=planning.delegue_id, date__in=jours,
                                         fige_le__isnull=False)
        .values_list("date", flat=True)
    )  # fmt: skip
    reprises = set(
        Rapport.objects.filter(visite__planning=planning, visite__archive_le__isnull=True,
                               statut__in=EN_REPRISE)
        .values_list("visite__date", flat=True)
    )  # fmt: skip
    return figees - reprises


def _journees_ouvertes(plannings: list[Planning], today) -> dict:
    """`{planning: [jours]}` : les journées passées qui ont des visites et ne sont pas
    validées (figées sans rapport repris depuis, 32.A)."""
    from apps.planning.models import Visite

    if not plannings:
        return {}
    jours: dict = defaultdict(set)
    for planning_id, jour in (
        Visite.objects.filter(planning__in=plannings, archive_le__isnull=True, date__lt=today)
        .order_by().values_list("planning_id", "date").distinct()
    ):  # fmt: skip
        jours[planning_id].add(jour)
    delegue_de = {p.pk: p.delegue_id for p in plannings}
    toutes = {j for liste in jours.values() for j in liste}
    figees = set(
        ConformiteJournee.objects.filter(delegue_id__in=set(delegue_de.values()),
                                         date__in=toutes, fige_le__isnull=False)
        .values_list("delegue_id", "date")
    )  # fmt: skip
    reprises = set(
        Rapport.objects.filter(visite__planning__in=plannings, visite__archive_le__isnull=True,
                               statut__in=EN_REPRISE)
        .values_list("visite__planning_id", "visite__date")
    )  # fmt: skip
    return {
        planning_id: sorted(j for j in liste if (delegue_de[planning_id], j) not in figees
                            or (planning_id, j) in reprises)
        for planning_id, liste in jours.items()
    }  # fmt: skip


def _rapports_par_jour(planning: Planning, jours) -> dict:
    """Les compteurs de chaque journée, en une requête (0.9.4) : visites, effectuées, et les
    rapports des visites effectuées par état."""
    from apps.planning.models import Visite

    faite = models.Q(statut=StatutVisite.EFFECTUEE)

    def rapports(**filtre):
        return models.Count("rapport", filter=faite & models.Q(**filtre))

    lignes = (
        Visite.objects.filter(planning=planning, archive_le__isnull=True, date__in=jours)
        .values("date")
        .annotate(
            visites=models.Count("id"), effectuees=models.Count("id", filter=faite),
            a_valider=rapports(rapport__statut=StatutRapport.SOUMIS),
            transmis=rapports(rapport__statut__in=TRANSMIS),
            en_retard=rapports(rapport__statut__in=TRANSMIS, rapport__en_retard=True),
            douteux=rapports(rapport__statut__in=TRANSMIS, rapport__horodatage_douteux=True),
            a_corriger=rapports(rapport__statut=StatutRapport.A_CORRIGER),
            rouverts=rapports(rapport__statut=StatutRapport.ROUVERT),
        )
    )  # fmt: skip
    return {
        ligne["date"]: {
            "visites": ligne["visites"],
            "effectuees": ligne["effectuees"],
            "rapports_a_valider": ligne["a_valider"],
            "rapports_attendus": ligne["effectuees"] - ligne["transmis"],
            "rapports_en_retard": ligne["en_retard"],
            "horodatages_douteux": ligne["douteux"],
            "rapports_a_corriger": ligne["a_corriger"],
            "rapports_rouverts": ligne["rouverts"],
        }
        for ligne in lignes
    }


def journees_a_traiter(utilisateur, pays) -> list[dict]:
    """Par délégué, ses journées terminées et non validées, de la plus ancienne (CA1)."""
    today = aujourdhui(pays)
    par_delegue: dict = defaultdict(list)
    delegues = {}
    regles = conformite.seuils(pays)
    plannings = _plannings(utilisateur, pays)
    # 0.9.4 : les journées encore ouvertes de tous les plannings, en trois requêtes ; un
    # planning tout validé ne coûte plus rien.
    ouvertes = _journees_ouvertes(plannings, today)
    for planning in plannings:
        jours = ouvertes.get(planning.pk)
        if not jours:
            continue
        # 0.9.4 : le titre se calcule une fois par planning ; seule l'escalade d'un DM
        # dépend de la journée (mode_pour).
        titre = mode_de_decision(utilisateur, planning)
        direct = titre in (ModeDecision.DIRECT, ModeDecision.REMPLACEMENT)
        if not direct and utilisateur.pk not in recours_du_planning(planning):
            continue  # ni responsable, ni remplaçant, ni administrateur
        comptes = _rapports_par_jour(planning, jours)
        indisponibles = du_planning(planning)
        # Les journées encore ouvertes, leurs visites et leur conformité : lues une fois,
        # verrouillées comme le ferait `recalculer` journée par journée.
        visites = defaultdict(list)
        for visite in conformite.visites_du_planning(planning, jours):
            visites[visite.date].append(visite)
        calculees = {
            c.date: c
            for c in ConformiteJournee.objects.select_for_update().filter(
                delegue_id=planning.delegue_id, date__in=jours
            )
        }
        for jour in jours:
            mode = titre if direct else (ModeDecision.ESCALADE if en_escalade(planning, jour)
                                         else None)  # fmt: skip
            if mode is None:
                continue  # le DM ne voit une journée qu'en escalade
            journee = conformite.recalculer(planning, jour, regles, indisponibles,
                                            calculees.get(jour), visites[jour])  # fmt: skip
            if journee_validee(planning, jour, journee):
                continue  # validée (0.6.3) : elle a quitté la file
            delegues[planning.delegue_id] = planning.delegue
            par_delegue[planning.delegue_id].append(
                {
                    "date": jour,
                    "planning": planning.pk,
                    "classement": journee.classement,
                    "ecarts": journee.ecarts,
                    "escalade": mode == ModeDecision.ESCALADE,
                    "eligible_lot": eligible_au_lot(
                        planning, jour, journee, comptes[jour]["rapports_attendus"]
                    ),
                    **comptes[jour],
                }  # fmt: skip
            )
    lignes = [
        {"delegue": delegues[pk], "journees": sorted(journees, key=lambda j: j["date"])}
        for pk, journees in par_delegue.items()
    ]
    # Le délégué qui attend depuis le plus longtemps d'abord, puis par nom.
    return sorted(lignes, key=lambda x: (x["journees"][0]["date"], x["delegue"].last_name,
                                         x["delegue"].first_name))  # fmt: skip

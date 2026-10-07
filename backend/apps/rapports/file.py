"""File de travail du superviseur (RPT-012, 0.6.1 ; DC-47, engagement 3 « À traiter
aujourd'hui »).

Les journées terminées de ses délégués, pas encore validées, regroupées par délégué et
rangées de la plus ancienne à la plus récente. Chaque journée porte son classement de
conformité (« conforme » ou « à vérifier ») et le détail de ses écarts (CA1), ainsi que l'état
de ses rapports : soumis en attente de validation, encore attendus, en retard, à l'horodatage
douteux.

Qui voit quoi : les délégués dont il est le responsable cette semaine-là (superviseur du
poste, DM pour un superviseur-visiteur, RG-023), et ceux du superviseur qu'il remplace
(ORG-013). Jamais ses propres journées.

[H] La file remonte sur quatre semaines (`SEMAINES`) : au-delà, une journée non validée relève
des retards (RPT-017, 0.6.7).
"""

from collections import defaultdict
from datetime import timedelta

from apps.planning import conformite
from apps.planning.calendrier import lundi
from apps.planning.etats import StatutPlanning, StatutVisite
from apps.planning.models import Planning
from apps.planning.services import supervise
from apps.socle.services import aujourdhui

from .models import Rapport, StatutRapport

SEMAINES = 4
#: Plannings dont les visites s'exécutent : approuvés, en cours ou terminés.
EXECUTES = (StatutPlanning.APPROUVE, StatutPlanning.EN_COURS, StatutPlanning.TERMINE)
#: Rapports transmis au superviseur ; les autres sont encore entre les mains du délégué.
TRANSMIS = (StatutRapport.SOUMIS, StatutRapport.VALIDE)


def _plannings(superviseur, pays) -> list[Planning]:
    from apps.organisation.services import remplaces_par

    titulaires = [superviseur.pk, *(r.pk for r in remplaces_par(superviseur, pays))]
    debut = lundi(aujourdhui(pays)) - timedelta(weeks=SEMAINES - 1)
    candidats = (
        Planning.objects.filter(pays=pays, statut__in=EXECUTES, semaine__gte=debut,
                                delegue__occupations__poste__rattachements__superviseur__in=titulaires)
        .exclude(delegue=superviseur)
        .select_related("delegue", "pays")
        .distinct()
    )  # fmt: skip
    return [p for p in candidats if supervise(superviseur, p)]


def _rapports(planning: Planning, jour) -> dict:
    visites = planning.visites.filter(archive_le__isnull=True, date=jour)
    effectuees = visites.filter(statut=StatutVisite.EFFECTUEE)
    rapports = Rapport.objects.filter(visite__in=effectuees)
    transmis = rapports.filter(statut__in=TRANSMIS)
    return {
        "visites": visites.count(),
        "effectuees": effectuees.count(),
        "rapports_a_valider": rapports.filter(statut=StatutRapport.SOUMIS).count(),
        "rapports_attendus": effectuees.count() - transmis.count(),
        "rapports_en_retard": transmis.filter(en_retard=True).count(),
        "horodatages_douteux": transmis.filter(horodatage_douteux=True).count(),
    }


def journees_a_traiter(superviseur, pays) -> list[dict]:
    """Par délégué, ses journées terminées et non validées, de la plus ancienne (CA1)."""
    today = aujourdhui(pays)
    par_delegue: dict = defaultdict(list)
    delegues = {}
    for planning in _plannings(superviseur, pays):
        jours = sorted(set(
            planning.visites.filter(archive_le__isnull=True, date__lt=today)
            .values_list("date", flat=True)
        ))  # fmt: skip
        for jour in jours:
            journee = conformite.recalculer(planning, jour)
            if journee.fige_le is not None:
                continue  # validée (0.6.3) : elle a quitté la file
            delegues[planning.delegue_id] = planning.delegue
            par_delegue[planning.delegue_id].append(
                {
                    "date": jour,
                    "planning": planning.pk,
                    "classement": journee.classement,
                    "ecarts": journee.ecarts,
                    **_rapports(planning, jour),
                }  # fmt: skip
            )
    lignes = [
        {"delegue": delegues[pk], "journees": sorted(journees, key=lambda j: j["date"])}
        for pk, journees in par_delegue.items()
    ]
    # Le délégué qui attend depuis le plus longtemps d'abord, puis par nom.
    return sorted(lignes, key=lambda x: (x["journees"][0]["date"], x["delegue"].last_name,
                                         x["delegue"].first_name))  # fmt: skip

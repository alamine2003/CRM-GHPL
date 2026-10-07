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
from apps.planning.etats import StatutPlanning, StatutVisite
from apps.planning.models import ModeDecision, Planning
from apps.socle.services import aujourdhui

from .models import Rapport, StatutRapport
from .validation import eligible_au_lot, mode_pour

SEMAINES = 4
#: Plannings dont les visites s'exécutent : approuvés, en cours ou terminés.
EXECUTES = (StatutPlanning.APPROUVE, StatutPlanning.EN_COURS, StatutPlanning.TERMINE)
#: Rapports transmis au superviseur ; les autres sont encore entre les mains du délégué.
TRANSMIS = (StatutRapport.SOUMIS, StatutRapport.VALIDE)


def _plannings(utilisateur, pays) -> list[Planning]:
    from apps.organisation.models import PerimetreReseau, actif_le
    from apps.organisation.services import remplaces_par

    titulaires = [utilisateur.pk, *(r.pk for r in remplaces_par(utilisateur, pays))]
    debut = lundi(aujourdhui(pays)) - timedelta(weeks=SEMAINES - 1)
    executes = Planning.objects.filter(pays=pays, statut__in=EXECUTES, semaine__gte=debut)
    # Les postes rattachés (ou remplacés), et, pour l'escalade, ceux des réseaux du DM.
    reseaux = PerimetreReseau.objects.filter(actif_le(aujourdhui(pays)), utilisateur=utilisateur)
    candidats = (
        executes.filter(
            models.Q(delegue__occupations__poste__rattachements__superviseur__in=titulaires)
            | models.Q(delegue__occupations__poste__reseaux__in=reseaux.values("reseau_id"))
        )
        .exclude(delegue=utilisateur)
        .select_related("delegue", "pays")
        .distinct()
    )
    return list(candidats)


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


def journees_a_traiter(utilisateur, pays) -> list[dict]:
    """Par délégué, ses journées terminées et non validées, de la plus ancienne (CA1)."""
    today = aujourdhui(pays)
    par_delegue: dict = defaultdict(list)
    delegues = {}
    for planning in _plannings(utilisateur, pays):
        jours = sorted(set(
            planning.visites.filter(archive_le__isnull=True, date__lt=today)
            .values_list("date", flat=True)
        ))  # fmt: skip
        for jour in jours:
            mode = mode_pour(utilisateur, planning, jour)
            if mode is None:
                continue  # ni responsable, ni remplaçant, ni DM d'une journée en escalade
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
                    "escalade": mode == ModeDecision.ESCALADE,
                    "eligible_lot": eligible_au_lot(planning, jour),
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

"""Consultation d'une journée par le superviseur (0.6.2 ; RPT-012, RPT-013 à venir).

Depuis « À traiter », le superviseur ouvre une journée d'un délégué : son classement de
conformité et ses écarts, ses activités (indisponibilité, accompagnement…), puis chaque
visite dans l'ordre, avec ce qui s'est passé (heures, distances, motif d'un écart) et son
rapport tel que soumis : produits et retours, remises, résultat, prochaine action, champs du
pays, pièces jointes (RPT-007 CA2), retard et horodatage douteux (RPT-010 CA1), nombre de
versions (RG-037). Un brouillon reste au délégué : seul son état se voit.

Qui : le responsable du poste cette semaine-là ou son remplaçant (`supervise`) ; ailleurs, la
journée n'existe pas (404).
"""

from datetime import date

from django.http import Http404

from apps.planning import conformite
from apps.planning.etats import StatutVisite

from .models import StatutRapport


def journee(superviseur, pays, delegue_id, jour: date) -> dict:
    from .validation import journee_validee, manquants, peut_rouvrir, planning_du_jour

    planning, mode = planning_du_jour(superviseur, pays, delegue_id, jour, consultation=True)
    visites = list(
        planning.visites.filter(archive_le__isnull=True, date=jour)
        .select_related(
            "prospect",
            "etablissement",
            "motif_ecart",
            "rapport__resultat",
            "rapport__prochaine_action_type",
            "rapport__valide_par",
            "rapport__rouvert_par",
            "rapport__correction_par",
        )  # fmt: skip
        .prefetch_related("rapport__pieces_jointes", "rapport__versions")
        .order_by("heure", "ordre")
    )
    if not visites:
        raise Http404
    calcul = conformite.recalculer(planning, jour)
    for v in visites:
        rapport = getattr(v, "rapport", None)
        if v.statut != StatutVisite.EFFECTUEE:
            v.rapport_statut = None
        else:
            v.rapport_statut = rapport.statut if rapport is not None else "attendu"
        # Le brouillon reste au délégué ; le superviseur n'en voit que l'état.
        v.rapport_lu = (
            rapport if rapport is not None and rapport.statut != StatutRapport.BROUILLON else None
        )  # fmt: skip
        if v.rapport_lu is not None:
            v.rapport_lu.rouvrable = peut_rouvrir(superviseur, rapport, mode)
    return {
        "delegue": planning.delegue,
        "date": jour,
        "planning": planning.pk,
        "classement": calcul.classement,
        "ecarts": calcul.ecarts,
        #: Validée (32.A : un rapport rouvert la fait revenir, son classement reste figé).
        "fige": journee_validee(planning, jour, calcul),
        #: À quel titre l'utilisateur valide : responsable, remplaçant, ou DM par escalade.
        "mode": mode,
        #: 22.A : la journée se valide quand tous ses rapports sont soumis.
        "rapports_manquants": manquants(planning, jour),
        "activites": list(planning.activites.filter(archive_le__isnull=True, date=jour)),
        "visites": visites,
    }

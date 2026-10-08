"""Rapports en retard (RPT-017, RG-032 ; 0.6.7).

[D, 8 octobre 2026, 35.A] Un onglet « Retards » de « À traiter », filtrable par délégué
(CA1) : les rapports pas encore soumis après leur échéance (visite effectuée, rapport absent ou
en brouillon), et les journées de plus de 4 semaines toujours pas validées (20.A), qui ont
quitté la file. Un rapport renvoyé pour correction ou rouvert n'y figure pas : il est sans
échéance (DC-60).

[D, 8 octobre 2026, 34.A] Alerte au superviseur : 48 heures après la visite (sa fin, ou à
défaut la fin de sa journée), un rapport toujours pas soumis le prévient, une seule fois ; les
visites d'un même jour d'un délégué font une seule alerte, avec leur nombre. [H] Seules les
visites des 7 derniers jours sont alertées, et la liste remonte sur 13 semaines.

Qui voit quoi : le responsable du poste (ou son remplaçant) et le DM du périmètre.
"""

from datetime import datetime, timedelta

from django.db import models

from apps.planning.calendrier import lundi
from apps.planning.etats import StatutVisite
from apps.planning.models import ModeDecision, Planning, Visite
from apps.socle.services import aujourdhui, debut_du_jour

from .file import EXECUTES, SEMAINES, _plannings, _rapports
from .models import StatutRapport

#: [H] Profondeur de la liste des retards.
SEMAINES_RETARDS = 13
#: [D, 34.A] Délai de l'alerte au superviseur, après la visite.
DELAI_ALERTE = timedelta(hours=48)
#: [H] On n'alerte pas pour des visites plus anciennes (première mise en service, reprise).
FENETRE_ALERTE = timedelta(days=7)
#: Rapport absent ou en brouillon : encore attendu (les autres ont été soumis au moins une fois).
NON_SOUMIS = models.Q(rapport__isnull=True) | models.Q(rapport__statut=StatutRapport.BROUILLON)


def _visibles(utilisateur, pays) -> list[Planning]:
    """Les plannings des délégués que l'utilisateur encadre : responsable, remplaçant, DM."""
    from apps.planning.echeances import dms_du_planning
    from apps.planning.services import mode_de_decision

    debut = lundi(aujourdhui(pays)) - timedelta(weeks=SEMAINES_RETARDS - 1)
    return [
        p for p in _plannings(utilisateur, pays, depuis=debut)
        if mode_de_decision(utilisateur, p) in (ModeDecision.DIRECT, ModeDecision.REMPLACEMENT)
        or utilisateur.pk in dms_du_planning(p)
    ]  # fmt: skip


def retards(utilisateur, pays, delegue_id=None) -> dict:
    """CA1 : les délégués concernés (pour le filtre), puis les rapports non soumis et les
    journées anciennes non validées, éventuellement d'un seul délégué."""
    from .validation import journee_validee

    today = aujourdhui(pays)
    file_depuis = lundi(today) - timedelta(weeks=SEMAINES - 1)
    plannings = _visibles(utilisateur, pays)
    rapports, journees, delegues = [], [], {}
    for planning in plannings:
        en_retard = list(
            planning.visites.filter(archive_le__isnull=True, statut=StatutVisite.EFFECTUEE,
                                    date__lt=today)
            .filter(NON_SOUMIS)
            .select_related("prospect", "etablissement", "rapport")
            .order_by("date", "heure")
        )  # fmt: skip
        for v in en_retard:
            v.delegue = planning.delegue
            v.etat = "brouillon" if getattr(v, "rapport", None) else "attendu"
            v.jours_de_retard = (today - v.date).days
        rapports += en_retard
        if planning.semaine < file_depuis:
            jours = sorted(set(
                planning.visites.filter(archive_le__isnull=True, statut=StatutVisite.EFFECTUEE)
                .values_list("date", flat=True)
            ))  # fmt: skip
            for jour in jours:
                if not journee_validee(planning, jour):
                    ligne = {"delegue": planning.delegue, "date": jour, "planning": planning.pk}
                    journees.append({**ligne, **_rapports(planning, jour)})
        if en_retard or any(j["delegue"].pk == planning.delegue_id for j in journees):
            delegues[planning.delegue_id] = planning.delegue
    if delegue_id is not None:
        rapports = [v for v in rapports if v.delegue.pk == delegue_id]
        journees = [j for j in journees if j["delegue"].pk == delegue_id]
    return {
        "delegues": sorted(delegues.values(), key=lambda d: (d.last_name, d.first_name)),
        "rapports": sorted(rapports, key=lambda v: (v.date, v.heure or datetime.min.time())),
        "journees": sorted(journees, key=lambda j: j["date"]),
    }


def alertes(pays, maintenant: datetime) -> int:
    """34.A : 48 h après la visite, le rapport toujours pas soumis prévient le responsable du
    poste, une seule fois par délégué et par jour."""
    from apps.identite.models import Utilisateur
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier_une_fois
    from apps.planning.services import responsables

    depuis = (maintenant - FENETRE_ALERTE).date()
    visites = (
        Visite.objects.filter(pays=pays, archive_le__isnull=True, statut=StatutVisite.EFFECTUEE,
                              date__gte=depuis, planning__statut__in=EXECUTES)
        .filter(NON_SOUMIS)
        .select_related("planning__delegue")
    )  # fmt: skip
    # Une alerte par délégué et par jour : plusieurs visites du même jour ne se répètent pas.
    par_jour: dict = {}
    for v in visites:
        fin = v.fin_le or debut_du_jour(pays, v.date + timedelta(days=1))
        if maintenant >= fin + DELAI_ALERTE:
            par_jour.setdefault((v.planning, v.date), []).append(v)
    nombre = 0
    for (planning, jour), en_retard in par_jour.items():
        delegue = planning.delegue
        nom = f"{delegue.first_name} {delegue.last_name}".strip()
        for sup in Utilisateur.objects.filter(pk__in=responsables(planning)):
            if notifier_une_fois(sup, TypeNotification.RAPPORT_EN_RETARD, pays,
                                 f"rapport-retard-{delegue.pk}-{jour.isoformat()}",
                                 delegue=str(delegue.pk), date=jour.isoformat(),
                                 nombre=len(en_retard), nom=nom):  # fmt: skip
                nombre += 1
    return nombre

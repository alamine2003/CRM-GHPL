"""Validation des rapports (RPT-013, RPT-018, RG-034, RG-035 ; 0.6.3).

Trois gestes : valider un rapport (`unitaire`), une journée (`journee`) ou les journées
conformes d'un coup (`lot`). Chaque rapport validé porte son validateur, la date et le mode
(RPT-013 CA2, RG-034). Le remplaçant d'un superviseur valide en mode `remplacement`, le DM
par escalade en mode `escalade` (RPT-018) ; le mode se lit dans l'historique (CA1).

Règles retenues :
- 22.A [D, 7 octobre 2026] : une journée se valide quand tous ses rapports sont soumis ; une
  visite effectuée sans rapport soumis la bloque.
- 23.A [D, 7 octobre 2026] : le lot ne prend que les journées « conformes », sans rapport
  attendu ni horodatage douteux (RPT-013 CA1, RG-035).
- [H] Escalade : un rapport soumis qui attend depuis plus que le délai d'escalade du pays
  (`delai_escalade_heures_ouvrees`, celui des plannings, PLN-016) ouvre sa journée au DM du
  périmètre ; le superviseur garde la main.

Une journée validée est figée : son classement de conformité ne bouge plus (VIS-010 CA3) et
elle quitte « À traiter ». Valider le dernier rapport d'une journée complète la valide aussi.
"""

from datetime import date

from django.db import models, transaction
from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import status

from apps.planning import conformite
from apps.planning.calendrier import lundi
from apps.planning.etats import StatutVisite
from apps.planning.models import ModeDecision, Planning
from apps.planning.services import mode_de_decision
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import valeur_parametre

from .models import ModeValidation, Rapport, StatutRapport


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(action, objet=objet, pays=objet.pays, details=details)


def _en_attente(planning: Planning, jour: date):
    return Rapport.objects.filter(visite__planning=planning, visite__date=jour,
                                  visite__archive_le__isnull=True,
                                  statut=StatutRapport.SOUMIS)  # fmt: skip


def en_escalade(planning: Planning, jour: date, maintenant=None) -> bool:
    """[H] Un rapport soumis de la journée attend depuis plus que le délai d'escalade."""
    from apps.planning.echeances import heures_ouvrees

    plus_ancien = _en_attente(planning, jour).aggregate(le=models.Min("soumis_le"))["le"]
    if plus_ancien is None:
        return False
    delai = valeur_parametre(planning.pays, "delai_escalade_heures_ouvrees")
    return heures_ouvrees(planning.pays, plus_ancien, maintenant or timezone.now()) >= delai


def mode_pour(utilisateur, planning: Planning, jour: date) -> str | None:
    """Qui peut valider cette journée, et à quel titre : `direct` (responsable du poste),
    `remplacement` (son remplaçant daté) ou `escalade` (DM du périmètre, journée en retard)."""
    from apps.planning.echeances import dms_du_planning

    mode = mode_de_decision(utilisateur, planning)
    if mode in (ModeDecision.DIRECT, ModeDecision.REMPLACEMENT):
        return mode
    if utilisateur.pk in dms_du_planning(planning) and en_escalade(planning, jour):
        return ModeDecision.ESCALADE
    return None


def planning_du_jour(utilisateur, pays, delegue_id, jour: date) -> tuple[Planning, str]:
    """Le planning de la journée et le titre de l'utilisateur ; ailleurs, la journée n'existe
    pas pour lui (404)."""
    planning = (
        Planning.objects.filter(pays=pays, delegue_id=delegue_id, semaine=lundi(jour))
        .select_related("delegue", "pays")
        .first()
    )
    mode = mode_pour(utilisateur, planning, jour) if planning is not None else None
    if mode is None:
        raise Http404
    return planning, mode


def _mode_rapport(titre: str, geste: str) -> str:
    """RG-034 : le remplacement et l'escalade priment sur le geste."""
    if titre == ModeDecision.REMPLACEMENT:
        return ModeValidation.REMPLACEMENT
    if titre == ModeDecision.ESCALADE:
        return ModeValidation.ESCALADE
    return geste


def manquants(planning: Planning, jour: date) -> int:
    """22.A : visites effectuées de la journée dont le rapport n'est pas soumis."""
    effectuees = planning.visites.filter(archive_le__isnull=True, date=jour,
                                         statut=StatutVisite.EFFECTUEE)  # fmt: skip
    transmis = Rapport.objects.filter(
        visite__in=effectuees, statut__in=(StatutRapport.SOUMIS, StatutRapport.VALIDE)
    )
    return effectuees.count() - transmis.count()


def _valider(rapport: Rapport, par, mode: str) -> Rapport:
    rapport.statut = StatutRapport.VALIDE
    rapport.valide_le = timezone.now()
    rapport.valide_par = par
    rapport.mode_validation = mode
    rapport.save(update_fields=["statut", "valide_le", "valide_par", "mode_validation",
                                "modifie_le"])  # fmt: skip
    _auditer("rapport.validation", rapport, mode=mode, visite=str(rapport.visite_id))
    return rapport


def _figer_si_complete(planning: Planning, jour: date) -> bool:
    """La journée dont tous les rapports sont validés est validée : elle se fige."""
    if manquants(planning, jour) or _en_attente(planning, jour).exists():
        return False
    journee = conformite.recalculer(planning, jour)
    conformite.figer(journee)
    return True


@transaction.atomic
def valider_rapport(rapport: Rapport, par) -> Rapport:
    """RPT-013 : un rapport soumis, validé seul (mode `unitaire`)."""
    visite = rapport.visite
    titre = planning_du_jour(par, rapport.pays, visite.planning.delegue_id, visite.date)[1]
    if rapport.statut != StatutRapport.SOUMIS:
        raise ErreurMetier("rapport_non_soumis",
                           _("Seul un rapport soumis se valide."),
                           status.HTTP_409_CONFLICT)  # fmt: skip
    _valider(rapport, par, _mode_rapport(titre, ModeValidation.UNITAIRE))
    _figer_si_complete(visite.planning, visite.date)
    return rapport


@transaction.atomic
def valider_journee(planning: Planning, jour: date, par, titre: str,
                    geste: str = ModeValidation.JOURNEE) -> int:  # fmt: skip
    """RPT-013 : tous les rapports soumis de la journée ; 22.A : impossible tant qu'une visite
    effectuée n'a pas son rapport soumis. Renvoie le nombre de rapports validés."""
    if conformite.recalculer(planning, jour).fige_le is not None:
        raise ErreurMetier("journee_validee", _("Cette journée est déjà validée."),
                           status.HTTP_409_CONFLICT)  # fmt: skip
    if n := manquants(planning, jour):
        raise ErreurMetier(
            "rapports_non_soumis",
            _("%(n)s rapport(s) de cette journée ne sont pas encore soumis.") % {"n": n},
            status.HTTP_409_CONFLICT,
        )  # fmt: skip
    rapports = list(_en_attente(planning, jour).select_related("visite"))
    for rapport in rapports:
        _valider(rapport, par, _mode_rapport(titre, geste))
    conformite.figer(conformite.recalculer(planning, jour))
    _auditer("rapport.validation_journee", planning, date=jour.isoformat(),
             mode=_mode_rapport(titre, geste), rapports=len(rapports))  # fmt: skip
    return len(rapports)


def eligible_au_lot(planning: Planning, jour: date) -> bool:
    """23.A, RG-035 : conforme, aucun rapport attendu, aucun horodatage douteux."""
    journee = conformite.recalculer(planning, jour)
    if journee.fige_le is not None or journee.classement != "conforme":
        return False
    if manquants(planning, jour):
        return False
    return not _en_attente(planning, jour).filter(horodatage_douteux=True).exists()


@transaction.atomic
def valider_lot(par, pays, journees: list[tuple]) -> dict:
    """RPT-013 CA1 : « Valider les n conformes » ne valide que les journées éligibles parmi
    celles affichées ; les autres restent en attente, sans erreur."""
    validees, rapports = 0, 0
    for delegue_id, jour in journees:
        try:
            planning, titre = planning_du_jour(par, pays, delegue_id, jour)
        except Http404:
            continue
        if not eligible_au_lot(planning, jour):
            continue
        rapports += valider_journee(planning, jour, par, titre, ModeValidation.LOT)
        validees += 1
    return {"journees": validees, "rapports": rapports}

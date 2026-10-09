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

Réouverture (RPT-016, 0.6.6) : un rapport validé se rouvre avec un motif ; par le responsable
(ou son remplaçant) jusqu'à 30 jours après la validation, par le DM du périmètre au-delà
(CA1). [D, 8 octobre 2026, 32.A] Sa journée revient dans « À traiter » jusqu'à la nouvelle
validation ; son classement de conformité, lui, reste figé : seules les visites le fondent.
"""

from datetime import date, timedelta

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


#: Rapports d'une journée validée qui la font revenir dans la file : rouverts (RPT-016), puis
#: resoumis ou renvoyés pour correction.
EN_REPRISE = (StatutRapport.ROUVERT, StatutRapport.SOUMIS, StatutRapport.A_CORRIGER)


def journee_validee(planning: Planning, jour: date, journee=None) -> bool:
    """Figée et sans rapport repris depuis : la journée est validée (32.A)."""
    journee = journee or conformite.recalculer(planning, jour)
    if journee.fige_le is None:
        return False
    return not Rapport.objects.filter(visite__planning=planning, visite__date=jour,
                                      visite__archive_le__isnull=True,
                                      statut__in=EN_REPRISE).exists()  # fmt: skip


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


#: RPT-016 : le DM du périmètre lit une journée hors escalade, pour en rouvrir un rapport.
CONSULTATION = "consultation"


def planning_du_jour(utilisateur, pays, delegue_id, jour: date,
                     consultation: bool = False) -> tuple[Planning, str]:  # fmt: skip
    """Le planning de la journée et le titre de l'utilisateur ; ailleurs, la journée n'existe
    pas pour lui (404). En `consultation`, le DM du périmètre la lit aussi."""
    from apps.planning.echeances import dms_du_planning

    planning = (
        Planning.objects.filter(pays=pays, delegue_id=delegue_id, semaine=lundi(jour))
        .select_related("delegue", "pays")
        .first()
    )
    mode = mode_pour(utilisateur, planning, jour) if planning is not None else None
    if mode is None and consultation and planning is not None:
        if utilisateur.pk in dms_du_planning(planning):
            mode = CONSULTATION
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
    _prevenir_validation(rapport)
    return rapport


def _prevenir_validation(rapport: Rapport) -> None:
    """prd.md §18 (0.6.8) : « n rapports validés » au délégué, regroupés par jour."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier_regroupe
    from apps.socle.services import aujourdhui

    jour = aujourdhui(rapport.pays).isoformat()
    notifier_regroupe(rapport.delegue, TypeNotification.RAPPORTS_VALIDES, rapport.pays,
                      f"valides:{jour}")  # fmt: skip


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
    if journee_validee(planning, jour):
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


def eligible_au_lot(planning: Planning, jour: date, journee=None, attendus=None) -> bool:
    """23.A, RG-035 : conforme, aucun rapport attendu, aucun horodatage douteux. La file
    (0.9.4) donne la journée déjà calculée et ses rapports attendus."""
    journee = journee or conformite.recalculer(planning, jour)
    if journee_validee(planning, jour, journee) or journee.classement != "conforme":
        return False
    if manquants(planning, jour) if attendus is None else attendus:
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


#: RPT-014 : les parties du socle qu'une correction peut viser ; s'y ajoutent les champs du
#: pays du rapport, par leur code.
PARTIES_SOCLE = ("presentations", "remises", "resultat", "resume", "prochaine_action",
                 "pieces_jointes")  # fmt: skip


@transaction.atomic
def demander_correction(rapport: Rapport, par, commentaire: str, champs: list[str]) -> Rapport:
    """RPT-014 : le superviseur renvoie un rapport soumis au délégué, avec un commentaire
    obligatoire (CA1) et les champs à revoir ; sans échéance (DC-60). Les autres rapports de la
    journée restent validables (CA2) ; la journée, elle, attend la nouvelle soumission (22.A)."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    visite = rapport.visite
    planning_du_jour(par, rapport.pays, visite.planning.delegue_id, visite.date)
    if rapport.statut != StatutRapport.SOUMIS:
        raise ErreurMetier("rapport_non_soumis",
                           _("Seul un rapport soumis peut être renvoyé pour correction."),
                           status.HTTP_409_CONFLICT)  # fmt: skip
    texte = (commentaire or "").strip()
    if not texte:
        raise ErreurMetier("commentaire_requis",
                           _("Dites au délégué ce qu'il doit corriger."),
                           champ="commentaire")  # fmt: skip
    permis = set(PARTIES_SOCLE) | {d["code"] for d in rapport.definitions}
    inconnus = [c for c in champs if c not in permis]
    if inconnus:
        raise ErreurMetier("champ_inconnu", _("Champ du rapport inconnu."),
                           champ="champs", inconnus=inconnus)  # fmt: skip
    rapport.statut = StatutRapport.A_CORRIGER
    rapport.correction_le = timezone.now()
    rapport.correction_par = par
    rapport.correction_commentaire = texte
    rapport.correction_champs = list(dict.fromkeys(champs))
    rapport.save(update_fields=["statut", "correction_le", "correction_par",
                                "correction_commentaire", "correction_champs",
                                "modifie_le"])  # fmt: skip
    _auditer("rapport.correction_demandee", rapport, visite=str(visite.pk),
             champs=rapport.correction_champs)  # fmt: skip
    # Sans nom de prospect ni contenu médical dans le texte de la notification (NOT-002 CA2).
    notifier(rapport.delegue, TypeNotification.CORRECTION_DEMANDEE, rapport.pays,
             visite=str(visite.pk), date=visite.date.isoformat(),
             nom=f"{par.first_name} {par.last_name}".strip())  # fmt: skip
    return rapport


#: RPT-016 CA1 : au-delà, seul le DM du périmètre rouvre un rapport validé.
DELAI_REOUVERTURE = timedelta(days=30)


def peut_rouvrir(utilisateur, rapport: Rapport, titre: str) -> bool:
    """Le responsable (ou son remplaçant) jusqu'à 30 jours après la validation ; le DM du
    périmètre, toujours."""
    from apps.planning.echeances import dms_du_planning

    if rapport.statut != StatutRapport.VALIDE or rapport.valide_le is None:
        return False
    if utilisateur.pk in dms_du_planning(rapport.visite.planning):
        return True
    recent = timezone.now() - rapport.valide_le <= DELAI_REOUVERTURE
    return titre in (ModeDecision.DIRECT, ModeDecision.REMPLACEMENT) and recent


@transaction.atomic
def rouvrir(rapport: Rapport, par, motif: str) -> Rapport:
    """RPT-016 : rouvre un rapport validé, avec un motif obligatoire ; audité et notifié
    (CA2). Le délégué le corrige et le soumet à nouveau ; sa journée revient dans la file."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier
    from apps.planning.services import responsables

    visite = rapport.visite
    titre = planning_du_jour(par, rapport.pays, visite.planning.delegue_id, visite.date,
                             consultation=True)[1]  # fmt: skip
    if rapport.statut != StatutRapport.VALIDE:
        raise ErreurMetier("rapport_non_valide", _("Seul un rapport validé se rouvre."),
                           status.HTTP_409_CONFLICT)  # fmt: skip
    if not peut_rouvrir(par, rapport, titre):
        raise ErreurMetier("delai_reouverture",
                           _("Validé il y a plus de 30 jours : seul le DM peut le rouvrir."),
                           status.HTTP_403_FORBIDDEN)  # fmt: skip
    texte = (motif or "").strip()
    if not texte:
        raise ErreurMetier("motif_requis", _("Dites pourquoi vous rouvrez ce rapport."),
                           champ="motif")  # fmt: skip
    rapport.statut = StatutRapport.ROUVERT
    rapport.rouvert_le = timezone.now()
    rapport.rouvert_par = par
    rapport.rouvert_motif = texte
    rapport.save(update_fields=["statut", "rouvert_le", "rouvert_par", "rouvert_motif",
                                "modifie_le"])  # fmt: skip
    _auditer("rapport.reouverture", rapport, visite=str(visite.pk), motif=texte,
             valide_le=rapport.valide_le.isoformat())  # fmt: skip
    nom = f"{par.first_name} {par.last_name}".strip()
    donnees = {"visite": str(visite.pk), "date": visite.date.isoformat(), "nom": nom}
    notifier(rapport.delegue, TypeNotification.RAPPORT_ROUVERT, rapport.pays, **donnees)
    # 31.A : quand le DM rouvre, le superviseur du délégué l'apprend aussi.
    from apps.identite.models import Utilisateur

    autres = responsables(visite.planning) - {par.pk, rapport.delegue_id}
    if titre not in (ModeDecision.DIRECT, ModeDecision.REMPLACEMENT):
        for sup in Utilisateur.objects.filter(pk__in=autres):
            notifier(sup, TypeNotification.RAPPORT_ROUVERT, rapport.pays,
                     delegue=str(visite.planning.delegue_id), **donnees)  # fmt: skip
    return rapport

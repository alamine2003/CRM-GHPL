"""Contrôles de conformité des visites (VIS-010, RG-029, prd.md §12).

Calculés par le serveur à la réception de chaque action du téléphone, ils ne bloquent rien :
ils classent la journée du délégué « conforme » ou « à vérifier » (CA1). Les seuils viennent
des paramètres du pays (CA2) : plage horaire, visites sans GPS tolérées, distance de pointage,
durée d'une visite. Tant que la journée n'est pas validée (cycle 0.6), elle est recalculée à
chaque lecture, donc avec les paramètres du moment ; validée, elle est figée (CA3).

Écarts relevés, visite par visite : `hors_plage` (début ou fin hors de la plage horaire),
`distance` (début ou fin plus loin du lieu que la distance de pointage), `duree_courte`,
`duree_longue`, `imprevue` (VIS-008), `a_justifier` (restée prévue après sa journée, VIS-009) ;
pour la journée, `sans_gps` quand les visites sans GPS dépassent la tolérance.
"""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.socle.services import aujourdhui, valeur_parametre

from .etats import StatutVisite
from .models import Classement, ConformiteJournee, Planning, Visite


def seuils(pays) -> dict:
    return {
        "plage": valeur_parametre(pays, "plage_horaire_visites"),
        "sans_gps_toleres": valeur_parametre(pays, "visites_sans_gps_tolerees"),
        "distance_m": valeur_parametre(pays, "distance_pointage_m"),
        "duree_min": valeur_parametre(pays, "duree_visite_minutes"),
    }


def _nom(visite: Visite) -> str | None:
    p = visite.prospect
    return " ".join(x for x in (p.prenom, p.nom) if x) if p else None


def _heure_locale(moment: datetime, fuseau: ZoneInfo) -> time:
    return moment.astimezone(fuseau).time()


def ecarts_du_jour(planning: Planning, jour: date, regles: dict) -> list[dict]:
    """Les écarts d'une journée, dans l'ordre des visites ; vide : la journée est conforme."""
    fuseau = ZoneInfo(planning.pays.fuseau)
    debut_plage = time.fromisoformat(regles["plage"]["debut"])
    fin_plage = time.fromisoformat(regles["plage"]["fin"])
    visites = (
        planning.visites.filter(archive_le__isnull=True, date=jour)
        .select_related("prospect")
        .order_by("heure", "ordre")
    )
    ecarts: list[dict] = []
    sans_gps = 0

    def ecart(code, visite=None, **detail):
        ecarts.append({"code": code, "visite": str(visite.pk) if visite else None,
                       "prospect": _nom(visite) if visite else None,
                       "heure": visite.heure.strftime("%H:%M") if visite and visite.heure
                       else None, **detail})  # fmt: skip

    for v in visites:
        if v.est_imprevue:
            ecart("imprevue", v, justification=v.justification)
        if v.statut == StatutVisite.PREVUE:
            if jour < aujourdhui(planning.pays):
                ecart("a_justifier", v)
            continue
        if v.debut_le is None:
            continue  # un écart déclaré sans démarrer : son motif suffit (VIS-005 à VIS-007)
        heures = [_heure_locale(v.debut_le, fuseau)]
        if v.fin_le:
            heures.append(_heure_locale(v.fin_le, fuseau))
        if any(h < debut_plage or h > fin_plage for h in heures):
            ecart("hors_plage", v, debut=heures[0].strftime("%H:%M"),
                  fin=heures[1].strftime("%H:%M") if len(heures) > 1 else None)  # fmt: skip
        if v.sans_gps or (v.fin_le and v.fin_sans_gps):
            sans_gps += 1
        distances = [d for d in (v.distance_debut_m, v.distance_fin_m) if d is not None]
        if distances and max(distances) > regles["distance_m"]:
            ecart("distance", v, distance_m=max(distances), seuil_m=regles["distance_m"])
        if v.statut == StatutVisite.EFFECTUEE and v.fin_le:
            minutes = round((v.fin_le - v.debut_le).total_seconds() / 60)
            if minutes < regles["duree_min"]["min"]:
                ecart("duree_courte", v, minutes=minutes, seuil=regles["duree_min"]["min"])
            elif minutes > regles["duree_min"]["max"]:
                ecart("duree_longue", v, minutes=minutes, seuil=regles["duree_min"]["max"])
    if sans_gps > regles["sans_gps_toleres"]:
        ecart("sans_gps", nombre=sans_gps, tolerees=regles["sans_gps_toleres"])
    return ecarts


@transaction.atomic
def recalculer(planning: Planning, jour: date) -> ConformiteJournee:
    """Calcule et garde la conformité d'une journée ; une journée figée ne change plus (CA3)."""
    existante = (
        ConformiteJournee.objects.select_for_update()
        .filter(delegue_id=planning.delegue_id, date=jour)
        .first()
    )
    if existante is not None and existante.fige_le is not None:
        return existante
    regles = seuils(planning.pays)
    ecarts = ecarts_du_jour(planning, jour, regles)
    champs = {
        "planning": planning,
        "classement": Classement.A_VERIFIER if ecarts else Classement.CONFORME,
        "ecarts": ecarts,
        "seuils": regles,
        "calcule_le": timezone.now(),
    }
    if existante is None:
        return ConformiteJournee.objects.create(pays=planning.pays,
                                                delegue_id=planning.delegue_id, date=jour,
                                                **champs)  # fmt: skip
    for cle, valeur in champs.items():
        setattr(existante, cle, valeur)
    existante.save()
    return existante


def figer(conformite: ConformiteJournee) -> ConformiteJournee:
    """À la validation de la journée (cycle 0.6) : le classement ne bouge plus (CA3)."""
    if conformite.fige_le is None:
        conformite.fige_le = timezone.now()
        conformite.save(update_fields=["fige_le", "modifie_le"])
    return conformite


def de_la_semaine(planning: Planning) -> list[ConformiteJournee]:
    """Les journées passées ou du jour qui ont des visites, recalculées si non figées."""
    today = aujourdhui(planning.pays)
    jours = sorted(
        set(
            planning.visites.filter(archive_le__isnull=True, date__lte=today).values_list(
                "date", flat=True
            )
        )
    )
    return [recalculer(planning, j) for j in jours]

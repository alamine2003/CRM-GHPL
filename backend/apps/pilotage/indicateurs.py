"""Moteur commun des indicateurs de pilotage (cycle 0.7, prd.md §5 et §14.18).

Chaque indicateur se recalcule à partir des visites, jamais repris d'un outil externe. Les
comptages portent sur un délégué et une période (des dates incluses) ; les taux s'en déduisent,
bornés à 100 % et vides quand rien ne les fonde (DSH-012 CA1). Aucun score, aucune appréciation,
aucun classement (DC-49).

- **Prévues** : les visites de la version approuvée des plannings (RG-018), à leur date
  approuvée. Une visite est **échue** quand sa journée est passée ou qu'elle est déjà décidée
  (faite, ou un écart déclaré) : les jours à venir n'abaissent aucun taux [D, 8 octobre 2026,
  délégation].
- **Réalisation** (KPI-03, DC-50) : prévues effectuées / prévues échues ; publiée avec un second
  chiffre, la **part des écarts justifiés** : écarts motivés (annulée, reportée, prospect
  absent, non réalisée) et visites couvertes par une indisponibilité (DC-51), sur les prévues
  échues non effectuées.
- **Imprévues** (VIS-008) : effectuées hors planning ; elles comptent dans les visites faites et
  n'abaissent aucun taux (DSH-012 CA1). La **part planifiée** n'est qu'une information.
- **Géolocalisation** (§14.18, DC-49) : visites faites dont le pointage du démarrage est à la
  distance du pays au plus (ou au rayon de l'établissement, DC-55), avec une précision
  suffisante / visites faites.
- **Rapports dans le délai** (KPI-04) : rapports soumis avant l'échéance / visites faites dont
  l'échéance est passée ou le rapport déjà soumis.
- **Couverture** (§14.18, KPI-08) : prospects de la liste cible des postes occupés sur la
  période, visités au moins une fois / liste cible ; pour les potentiels A et B, aussi la part
  vue à la fréquence cible, ramenée à la durée de la période (fréquence par cycle de
  `cycle_visite_semaines` semaines).
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import date, timedelta

from django.db.models import Q

from apps.organisation.models import Occupation
from apps.planning.calendrier import lundi
from apps.planning.etats import StatutVisite
from apps.planning.indisponibilite import couverte, du_planning
from apps.planning.models import Decision, Planning, Visite
from apps.socle.services import aujourdhui, valeur_parametre

#: Écarts déclarés avec un motif (VIS-005 à VIS-007) : justifiés quand le motif est donné.
ECARTS = (StatutVisite.ANNULEE, StatutVisite.REPORTEE, StatutVisite.PROSPECT_ABSENT,
          StatutVisite.NON_REALISEE)  # fmt: skip
#: Une visite encore à faire.
A_FAIRE = (StatutVisite.PREVUE, StatutVisite.EN_COURS)


def taux(numerateur: int, denominateur: int) -> float | None:
    """Un taux borné à 100 % ; vide sans dénominateur (DSH-012 CA1)."""
    if not denominateur:
        return None
    return round(min(1.0, numerateur / denominateur), 3)


def semaine(jour: date) -> tuple[date, date]:
    debut = lundi(jour)
    return debut, debut + timedelta(days=6)


def _visites(pays, delegue, debut: date, fin: date) -> tuple[list, list, dict]:
    """Les visites approuvées de la période, les imprévues, et les indisponibilités par
    planning."""
    from apps.planning import services
    from apps.planning.programme import _visites_approuvees

    plannings = (
        Planning.objects.filter(pays=pays, delegue=delegue, semaine__gte=lundi(debut),
                                semaine__lte=fin, versions__decision=Decision.APPROUVE)
        .distinct()
        .order_by("semaine")
    )  # fmt: skip
    approuvees, indisponibles = [], {}
    for planning in plannings:
        indisponibles[planning.pk] = du_planning(planning)
        for v in _visites_approuvees(planning, services.reference(planning)):
            if debut <= v.date <= fin:
                approuvees.append(v)
    imprevues = list(
        Visite.objects.filter(pays=pays, planning__delegue=delegue, archive_le__isnull=True,
                              est_imprevue=True, date__gte=debut, date__lte=fin)
        .select_related("etablissement")
    )  # fmt: skip
    return approuvees, imprevues, indisponibles


def _rapports(visites: list) -> dict:
    from apps.rapports.models import Rapport

    lus = Rapport.objects.filter(visite_id__in=[v.pk for v in visites]).only(
        "visite_id", "statut", "soumis_le", "en_retard"
    )
    return {r.visite_id: r for r in lus}


def geolocalisee(visite: Visite, distance_pays: int) -> bool:
    """§14.18 : le pointage du démarrage est assez près du lieu, et assez précis (DC-55)."""
    if visite.debut_le is None or visite.sans_gps or visite.distance_debut_m is None:
        return False
    seuil = (visite.etablissement.rayon_pointage_m if visite.etablissement else None) or (
        distance_pays
    )
    precision = visite.debut_precision_m
    return visite.distance_debut_m <= seuil and (precision is None or precision <= seuil)


def _cibles(pays, delegue, debut: date, fin: date) -> dict:
    """Les prospects de la liste cible des postes occupés sur la période, avec leur potentiel
    et la plus forte fréquence."""
    from apps.prospects.models import Cible

    postes = Occupation.objects.filter(
        Q(fin__isnull=True) | Q(fin__gt=debut), utilisateur=delegue, poste__pays=pays,
        debut__lte=fin,
    ).values("poste_id")  # fmt: skip
    cibles = Cible.objects.filter(
        Q(fin__isnull=True) | Q(fin__gt=debut), poste_id__in=postes, debut__lte=fin,
        prospect__archive_le__isnull=True,
    ).values_list("prospect_id", "prospect__potentiel", "frequence")  # fmt: skip
    liste: dict = {}
    for prospect, potentiel, frequence in cibles:
        avant = liste.get(prospect)
        liste[prospect] = (potentiel, max(frequence, avant[1] if avant else 0))
    return liste


def calculer(pays, delegue, debut: date, fin: date) -> dict:
    """Les comptages et les taux d'un délégué sur une période."""
    today = aujourdhui(pays)
    distance = valeur_parametre(pays, "distance_pointage_m")
    approuvees, imprevues, indisponibles = _visites(pays, delegue, debut, fin)

    echues, a_venir, effectuees_prevues, justifies, a_justifier = [], 0, 0, 0, 0
    for v in approuvees:
        passee = v.date < today
        if v.statut in A_FAIRE and not passee:
            a_venir += 1
            continue
        echues.append(v)
        if v.statut == StatutVisite.EFFECTUEE:
            effectuees_prevues += 1
        elif v.statut in ECARTS and v.motif_ecart_id:
            justifies += 1
        elif v.statut == StatutVisite.PREVUE and couverte(v, indisponibles[v.planning_id]):
            justifies += 1  # DC-51 : l'indisponibilité justifie la journée d'un coup
        elif v.statut == StatutVisite.PREVUE:
            a_justifier += 1
    faites = [v for v in approuvees if v.statut == StatutVisite.EFFECTUEE] + [
        v for v in imprevues if v.statut == StatutVisite.EFFECTUEE
    ]
    imprevues_faites = len(faites) - effectuees_prevues
    geo = sum(1 for v in faites if geolocalisee(v, distance))

    rapports = _rapports(faites)
    soumis = dans_delai = valides = attendus = en_retard = 0
    for v in faites:
        r = rapports.get(v.pk)
        if r is not None and r.soumis_le is not None:
            soumis += 1
            dans_delai += int(not r.en_retard)
            valides += int(r.statut == "valide")
        else:
            attendus += 1
            en_retard += int(v.date < today)

    liste = _cibles(pays, delegue, debut, fin)
    visites_par_prospect = Counter(v.prospect_id for v in faites if v.prospect_id)
    semaines = max(1, round(((fin - debut).days + 1) / 7))
    cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
    ab = {p: f for p, (potentiel, f) in liste.items() if potentiel in ("A", "B")}
    vus = sum(1 for p in liste if visites_par_prospect[p])
    ab_vus = sum(1 for p in ab if visites_par_prospect[p])
    ab_frequence = sum(
        1 for p, f in ab.items()
        if visites_par_prospect[p] >= max(1, math.ceil(f * semaines / cycle))
    )  # fmt: skip

    comptes = {
        "activite": bool(approuvees or imprevues),
        "visites": {
            "prevues": len(approuvees),
            "echues": len(echues),
            "a_venir": a_venir,
            "effectuees_prevues": effectuees_prevues,
            "ecarts": len(echues) - effectuees_prevues,
            "ecarts_justifies": justifies,
            "a_justifier": a_justifier,
            "imprevues": imprevues_faites,
            "effectuees": len(faites),
            "geolocalisees": geo,
        },
        "rapports": {
            "soumis": soumis,
            "dans_delai": dans_delai,
            "valides": valides,
            "a_soumettre": attendus,
            "en_retard": en_retard,
        },
        "couverture": {
            "cibles": len(liste),
            "visitees": vus,
            "cibles_ab": len(ab),
            "visitees_ab": ab_vus,
            "frequence_ab": ab_frequence,
        },
    }
    return {**comptes, "taux": taux_de(comptes)}


def taux_de(comptes: dict) -> dict:
    """Les taux, toujours déduits des comptages : ceux d'une équipe viennent de ses sommes, jamais
    d'une moyenne de taux."""
    v, r, c = comptes["visites"], comptes["rapports"], comptes["couverture"]
    return {
        "realisation": taux(v["effectuees_prevues"], v["echues"]),
        "ecarts_justifies": taux(v["ecarts_justifies"], v["ecarts"]),
        "geolocalisation": taux(v["geolocalisees"], v["effectuees"]),
        "rapports_dans_delai": taux(r["dans_delai"], r["soumis"] + r["en_retard"]),
        "couverture": taux(c["visitees"], c["cibles"]),
        "couverture_ab": taux(c["visitees_ab"], c["cibles_ab"]),
        "frequence_ab": taux(c["frequence_ab"], c["cibles_ab"]),
        "part_planifiee": taux(v["effectuees_prevues"], v["effectuees"]),
    }


def somme(liste: list[dict]) -> dict:
    """Les comptages additionnés (une équipe, un réseau) et leurs taux."""
    base = liste or [calculer_vide()]
    comptes = {"activite": any(x["activite"] for x in base)}
    for bloc in ("visites", "rapports", "couverture"):
        comptes[bloc] = {k: sum(x[bloc][k] for x in base) for k in base[0][bloc]}
    return {**comptes, "taux": taux_de(comptes)}


def calculer_vide() -> dict:
    zero = lambda *cles: dict.fromkeys(cles, 0)  # noqa: E731
    return {
        "activite": False,
        "visites": zero("prevues", "echues", "a_venir", "effectuees_prevues", "ecarts",
                        "ecarts_justifies", "a_justifier", "imprevues", "effectuees",
                        "geolocalisees"),
        "rapports": zero("soumis", "dans_delai", "valides", "a_soumettre", "en_retard"),
        "couverture": zero("cibles", "visitees", "cibles_ab", "visitees_ab", "frequence_ab"),
    }  # fmt: skip


def jours(pays, delegue, debut: date, fin: date) -> list[dict]:
    """La courbe de la période : visites prévues (approuvées) et faites, jour par jour."""
    approuvees, imprevues, _ = _visites(pays, delegue, debut, fin)
    prevues = Counter(v.date for v in approuvees)
    faites = Counter(v.date for v in approuvees + imprevues if v.statut == StatutVisite.EFFECTUEE)
    return [
        {"date": debut + timedelta(days=i), "prevues": prevues[debut + timedelta(days=i)],
         "effectuees": faites[debut + timedelta(days=i)]}
        for i in range((fin - debut).days + 1)
    ]  # fmt: skip


def mes_chiffres(pays, delegue, jour: date | None = None) -> dict:
    """DSH-001 : la semaine (celle de `jour`, celle-ci par défaut), la précédente pour la
    comparaison, et le cycle de visites qui se termine avec elle, pour la couverture."""
    from django.utils import timezone

    today = aujourdhui(pays)
    debut, fin = semaine(jour or today)
    cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
    debut_cycle = debut - timedelta(weeks=cycle - 1)
    return {
        "aujourdhui": today,
        "calcule_le": timezone.now(),
        "semaine": {"debut": debut, "fin": fin, **calculer(pays, delegue, debut, fin)},
        "precedente": {"debut": debut - timedelta(days=7), "fin": debut - timedelta(days=1),
                       **calculer(pays, delegue, debut - timedelta(days=7),
                                  debut - timedelta(days=1))},
        "cycle": {"debut": debut_cycle, "fin": fin, "semaines": cycle,
                  **calculer(pays, delegue, debut_cycle, fin)},
        "jours": jours(pays, delegue, debut, fin),
    }  # fmt: skip


def equipe_du_superviseur(pays, superviseur, debut: date, fin: date) -> list:
    """DSH-002 CA1 : les délégués des postes rattachés au superviseur pendant la période, avec
    leur poste ; jamais un délégué d'un poste qui ne lui est pas rattaché."""
    from apps.organisation.models import Rattachement

    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    postes = Rattachement.objects.filter(pendant, superviseur=superviseur, poste__pays=pays,
                                         debut__lte=fin).values("poste_id")  # fmt: skip
    occupations = (
        Occupation.objects.filter(pendant, poste_id__in=postes, debut__lte=fin)
        .exclude(utilisateur=superviseur)
        .select_related("utilisateur", "poste")
        .order_by("utilisateur__last_name", "utilisateur__first_name", "-debut")
    )
    vus, equipe = set(), []
    for o in occupations:
        if o.utilisateur_id not in vus:
            vus.add(o.utilisateur_id)
            equipe.append((o.utilisateur, o.poste))
    return equipe


def tableau_equipe(pays, superviseur, jour: date | None = None) -> dict:
    """DSH-002, DSH-012 : la semaine de chaque délégué de l'équipe, côte à côte, dans l'ordre
    alphabétique (DC-49 : aucun classement), la couverture sur le cycle, et le total de l'équipe
    tiré des sommes."""
    from django.utils import timezone

    today = aujourdhui(pays)
    debut, fin = semaine(jour or today)
    cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
    debut_cycle = debut - timedelta(weeks=cycle - 1)
    lignes = []
    for delegue, poste in equipe_du_superviseur(pays, superviseur, debut, fin):
        lignes.append({
            "delegue": delegue,
            "poste": poste,
            "semaine": calculer(pays, delegue, debut, fin),
            "cycle": calculer(pays, delegue, debut_cycle, fin),
        })  # fmt: skip
    return {
        "aujourdhui": today,
        "calcule_le": timezone.now(),
        "debut": debut,
        "fin": fin,
        "cycle": {"debut": debut_cycle, "fin": fin, "semaines": cycle},
        "delegues": lignes,
        "total": {
            "semaine": somme([x["semaine"] for x in lignes]),
            "cycle": somme([x["cycle"] for x in lignes]),
        },
    }

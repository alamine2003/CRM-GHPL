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
from collections import Counter, defaultdict
from datetime import date, timedelta

from django.db.models import Q

from apps.organisation.models import Occupation
from apps.planning.calendrier import lundi
from apps.planning.etats import StatutVisite
from apps.planning.indisponibilite import couverte
from apps.planning.models import Decision, Planning, Visite
from apps.planning.programme import LigneVisite, lignes_visites, visites_approuvees_de
from apps.socle.services import aujourdhui, valeur_parametre

from .delais import delais, durees

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


def geolocalisee(visite: LigneVisite, distance_pays: int) -> bool:
    """§14.18 : le pointage du démarrage est assez près du lieu, et assez précis (DC-55)."""
    if visite.debut_le is None or visite.sans_gps or visite.distance_debut_m is None:
        return False
    seuil = visite.rayon_pointage_m or distance_pays
    precision = visite.debut_precision_m
    return visite.distance_debut_m <= seuil and (precision is None or precision <= seuil)


class Lot:
    """Les données de plusieurs délégués sur une fenêtre, chargées en quelques requêtes
    groupées ; chaque période incluse dans la fenêtre (la semaine, la précédente, le cycle) se
    compte ensuite sans requête de plus (sauf la version approuvée de chaque planning)."""

    def __init__(self, pays, delegues, debut: date, fin: date):
        from apps.planning.models import Activite, TypeActivite
        from apps.prospects.models import Cible
        from apps.rapports.models import Rapport

        self.today = aujourdhui(pays)
        self.distance = valeur_parametre(pays, "distance_pointage_m")
        self.cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
        ids = [d.pk for d in delegues]
        plannings = list(
            Planning.objects.filter(pays=pays, delegue_id__in=ids, semaine__gte=lundi(debut),
                                    semaine__lte=fin, versions__decision=Decision.APPROUVE)
            .distinct()
            .order_by("semaine")
        )  # fmt: skip
        self.indisponibles: dict = defaultdict(list)
        for a in Activite.objects.filter(planning__in=plannings, archive_le__isnull=True,
                                         type=TypeActivite.INDISPONIBILITE):  # fmt: skip
            self.indisponibles[a.planning_id].append(a)
        self.approuvees: dict = defaultdict(list)
        # 0.9.4 : toutes les versions approuvées et leurs visites en deux requêtes.
        approuvees = visites_approuvees_de(plannings)
        for planning in plannings:
            for v in approuvees.get(planning.pk, []):
                if debut <= v.date <= fin:
                    self.approuvees[planning.delegue_id].append(v)
        self.imprevues: dict = defaultdict(list)
        for v in lignes_visites(
            Visite.objects.filter(pays=pays, planning__delegue_id__in=ids,
                                  archive_le__isnull=True, est_imprevue=True, date__gte=debut,
                                  date__lte=fin),
            "planning__delegue_id",
        ):  # fmt: skip
            self.imprevues[v.delegue_id].append(v)
        faites = [
            v.pk for liste in (*self.approuvees.values(), *self.imprevues.values())
            for v in liste if v.statut == StatutVisite.EFFECTUEE
        ]  # fmt: skip
        # 0.9.4 : des lignes nommées plutôt que des objets, des milliers à l'échelle d'un pays.
        # Par délégué et par dates plutôt que par une liste de milliers de visites.
        faites = set(faites)
        self.rapports = {
            r.visite_id: r
            for r in Rapport.objects.filter(
                visite__planning__delegue_id__in=ids, visite__date__gte=debut,
                visite__date__lte=fin,
            ).values_list("visite_id", "statut", "soumis_le", "en_retard", named=True)
            if r.visite_id in faites
        }  # fmt: skip
        pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
        self.occupations: dict = defaultdict(list)
        for o in Occupation.objects.filter(pendant, utilisateur_id__in=ids, poste__pays=pays,
                                           debut__lte=fin):  # fmt: skip
            self.occupations[o.utilisateur_id].append(o)
        postes = {o.poste_id for liste in self.occupations.values() for o in liste}
        # Colonnes seules : une liste cible de pays compte des milliers de lignes.
        self.cibles: dict = defaultdict(list)
        for poste, prospect, potentiel, frequence, c_debut, c_fin in Cible.objects.filter(
            pendant, poste_id__in=postes, debut__lte=fin, prospect__archive_le__isnull=True
        ).values_list("poste_id", "prospect_id", "prospect__potentiel", "frequence", "debut",
                      "fin"):  # fmt: skip
            self.cibles[poste].append((prospect, potentiel, frequence, c_debut, c_fin))

    def visites(self, delegue, debut: date, fin: date) -> tuple[list, list]:
        dans = lambda v: debut <= v.date <= fin  # noqa: E731
        return ([v for v in self.approuvees[delegue.pk] if dans(v)],
                [v for v in self.imprevues[delegue.pk] if dans(v)])  # fmt: skip

    def liste_cible(self, delegue, debut: date, fin: date) -> dict:
        """Les prospects de la liste cible des postes occupés sur la période, avec leur
        potentiel et la plus forte fréquence."""
        actif = lambda x: x.debut <= fin and (x.fin is None or x.fin > debut)  # noqa: E731
        liste: dict = {}
        for o in self.occupations[delegue.pk]:
            if not actif(o):
                continue
            for prospect, potentiel, frequence, c_debut, c_fin in self.cibles[o.poste_id]:
                if c_debut <= fin and (c_fin is None or c_fin > debut):
                    avant = liste.get(prospect, (None, 0))[1]
                    liste[prospect] = (potentiel, max(frequence, avant))
        return liste

    def calculer(self, delegue, debut: date, fin: date) -> dict:
        """Les comptages et les taux d'un délégué sur une période de la fenêtre."""
        today = self.today
        approuvees, imprevues = self.visites(delegue, debut, fin)
        indisponibles = self.indisponibles

        echues, a_venir, effectuees_prevues, justifies, a_justifier = [], 0, 0, 0, 0
        for v in approuvees:
            if v.statut in A_FAIRE and not v.date < today:
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
        faites = [v for v in approuvees + imprevues if v.statut == StatutVisite.EFFECTUEE]
        imprevues_faites = len(faites) - effectuees_prevues
        geo = sum(1 for v in faites if geolocalisee(v, self.distance))

        soumis = dans_delai = valides = attendus = en_retard = 0
        for v in faites:
            r = self.rapports.get(v.pk)
            if r is not None and r.soumis_le is not None:
                soumis += 1
                dans_delai += int(not r.en_retard)
                valides += int(r.statut == "valide")
            else:
                attendus += 1
                en_retard += int(v.date < today)

        liste = self.liste_cible(delegue, debut, fin)
        visites_par_prospect = Counter(v.prospect_id for v in faites if v.prospect_id)
        semaines = max(1, round(((fin - debut).days + 1) / 7))
        ab = {p: f for p, (potentiel, f) in liste.items() if potentiel in ("A", "B")}
        vus = sum(1 for p in liste if visites_par_prospect[p])
        ab_vus = sum(1 for p in ab if visites_par_prospect[p])
        ab_frequence = sum(
            1 for p, f in ab.items()
            if visites_par_prospect[p] >= max(1, math.ceil(f * semaines / self.cycle))
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


def calculer(pays, delegue, debut: date, fin: date) -> dict:
    """Les comptages et les taux d'un délégué sur une période."""
    return Lot(pays, [delegue], debut, fin).calculer(delegue, debut, fin)


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


def jours(lot: Lot, delegue, debut: date, fin: date) -> list[dict]:
    """La courbe de la période : visites prévues (approuvées) et faites, jour par jour."""
    approuvees, imprevues = lot.visites(delegue, debut, fin)
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
    avant = debut - timedelta(days=7)
    lot = Lot(pays, [delegue], min(debut_cycle, avant), fin)
    return {
        "aujourdhui": today,
        "calcule_le": timezone.now(),
        "semaine": {"debut": debut, "fin": fin, **lot.calculer(delegue, debut, fin)},
        "precedente": {"debut": avant, "fin": debut - timedelta(days=1),
                       **lot.calculer(delegue, avant, debut - timedelta(days=1))},
        "cycle": {"debut": debut_cycle, "fin": fin, "semaines": cycle,
                  **lot.calculer(delegue, debut_cycle, fin)},
        "jours": jours(lot, delegue, debut, fin),
    }  # fmt: skip


#: Regroupements du tableau (DSH-003) : à plat, ou par réseau, zone, secteur du poste.
REGROUPEMENTS = ("delegue", "reseau", "zone", "secteur")


def postes_du_pilotage(perimetre, debut: date, fin: date):
    """Les postes dont l'utilisateur pilote les délégués sur la période (DSH-002, DSH-003) :
    rattachés au superviseur (ou au DM, pour un superviseur-visiteur, RG-023), des réseaux du
    périmètre du DM et du DF, tout le pays pour le responsable pays."""
    from apps.identite.models import Role
    from apps.organisation.models import PerimetreReseau, Poste, Rattachement

    pays, moi = perimetre.pays_actif, perimetre.utilisateur
    postes = Poste.objects.filter(pays=pays)
    # DSH-004 : le siège descend au nominatif d'un pays ; la consultation est auditée (vue).
    if perimetre.est_siege or Role.RESPONSABLE_PAYS in perimetre.roles:
        return postes
    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    choisis = Q(pk__in=[])
    if perimetre.roles & {Role.SUPERVISEUR, Role.DM}:
        rattaches = Rattachement.objects.filter(pendant, superviseur=moi, debut__lte=fin)
        choisis |= Q(pk__in=rattaches.values("poste_id"))
    if perimetre.roles & {Role.DF, Role.DM}:
        reseaux = PerimetreReseau.objects.filter(pendant, utilisateur=moi, debut__lte=fin)
        choisis |= Q(reseaux__in=reseaux.values("reseau_id"))
    return postes.filter(choisis).distinct()


def delegues_des_postes(postes, exclu, debut: date, fin: date) -> list:
    """Les occupants des postes sur la période, par ordre alphabétique, avec leur poste (le
    plus récent s'il y en a eu deux) ; jamais l'utilisateur lui-même."""
    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    occupations = (
        Occupation.objects.filter(pendant, poste__in=postes, debut__lte=fin)
        .exclude(utilisateur=exclu)
        .select_related("utilisateur", "poste")
        .prefetch_related("poste__reseaux__division", "poste__secteurs__zone")
        .order_by("utilisateur__last_name", "utilisateur__first_name", "-debut")
    )
    vus, liste = set(), []
    for o in occupations:
        if o.utilisateur_id not in vus:
            vus.add(o.utilisateur_id)
            liste.append((o.utilisateur, o.poste))
    return liste


def _groupes_du_poste(poste, par: str) -> list[tuple]:
    if par == "reseau":
        return [(r.pk, r.libelle) for r in poste.reseaux.all()]
    if par == "secteur":
        return [(s.pk, s.libelle) for s in poste.secteurs.all()]
    if par == "zone":
        zones = {s.zone_id: s.zone.libelle for s in poste.secteurs.all()}
        return list(zones.items())
    return []


#: §14.18, DSH-005 : périodes glissantes (jours), la semaine civile, ou des dates choisies.
PERIODES = {"semaine": None, "30j": 30, "90j": 90, "6m": 182, "1a": 365, "dates": None}
#: Filtres de DSH-005 : identifiants d'objets de l'organisation, et l'activité de la période.
FILTRES = ("zone", "secteur", "division", "reseau", "superviseur", "delegue")


def bornes(pays, periode: str = "semaine", jour: date | None = None, du=None, au=None):
    """Les dates d'une période (incluses) : la semaine de `jour`, les N derniers jours jusqu'à
    `jour` (aujourd'hui par défaut), ou les dates choisies."""
    today = aujourdhui(pays)
    if periode == "dates":
        return du, au
    if periode == "semaine":
        return semaine(jour or today)
    fin = jour or today
    return fin - timedelta(days=PERIODES[periode] - 1), fin


def _options(pilotes, rattachements) -> dict:
    """DSH-005 CA1 : les valeurs proposées viennent des seuls postes du périmètre."""
    zones, secteurs, divisions, reseaux = {}, {}, {}, {}
    for _, poste in pilotes:
        for r in poste.reseaux.all():
            reseaux[r.pk] = r.libelle
            divisions[r.division_id] = r.division.libelle
        for s in poste.secteurs.all():
            secteurs[s.pk] = s.libelle
            zones[s.zone_id] = s.zone.libelle
    superviseurs = {r.superviseur_id: r.superviseur for r in rattachements}
    trier = lambda d: [{"id": k, "libelle": v} for k, v in sorted(d.items(), key=lambda x: x[1])]  # noqa: E731
    personne = lambda u: {"id": u.pk, "libelle": f"{u.first_name} {u.last_name}".strip()}  # noqa: E731
    return {
        "zones": trier(zones), "secteurs": trier(secteurs), "divisions": trier(divisions),
        "reseaux": trier(reseaux),
        "superviseurs": sorted((personne(u) for u in superviseurs.values()),
                               key=lambda x: x["libelle"]),
        "delegues": [personne(d) for d, _ in pilotes],
    }  # fmt: skip


def _retenu(delegue, poste, filtres: dict, sup_par_poste: dict) -> bool:
    if filtres.get("delegue") and delegue.pk != filtres["delegue"]:
        return False
    if filtres.get("reseau") and filtres["reseau"] not in {r.pk for r in poste.reseaux.all()}:
        return False
    if filtres.get("division") and filtres["division"] not in {
        r.division_id for r in poste.reseaux.all()
    }:
        return False
    if filtres.get("secteur") and filtres["secteur"] not in {s.pk for s in poste.secteurs.all()}:
        return False
    if filtres.get("zone") and filtres["zone"] not in {s.zone_id for s in poste.secteurs.all()}:
        return False
    if filtres.get("superviseur") and filtres["superviseur"] not in sup_par_poste.get(
        poste.pk, set()
    ):
        return False
    return True


def pilotes_retenus(perimetre, debut: date, fin: date, filtres: dict):
    """Les délégués du périmètre sur la période (`tous`), les rattachements de leurs postes, et
    ceux que les filtres retiennent (DSH-005 CA1 : un filtre ne fait que restreindre)."""
    from apps.organisation.models import Rattachement

    postes = postes_du_pilotage(perimetre, debut, fin)
    tous = delegues_des_postes(postes, perimetre.utilisateur, debut, fin)
    pendant = Q(fin__isnull=True) | Q(fin__gt=debut)
    rattachements = list(
        Rattachement.objects.filter(pendant, poste_id__in={p.pk for _, p in tous},
                                    debut__lte=fin).select_related("superviseur")
    )  # fmt: skip
    sup_par_poste: dict = defaultdict(set)
    for r in rattachements:
        sup_par_poste[r.poste_id].add(r.superviseur_id)
    pilotes = [(d, p) for d, p in tous if _retenu(d, p, filtres, sup_par_poste)]
    return tous, rattachements, pilotes


def tableau_pilotage(perimetre, jour: date | None = None, par: str = "delegue",
                     periode: str = "semaine", du=None, au=None,
                     filtres: dict | None = None) -> dict:  # fmt: skip
    """DSH-002, DSH-003, DSH-005, DSH-012 : la période de chaque délégué piloté, côte à côte
    par ordre alphabétique (DC-49 : aucun classement), la couverture sur le cycle (ou sur la
    période quand elle est plus longue), le total de l'ensemble et, si demandé, celui de chaque
    réseau, zone ou secteur : un total est toujours la somme de ses délégués (DSH-003 CA1). Un
    poste rattaché à deux réseaux compte dans chacun ; le total de l'ensemble ne compte chaque
    délégué qu'une fois. Les filtres ne font que restreindre le périmètre (DSH-005 CA1)."""
    from django.utils import timezone

    filtres = filtres or {}
    pays = perimetre.pays_actif
    today = aujourdhui(pays)
    debut, fin = bornes(pays, periode, jour, du, au)
    cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
    debut_cycle = min(debut, fin - timedelta(weeks=cycle) + timedelta(days=1))
    tous, rattachements, pilotes = pilotes_retenus(perimetre, debut, fin, filtres)
    lot = Lot(pays, [d for d, _ in pilotes], debut_cycle, fin)
    lignes = [
        {"delegue": delegue, "poste": poste,
         "semaine": lot.calculer(delegue, debut, fin),
         "cycle": lot.calculer(delegue, debut_cycle, fin)}
        for delegue, poste in pilotes
    ]  # fmt: skip
    statut = filtres.get("statut")
    if statut:
        lignes = [x for x in lignes if x["semaine"]["activite"] == (statut == "actif")]
    groupes: dict = {}
    for ligne in lignes:
        for cle, libelle in _groupes_du_poste(ligne["poste"], par):
            groupes.setdefault(cle, {"id": cle, "libelle": libelle, "lignes": []})
            groupes[cle]["lignes"].append(ligne)
    return {
        "aujourdhui": today,
        "calcule_le": timezone.now(),
        "periode": periode,
        "debut": debut,
        "fin": fin,
        "cycle": {"debut": debut_cycle, "fin": fin, "semaines": cycle},
        "par": par,
        "options": _options(tous, rattachements),
        "delegues": lignes,
        "groupes": [
            {"id": g["id"], "libelle": g["libelle"],
             "delegues": [x["delegue"].pk for x in g["lignes"]],
             "total": _total(g["lignes"])}
            for g in sorted(groupes.values(), key=lambda g: g["libelle"])
        ],
        "total": _total(lignes),
        "delais": delais(list(durees(pays, [x["delegue"] for x in lignes], debut, fin).values())),
    }  # fmt: skip


def _total(lignes: list) -> dict:
    return {
        "semaine": somme([x["semaine"] for x in lignes]),
        "cycle": somme([x["cycle"] for x in lignes]),
    }


def tableau_siege(perimetre, jour: date | None = None, periode: str = "semaine", du=None,
                  au=None) -> dict:  # fmt: skip
    """DSH-004 : la consolidation du siège, sans aucun nom : par pays (ordre alphabétique,
    aucun classement, DC-49), le nombre de délégués et les totaux de leur semaine et de leur
    cycle ; puis le total de tous les pays, tiré des sommes."""
    from django.utils import timezone

    from apps.organisation.models import Poste

    reference = jour or timezone.localdate()
    if periode == "dates":
        debut, fin = du, au
    elif periode == "semaine":
        debut, fin = semaine(reference)
    else:
        debut, fin = reference - timedelta(days=PERIODES[periode] - 1), reference
    lignes, toutes, tous_delais = [], [], []
    for pays in perimetre.pays_accessibles:
        cycle = int(valeur_parametre(pays, "cycle_visite_semaines") or 4)
        debut_cycle = min(debut, fin - timedelta(weeks=cycle) + timedelta(days=1))
        pilotes = delegues_des_postes(Poste.objects.filter(pays=pays), None, debut, fin)
        lot = Lot(pays, [d for d, _ in pilotes], debut_cycle, fin)
        semaines = [lot.calculer(d, debut, fin) for d, _ in pilotes]
        cycles = [lot.calculer(d, debut_cycle, fin) for d, _ in pilotes]
        toutes.append((semaines, cycles))
        du_pays = list(durees(pays, [d for d, _ in pilotes], debut, fin).values())
        tous_delais += du_pays
        lignes.append({
            "pays": pays,
            "delegues": len(pilotes),
            "cycle_semaines": cycle,
            "total": {"semaine": somme(semaines), "cycle": somme(cycles)},
            "delais": delais(du_pays),
        })  # fmt: skip
    return {
        "calcule_le": timezone.now(),
        "periode": periode,
        "debut": debut,
        "fin": fin,
        "pays": lignes,
        "delegues": sum(x["delegues"] for x in lignes),
        "total": {
            "semaine": somme([s for semaines, _ in toutes for s in semaines]),
            "cycle": somme([c for _, cycles in toutes for c in cycles]),
        },
        "delais": delais(tous_delais),
    }

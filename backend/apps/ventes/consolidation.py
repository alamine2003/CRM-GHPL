"""La vue de tous les pays du siège (1.9.0, prd.md §14.90) : les ventes de chaque pays dans sa
monnaie, converties en franc CFA de l'Ouest avec les taux que le siège fixe pour l'année.

- **À taux constant** : l'an passé se convertit au taux de l'année choisie, pour que l'évolution
  ne mesure que les ventes, pas le change.
- **Un pays sans taux** reste dans le tableau, dans sa monnaie, mais n'entre dans aucun total
  (ni la courbe ni le classement) ; la réponse le signale.
- **Aucun nom** : comme la consolidation du pilotage (DSH-004), la vue regroupe par pays, mois,
  produit, réseau ou classe, jamais par délégué ni par client.
"""

from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import QuerySet, Sum
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.audit.services import enregistrer
from apps.perimetre.perimetre import Perimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays

from .models import DEVISE_REFERENCE, ObjectifVente, TauxChange, Vente
from .objectifs import repartition
from .synthese import evolution

#: Les classements permis, tous pays confondus.
CLASSEMENTS = ("produit", "reseau", "classe")
CENTIME = Decimal("0.01")


def exiger_vue_consolidee(perimetre: Perimetre) -> None:
    if not perimetre.vue_consolidee:
        raise ErreurMetier(
            "vue_consolidee_requise",
            _("La vue de tous les pays se lit sans pays choisi : revenez à « Tous les pays »."),
        )


def periode(v: dict) -> tuple[int, int]:
    """Comme la synthèse d'un pays (`vues._periode`), au jour du serveur."""
    jour = timezone.localdate()
    annee = v.get("annee", jour.year)
    mois_fin = v.get("mois_fin") or (jour.month if annee == jour.year else 12)
    if annee == jour.year and mois_fin > jour.month:
        mois_fin = jour.month
    return annee, mois_fin


def pays_de_la_vue(perimetre: Perimetre) -> list[Pays]:
    return [p for p in perimetre.pays_accessibles if p.statut != Pays.Statut.ARCHIVE]


def taux_de_l_annee(annee: int) -> dict[str, Decimal]:
    """Chaque monnaie vers le XOF ; le XOF vaut toujours 1."""
    taux = {t.devise: t.taux for t in TauxChange.objects.filter(annee=annee)}
    taux[DEVISE_REFERENCE] = Decimal("1")
    return taux


def convertir(montant, taux: Decimal | None) -> Decimal | None:
    if taux is None:
        return None
    return (Decimal(montant or 0) * taux).quantize(CENTIME, rounding=ROUND_HALF_UP)


def _pourcent(a, b) -> float | None:
    return round(float(Decimal(a) / Decimal(b)) * 100, 1) if b else None


# --- Taux de change ------------------------------------------------------------------------


def devises(perimetre: Perimetre, annee: int) -> list[dict]:
    """Les monnaies des pays de la vue (hors XOF), avec leur taux de l'année s'il est fixé."""
    taux = {t.devise: t for t in TauxChange.objects.filter(annee=annee).select_related(
        "regle_par")}  # fmt: skip
    par_devise = defaultdict(list)
    for p in pays_de_la_vue(perimetre):
        if p.devise != DEVISE_REFERENCE:
            par_devise[p.devise].append(p.nom)
    rendu = []
    for devise in sorted(par_devise.keys() | taux.keys()):
        t = taux.get(devise)
        rendu.append({
            "devise": devise, "pays": sorted(par_devise.get(devise, [])),
            "taux": t.taux if t else None, "modifie_le": t.modifie_le if t else None,
        })  # fmt: skip
    return rendu


def _lire_taux(valeur) -> Decimal:
    try:
        taux = Decimal(str(valeur).replace(",", ".").strip())
    except ArithmeticError:
        taux = None
    if taux is None or not taux.is_finite() or taux <= 0:
        raise ErreurMetier("taux_invalide", _("Un taux est un nombre plus grand que zéro."),
                           champ="taux")  # fmt: skip
    if taux >= Decimal("1e12"):
        raise ErreurMetier("taux_invalide", _("Ce taux est trop grand."), champ="taux")
    return taux.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def regler_taux(utilisateur, annee: int, saisies: list[dict]) -> list[dict]:
    """Fixe ou corrige les taux de l'année ; chaque changement est audité. Un taux ne s'efface
    pas : on le corrige."""
    changements = []
    with transaction.atomic():
        for saisie in saisies:
            devise = str(saisie.get("devise", "")).strip().upper()
            if len(devise) != 3 or not devise.isalpha():
                raise ErreurMetier("devise_invalide", _("Une monnaie s'écrit en trois lettres."),
                                   champ="devise")  # fmt: skip
            if devise == DEVISE_REFERENCE:
                raise ErreurMetier("devise_reference",
                                   _("Le franc CFA de l'Ouest est la monnaie de référence : "
                                     "son taux vaut toujours 1."), champ="devise")  # fmt: skip
            taux = _lire_taux(saisie.get("taux"))
            existant = TauxChange.objects.filter(annee=annee, devise=devise).first()
            if existant and existant.taux == taux:
                continue
            avant = existant.taux if existant else None
            if existant:
                existant.taux, existant.regle_par = taux, utilisateur
                existant.modifie_le = timezone.now()
                existant.save()
            else:
                TauxChange.objects.create(annee=annee, devise=devise, taux=taux,
                                          regle_par=utilisateur)  # fmt: skip
            changements.append({"devise": devise, "avant": avant and str(avant),
                                "apres": str(taux)})  # fmt: skip
        if changements:
            enregistrer("ventes.taux_change", details={"annee": annee,
                                                       "changements": changements})  # fmt: skip
    return changements


# --- La vue ---------------------------------------------------------------------------------


def _somme_par(qs: QuerySet, *champs: str) -> dict:
    return {
        tuple(g[c] for c in champs): g["m"] or Decimal("0")
        for g in qs.values(*champs).annotate(m=Sum("montant_ttc"))
    }


def _cle_classement(par: str) -> tuple[str, str]:
    """Ce qui réunit un même produit, réseau ou classe d'un pays à l'autre, et son libellé : le
    code du produit (le modèle sénégalais est repris partout, §14.81), le libellé sinon."""
    return {
        "produit": ("produit__code", "produit__libelle"),
        "reseau": ("reseau__libelle", "reseau__libelle"),
        "classe": ("produit__classe__libelle", "produit__classe__libelle"),
    }[par]


def _objectifs(pays_ids: list, annee: int, mois_fin: int, realise_ytd: dict) -> dict:
    """Pour chaque pays, la somme de ses objectifs de réseau (les objectifs de produit et de
    délégué en sont le détail) : cible, attendu au mois choisi et réalisé de ces réseaux."""
    rendu = {}
    for o in ObjectifVente.objects.filter(
        pays_id__in=pays_ids, annee=annee, archive_le__isnull=True,
        produit__isnull=True, delegue__isnull=True,
    ):  # fmt: skip
        r = rendu.setdefault(o.pays_id, {"cible": Decimal("0"), "attendu": Decimal("0"),
                                         "realise": Decimal("0")})  # fmt: skip
        r["cible"] += o.cible
        r["attendu"] += sum(repartition(o.cible, o.mois)[:mois_fin], Decimal("0"))
        r["realise"] += realise_ytd.get((o.pays_id, o.reseau_id), Decimal("0"))
    return rendu


def tous_les_pays(perimetre: Perimetre, *, annee: int, mois_fin: int, par: str) -> dict:
    if par not in CLASSEMENTS:
        raise ErreurMetier("regroupement_invalide", _("Classement inconnu."), champ="par")
    pays = pays_de_la_vue(perimetre)
    ids = [p.pk for p in pays]
    taux = taux_de_l_annee(annee)
    taux_du_pays = {p.pk: taux.get(p.devise) for p in pays}

    lignes = Vente.objects.filter(archive_le__isnull=True, pays_id__in=ids)
    cumul = lignes.filter(mois__gte=date(annee, 1, 1), mois__lte=date(annee, mois_fin, 1))
    cumul_prec = lignes.filter(mois__gte=date(annee - 1, 1, 1),
                               mois__lte=date(annee - 1, mois_fin, 1))  # fmt: skip
    ytd = _somme_par(cumul, "pays_id")
    ytd_prec = _somme_par(cumul_prec, "pays_id")
    realise_reseaux = _somme_par(cumul, "pays_id", "reseau_id")
    objectifs = _objectifs(ids, annee, mois_fin, realise_reseaux)

    total = {"montant": Decimal("0"), "precedent": Decimal("0"), "cible": Decimal("0"),
             "attendu": Decimal("0"), "realise": Decimal("0")}  # fmt: skip
    rangees = []
    for p in pays:
        t = taux_du_pays[p.pk]
        montant, precedent = ytd.get((p.pk,), Decimal("0")), ytd_prec.get((p.pk,), Decimal("0"))
        objectif = objectifs.get(p.pk)
        if t is not None:
            total["montant"] += convertir(montant, t)
            total["precedent"] += convertir(precedent, t)
            if objectif:
                for k in ("cible", "attendu", "realise"):
                    total[k] += convertir(objectif[k], t)
        rangees.append({
            "code": p.code, "nom": p.nom, "devise": p.devise, "taux": t,
            "montant_ttc": montant, "precedent_montant_ttc": precedent,
            "evolution": evolution(montant, precedent),
            "montant_converti": convertir(montant, t),
            "precedent_converti": convertir(precedent, t),
            "objectif_cible": objectif["cible"] if objectif else None,
            "objectif_cible_converti": convertir(objectif["cible"], t) if objectif else None,
            "taux_cible": _pourcent(objectif["realise"], objectif["cible"]) if objectif else None,
            "taux_attendu": _pourcent(objectif["realise"], objectif["attendu"])
            if objectif else None,
        })  # fmt: skip
    for r in rangees:
        r["part"] = (_pourcent(r["montant_converti"], total["montant"])
                     if r["montant_converti"] is not None else None)  # fmt: skip
    rangees.sort(key=lambda r: (r["montant_converti"] is None,
                                -(r["montant_converti"] or 0), r["nom"]))  # fmt: skip

    convertis = [p.pk for p in pays if taux_du_pays[p.pk] is not None]
    mensuel = _mensuel(lignes.filter(pays_id__in=convertis), annee, taux_du_pays)
    classement = _classement(cumul.filter(pays_id__in=convertis),
                             cumul_prec.filter(pays_id__in=convertis), par, taux_du_pays,
                             total["montant"])  # fmt: skip
    return {
        "annee": annee, "mois_fin": mois_fin, "par": par, "devise": DEVISE_REFERENCE,
        "total": {
            "montant_ttc": total["montant"], "precedent_montant_ttc": total["precedent"],
            "evolution": evolution(total["montant"], total["precedent"]),
            "objectif_cible": total["cible"] or None,
            "taux_cible": _pourcent(total["realise"], total["cible"]),
            "taux_attendu": _pourcent(total["realise"], total["attendu"]),
        },
        "devises_sans_taux": sorted({p.devise for p in pays if taux_du_pays[p.pk] is None}),
        "pays": rangees, "mensuel": mensuel, "classement": classement,
    }  # fmt: skip


def _mensuel(lignes: QuerySet, annee: int, taux_du_pays: dict) -> list[dict]:
    montants, quantites = defaultdict(Decimal), defaultdict(int)
    for g in (lignes.filter(mois__year__in=[annee, annee - 1]).values("pays_id", "mois")
              .annotate(m=Sum("montant_ttc"), q=Sum("quantite"))):  # fmt: skip
        montants[g["mois"]] += convertir(g["m"], taux_du_pays[g["pays_id"]])
        quantites[g["mois"]] += g["q"] or 0
    return [
        {
            "mois": f"{annee}-{n:02d}",
            "montant_ttc": montants[date(annee, n, 1)],
            "quantite": quantites[date(annee, n, 1)],
            "precedent_montant_ttc": montants[date(annee - 1, n, 1)],
            "precedent_quantite": quantites[date(annee - 1, n, 1)],
        }
        for n in range(1, 13)
    ]


def _classement(cumul, cumul_prec, par: str, taux_du_pays: dict, total) -> list[dict]:
    cle, libelle = _cle_classement(par)
    groupes: dict = {}

    def ajouter(qs, champ):
        for g in qs.values("pays_id", cle, libelle).annotate(m=Sum("montant_ttc"),
                                                             q=Sum("quantite")):  # fmt: skip
            groupe = groupes.setdefault(g[cle], {
                "libelle": (g[libelle] or "").strip(), "montant_ttc": Decimal("0"),
                "precedent_montant_ttc": Decimal("0"), "quantite": 0, "pays": set(),
            })  # fmt: skip
            groupe[champ] += convertir(g["m"], taux_du_pays[g["pays_id"]])
            if champ == "montant_ttc":
                groupe["quantite"] += g["q"] or 0
                if g["m"]:
                    groupe["pays"].add(g["pays_id"])

    ajouter(cumul, "montant_ttc")
    ajouter(cumul_prec, "precedent_montant_ttc")
    sans = {"produit": _("Non renseigné"), "reseau": _("Sans réseau"),
            "classe": _("Sans classe thérapeutique")}[par]  # fmt: skip
    rendu = [
        {
            "libelle": g["libelle"] or sans,
            "montant_ttc": g["montant_ttc"],
            "quantite": g["quantite"],
            "part": _pourcent(g["montant_ttc"], total),
            "precedent_montant_ttc": g["precedent_montant_ttc"],
            "evolution": evolution(g["montant_ttc"], g["precedent_montant_ttc"]),
            "pays": len(g["pays"]),
        }
        for g in groupes.values()
    ]
    rendu.sort(key=lambda g: (-g["montant_ttc"], g["libelle"]))
    return rendu

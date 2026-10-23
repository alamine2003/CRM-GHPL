"""La synthèse des ventes (prd.md §14.84) : le cumul de l'année (YTD) face à l'an passé, les
ventes mois par mois, et la ventilation « éclatée » par délégué, produit, classe thérapeutique,
réseau, zone, client ou type de client. Les filtres se combinent ; tout est calculé dans le
périmètre de celui qui demande (`selecteurs`)."""

from datetime import date
from decimal import Decimal

from django.db.models import Count, F, QuerySet, Sum, Value
from django.db.models.functions import Concat
from django.utils.translation import gettext as _

from apps.socle.erreurs import ErreurMetier

from .models import TypeClient

#: Les regroupements permis, avec ce qui désigne un groupe (clé) et son libellé.
REGROUPEMENTS = ("delegue", "produit", "classe", "reseau", "zone", "client", "type_client")
#: Les filtres (champ de la ligne) ; chacun attend un identifiant, sauf `type_client`.
FILTRES = {
    "delegue": "delegue_id",
    "produit": "produit_id",
    "classe": "produit__classe_id",
    "reseau": "reseau_id",
    "zone": "zone_id",
    "client": "client_id",
    "type_client": "client__type",
}


def _groupe(lignes: QuerySet, par: str) -> QuerySet:
    if par == "delegue":
        return lignes.annotate(
            cle=F("delegue_id"),
            libelle=Concat("delegue__first_name", Value(" "), "delegue__last_name"),
        )
    if par == "produit":
        return lignes.annotate(cle=F("produit_id"), libelle=F("produit__libelle"))
    if par == "classe":
        return lignes.annotate(cle=F("produit__classe_id"), libelle=F("produit__classe__libelle"))
    if par == "reseau":
        return lignes.annotate(cle=F("reseau_id"), libelle=F("reseau__libelle"))
    if par == "zone":
        return lignes.annotate(cle=F("zone_id"), libelle=F("zone__libelle"))
    if par == "client":
        return lignes.annotate(cle=F("client_id"), libelle=F("client__nom"))
    return lignes.annotate(cle=F("client__type"), libelle=F("client__type"))


def libelle_regroupement(par: str) -> str:
    """Le nom d'un regroupement, en tête de la colonne qu'il ouvre (écran et export)."""
    return {
        "delegue": _("Délégué"), "produit": _("Produit"), "classe": _("Classe thérapeutique"),
        "reseau": _("Réseau"), "zone": _("Zone"), "client": _("Client"),
        "type_client": _("Type de client"),
    }[par]  # fmt: skip


def _sans(par: str) -> str:
    return {
        "classe": _("Sans classe thérapeutique"),
        "reseau": _("Sans réseau"),
        "zone": _("Sans zone"),
    }.get(par, _("Non renseigné"))


def filtrer(lignes: QuerySet, params: dict) -> QuerySet:
    for nom, champ in FILTRES.items():
        valeur = params.get(nom)
        if valeur:
            if nom == "type_client" and valeur not in TypeClient.values:
                raise ErreurMetier("filtre_invalide", _("Type de client inconnu."),
                                   champ="type_client")  # fmt: skip
            lignes = lignes.filter(**{champ: valeur})
    return lignes


def lignes_du_cumul(lignes: QuerySet, *, annee: int, mois_fin: int, params: dict) -> QuerySet:
    """Les lignes que le cumul de l'année additionne : janvier au mois choisi, avec les filtres."""
    debut, fin = date(annee, 1, 1), date(annee, mois_fin, 1)
    return filtrer(lignes, params).filter(mois__gte=debut, mois__lte=fin)


def _totaux(lignes: QuerySet) -> dict:
    t = lignes.aggregate(m=Sum("montant_ttc"), q=Sum("quantite"), n=Count("id"))
    return {"montant_ttc": t["m"] or Decimal("0"), "quantite": t["q"] or 0, "lignes": t["n"]}


def evolution(courant, precedent) -> float | None:
    """L'évolution en pourcentage face à l'an passé ; vide quand l'an passé n'a rien vendu."""
    if not precedent:
        return None
    return round(float((Decimal(courant) - Decimal(precedent)) / Decimal(precedent)) * 100, 1)


def _par_groupe(lignes: QuerySet, par: str) -> dict:
    groupes = (
        _groupe(lignes, par).values("cle", "libelle")
        .annotate(m=Sum("montant_ttc"), q=Sum("quantite"))
    )  # fmt: skip
    return {g["cle"]: g for g in groupes}


def synthese(lignes: QuerySet, *, annee: int, mois_fin: int, par: str, params: dict) -> dict:
    if par not in REGROUPEMENTS:
        raise ErreurMetier("regroupement_invalide", _("Regroupement inconnu."), champ="par")
    lignes = filtrer(lignes, params)
    debut = date(annee, 1, 1)
    fin = date(annee, mois_fin, 1)
    debut_prec, fin_prec = date(annee - 1, 1, 1), date(annee - 1, mois_fin, 1)
    cumul = lignes.filter(mois__gte=debut, mois__lte=fin)
    cumul_prec = lignes.filter(mois__gte=debut_prec, mois__lte=fin_prec)

    ytd = _totaux(cumul)
    precedent = _totaux(cumul_prec)

    courant = {
        g["mois"]: g
        for g in lignes.filter(mois__year=annee).values("mois")
        .annotate(m=Sum("montant_ttc"), q=Sum("quantite"))
    }  # fmt: skip
    avant = {
        g["mois"]: g
        for g in lignes.filter(mois__year=annee - 1).values("mois")
        .annotate(m=Sum("montant_ttc"), q=Sum("quantite"))
    }  # fmt: skip
    mensuel = []
    for numero in range(1, 13):
        a, b = courant.get(date(annee, numero, 1)), avant.get(date(annee - 1, numero, 1))
        mensuel.append({
            "mois": f"{annee}-{numero:02d}",
            "montant_ttc": (a or {}).get("m") or Decimal("0"),
            "quantite": (a or {}).get("q") or 0,
            "precedent_montant_ttc": (b or {}).get("m") or Decimal("0"),
            "precedent_quantite": (b or {}).get("q") or 0,
        })  # fmt: skip

    actuels, anciens = _par_groupe(cumul, par), _par_groupe(cumul_prec, par)
    ventilation = []
    for cle in actuels.keys() | anciens.keys():
        g, p = actuels.get(cle), anciens.get(cle)
        source = g or p
        montant = (g or {}).get("m") or Decimal("0")
        libelle = source["libelle"]
        if par == "type_client":
            libelle = TypeClient(source["libelle"]).label
        ventilation.append({
            "id": None if par == "type_client" else cle,
            "cle": str(cle) if cle is not None else "",
            "libelle": (libelle or "").strip() or _sans(par),
            "montant_ttc": montant,
            "quantite": (g or {}).get("q") or 0,
            "part": round(float(montant / ytd["montant_ttc"]) * 100, 1)
            if ytd["montant_ttc"] else None,
            "precedent_montant_ttc": (p or {}).get("m") or Decimal("0"),
            "evolution": evolution(montant, (p or {}).get("m")),
        })  # fmt: skip
    ventilation.sort(key=lambda v: (-v["montant_ttc"], v["libelle"]))
    return {
        "annee": annee,
        "mois_fin": mois_fin,
        "par": par,
        "ytd": {
            **ytd,
            "precedent_montant_ttc": precedent["montant_ttc"],
            "precedent_quantite": precedent["quantite"],
            "evolution": evolution(ytd["montant_ttc"], precedent["montant_ttc"]),
        },  # fmt: skip
        "mensuel": mensuel,
        "ventilation": ventilation,
    }

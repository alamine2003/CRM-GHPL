"""Exports des ventes, audités (1.6.2, prd.md §14.86) : ce que l'écran montre, en CSV ou en
classeur Excel — la ventilation éclatée, les ventes mensuelles ou les lignes du cumul.

Même période, mêmes filtres, même périmètre que la synthèse (VNT-006 CA1). Le CSV et le classeur
sont écrits comme ceux du pilotage (`pilotage.exports`) : séparateur « ; », UTF-8 avec BOM, et
aucune cellule lue comme une formule.
"""

from django.utils.translation import gettext as _

from apps.pilotage.exports import FORMATS, en_xlsx  # noqa: F401  (réexportés)
from apps.pilotage.exports import en_csv as _en_csv

from .models import EtatObjectifVente, SourceVente, TypeClient

#: Au-delà, on refuse : un tableur n'est pas fait pour cela, et l'export serait trop lourd.
LIGNES_MAX = 50_000


def en_csv(entetes: list, lignes: list) -> bytes:
    """Comme au pilotage, mais les montants s'écrivent avec la virgule décimale : Excel en français
    lit « 1250,50 » comme un nombre, et « 1250.50 » comme du texte ou une date."""
    return _en_csv(
        entetes,
        [[f"{x:.2f}".replace(".", ",") if isinstance(x, float) else x for x in ligne]
         for ligne in lignes],
    )  # fmt: skip


def _nombre(valeur):
    """Un montant en nombre, arrondi au centime : le tableur peut le sommer."""
    return None if valeur is None else round(float(valeur), 2)


def _pourcent(valeur):
    return "" if valeur is None else round(valeur, 1)


def ventilation(donnees: dict, libelle_groupe: str) -> tuple[list[str], list[list]]:
    """Le tableau « Ventes éclatées » de l'écran, une ligne par groupe."""
    annee = donnees["annee"]
    entetes = [
        libelle_groupe, _("CA TTC"), _("Part (%)"), _("Quantités"),
        _("CA TTC %(annee)s") % {"annee": annee - 1}, _("Évolution (%)"),
    ]  # fmt: skip
    lignes = [
        [g["libelle"], _nombre(g["montant_ttc"]), _pourcent(g["part"]), g["quantite"],
         _nombre(g["precedent_montant_ttc"]), _pourcent(g["evolution"])]
        for g in donnees["ventilation"]
    ]  # fmt: skip
    return entetes, lignes


def mensuel(donnees: dict) -> tuple[list[str], list[list]]:
    """Les douze mois de l'année face à l'an passé."""
    annee = donnees["annee"]
    entetes = [
        _("Mois"), _("CA TTC"), _("Quantités"),
        _("CA TTC %(annee)s") % {"annee": annee - 1},
        _("Quantités %(annee)s") % {"annee": annee - 1},
    ]  # fmt: skip
    lignes = [
        [m["mois"], _nombre(m["montant_ttc"]), m["quantite"],
         _nombre(m["precedent_montant_ttc"]), m["precedent_quantite"]]
        for m in donnees["mensuel"]
    ]  # fmt: skip
    return entetes, lignes


def lignes(qs) -> tuple[list[str], list[list]]:
    """Les lignes de vente du cumul, une par mois, délégué, produit et client."""
    entetes = [
        _("Mois"), _("Délégué"), _("Produit"), _("Classe thérapeutique"), _("Réseau"),
        _("Zone"), _("Client"), _("Type de client"), _("Quantité"), _("CA TTC"), _("Origine"),
    ]  # fmt: skip
    types, origines = dict(TypeClient.choices), dict(SourceVente.choices)
    rangees = []
    for v in qs.select_related("delegue", "produit__classe", "reseau", "zone", "client").order_by(
        "mois", "delegue__last_name", "delegue__first_name", "produit__libelle", "client__nom"
    ):
        d = v.delegue
        rangees.append([
            v.mois.strftime("%Y-%m"), f"{d.first_name} {d.last_name}".strip() or d.username,
            v.produit.libelle, v.produit.classe.libelle if v.produit.classe else "",
            v.reseau.libelle if v.reseau else "", v.zone.libelle if v.zone else "",
            v.client.nom, str(types.get(v.client.type, v.client.type)), v.quantite,
            _nombre(v.montant_ttc), str(origines.get(v.source, v.source)),
        ])  # fmt: skip
    return entetes, rangees


def objectifs(rendus: list[dict], annee: int, mois_fin: int) -> tuple[list[str], list[list]]:
    """1.8.0 : le tableau des objectifs, une ligne par objectif (réseau, produit ou délégué)."""

    entetes = [
        _("Réseau"), _("Portée"), _("Cible %(annee)s") % {"annee": annee},
        _("Attendu à fin %(mois)02d") % {"mois": mois_fin}, _("Réalisé (YTD)"), _("Écart"),
        _("% de la cible"), _("Réalisé / attendu (%)"), _("État"),
    ]  # fmt: skip

    def portee(o: dict) -> str:
        if o["produit"]:
            return _("Produit : %(nom)s") % {"nom": o["produit"]["libelle"]}
        if o["delegue"]:
            return _("Délégué : %(nom)s") % {"nom": o["delegue"]["nom"]}
        return str(_("Tout le réseau"))

    lignes = [
        [o["reseau"]["libelle"], portee(o), _nombre(o["cible"]), _nombre(o["attendu"]),
         _nombre(o["realise"]), _nombre(o["ecart"]), _pourcent(o["taux_cible"]),
         _pourcent(o["taux_attendu"]), str(EtatObjectifVente(o["etat"]).label)]
        for o in rendus
    ]  # fmt: skip
    return entetes, lignes


def tous_pays_par_pays(donnees: dict) -> tuple[list[str], list[list]]:
    """1.9.0 : le tableau par pays de la vue de tous les pays, dans la monnaie du pays et en
    XOF (à taux constant)."""
    annee, ref = donnees["annee"], donnees["devise"]
    entetes = [
        _("Pays"), _("Monnaie"), _("Taux en %(ref)s") % {"ref": ref},
        _("CA TTC (monnaie du pays)"),
        _("CA TTC %(annee)s (monnaie du pays)") % {"annee": annee - 1},
        _("Évolution (%)"), _("CA TTC (%(ref)s)") % {"ref": ref},
        _("CA TTC %(annee)s (%(ref)s)") % {"annee": annee - 1, "ref": ref}, _("Part (%)"),
        _("Objectif (%(ref)s)") % {"ref": ref}, _("Objectif atteint (%)"),
        _("Réalisé / attendu (%)"),
    ]  # fmt: skip
    lignes = [
        [p["nom"], p["devise"], "" if p["taux"] is None else float(p["taux"]),
         _nombre(p["montant_ttc"]), _nombre(p["precedent_montant_ttc"]),
         _pourcent(p["evolution"]), _nombre(p["montant_converti"]),
         _nombre(p["precedent_converti"]), _pourcent(p["part"]),
         _nombre(p["objectif_cible_converti"]), _pourcent(p["taux_cible"]),
         _pourcent(p["taux_attendu"])]
        for p in donnees["pays"]
    ]  # fmt: skip
    return entetes, lignes


def tous_pays_classement(donnees: dict, libelle_groupe: str) -> tuple[list[str], list[list]]:
    annee, ref = donnees["annee"], donnees["devise"]
    entetes = [
        libelle_groupe, _("CA TTC (%(ref)s)") % {"ref": ref}, _("Part (%)"), _("Quantités"),
        _("CA TTC %(annee)s (%(ref)s)") % {"annee": annee - 1, "ref": ref}, _("Évolution (%)"),
        _("Pays"),
    ]  # fmt: skip
    lignes = [
        [g["libelle"], _nombre(g["montant_ttc"]), _pourcent(g["part"]), g["quantite"],
         _nombre(g["precedent_montant_ttc"]), _pourcent(g["evolution"]), g["pays"]]
        for g in donnees["classement"]
    ]  # fmt: skip
    return entetes, lignes

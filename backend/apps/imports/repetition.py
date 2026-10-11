"""Répétition à blanc de la migration BirdNotes (0.9.6, PRP-013, prd.md §14.7).

Sur la base où elle tourne (préproduction), avec un export réel ou fictif : simulation, import
chronométré, second import du même fichier (qui ne doit rien créer), puis rapprochement table
par table : chaque ligne du fichier est créée, reconnue, fusionnée, écartée avec son motif ou
volontairement ignorée ; une ligne dont on ne sait rien est un écart.
"""

import time
from dataclasses import dataclass, field

from .birdnotes import importer, lire_fichier

#: Ce que l'import peut faire d'une ligne : tout autre sort est un écart.
ISSUES = ("crees", "existants", "fusionnes", "rejetes", "fictives_ignorees")


def _lignes(donnees: dict) -> dict:
    """Le nombre de lignes de chaque table, sous le nom des compteurs de l'import."""
    attente = [r for r in donnees.get("Prospects en attente") or []
               if not r.get("ID prospect d'origine")]  # fmt: skip
    return {
        "secteurs": len(donnees.get("Secteurs") or []),
        "localites": len(donnees.get("Localites") or []),
        "produits": len(donnees.get("Produits") or []),
        "etablissements": len(donnees.get("Etablissements") or []),
        "prospects": len(donnees.get("Prospects") or []) + len(attente),
    }


@dataclass
class Repetition:
    simulation_s: float = 0.0
    import_s: float = 0.0
    reimport_s: float = 0.0
    crees: dict = field(default_factory=dict)
    recrees: dict = field(default_factory=dict)
    rapprochement: list = field(default_factory=list)
    anomalies: int = 0

    @property
    def conforme(self) -> bool:
        return not self.recrees and all(x["ecart"] == 0 for x in self.rapprochement)


def repeter(pays, auteur, contenu: bytes, nom: str) -> Repetition:
    r = Repetition()

    def chrono(simulation: bool):
        debut = time.monotonic()
        lot = importer(pays, auteur, contenu, nom, simulation=simulation)
        return lot, round(time.monotonic() - debut, 1)

    _, r.simulation_s = chrono(True)
    lot, r.import_s = chrono(False)
    second, r.reimport_s = chrono(False)
    r.crees = {k: c.get("crees", 0) for k, c in lot.compteurs.items() if c.get("crees")}
    r.recrees = {k: c["crees"] for k, c in second.compteurs.items() if c.get("crees")}
    r.anomalies = len(lot.anomalies)
    for table, lignes in _lignes(lire_fichier(contenu, nom)).items():
        compteurs = lot.compteurs.get(table, {})
        traitees = {issue: compteurs.get(issue, 0) for issue in ISSUES if compteurs.get(issue)}
        r.rapprochement.append({"table": table, "fichier": lignes, **traitees,
                                "ecart": lignes - sum(traitees.values())})  # fmt: skip
    return r

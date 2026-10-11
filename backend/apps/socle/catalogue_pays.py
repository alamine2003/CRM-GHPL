"""Catalogue des pays que le siège peut ouvrir, avec leurs réglages par défaut.

Hypothèse O-07 (prd.md §24) : les 17 filiales Generic Healthcare, comme dans
JUSTI GH et AMM GH. Le siège crée un pays depuis ce catalogue (ORG-001) ;
ouvrir un pays absent du catalogue est une décision explicite qui modifie ce
fichier. Aucun code ne doit tester un code pays (ADR-017) : ces valeurs ne
servent qu'à pré-remplir le pays à sa création.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelePays:
    code: str
    nom: str
    fuseau: str
    devise: str
    langue: str = "fr"


CATALOGUE: dict[str, ModelePays] = {
    m.code: m
    for m in [
        ModelePays("SN", "Sénégal", "Africa/Dakar", "XOF"),
        ModelePays("ML", "Mali", "Africa/Bamako", "XOF"),
        ModelePays("CI", "Côte d'Ivoire", "Africa/Abidjan", "XOF"),
        ModelePays("MG", "Madagascar", "Indian/Antananarivo", "MGA"),
        ModelePays("CM", "Cameroun", "Africa/Douala", "XAF"),
        ModelePays("GA", "Gabon", "Africa/Libreville", "XAF"),
        ModelePays("MR", "Mauritanie", "Africa/Nouakchott", "MRU"),
        ModelePays("BF", "Burkina Faso", "Africa/Ouagadougou", "XOF"),
        ModelePays("NE", "Niger", "Africa/Niamey", "XOF"),
        ModelePays("BJ", "Bénin", "Africa/Porto-Novo", "XOF"),
        ModelePays("GN", "Guinée", "Africa/Conakry", "GNF"),
        ModelePays("TG", "Togo", "Africa/Lome", "XOF"),
        ModelePays("GM", "Gambie", "Africa/Banjul", "GMD", langue="en"),
        ModelePays("DJ", "Djibouti", "Africa/Djibouti", "DJF"),
        ModelePays("TD", "Tchad", "Africa/Ndjamena", "XAF"),
        ModelePays("CG", "Congo", "Africa/Brazzaville", "XAF"),
        ModelePays("CD", "République démocratique du Congo", "Africa/Kinshasa", "CDF"),
    ]
}

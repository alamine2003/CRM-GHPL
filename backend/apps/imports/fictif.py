"""Un export BirdNotes entièrement fictif, au volume du vrai (0.9.6, migration à blanc).

Le vrai fichier n'entre jamais dans le dépôt (CLAUDE.md). Celui-ci reprend sa structure —
noms des tables et des colonnes (section 14.7 du PRD) — avec des valeurs inventées, et les
défauts relevés dans le vrai : variantes de secteurs, potentiels hors A/B/C, titres à la place
du prénom, localités « INTERMEDIARE », établissements sans secteur, fiches sans nom, demandes
en attente, doublons signalés. La migration se répète ainsi de bout en bout sans donnée réelle.
"""

import random

from .correspondances import SPECIALITES

PRENOMS = (
    "Awa",
    "Moussa",
    "Fatou",
    "Ibrahima",
    "Aminata",
    "Cheikh",
    "Khady",
    "Ousmane",
    "Mariama",
    "Abdoulaye",
    "Ndeye",
    "Mamadou",
    "Coumba",
    "Lamine",
    "Seynabou",
)
NOMS = (
    "Fictif",
    "Exemple",
    "Modele",
    "Essai",
    "Factice",
    "Specimen",
    "Prototype",
    "Maquette",
    "Esquisse",
    "Gabarit",
    "Brouillon",
    "Ebauche",
    "Simule",
    "Imaginaire",
    "Invente",
)
TYPES_LIEUX = ("POSTE DE SANTE", "CENTRE DE SANTE", "PHARMACIE", "CABINET", "CLINIQUE",
               "HOPITAL")  # fmt: skip


def export_fictif(prospects: int = 6000, graine: int = 2026) -> dict:
    """`{"donnees": {table: [lignes]}}`, comme l'export BirdNotes (JSON)."""
    alea = random.Random(graine)  # noqa: S311 — données fictives, sans usage cryptographique
    secteurs = [f"Fictif {i:02d}" for i in range(1, 49)]
    localites = [(f"Quartier {i:03d}", secteurs[i % len(secteurs)]) for i in range(1, 241)]
    divisions = ("Division Fictive A", "Division Fictive B", "Division Fictive C",
                 "Division Fictive D")  # fmt: skip
    reseaux = [(f"Réseau Fictif {i:02d}", divisions[i % 4]) for i in range(1, 20)]
    specialites = sorted({k for k in SPECIALITES})
    lieux = max(50, prospects // 4)

    def prospect(ident: int) -> dict:
        prenom, nom = alea.choice(PRENOMS), f"{alea.choice(NOMS)}{ident:05d}"
        localite, secteur = alea.choice(localites)
        ligne = {
            "ID prospect": ident, "Prénom": prenom, "Nom": nom.upper(),
            "Nom complet": f"{prenom} {nom.upper()}", "Activité (H/P)": alea.choice("HP"),
            "Potentiel": alea.choice("AABBBCCC"), "Spécialité": alea.choice(specialites),
            "Type prospect": "", "Établissement": f"{alea.choice(TYPES_LIEUX)} FICTIF "
            f"{alea.randrange(1, lieux):04d}", "Secteur": secteur, "Localité": localite,
            "Téléphone": "", "GSM": f"77 {alea.randrange(100, 999)} 00 {ident % 100:02d}",
            "Email": "", "Grade": alea.choice(("", "", "Docteur", "Professeur", "Assistant")),
            "Latitude": None, "Longitude": None, "Délégués affectés": "",
            "Date création": f"2025-{alea.randrange(1, 13):02d}-{alea.randrange(1, 29):02d}",
        }  # fmt: skip
        # Les défauts du vrai fichier, en proportions voisines.
        tirage = alea.random()
        if tirage < 0.03:
            ligne["Potentiel"] = alea.choice(("X", "D", "BB"))
        elif tirage < 0.10:
            ligne["Prénom"], ligne["Nom"] = "DR", f"{prenom.upper()} {nom.upper()}"
        elif tirage < 0.12:
            ligne["Localité"] = "INTERMEDIARE 1"
        elif tirage < 0.125:
            ligne["Nom"], ligne["Nom complet"] = "", ""
        return ligne

    etablissements = [
        {"ID établissement": i, "Établissement": f"{t} FICTIF {i:04d}",
         "Activité (H/P)": "H" if t in ("POSTE DE SANTE", "CENTRE DE SANTE", "HOPITAL") else "P",
         "Secteur": None if i % 37 == 0 else secteurs[i % len(secteurs)]}
        for i in range(1, lieux) for t in [TYPES_LIEUX[i % len(TYPES_LIEUX)]]
    ]  # fmt: skip
    produits = [{"ID produit": i, "Produit": f"Produit Fictif {i:03d}",
                 "Code": f"PF{i:03d}" if i % 5 else ""} for i in range(1, 157)]  # fmt: skip
    return {
        "donnees": {
            "Secteurs": [{"ID secteur": i, "Secteur": s} for i, s in enumerate(secteurs, 1)]
            + [{"ID secteur": 100, "Secteur": secteurs[0].upper() + " "}],  # variante
            "Localites": [
                {"ID localité": i, "Localité": n, "Secteur": s}
                for i, (n, s) in enumerate(localites, 1)
            ],  # fmt: skip
            "Gammes": [{"Gamme": d, "Niveau": "Parente", "Gamme parente": ""} for d in divisions]
            + [{"Gamme": r, "Niveau": "Fille", "Gamme parente": d} for r, d in reseaux]
            + [{"Gamme": "Default", "Niveau": "Fille", "Gamme parente": ""}],
            "Produits": produits,
            "Portefeuille": [
                {"Gamme": r, "Gamme parente": d, "ID produit": p["ID produit"]}
                for i, (r, d) in enumerate(reseaux)
                for p in produits[i * 8 : (i + 1) * 8 + 4]
            ],  # fmt: skip
            "Etablissements": etablissements,
            "Prospects": [prospect(i) for i in range(1, prospects + 1)],
            "Prospects en attente": [prospect(prospects + i) for i in range(1, 51)]
            + [
                {**prospect(prospects + 100 + i), "ID prospect d'origine": i} for i in range(1, 11)
            ],  # fmt: skip
            "Doublons prospects": [
                {"ID prospect": i, "Groupe": f"G{i // 2}"} for i in range(2, 42)
            ],  # fmt: skip
        }
    }

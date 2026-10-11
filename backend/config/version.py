"""Version unique du produit, lue dans le fichier VERSION à la racine du dépôt (ADR-018)."""

from pathlib import Path

_FICHIER = Path(__file__).resolve().parents[2] / "VERSION"


def lire_version() -> str:
    try:
        return _FICHIER.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return "inconnue"


VERSION = lire_version()

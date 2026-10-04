"""Traçabilité : chaque exigence livrée est citée par au moins un test automatisé.

Une exigence du PRD dont la version est inférieure ou égale à `VERSION` doit apparaître
(son identifiant, par exemple `ORG-009`) dans un test du serveur, du portail, du mobile
ou des paquets partagés. La matrice détaillée par critère est dans `recette-0.0.md`.
"""

import re
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
DOSSIERS = ["backend", "portail/src", "mobile/__tests__", "mobile/src", "packages"]
EXCLUS = {"node_modules", ".venv", "dist"}


def _version(texte: str) -> tuple[int, ...]:
    return tuple(int(n) for n in texte.split("."))


def _exigences_livrees() -> set[str]:
    actuelle = _version((RACINE / "VERSION").read_text().strip())
    lignes = re.findall(
        r"^\| ([A-Z]{2,4}-\d{3}) \|[^\n]*?\| (\d+\.\d+\.\d+) \|", (RACINE / "prd.md").read_text(),
        re.M,
    )  # fmt: skip
    return {ident for ident, version in lignes if _version(version) <= actuelle}


def _textes_des_tests() -> str:
    morceaux = []
    for dossier in DOSSIERS:
        for fichier in (RACINE / dossier).rglob("*"):
            if EXCLUS & set(fichier.parts) or not fichier.is_file():
                continue
            if re.search(r"(^test_.*\.py|\.test\.tsx?)$", fichier.name):
                morceaux.append(fichier.read_text(encoding="utf-8"))
    return "\n".join(morceaux)


def test_chaque_exigence_livree_est_citee_par_un_test():
    exigences = _exigences_livrees()
    assert len(exigences) >= 23  # cycle 0.0
    textes = _textes_des_tests()
    assert sorted(e for e in exigences if e not in textes) == []

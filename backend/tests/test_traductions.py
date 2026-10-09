"""Chaque message du serveur est traduit en anglais (USR-004)."""

from pathlib import Path

import polib

CATALOGUE = Path(__file__).resolve().parents[1] / "locale" / "en" / "LC_MESSAGES" / "django.po"


def test_aucun_message_sans_traduction_anglaise():
    catalogue = polib.pofile(str(CATALOGUE))
    # Une phrase au pluriel (ngettext) se traduit dans chacune de ses formes.
    manquants = [
        e.msgid
        for e in catalogue
        if not e.obsolete and not (all(e.msgstr_plural.values()) if e.msgid_plural else e.msgstr)
    ]
    assert manquants == [], f"Traductions manquantes : {manquants}"
    assert not catalogue.fuzzy_entries()


def _messages_du_code():
    """Chaînes littérales passées à _(), gettext() ou gettext_lazy() dans apps/ et config/."""
    import ast

    racine = CATALOGUE.parents[3]
    for fichier in [*racine.glob("apps/**/*.py"), *racine.glob("config/**/*.py")]:
        if "migrations" in fichier.parts or "tests" in fichier.parts:
            continue
        for noeud in ast.walk(ast.parse(fichier.read_text(encoding="utf-8"))):
            if (
                isinstance(noeud, ast.Call)
                and isinstance(noeud.func, ast.Name)
                and noeud.func.id in {"_", "gettext", "gettext_lazy"}
                and noeud.args
                and isinstance(noeud.args[0], ast.Constant)
            ):
                yield fichier.relative_to(racine), noeud.args[0].value


def test_chaque_message_du_code_est_dans_le_catalogue():
    """Sans `makemessages`, un nouveau message resterait en français pour tous (USR-004 CA1)."""
    connus = {e.msgid for e in polib.pofile(str(CATALOGUE)) if not e.obsolete}
    absents = sorted({f"{f}: {m}" for f, m in _messages_du_code() if m not in connus})
    assert absents == [], f"Lancer makemessages -l en puis traduire : {absents}"

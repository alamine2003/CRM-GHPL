"""Chaque message du serveur est traduit en anglais (USR-004)."""

from pathlib import Path

import polib

CATALOGUE = Path(__file__).resolve().parents[1] / "locale" / "en" / "LC_MESSAGES" / "django.po"


def test_aucun_message_sans_traduction_anglaise():
    catalogue = polib.pofile(str(CATALOGUE))
    manquants = [e.msgid for e in catalogue if not e.msgstr and not e.obsolete]
    assert manquants == [], f"Traductions manquantes : {manquants}"
    assert not catalogue.fuzzy_entries()

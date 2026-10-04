"""Validateurs de mots de passe d'INNOV CRM (SEC-001), en plus de ceux de Django.

- `MotsCompromettantsValidator` refuse un mot de passe qui contient un mot de la liste
  `mots_compromettants.txt` (entreprise, métier, pays, mots de passe courants), même
  déguisé : « D@k4r-2026 » contient « dakar ».
- `FuitesConnuesValidator` refuse un mot de passe déjà paru dans des fuites de données
  publiques (service Have I Been Pwned, k-anonymat : seuls les 5 premiers caractères de
  l'empreinte SHA-1 quittent le serveur, jamais le mot de passe). Si le service ne répond
  pas, le mot de passe n'est pas bloqué pour autant : la vérification est un renfort.
"""

import hashlib
import logging
import unicodedata
import urllib.request
from functools import cache
from pathlib import Path

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

journal = logging.getLogger(__name__)

LISTE = Path(__file__).with_name("mots_compromettants.txt")
SUBSTITUTIONS = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
                               "@": "a", "$": "s", "!": "i"})  # fmt: skip


@cache
def mots_compromettants() -> tuple[str, ...]:
    lignes = LISTE.read_text(encoding="utf-8").splitlines()
    return tuple(sorted({m.strip() for m in lignes if m.strip() and not m.startswith("#")}))


def _sans_accents(texte: str) -> str:
    return unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()


def formes(mot_de_passe: str) -> set[str]:
    """Le mot de passe tel quel, sans accents ni séparateurs, et « dé-leeté »."""
    brut = _sans_accents(mot_de_passe)
    compact = "".join(c for c in brut if c.isalnum())
    lettres = "".join(c for c in brut.translate(SUBSTITUTIONS) if c.isalpha())
    return {brut, compact, lettres}


def mot_compromettant(mot_de_passe: str) -> str | None:
    variantes = formes(mot_de_passe)
    for mot in mots_compromettants():
        if any(mot in v for v in variantes):
            return mot
    return None


class MotsCompromettantsValidator:
    def validate(self, password, user=None):
        mot = mot_compromettant(password)
        if mot:
            raise ValidationError(
                _("Ce mot de passe peut être compromettant : il contient « %(mot)s ».")
                % {"mot": mot},
                code="mot_compromettant",
            )

    def get_help_text(self):
        return _(
            "Votre mot de passe ne doit contenir ni le nom de l'entreprise, ni un mot du métier, "
            "ni un nom de pays ou de ville, ni un mot de passe courant."
        )


class FuitesConnuesValidator:
    URL = "https://api.pwnedpasswords.com/range/"

    def __init__(self, actif: bool = True, delai: float = 3.0):
        self.actif = actif
        self.delai = delai

    def _suffixes(self, prefixe: str) -> str:
        requete = urllib.request.Request(  # noqa: S310 — URL fixe en https
            self.URL + prefixe, headers={"Add-Padding": "true", "User-Agent": "INNOV-CRM"}
        )
        with urllib.request.urlopen(requete, timeout=self.delai) as reponse:  # noqa: S310
            return reponse.read().decode("utf-8")

    def validate(self, password, user=None):
        if not self.actif:
            return
        empreinte = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()  # noqa: S324
        prefixe, suffixe = empreinte[:5], empreinte[5:]
        try:
            lignes = self._suffixes(prefixe).splitlines()
        except OSError as erreur:
            journal.warning("Vérification des fuites indisponible : %s", erreur)
            return
        for ligne in lignes:
            valeur, _sep, compte = ligne.partition(":")
            if valeur.strip() == suffixe and compte.strip() not in ("", "0"):
                raise ValidationError(
                    _(
                        "Ce mot de passe peut être compromettant : il figure dans des fuites "
                        "de données connues. Choisissez-en un autre."
                    ),
                    code="mot_de_passe_divulgue",
                )

    def get_help_text(self):
        return _("Votre mot de passe ne doit pas figurer dans des fuites de données connues.")

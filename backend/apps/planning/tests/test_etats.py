"""ADR-011 : la machine à états du planning (prd.md §17.1) a une seule source, le serveur."""

import pytest

from apps.planning.etats import StatutPlanning as S
from apps.planning.etats import exiger_transition, peut_passer
from apps.planning.management.commands.exporter_etats import FICHIER, contenu
from apps.socle.erreurs import ErreurMetier


def test_le_miroir_typescript_est_a_jour():
    """`make schema` régénère packages/domaine/src/etats.json ; sinon ce test échoue."""
    assert FICHIER.read_text(encoding="utf-8") == contenu()


def test_les_transitions_suivent_le_prd():
    assert peut_passer(S.BROUILLON, S.SOUMIS)
    assert peut_passer(S.SOUMIS, S.APPROUVE) and peut_passer(S.SOUMIS, S.A_REVISER)
    assert peut_passer(S.APPROUVE, S.ANNULE) and peut_passer(S.EN_COURS, S.SOUMIS)
    assert not peut_passer(S.BROUILLON, S.APPROUVE)
    assert not peut_passer(S.TERMINE, S.SOUMIS)
    with pytest.raises(ErreurMetier) as erreur:
        exiger_transition(S.ANNULE, S.SOUMIS)
    assert erreur.value.code == "transition_interdite"

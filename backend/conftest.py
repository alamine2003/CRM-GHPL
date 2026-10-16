import pytest
from django.core.cache import cache
from freezegun import freeze_time

#: Horloge de référence des tests (1.0.5). Les terrains de test planifient la semaine du lundi
#: 12 octobre 2026 : sans horloge fixe, la suite échouait dès que la vraie date atteignait ce
#: lundi 0 h (semaine fermée). Dimanche 11 octobre 2026, 19 h UTC : la semaine est encore
#: ouverte. Un test qui fixe sa propre date (freeze_time) l'emporte sur celle-ci.
HORLOGE_DES_TESTS = "2026-10-11 19:00:00"


@pytest.fixture(scope="session", autouse=True)
def _code_charge_avant_l_horloge(django_db_setup):
    """Charge les vues et les sérialiseurs avant de figer l'horloge : chargés pendant, ils
    garderaient les fausses classes date/datetime de freezegun, que le générateur du schéma
    OpenAPI ne sait pas typer (test_schema)."""
    from django.urls import get_resolver

    _ = get_resolver().url_patterns  # importe toutes les vues


@pytest.fixture(autouse=True)
def _horloge_de_reference():
    """Les tests ne dépendent pas du jour où on les lance ; l'horloge avance normalement."""
    with freeze_time(HORLOGE_DES_TESTS, tick=True):
        yield


@pytest.fixture(autouse=True)
def _cache_vide():
    """Les limites de débit (connexion, récupération) vivent dans le cache."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _double_auth_imposee(settings):
    """Les tests vérifient la double authentification imposée, telle qu'elle reviendra en
    version 2 (suspendue par défaut depuis 1.1.2) ; un test peut la remettre à False."""
    settings.INNOV_DOUBLE_AUTH_OBLIGATOIRE = True

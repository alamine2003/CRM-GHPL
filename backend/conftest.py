import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _cache_vide():
    """Les limites de débit (connexion, récupération) vivent dans le cache."""
    cache.clear()
    yield
    cache.clear()

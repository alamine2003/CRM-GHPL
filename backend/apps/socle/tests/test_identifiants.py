from datetime import UTC, datetime

from apps.socle import identifiants
from apps.socle.identifiants import uuid7


def test_uuid7_respecte_la_rfc():
    identifiant = uuid7()
    assert identifiant.version == 7
    assert identifiant.variant == "specified in RFC 4122"


def test_uuid7_porte_l_heure_de_creation(monkeypatch):
    # Des tests figent l'horloge dans le futur ; l'ordre croissant garderait cette date.
    monkeypatch.setattr(identifiants, "_dernier", 0)
    avant = datetime.now(UTC).timestamp() * 1000
    ms = uuid7().int >> 80
    apres = datetime.now(UTC).timestamp() * 1000
    assert avant - 1 <= ms <= apres + 1


def test_uuid7_strictement_croissants_et_uniques():
    identifiants = [uuid7() for _ in range(5000)]
    assert identifiants == sorted(identifiants)
    assert len(set(identifiants)) == len(identifiants)

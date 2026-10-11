"""0.9.3 : renforcement de la sécurité (revue : docs/revue-securite.md).

En-têtes de chaque réponse, pièce jointe ouverte en bac à sable, configuration de production
sans avertissement de `check --deploy`, dépendances sans faille connue (audit en CI)."""

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from apps.perimetre.tests.conftest import client_de, monde  # noqa: F401

RACINE = Path(__file__).resolve().parents[1]


@pytest.mark.django_db
def test_chaque_reponse_porte_les_entetes_de_securite(monde):  # noqa: F811
    r = client_de(monde["admin.sn"]).get("/api/v1/referentiel/valeurs/")
    assert r.status_code == 200
    assert r["Content-Security-Policy"].startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in r["Content-Security-Policy"]
    assert "geolocation=()" in r["Permissions-Policy"]
    assert r["X-Content-Type-Options"] == "nosniff"
    assert r["X-Frame-Options"] == "DENY"
    assert r["Referrer-Policy"] == "same-origin"
    # Même une erreur ou une route inconnue les porte.
    inconnue = client_de(monde["admin.sn"]).get("/api/v1/inconnue/")
    assert inconnue["Content-Security-Policy"].startswith("default-src 'none'")


def test_la_configuration_de_production_passe_check_deploy():
    """`check --deploy` sans avertissement (hors W003 et W021, écartés et justifiés)."""
    env = {
        **os.environ,
        "ENVIRONNEMENT": "production",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "DJANGO_ALLOWED_HOSTS": "api.exemple.org",
    }
    r = subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
        cwd=RACINE, env=env, capture_output=True, text=True, timeout=120,
    )  # fmt: skip
    assert r.returncode == 0, r.stderr + r.stdout


def test_la_production_refuse_une_cle_absente_ou_courte():
    env = {**os.environ, "ENVIRONNEMENT": "production", "DJANGO_SECRET_KEY": "courte"}
    r = subprocess.run([sys.executable, "manage.py", "check"], cwd=RACINE, env=env,
                       capture_output=True, text=True, timeout=120)  # fmt: skip
    assert r.returncode != 0 and "DJANGO_SECRET_KEY" in r.stderr


def test_la_production_ne_tourne_jamais_en_debug():
    from django.conf import settings

    source = (RACINE / "config" / "settings.py").read_text(encoding="utf-8")
    assert 'DEBUG = env_bool("DJANGO_DEBUG", ENVIRONNEMENT == "developpement")' in source
    assert settings.DEBUG is False  # les tests tournent comme la production

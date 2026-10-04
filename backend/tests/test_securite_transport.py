"""SEC-007 : communications chiffrées et aucun secret dans le code.

CA1 (« l'analyse de secrets de la CI ne trouve rien ») est vérifié par le job `secrets`
(gitleaks) de la CI, qui bloque la fusion ; ce test vérifie que ce job existe et que la
configuration de production impose HTTPS.
"""

import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]


def test_la_ci_analyse_les_secrets_de_tout_l_historique():
    ci = (RACINE / ".github" / "workflows" / "ci.yml").read_text()
    assert "gitleaks/gitleaks-action" in ci and "fetch-depth: 0" in ci


def test_la_production_impose_https():
    script = (
        "import json, django; from django.conf import settings; django.setup(); "
        "print(json.dumps([settings.SECURE_SSL_REDIRECT, settings.SECURE_HSTS_SECONDS, "
        "settings.SESSION_COOKIE_SECURE, settings.CSRF_COOKIE_SECURE, settings.DEBUG]))"
    )
    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings",
        "ENVIRONNEMENT": "production",
        # Clé jetable tirée à l'exécution : aucun secret n'est écrit dans le dépôt.
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(50),
        "DJANGO_ALLOWED_HOSTS": "api.exemple.org",
    }
    # Commande fixe (l'interpréteur courant et un script constant) : aucune entrée extérieure.
    sortie = subprocess.run(  # noqa: S603
        [sys.executable, "-c", script], env=env, cwd=RACINE / "backend",
        capture_output=True, text=True, check=True,
    ).stdout  # fmt: skip
    valeurs = json.loads(sortie.strip().splitlines()[-1])
    redirection, hsts, cookie_session, cookie_csrf, debug = valeurs
    assert redirection is True and hsts >= 31536000
    assert cookie_session and cookie_csrf and debug is False

"""0.9.5 : hébergement de production (prd.md §21.2, condition 6 ; NFR-006, REC-20).

Le plan Render (`render.yaml`) : offres payantes, Francfort, aucun secret écrit ; les pièces
jointes sur un stockage compatible S3 (Cloudflare R2, essai dans `test_pieces.py`) ; les scripts
de sauvegarde et de restauration. La restauration elle-même est rejouée par la CI
(`scripts/tester_restauration.sh`) et chaque mois sur la vraie sauvegarde
(`.github/workflows/restauration.yml`)."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"


def plan() -> dict:
    return yaml.safe_load((RACINE / "render.yaml").read_text(encoding="utf-8"))


def test_render_offres_payantes_a_francfort_sans_secret_ecrit():
    p = plan()
    elements = [*p["databases"], *p["services"]]
    for e in elements:
        assert e.get("region") == "frankfurt", e["name"]
        assert e.get("plan") != "free", e["name"]  # HT-05 : base persistante, sauvegardée
    secrets = ("SECRET", "KEY", "CLE", "PASSWORD", "JETON", "PHRASE", "DSN", "TOKEN")
    for service in p["services"]:
        for var in service.get("envVars", []):
            if any(mot in var["key"] for mot in secrets):
                # Un secret se saisit dans Render ou s'y tire au hasard ; jamais écrit ici.
                assert "value" not in var, var["key"]
    noms = {s["name"]: s for s in p["services"]}
    assert noms["innov-api"]["healthCheckPath"] == "/api/health/"
    assert "migrate" in noms["innov-api"]["preDeployCommand"]
    assert noms["innov-sauvegarde"]["type"] == "cron"
    assert noms["innov-file"]["maxmemoryPolicy"] == "noeviction"


def test_le_stockage_r2_est_choisi_en_hebergement():
    env = {**os.environ, "INNOV_STOCKAGE": "r2", "R2_URL": "https://compte.r2.exemple",
           "R2_COMPARTIMENT": "innov-essai-pieces", "R2_CLE": "x", "R2_SECRET": "y"}  # fmt: skip
    code = ("import django; django.setup(); from django.conf import settings; "
            "print(settings.STORAGES['default']['BACKEND'])")  # fmt: skip
    r = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True,  # noqa: S603
                       text=True, timeout=120,
                       env={**env, "DJANGO_SETTINGS_MODULE": "config.settings"})  # fmt: skip
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "storages.backends.s3.S3Storage"


@pytest.mark.parametrize("script", ["sauvegarder.sh", "restaurer.sh", "tester_restauration.sh",
                                    "controler_restauration.sh"])  # fmt: skip
def test_les_scripts_d_exploitation_sont_valides(script):
    chemin = RACINE / "scripts" / script
    assert os.access(chemin, os.X_OK), f"{script} n'est pas exécutable"
    bash = shutil.which("bash")
    r = subprocess.run([bash, "-n", str(chemin)], capture_output=True, text=True)  # noqa: S603
    assert r.returncode == 0, r.stderr
    # Jamais de mot de passe ni d'adresse de base affichés dans les journaux.
    assert 'echo "$DATABASE_URL' not in chemin.read_text(encoding="utf-8")

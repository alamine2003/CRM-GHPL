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
        if e.get("runtime") == "static":
            continue  # portail : réseau de diffusion de Render, ni offre ni région
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


def test_portail_statique_sur_render():
    """1.0.1 : le portail est servi par Render, avec les en-têtes de sécurité de la revue 0.9.3."""
    s = {x["name"]: x for x in plan()["services"]}
    p = s["innov-portail"]
    assert p["type"] == "web" and p["runtime"] == "static"
    assert p["staticPublishPath"] == "portail/dist" and "build -w portail" in p["buildCommand"]
    assert {"type": "rewrite", "source": "/*", "destination": "/index.html"} in p["routes"]
    e = {h["name"]: h["value"] for h in p["headers"] if h["path"] == "/*"}
    for directive in ("default-src 'self'", "script-src 'self'", "frame-ancestors 'none'",
                      "object-src 'none'", "base-uri 'self'"):  # fmt: skip
        assert directive in e["Content-Security-Policy"]
    assert e["X-Frame-Options"] == "DENY" and e["X-Content-Type-Options"] == "nosniff"
    assert e["Strict-Transport-Security"].startswith("max-age=31536000")
    v = {x["key"]: x for x in p["envVars"]}
    assert v["VITE_API_URL"].get("sync") is False and "value" not in v["VITE_API_URL"]
    assert v["VITE_CONTACT_DONNEES"].get("sync") is False
    api = {x["key"]: x for x in s["innov-api"]["envVars"]}
    # « None » n'est jamais écrit en dur : il se saisit tant qu'il n'y a pas de domaine.
    assert "value" not in api["INNOV_COOKIE_SAMESITE"]


def test_demonstration_gratuite_sur_render():
    """1.0.3 : l'instance d'essai tient dans les offres gratuites, sans secret écrit
    (ENVIRONNEMENT=demonstration). 1.0.8 : plus de données fictives, un premier compte seulement."""
    d = yaml.safe_load((RACINE / "render-demo.yaml").read_text(encoding="utf-8"))
    # 1.0.4 : la base gratuite est chez Neon ; son adresse se saisit, jamais écrite ici.
    assert "databases" not in d
    s = {x["name"]: x for x in d["services"]}
    api, portail = s["innov-demo-api"], s["innov-demo-portail"]
    assert api["plan"] == "free" and portail["runtime"] == "static"
    assert set(s) == {"innov-demo-api", "innov-demo-portail"}  # ni worker, ni Redis, ni cron
    # 1.0.5 : un fichier de démarrage, sans guillemets dans la commande (Render les transmet mal).
    assert api["dockerCommand"] == "sh demarrer_demo.sh"
    script = (BACKEND / "demarrer_demo.sh").read_text(encoding="utf-8")
    assert "set -e" in script and "${PORT:-8000}" in script
    commande = script.split("set -e", 1)[1]  # les instructions, sans le commentaire d'en-tête
    ordre = [commande.index(etape) for etape in ("migrate", "preparer_instance", "gunicorn")]
    assert ordre == sorted(ordre)
    assert subprocess.run(["sh", "-n", BACKEND / "demarrer_demo.sh"]).returncode == 0  # noqa: S603, S607
    v = {x["key"]: x for x in api["envVars"]}
    assert v["ENVIRONNEMENT"]["value"] == "demonstration"
    assert v["DATABASE_URL"].get("sync") is False and "value" not in v["DATABASE_URL"]
    assert "INNOV_STOCKAGE" not in v and "REDIS_URL" not in v
    for cle in ("DJANGO_SECRET_KEY", "JWT_SIGNING_KEY", "INNOV_CLE_CHIFFREMENT"):
        assert v[cle].get("generateValue") is True and "value" not in v[cle]
    for cle in ("INNOV_ADMIN_IDENTIFIANT", "INNOV_ADMIN_MOT_DE_PASSE"):
        assert v[cle].get("sync") is False and "value" not in v[cle]
    assert not any(cle.startswith("INNOV_DEMO_") for cle in v)  # plus de données fictives
    # Mêmes en-têtes de sécurité que le portail de production.
    prod = {x["name"]: x for x in plan()["services"]}["innov-portail"]
    assert portail["headers"] == prod["headers"] and portail["routes"] == prod["routes"]


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

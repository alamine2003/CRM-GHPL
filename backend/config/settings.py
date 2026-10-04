"""Réglages du service central INNOV CRM.

Tout ce qui dépend de l'environnement vient des variables d'environnement ;
aucun secret n'est versionné (architecture-essentials §10). Les valeurs par
défaut ne conviennent qu'au poste de développement.
"""

import os
from pathlib import Path

import dj_database_url
from django.utils.translation import gettext_lazy as _

from .version import VERSION

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(nom: str, defaut: bool = False) -> bool:
    return os.environ.get(nom, str(defaut)).lower() in {"1", "true", "oui", "yes"}


def env_liste(nom: str, defaut: str = "") -> list[str]:
    return [v.strip() for v in os.environ.get(nom, defaut).split(",") if v.strip()]


ENVIRONNEMENT = os.environ.get("ENVIRONNEMENT", "developpement")
DEBUG = env_bool("DJANGO_DEBUG", ENVIRONNEMENT == "developpement")
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if ENVIRONNEMENT not in {"developpement", "test"}:
        raise RuntimeError("DJANGO_SECRET_KEY est obligatoire hors développement.")
    SECRET_KEY = "cle-de-developpement-uniquement"  # noqa: S105

ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CORS_ALLOWED_ORIGINS = env_liste("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CSRF_TRUSTED_ORIGINS = env_liste("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")

INNOV_VERSION = VERSION

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "apps.socle",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    },
]

DATABASES = {
    "default": dj_database_url.config(
        default="postgres://innov@localhost:5432/innov", conn_max_age=60
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Internationalisation : français par défaut, anglais disponible (DC-12).
LANGUAGE_CODE = "fr"
LANGUAGES = [("fr", _("Français")), ("en", _("Anglais"))]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
# Stockage en UTC, affichage dans le fuseau du pays (RG-006).
TIME_ZONE = "UTC"
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "INNOV CRM",
    "DESCRIPTION": "API du CRM multi-pays des délégués médicaux.",
    "VERSION": VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
}

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
# Sécurité du transport : uniquement derrière l'hébergeur (recette, préproduction, production).
if ENVIRONNEMENT not in {"developpement", "test"}:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = 31536000
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

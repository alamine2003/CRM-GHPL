"""Réglages du service central INNOV CRM.

Tout ce qui dépend de l'environnement vient des variables d'environnement ;
aucun secret n'est versionné (architecture-essentials §10). Les valeurs par
défaut ne conviennent qu'au poste de développement.
"""

import os
from datetime import timedelta
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
if ENVIRONNEMENT in {"developpement", "test"} and not SECRET_KEY:
    SECRET_KEY = "cle-de-developpement-uniquement-jamais-utilisee-en-production"  # noqa: S105
elif len(SECRET_KEY) < 50:
    # Elle signe aussi les jetons d'accès : une clé courte affaiblit toute l'authentification.
    raise RuntimeError("DJANGO_SECRET_KEY est obligatoire hors développement (50 caractères min.).")

ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CORS_ALLOWED_ORIGINS = env_liste("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CSRF_TRUSTED_ORIGINS = env_liste("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")
# Le jeton de rafraîchissement du portail voyage dans un cookie : le portail et
# l'API doivent partager le même domaine parent (même « site »).
CORS_ALLOW_CREDENTIALS = True
# En-têtes propres à INNOV CRM : client du portail (rafraîchissement) et pays actif (§11.4).
CORS_ALLOW_HEADERS = ["accept", "accept-language", "authorization", "content-type",
                      "x-innov-client", "x-pays"]  # fmt: skip
PORTAIL_URL = os.environ.get("PORTAIL_URL", "http://localhost:5173").rstrip("/")

INNOV_VERSION = VERSION

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "apps.socle",
    "apps.identite",
    "apps.perimetre",
    "apps.organisation",
    "apps.referentiel",
    "apps.prospects",
    "apps.demonstration",
    "apps.audit",
]

AUTH_USER_MODEL = "identite.Utilisateur"

# Mots de passe : Argon2id, 12 caractères minimum, refus des mots de passe courants (SEC-001).
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    # Mots compromettants (entreprise, métier, pays, mots courants), même déguisés.
    {"NAME": "apps.identite.mots_de_passe.MotsCompromettantsValidator"},
    # Fuites publiques (k-anonymat) ; désactivable en local sans réseau.
    {
        "NAME": "apps.identite.mots_de_passe.FuitesConnuesValidator",
        "OPTIONS": {
            "actif": env_bool(
                "INNOV_VERIFIER_FUITES", ENVIRONNEMENT not in {"developpement", "test"}
            )
        },
    },
]

# Connexion et sessions (SEC-002, architecture §11.1).
INNOV_AUTH = {
    "ECHECS_AVANT_VERROUILLAGE": 5,
    "DUREE_VERROUILLAGE_MINUTES": 15,
    # Durée de vie glissante du jeton de rafraîchissement, par client.
    "SESSION_PORTAIL_MINUTES": 30,
    "SESSION_MOBILE_JOURS": 7,
    "REINITIALISATION_MINUTES": 30,
    "COOKIE_RAFRAICHISSEMENT": "innov_rafraichissement",
    "COOKIE_SECURISE": ENVIRONNEMENT not in {"developpement", "test"},
}

# Chiffrement des secrets de double authentification (SEC-003). Une clé distincte de
# DJANGO_SECRET_KEY permet de changer l'une sans invalider l'autre ; à défaut, la clé
# est dérivée de DJANGO_SECRET_KEY.
INNOV_CLE_CHIFFREMENT = os.environ.get("INNOV_CLE_CHIFFREMENT", "")

MIDDLEWARE = [
    "apps.socle.journalisation.ReferenceRequete",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# Journaux techniques : JSON sur la sortie standard (Render les collecte), sans donnée
# personnelle en clair (architecture §16.3). JOURNAUX_LISIBLES=1 en local pour du texte.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": "apps.socle.journalisation.FormatJSON"},
        "texte": {"format": "%(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "sortie": {
            "class": "logging.StreamHandler",
            "formatter": "texte" if env_bool("JOURNAUX_LISIBLES") else "json",
        }
    },
    "root": {"handlers": ["sortie"], "level": os.environ.get("NIVEAU_JOURNAUX", "INFO")},
    "loggers": {
        # Les requêtes sont déjà journalisées par ReferenceRequete, avec leur référence.
        "django.request": {"level": "ERROR"},
        "django.server": {"level": "WARNING"},
    },
}

# Suivi des erreurs (architecture §19) : actif seulement si SENTRY_DSN est fourni par
# l'hébergeur. Aucune donnée personnelle n'est envoyée.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    from apps.socle.suivi import avant_envoi

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=ENVIRONNEMENT,
        release=f"innov-crm@{INNOV_VERSION}",
        send_default_pii=False,
        traces_sample_rate=float(os.environ.get("SENTRY_ECHANTILLON_TRACES", "0")),
        before_send=avant_envoi,
    )
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
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.identite.authentification.AuthentificationSession"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "connexion": "20/min",
        "recuperation": "5/min",
        "erreurs_clients": "30/min",
    },
    "EXCEPTION_HANDLER": "apps.socle.erreurs.gestionnaire_exceptions",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", SECRET_KEY),
    "ALGORITHM": "HS256",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "sub",
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ["REDIS_URL"],
        }
        if os.environ.get("REDIS_URL")
        else {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    )
}

# Courriel : uniquement sécurité du compte (NOT-004). Console en développement.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "INNOV CRM <ne-pas-repondre@localhost>")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)

SPECTACULAR_SETTINGS = {
    "TITLE": "INNOV CRM",
    "DESCRIPTION": "API du CRM multi-pays des délégués médicaux.",
    "VERSION": VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "LangueEnum": "apps.socle.models.CHOIX_LANGUES",
        "StatutEnum": "apps.socle.models.Pays.Statut",
        "StatutFicheEnum": "apps.prospects.models.StatutFiche",
    },
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

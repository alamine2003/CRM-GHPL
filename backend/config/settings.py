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
elif len(SECRET_KEY) < 43:
    # Elle signe aussi les jetons d'accès : une clé courte affaiblit toute l'authentification.
    # 43 caractères : 256 bits tirés au hasard, écrits en base64, comme les tire Render
    # (`generateValue`, 44 caractères avec le « = » final ; 1.0.6).
    raise RuntimeError("DJANGO_SECRET_KEY est obligatoire hors développement (43 caractères min.).")

ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# Render donne l'adresse publique du service (1.0.3) : la démonstration gratuite n'a rien à saisir.
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])
CORS_ALLOWED_ORIGINS = env_liste("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CSRF_TRUSTED_ORIGINS = env_liste("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")
# Le jeton de rafraîchissement du portail voyage dans un cookie : le portail et l'API partagent
# de préférence le même domaine parent (même « site ») ; sinon voir INNOV_COOKIE_SAMESITE.
CORS_ALLOW_CREDENTIALS = True
# En-têtes propres à INNOV CRM : client du portail (rafraîchissement), pays actif (§11.4) et
# version de l'application (0.9.6 ; 1.0.0 : autorisé aussi pour l'application dans un navigateur).
CORS_ALLOW_HEADERS = ["accept", "accept-language", "authorization", "content-type",
                      "x-innov-client", "x-pays", "x-version-app"]  # fmt: skip
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
    "apps.imports",
    "apps.planning",
    "apps.rapports",
    "apps.notifications",
    "apps.pilotage",
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
_COOKIE_SECURISE = ENVIRONNEMENT not in {"developpement", "test"}
# SameSite du cookie de rafraîchissement du portail (1.0.1) : « Strict » dès que le portail et
# l'API partagent un domaine (portail.<domaine>, api.<domaine>). « None » seulement tant qu'ils
# sont sur deux adresses *.onrender.com (suffixe public : deux sites distincts). La protection
# contre les requêtes forgées repose alors sur l'en-tête X-Innov-Client (requête CORS
# pré-vérifiée, origines listées une à une). Vide ou absent : « Strict ».
_COOKIE_SAMESITE = (os.environ.get("INNOV_COOKIE_SAMESITE") or "Strict").strip().capitalize()
if _COOKIE_SAMESITE not in {"Strict", "None"}:
    raise RuntimeError("INNOV_COOKIE_SAMESITE vaut Strict ou None.")
if _COOKIE_SAMESITE == "None" and not _COOKIE_SECURISE:
    raise RuntimeError("INNOV_COOKIE_SAMESITE=None exige HTTPS (hors développement et test).")
INNOV_AUTH = {
    "ECHECS_AVANT_VERROUILLAGE": 5,
    "DUREE_VERROUILLAGE_MINUTES": 15,
    # Durée de vie glissante du jeton de rafraîchissement, par client.
    "SESSION_PORTAIL_MINUTES": 30,
    "SESSION_MOBILE_JOURS": 7,
    "REINITIALISATION_MINUTES": 30,
    "COOKIE_RAFRAICHISSEMENT": "innov_rafraichissement",
    "COOKIE_SECURISE": _COOKIE_SECURISE,
    "COOKIE_SAMESITE": _COOKIE_SAMESITE,
}

# Chiffrement des secrets de double authentification (SEC-003). Une clé distincte de
# DJANGO_SECRET_KEY permet de changer l'une sans invalider l'autre ; à défaut, la clé
# est dérivée de DJANGO_SECRET_KEY.
INNOV_CLE_CHIFFREMENT = os.environ.get("INNOV_CLE_CHIFFREMENT", "")

MIDDLEWARE = [
    "apps.socle.journalisation.ReferenceRequete",
    "django.middleware.security.SecurityMiddleware",
    "apps.socle.securite.EntetesSecurite",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # OFF-006 : avant tout ce qui modifie la réponse ; voir apps/socle/compression.py.
    "apps.socle.compression.CompressionApi",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # 0.9.6 : version minimale de l'application mobile (architecture §14.8).
    "apps.socle.version_app.VersionMinimaleApp",
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

# Pièces jointes des rapports (RPT-007) : jamais servies telles quelles, toujours par une vue
# qui vérifie le droit de voir le rapport. Disque local en développement ; en hébergement
# (0.9.5), Cloudflare R2 (compatible S3, architecture §5) : compartiment privé par
# environnement, lu seulement par l'API, jamais par un lien public.
MEDIA_ROOT = Path(os.environ.get("INNOV_FICHIERS", BASE_DIR / "fichiers"))
if os.environ.get("INNOV_STOCKAGE") == "r2":
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "bucket_name": os.environ["R2_COMPARTIMENT"],
                "endpoint_url": os.environ["R2_URL"],
                "access_key": os.environ["R2_CLE"],
                "secret_key": os.environ["R2_SECRET"],
                "region_name": "auto",
                "default_acl": None,
                "file_overwrite": False,
            },
        },
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

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

# Worker et ordonnanceur (architecture §7.5) : file Redis ; sans Redis, exécution sur place.
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "memory://")
CELERY_TASK_ALWAYS_EAGER = not os.environ.get("REDIS_URL")
CELERY_TIMEZONE = "UTC"
CELERY_TASK_IGNORE_RESULT = True

# Courriel : uniquement sécurité du compte (NOT-004). Console en développement.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "INNOV CRM <ne-pas-repondre@localhost>")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)

# NOT-002 (0.8.5) : notifications push par le service d'Expo. Désactivées tant que
# l'hébergement ne les ouvre pas ; le jeton d'accès, s'il y en a un, vient de l'environnement.
PUSH_ACTIF = env_bool("PUSH_ACTIF", False)
# 0.9.6 (architecture §14.8) : une application plus ancienne reçoit 426 ; vide, tout passe.
VERSION_MIN_APP = os.environ.get("INNOV_VERSION_MIN_APP", "")
PUSH_EXPO_URL = os.environ.get("PUSH_EXPO_URL", "https://exp.host/--/api/v2/push/send")
PUSH_EXPO_JETON = os.environ.get("PUSH_EXPO_JETON", "")

SPECTACULAR_SETTINGS = {
    "TITLE": "INNOV CRM",
    "DESCRIPTION": "API du CRM multi-pays des délégués médicaux.",
    "VERSION": VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "LangueEnum": "apps.socle.models.CHOIX_LANGUES",
        "StatutEnum": "apps.socle.models.Pays.Statut",
        "StatutRapportEnum": "apps.rapports.models.StatutRapport",
        "PeriodePilotageEnum": "apps.pilotage.serializers.PERIODES",
        "TypeChampEnum": "apps.rapports.models.TypeChamp",
        "RetourPrescripteurEnum": "apps.rapports.models.RetourPrescripteur",
        "TypeRemiseEnum": "apps.rapports.models.TypeRemise",
        "StatutFicheEnum": "apps.prospects.models.StatutFiche",
        "StatutLotEnum": "apps.imports.models.LotImport.Statut",
        "TypeActiviteEnum": "apps.planning.models.TypeActivite",
        "PeriodeActiviteEnum": "apps.planning.models.Periode",
        "CodeControleEnum": "apps.planning.controles.CODES",
        "GraviteControleEnum": "apps.planning.controles.GRAVITES",
        "RaisonRepriseEnum": "apps.planning.services.RAISONS_REPRISE",
        "DecisionPlanningEnum": "apps.planning.models.Decision",
        "ModeDecisionEnum": "apps.planning.models.ModeDecision",
        "MotifVersionEnum": "apps.planning.models.MotifVersion",
        "VisiteStatutEnum": "apps.planning.etats.StatutVisite",
    },
}

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
# Corps de requête hors fichiers : 2,5 Mo au plus ; les pièces jointes (10 Mo, RPT-007) passent
# par le téléversement, contrôlé par le service.
DATA_UPLOAD_MAX_MEMORY_SIZE = 2_621_440
# Sécurité du transport : uniquement derrière l'hébergeur (recette, préproduction, production).
if ENVIRONNEMENT not in {"developpement", "test"}:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    # La sonde de santé de l'hébergeur appelle le service directement, en HTTP (1.0.3).
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# `check --deploy` (0.9.3) : deux avertissements écartés à dessein.
# - W003 : l'API n'a pas de formulaire ; elle s'authentifie par l'en-tête Authorization. Le seul
#   cookie (rafraîchissement du portail) est httpOnly, SameSite=Strict (ou None tant que portail
#   et API n'ont pas de domaine commun, 1.0.1), limité à /api/v1/auth/,
#   et n'est lu qu'avec l'en-tête X-Innov-Client, qui impose une requête CORS autorisée.
# - W021 : pas de préchargement HSTS tant que le domaine de production n'est pas fixé
#   (l'inscription est très difficile à retirer).
# - W009 (1.0.6) : Django veut 50 caractères ; la clé tirée par Render en a 44 (256 bits en
#   base64), ce qui suffit. La longueur minimale est imposée plus haut, au démarrage.
SILENCED_SYSTEM_CHECKS = ["security.W003", "security.W009", "security.W021"]

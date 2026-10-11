from django.apps import AppConfig


class PerimetreConfig(AppConfig):
    name = "apps.perimetre"
    verbose_name = "Périmètre et permissions"

    def ready(self):
        from . import verifications  # noqa: F401 — enregistre la vérification de déploiement

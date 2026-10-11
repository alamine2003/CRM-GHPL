from django.urls import include, path

from apps.socle.views import sante

urlpatterns = [
    path("api/health/", sante, name="sante"),
    path("api/v1/", include("config.urls_v1")),
]

# Les erreurs hors de l'API REST gardent le format JSON commun, avec la référence.
handler404 = "apps.socle.erreurs.page_introuvable"
handler500 = "apps.socle.erreurs.erreur_serveur"

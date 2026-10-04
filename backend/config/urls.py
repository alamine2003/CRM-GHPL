from django.urls import include, path

from apps.socle.views import sante

urlpatterns = [
    path("api/health/", sante, name="sante"),
    path("api/v1/", include("config.urls_v1")),
]

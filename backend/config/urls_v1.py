"""Routes de l'API versionnée /api/v1 (ADR-012)."""

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.socle.views import InformationsView

urlpatterns = [
    path("auth/", include("apps.identite.urls")),
    path("informations/", InformationsView.as_view(), name="informations"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

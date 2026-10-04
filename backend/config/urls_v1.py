"""Routes de l'API versionnée /api/v1 (ADR-012)."""

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.identite import vues_comptes as comptes
from apps.socle import vues_pays as pays
from apps.socle.views import InformationsView

urlpatterns = [
    path("auth/", include("apps.identite.urls")),
    path("auth/perimetre/", comptes.PerimetreVue.as_view(), name="perimetre"),
    path("informations/", InformationsView.as_view(), name="informations"),
    # Pays et paramètres (ORG-001, ORG-011)
    path("pays/", pays.PaysListeVue.as_view(), name="pays-liste"),
    path("pays/<str:code>/", pays.PaysDetailVue.as_view(), name="pays-detail"),
    path("pays/<str:code>/statut/", pays.PaysStatutVue.as_view(), name="pays-statut"),
    path("pays/<str:code>/parametres/", pays.ParametresVue.as_view(), name="parametres"),
    path("pays/<str:code>/parametres/<str:cle>/", pays.ParametreVue.as_view(), name="parametre"),
    path("pays/<str:code>/designations/", comptes.DesignationsVue.as_view(), name="designations"),
    # Comptes et rôles (USR-003, ORG-002)
    path("utilisateurs/", comptes.UtilisateursVue.as_view(), name="utilisateurs"),
    path("utilisateurs/<uuid:id>/", comptes.UtilisateurVue.as_view(), name="utilisateur"),
    path("utilisateurs/<uuid:id>/roles/", comptes.RolesUtilisateurVue.as_view(), name="roles"),
    path(
        "utilisateurs/<uuid:id>/<str:operation>/",
        comptes.UtilisateurActionVue.as_view(),
        name="utilisateur-action",
    ),
    path("roles/<uuid:id>/retirer/", comptes.RetraitRoleVue.as_view(), name="role-retirer"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

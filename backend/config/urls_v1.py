"""Routes de l'API versionnée /api/v1 (ADR-012)."""

# ruff: noqa: E501

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.identite import vues_comptes as comptes
from apps.organisation import vues as org
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
    # Affectations multi-pays et transferts (ORG-009, ORG-010)
    path(
        "utilisateurs/<uuid:id>/affectations/",
        comptes.AffectationsVue.as_view(),
        name="affectations",
    ),
    path(
        "affectations/<uuid:id>/terminer/",
        comptes.AffectationFinVue.as_view(),
        name="affectation-terminer",
    ),
    path("utilisateurs/<uuid:id>/transferts/", comptes.TransfertsVue.as_view(), name="transferts"),
    path(
        "utilisateurs/<uuid:id>/<str:operation>/",
        comptes.UtilisateurActionVue.as_view(),
        name="utilisateur-action",
    ),
    path("roles/<uuid:id>/retirer/", comptes.RetraitRoleVue.as_view(), name="role-retirer"),
    # Organisation du pays (ORG-003 à ORG-008)
    path("organisation/moi/", org.MonOrganisationVue.as_view(), name="mon-organisation"),
    path("organisation/synthese/", org.SyntheseVue.as_view(), name="organisation-synthese"),
    path("organisation/divisions/", org.DivisionsVue.as_view(), name="divisions"),
    path("organisation/divisions/<uuid:id>/", org.DivisionVue.as_view(), name="division"),
    path(
        "organisation/divisions/<uuid:id>/archiver/",
        org.DivisionArchivageVue.as_view(),
        name="division-archiver",
    ),
    path("organisation/reseaux/", org.ReseauxVue.as_view(), name="reseaux"),
    path("organisation/reseaux/<uuid:id>/", org.ReseauVue.as_view(), name="reseau"),
    path(
        "organisation/reseaux/<uuid:id>/archiver/",
        org.ReseauArchivageVue.as_view(),
        name="reseau-archiver",
    ),
    path("organisation/zones/", org.ZonesVue.as_view(), name="zones"),
    path("organisation/zones/<uuid:id>/", org.ZoneVue.as_view(), name="zone"),
    path(
        "organisation/zones/<uuid:id>/archiver/",
        org.ZoneArchivageVue.as_view(),
        name="zone-archiver",
    ),
    path("organisation/secteurs/", org.SecteursVue.as_view(), name="secteurs"),
    path("organisation/secteurs/<uuid:id>/", org.SecteurVue.as_view(), name="secteur"),
    path(
        "organisation/secteurs/<uuid:id>/archiver/",
        org.SecteurArchivageVue.as_view(),
        name="secteur-archiver",
    ),
    path("organisation/postes/", org.PostesVue.as_view(), name="postes"),
    path("organisation/postes/<uuid:id>/", org.PosteVue.as_view(), name="poste"),
    path(
        "organisation/postes/<uuid:id>/archiver/",
        org.PosteArchivageVue.as_view(),
        name="poste-archiver",
    ),
    path(
        "organisation/postes/<uuid:id>/occupations/",
        org.OccupationsVue.as_view(),
        name="occupations",
    ),
    path(
        "organisation/postes/<uuid:id>/rattachements/",
        org.RattachementsVue.as_view(),
        name="rattachements",
    ),
    path(
        "organisation/occupations/<uuid:id>/terminer/",
        org.OccupationFinVue.as_view(),
        name="occupation-terminer",
    ),
    path(
        "organisation/personnes/<uuid:id>/reseaux/",
        org.PerimetresReseauxVue.as_view(),
        name="perimetres-reseaux",
    ),
    path(
        "organisation/perimetres-reseaux/<uuid:id>/terminer/",
        org.PerimetreReseauFinVue.as_view(),
        name="perimetre-reseau-terminer",
    ),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

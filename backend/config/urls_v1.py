"""Routes de l'API versionnée /api/v1 (ADR-012)."""

# ruff: noqa: E501

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.identite import vues_comptes as comptes
from apps.organisation import vues as org
from apps.prospects import vues as prs
from apps.referentiel import vues as ref
from apps.socle import vues_exploitation as exploitation
from apps.socle import vues_pays as pays
from apps.socle.views import InformationsView

urlpatterns = [
    path("auth/", include("apps.identite.urls")),
    path("auth/perimetre/", comptes.PerimetreVue.as_view(), name="perimetre"),
    path("informations/", InformationsView.as_view(), name="informations"),
    path("erreurs-clients/", exploitation.ErreursClientsVue.as_view(), name="erreurs-clients"),
    path("exploitation/", exploitation.ExploitationVue.as_view(), name="exploitation"),
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
    path("appareils/", comptes.AppareilsVue.as_view(), name="appareils"),
    path(
        "appareils/<uuid:id>/revoquer/",
        comptes.AppareilRevocationVue.as_view(),
        name="appareil-revoquer",
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
    # Référentiel du pays (PRP-001) et portefeuilles des réseaux (ORG-004)
    path("referentiel/valeurs/", ref.ValeursVue.as_view(), name="valeurs"),
    path("referentiel/valeurs/<uuid:id>/", ref.ValeurVue.as_view(), name="valeur"),
    path(
        "referentiel/valeurs/<uuid:id>/archiver/",
        ref.ValeurArchivageVue.as_view(),
        name="valeur-archiver",
    ),
    path(
        "referentiel/valeurs/<uuid:id>/reactiver/",
        ref.ValeurReactivationVue.as_view(),
        name="valeur-reactiver",
    ),
    path("referentiel/produits/", ref.ProduitsVue.as_view(), name="produits"),
    path("referentiel/produits/<uuid:id>/", ref.ProduitVue.as_view(), name="produit"),
    path(
        "referentiel/produits/<uuid:id>/archiver/",
        ref.ProduitArchivageVue.as_view(),
        name="produit-archiver",
    ),
    path(
        "referentiel/produits/<uuid:id>/reactiver/",
        ref.ProduitReactivationVue.as_view(),
        name="produit-reactiver",
    ),
    path("referentiel/portefeuilles/", ref.PortefeuillesVue.as_view(), name="portefeuilles"),
    path(
        "referentiel/portefeuilles/<uuid:id>/",
        ref.PortefeuilleReseauVue.as_view(),
        name="portefeuille-reseau",
    ),
    path(
        "referentiel/mon-portefeuille/", ref.MonPortefeuilleVue.as_view(), name="mon-portefeuille"
    ),
    # Fiches prospects (PRP-002, PRP-006)
    path("prospects/", prs.ProspectsVue.as_view(), name="prospects"),
    path("prospects/synthese/", prs.SyntheseProspectsVue.as_view(), name="prospects-synthese"),
    path("prospects/<uuid:id>/", prs.ProspectVue.as_view(), name="prospect"),
    path(
        "prospects/<uuid:id>/valider/", prs.ProspectValidationVue.as_view(), name="prospect-valider"
    ),
    path(
        "prospects/<uuid:id>/archiver/",
        prs.ProspectArchivageVue.as_view(),
        name="prospect-archiver",
    ),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

"""Routes de l'API versionnée /api/v1 (ADR-012)."""

# ruff: noqa: E501

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.identite import vues_comptes as comptes
from apps.imports import vues as imp
from apps.notifications import vues as ntf
from apps.organisation import vues as org
from apps.planning import vues as pln
from apps.prospects import vues as prs
from apps.prospects import vues_ciblage as cib
from apps.prospects import vues_doublons as dbl
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
    path("organisation/localites/", org.LocalitesVue.as_view(), name="localites"),
    path("organisation/localites/<uuid:id>/", org.LocaliteVue.as_view(), name="localite"),
    path(
        "organisation/localites/<uuid:id>/archiver/",
        org.LocaliteArchivageVue.as_view(),
        name="localite-archiver",
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
    # Doublons, fusions, historique, propositions (PRP-007 à PRP-014)
    path("prospects/ressemblants/", dbl.RessemblantsVue.as_view(), name="prospects-ressemblants"),
    path(
        "prospects/<uuid:id>/historique/",
        dbl.HistoriqueProspectVue.as_view(),
        name="prospect-historique",
    ),
    path(
        "etablissements/<uuid:id>/historique/",
        dbl.HistoriqueEtablissementVue.as_view(),
        name="etablissement-historique",
    ),
    path("doublons/", dbl.DoublonsVue.as_view(), name="doublons"),
    path("qualite/", dbl.QualiteVue.as_view(), name="qualite"),
    path("jours-feries/", pln.JoursFeriesVue.as_view(), name="jours-feries"),
    path("jours-feries/<uuid:id>/", pln.JourFerieVue.as_view(), name="jour-ferie"),
    path(
        "jours-feries/<uuid:id>/retirer/",
        pln.JourFerieRetraitVue.as_view(),
        name="jour-ferie-retirer",
    ),
    path("plannings/", pln.PlanningsVue.as_view(), name="plannings"),
    path("plannings/semaine/", pln.SemaineVue.as_view(), name="planning-semaine"),
    path("programme/", pln.ProgrammeVue.as_view(), name="programme"),
    path("plannings/a-valider/", pln.FileValidationVue.as_view(), name="plannings-a-valider"),
    path("plannings/fermes/", pln.SemainesFermeesVue.as_view(), name="plannings-fermes"),
    path("plannings/fermes/rouvrir/", pln.ReouvertureVue.as_view(), name="plannings-rouvrir"),
    path(
        "plannings/semaine/reouverture/",
        pln.DemandeReouvertureVue.as_view(),
        name="planning-demander-reouverture",
    ),
    path("plannings/<uuid:id>/visites/", pln.VisitesPlanningVue.as_view(), name="planning-visites"),
    path("visites/<uuid:id>/", pln.VisiteVue.as_view(), name="visite"),
    path("visites/<uuid:id>/retirer/", pln.VisiteRetraitVue.as_view(), name="visite-retirer"),
    path("plannings/<uuid:id>/ordre/", pln.OrdreVue.as_view(), name="planning-ordre"),
    path("plannings/<uuid:id>/poser/", pln.PoseVue.as_view(), name="planning-poser"),
    path("plannings/<uuid:id>/soumettre/", pln.SoumissionVue.as_view(), name="planning-soumettre"),
    path(
        "plannings/<uuid:id>/consultation/",
        pln.ConsultationVue.as_view(),
        name="planning-consultation",
    ),
    path("plannings/<uuid:id>/approuver/", pln.ApprobationVue.as_view(), name="planning-approuver"),
    path("notifications/", ntf.NotificationsVue.as_view(), name="notifications"),
    path("remplacements/", org.RemplacementsVue.as_view(), name="remplacements"),
    path(
        "remplacements/candidats/",
        org.CandidatsRemplacementVue.as_view(),
        name="remplacements-candidats",
    ),
    path(
        "remplacements/<uuid:id>/terminer/",
        org.RemplacementTerminerVue.as_view(),
        name="remplacement-terminer",
    ),
    path("plannings/<uuid:id>/reviser/", pln.RevisionVue.as_view(), name="planning-reviser"),
    path("plannings/<uuid:id>/versions/", pln.VersionsVue.as_view(), name="planning-versions"),
    path(
        "plannings/<uuid:id>/versions/<int:numero>/",
        pln.VersionVue.as_view(),
        name="planning-version",
    ),
    path("notifications/lues/", ntf.ToutesLuesVue.as_view(), name="notifications-lues"),
    path("notifications/<uuid:id>/lue/", ntf.LueVue.as_view(), name="notification-lue"),
    path("plannings/<uuid:id>/reprendre/", pln.RepriseVue.as_view(), name="planning-reprendre"),
    path("visites/<uuid:id>/copier/", pln.VisiteCopieVue.as_view(), name="visite-copier"),
    path(
        "plannings/<uuid:id>/passages/", pln.PassagesPlanningVue.as_view(), name="planning-passages"
    ),
    path(
        "passages/<uuid:id>/dissocier/",
        pln.PassageDissociationVue.as_view(),
        name="passage-dissocier",
    ),
    path(
        "plannings/<uuid:id>/activites/",
        pln.ActivitesPlanningVue.as_view(),
        name="planning-activites",
    ),
    path("activites/<uuid:id>/", pln.ActiviteVue.as_view(), name="activite"),
    path("activites/<uuid:id>/retirer/", pln.ActiviteRetraitVue.as_view(), name="activite-retirer"),
    path("doublons/<uuid:id>/trancher/", dbl.DoublonDecisionVue.as_view(), name="doublon-trancher"),
    path("fusions/", dbl.FusionsVue.as_view(), name="fusions"),
    path("fusions/<uuid:id>/defaire/", dbl.DefusionVue.as_view(), name="fusion-defaire"),
    path("propositions/", dbl.PropositionsVue.as_view(), name="propositions"),
    path("propositions/vues/", dbl.PropositionsVuesVue.as_view(), name="propositions-vues"),
    path(
        "propositions/<uuid:id>/trancher/",
        dbl.PropositionDecisionVue.as_view(),
        name="proposition-trancher",
    ),
    path("prospects/<uuid:id>/", prs.ProspectVue.as_view(), name="prospect"),
    path(
        "prospects/<uuid:id>/valider/", prs.ProspectValidationVue.as_view(), name="prospect-valider"
    ),
    path(
        "prospects/<uuid:id>/archiver/",
        prs.ProspectArchivageVue.as_view(),
        name="prospect-archiver",
    ),
    # Fiches établissements (PRP-003)
    path(
        "prospects/<uuid:id>/exercices/",
        prs.ExercicesProspectVue.as_view(),
        name="prospect-exercices",
    ),
    path("exercices/<uuid:id>/", prs.ExerciceVue.as_view(), name="exercice"),
    path("exercices/<uuid:id>/terminer/", prs.ExerciceFinVue.as_view(), name="exercice-terminer"),
    path(
        "etablissements/<uuid:id>/exercices/",
        prs.ExercicesEtablissementVue.as_view(),
        name="etablissement-exercices",
    ),
    path("ciblage/postes/", cib.PostesCiblageVue.as_view(), name="ciblage-postes"),
    path("ciblage/postes/<uuid:id>/", cib.ListeCibleVue.as_view(), name="ciblage-liste"),
    path(
        "ciblage/postes/<uuid:id>/candidats/",
        cib.CandidatsCiblageVue.as_view(),
        name="ciblage-candidats",
    ),
    path("ciblage/cibles/<uuid:id>/", cib.CibleVue.as_view(), name="cible"),
    path("ciblage/cibles/<uuid:id>/retirer/", cib.CibleRetraitVue.as_view(), name="cible-retirer"),
    path("ciblage/moi/", cib.MaListeCibleVue.as_view(), name="ciblage-moi"),
    path("etablissements/", prs.EtablissementsVue.as_view(), name="etablissements"),
    path(
        "etablissements/synthese/",
        prs.SyntheseEtablissementsVue.as_view(),
        name="etablissements-synthese",
    ),
    path(
        "etablissements/secteurs/",
        prs.SecteursEtablissementsVue.as_view(),
        name="etablissements-secteurs",
    ),
    path("etablissements/<uuid:id>/", prs.EtablissementVue.as_view(), name="etablissement"),
    path(
        "etablissements/<uuid:id>/valider/",
        prs.EtablissementValidationVue.as_view(),
        name="etablissement-valider",
    ),
    path(
        "etablissements/<uuid:id>/archiver/",
        prs.EtablissementArchivageVue.as_view(),
        name="etablissement-archiver",
    ),
    # Imports (PRP-013)
    path("imports/", imp.LotsVue.as_view(), name="imports"),
    path("imports/birdnotes/", imp.ImportBirdNotesVue.as_view(), name="import-birdnotes"),
    path("imports/organisation/", imp.ImportOrganisationVue.as_view(), name="import-organisation"),
    path("imports/<uuid:id>/", imp.LotVue.as_view(), name="import"),
    path("imports/<uuid:id>/rapport/", imp.RapportLotVue.as_view(), name="import-rapport"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

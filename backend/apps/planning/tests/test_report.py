"""0.4.7 : reporter une visite (VIS-007).

« Reportée » avec un motif de la liste du pays ; une nouvelle visite liée à l'originale se pose
au jour choisi (CA1). Dans une semaine déjà approuvée, cet ajout est une modification majeure
soumise au superviseur (CA2) ; dans une semaine à préparer, il s'ajoute au planning."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services
from apps.planning.models import Planning, Visite
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
NOUVELLE = "7a0e5c55-0000-4000-8000-000000000047"


@pytest.fixture
def approuvee(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        lieu = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
        visite = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                         **lieu)  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    return visite


def motif(monde, code="rendez_vous_reporte", pays="sn"):
    return Valeur.objects.get(pays=monde[pays], liste="motif_ecart", code=code)


def reporter(monde, visite, **corps):
    return client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/reporter/", corps,
                                             format="json")  # fmt: skip


@freeze_time("2026-10-13 08:30")
def test_vis007_ca1_la_nouvelle_visite_reference_l_originale(monde, approuvee):
    r = reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                 date="2026-10-15", heure="10:00", id=NOUVELLE,
                 commentaire="Reçoit jeudi")  # fmt: skip
    assert r.status_code == 200, r.json()
    v = r.json()
    assert (v["statut"], v["motif_ecart"]["libelle"]) == ("reportee", "Rendez-vous reporté")
    assert v["report"] == {"id": NOUVELLE, "date": "2026-10-15", "heure": "10:00"}
    suite = Visite.objects.get(pk=NOUVELLE)
    assert (suite.reportee_de_id, suite.prospect_id, suite.objectif) == (
        approuvee.pk, approuvee.prospect_id, "A")  # fmt: skip
    audit = EvenementAudit.objects.get(action="visite.reportee")
    assert audit.details["nouvelle"] == NOUVELLE


@freeze_time("2026-10-13 08:30")
def test_vis007_ca2_dans_la_semaine_approuvee_c_est_une_modification_majeure(monde, approuvee):
    reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
             date="2026-10-15", heure="10:00", id=NOUVELLE)  # fmt: skip
    planning = Planning.objects.get(pk=approuvee.planning_id)
    assert planning.statut == "soumis"
    assert services.version_a_decider(planning).motif == "modification"
    # Le programme reste celui approuvé : la nouvelle visite attend la décision.
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    jeudi = next(j for j in p["jours"] if j["date"] == "2026-10-15")
    assert NOUVELLE not in [v["id"] for v in jeudi["visites"]]


@freeze_time("2026-10-13 08:30")
def test_vis007_dans_une_semaine_a_preparer_elle_s_ajoute_au_planning(monde, approuvee):
    r = reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                 date="2026-10-20", id=NOUVELLE)  # fmt: skip
    assert r.status_code == 200, r.json()
    suite = Visite.objects.get(pk=NOUVELLE)
    assert (suite.planning.semaine, suite.planning.statut) == (date(2026, 10, 19), "brouillon")
    # La semaine en cours n'est pas resoumise.
    assert Planning.objects.get(pk=approuvee.planning_id).statut == "approuve"


@freeze_time("2026-10-13 08:30")
def test_vis007_impossible_sans_motif(monde, approuvee):
    r = reporter(monde, approuvee, le="2026-10-13T08:28:00Z", date="2026-10-15")
    assert (r.status_code, r.json()["code"]) == (400, "motif_requis")
    assert not Visite.objects.filter(reportee_de=approuvee).exists()


@freeze_time("2026-10-13 08:30")
def test_vis007_le_nouveau_jour_suit_le_jour_prevu(monde, approuvee):
    for jour in ("2026-10-13", "2026-10-12"):
        r = reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                     date=jour)  # fmt: skip
        assert (r.status_code, r.json()["code"]) == (400, "report_avant")


def test_vis007_rejoue_depuis_la_file_sans_doublon(monde, approuvee):
    corps = dict(le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk), date="2026-10-20",
                 id=NOUVELLE)  # fmt: skip
    with freeze_time("2026-10-13 12:00"):
        assert reporter(monde, approuvee, **corps).status_code == 200
        assert reporter(monde, approuvee, **corps).status_code == 200
    assert Visite.objects.filter(reportee_de=approuvee).count() == 1
    assert EvenementAudit.objects.filter(action="visite.reportee").count() == 1


@freeze_time("2026-10-13 09:30")
def test_vis007_une_visite_en_cours_ne_se_reporte_pas(monde, approuvee):
    from django.utils import timezone

    with freeze_time("2026-10-13 09:05"):
        execution.demarrer(approuvee, timezone.now())
    r = reporter(monde, approuvee, le="2026-10-13T09:25:00Z", motif=str(motif(monde).pk),
                 date="2026-10-15")  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "transition_interdite")


def test_vis007_une_modification_soumise_garde_les_visites_a_justifier(monde, terrain, approuvee):
    """Le report soumet une modification : le planning repasse « soumis », mais ce qui a été
    approuvé reste la référence (à justifier, historique)."""
    planning = terrain["planning"]
    from apps.planning.models import VersionPlanning

    # Une visite du lundi, approuvée, restée prévue.
    with freeze_time("2026-10-08 09:00"):
        Planning.objects.filter(pk=planning.pk).update(statut="brouillon")
        planning.refresh_from_db()
        oubliee = services.ajouter_visite(planning, date=date(2026, 10, 12), heure=time(15, 0),
                                          prospect=terrain["medecin"], objectif="B",
                                          etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    assert VersionPlanning.objects.filter(planning=planning, decision="approuve").count() == 2
    with freeze_time("2026-10-13 08:30"):
        reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                 date="2026-10-15", heure="10:00", id=NOUVELLE)  # fmt: skip
        assert Planning.objects.get(pk=planning.pk).statut == "soumis"
        p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert [v["id"] for v in p["a_justifier"]] == [str(oubliee.pk)]


def test_vis007_ca2_le_superviseur_trouve_et_approuve_le_report_de_la_semaine(monde, approuvee):
    """La semaine commencée ne ferme pas la modification : elle est dans la file du
    superviseur, il l'approuve, et la nouvelle visite entre au programme."""
    with freeze_time("2026-10-13 08:30"):
        reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                 date="2026-10-15", heure="10:00", id=NOUVELLE)  # fmt: skip
        sup = client_de(monde["sup.sn"])
        file = sup.get("/api/v1/plannings/a-valider/").json()
        assert str(approuvee.planning_id) in [str(ligne["planning"]["id"]) for ligne in file]
        r = sup.post(f"/api/v1/plannings/{approuvee.planning_id}/approuver/", format="json")
        assert r.status_code == 200, r.json()
        p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    jeudi = next(j for j in p["jours"] if j["date"] == "2026-10-15")
    assert NOUVELLE in [v["id"] for v in jeudi["visites"]]


def test_pln015_ca2_les_autres_visites_restent_executables(monde, terrain, approuvee):
    """Une modification soumise (un report) n'empêche pas d'exécuter les visites approuvées."""
    planning = Planning.objects.get(pk=approuvee.planning_id)
    with freeze_time("2026-10-08 09:00"):
        Planning.objects.filter(pk=planning.pk).update(statut="brouillon")
        planning.refresh_from_db()
        from apps.planning.tests.conftest import valeur
        from apps.prospects.services import creer_exercice, creer_prospect

        confrere = creer_prospect(
            monde["sn"], monde["admin.sn"], actif=True, nom="Sarr", prenom="Ibou",
            potentiel="B", type=valeur(monde, "type_prospect", "medecin"),
            specialite=valeur(monde, "specialite", "cardiologie"),
        )  # fmt: skip
        creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
        seconde = services.ajouter_visite(planning, date=MARDI, heure=time(11, 0), objectif="B",
                                          prospect=confrere,
                                          etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    with freeze_time("2026-10-13 08:30"):
        reporter(monde, approuvee, le="2026-10-13T08:28:00Z", motif=str(motif(monde).pk),
                 date="2026-10-15", heure="10:00", id=NOUVELLE)  # fmt: skip
        assert Planning.objects.get(pk=planning.pk).statut == "soumis"
    with freeze_time("2026-10-13 11:05"):
        r = client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{seconde.pk}/demarrer/",
                                              {"debut_le": "2026-10-13T11:02:00Z"},
                                              format="json")  # fmt: skip
    assert (r.status_code, r.json()["statut"]) == (200, "en_cours")

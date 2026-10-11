"""0.4.6 : annuler une visite (VIS-006) et justifier une visite non réalisée (VIS-009).

Chacun exige un motif de la liste du pays (CA1, RG-031). Une visite s'annule le jour prévu
ou à l'avance ; restée prévue après la fin de sa journée, elle apparaît « à justifier » au
délégué (VIS-009 CA1) et se justifie « non réalisée »."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


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


def envoyer(monde, visite, action, **corps):
    return client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/{action}/", corps,
                                             format="json")  # fmt: skip


@freeze_time("2026-10-12 17:00")
def test_vis006_une_visite_s_annule_a_l_avance_avec_son_motif(monde, approuvee):
    r = envoyer(monde, approuvee, "annuler", le="2026-10-12T16:58:00Z",
                motif=str(motif(monde).pk), commentaire="Reçoit vendredi")  # fmt: skip
    assert r.status_code == 200, r.json()
    v = r.json()
    assert (v["statut"], v["motif_ecart"]["libelle"], v["commentaire_ecart"]) == (
        "annulee", "Rendez-vous reporté", "Reçoit vendredi")  # fmt: skip
    assert EvenementAudit.objects.get(action="visite.annulee").details["motif"] == (
        "rendez_vous_reporte")  # fmt: skip


@freeze_time("2026-10-13 09:10")
def test_vis006_ca1_impossible_sans_motif(monde, approuvee):
    for corps in ({}, {"motif": None}, {"motif": str(motif(monde, pays="tg").pk)}):
        r = envoyer(monde, approuvee, "annuler", le="2026-10-13T09:08:00Z", **corps)
        assert (r.status_code, r.json()["code"]) == (400, "motif_requis")
    approuvee.refresh_from_db()
    assert approuvee.statut == "prevue"


@freeze_time("2026-10-13 09:30")
def test_vis006_une_visite_en_cours_s_annule(monde, approuvee):
    from django.utils import timezone

    with freeze_time("2026-10-13 09:05"):
        execution.demarrer(approuvee, timezone.now())
    r = envoyer(monde, approuvee, "annuler", le="2026-10-13T09:25:00Z",
                motif=str(motif(monde, "urgence").pk))  # fmt: skip
    assert r.json()["statut"] == "annulee"


@freeze_time("2026-10-14 08:00")
def test_vis006_une_journee_passee_ne_s_annule_plus(monde, approuvee):
    r = envoyer(monde, approuvee, "annuler", le="2026-10-14T07:58:00Z",
                motif=str(motif(monde).pk))  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "journee_passee")


@freeze_time("2026-10-14 08:00")
def test_vis009_ca1_la_visite_restee_prevue_est_a_justifier(monde, approuvee):
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert [v["id"] for v in p["a_justifier"]] == [str(approuvee.pk)]
    assert p["a_justifier"][0]["date"] == "2026-10-13"


@freeze_time("2026-10-14 08:00")
def test_vis009_justifiee_non_realisee_elle_quitte_la_liste(monde, approuvee):
    corps = dict(le="2026-10-14T07:58:00Z", motif=str(motif(monde, "transport").pk))
    r = envoyer(monde, approuvee, "non-realisee", **corps)
    assert r.json()["statut"] == "non_realisee", r.json()
    # Rejouée depuis la file du téléphone : sans effet.
    assert envoyer(monde, approuvee, "non-realisee", **corps).status_code == 200
    assert EvenementAudit.objects.filter(action="visite.non_realisee").count() == 1
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert p["a_justifier"] == []


@freeze_time("2026-10-14 08:00")
def test_vis009_ca1_sans_motif_impossible(monde, approuvee):
    r = envoyer(monde, approuvee, "non-realisee", le="2026-10-14T07:58:00Z")
    assert (r.status_code, r.json()["code"]) == (400, "motif_requis")


@freeze_time("2026-10-13 09:10")
def test_vis009_une_journee_pas_finie_ne_se_dit_pas_non_realisee(monde, approuvee):
    r = envoyer(monde, approuvee, "non-realisee", le="2026-10-13T09:08:00Z",
                motif=str(motif(monde).pk))  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "journee_pas_finie")
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert p["a_justifier"] == []


@freeze_time("2026-10-13 09:30")
def test_vis009_une_visite_en_cours_ne_se_dit_pas_non_realisee(monde, approuvee):
    from django.utils import timezone

    with freeze_time("2026-10-13 09:05"):
        execution.demarrer(approuvee, timezone.now())
    r = envoyer(monde, approuvee, "non-realisee", le="2026-10-13T09:25:00Z",
                motif=str(motif(monde).pk))  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "transition_interdite")

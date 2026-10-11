"""0.4.8 : visite imprévue (VIS-008, RG-027).

Rencontrée hors du planning, elle se déclare justifiée (CA1), rattachée au jour réel, et
démarre aussitôt ; elle ne passe pas par le superviseur et reste marquée « imprévue » (CA2)."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services
from apps.planning.models import Planning, Visite

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
IMPREVUE = "7a0e5c55-0000-4000-8000-000000000048"


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


def declarer(monde, **corps):
    return client_de(monde["deleg.sn"]).post("/api/v1/visites/imprevue/", corps, format="json")


def corps(terrain, **autres):
    return {"id": IMPREVUE, "le": "2026-10-13T11:40:00Z", "prospect": str(terrain["medecin"].pk),
            "etablissement": str(terrain["clinique"].pk),
            "justification": "Croisé à la pharmacie, il m'a reçu", **autres}  # fmt: skip


@freeze_time("2026-10-13 11:45")
def test_vis008_la_visite_imprevue_demarre_au_jour_reel_sans_approbation(monde, terrain,
                                                                         approuvee):  # fmt: skip
    r = declarer(monde, **corps(terrain, latitude=14.7, longitude=-17.4, precision_m=8))
    assert r.status_code == 201, r.json()
    v = r.json()
    assert (v["est_imprevue"], v["statut"], v["date"], v["heure"]) == (
        True, "en_cours", "2026-10-13", "11:40")  # fmt: skip
    assert v["justification"] == "Croisé à la pharmacie, il m'a reçu"
    # Pas de modification soumise : le planning reste approuvé, rien à décider.
    assert Planning.objects.get(pk=approuvee.planning_id).statut == "approuve"
    assert EvenementAudit.objects.filter(action="visite.imprevue").count() == 1
    # Elle se termine comme les autres.
    from django.utils import timezone

    fin = execution.terminer(Visite.objects.get(pk=IMPREVUE), timezone.now())
    assert fin.statut == "effectuee"


@freeze_time("2026-10-13 11:45")
def test_vis008_ca1_impossible_sans_justification(monde, terrain, approuvee):
    for justification in ("", "   "):
        r = declarer(monde, **corps(terrain, justification=justification))
        assert (r.status_code, r.json()["code"]) == (400, "justification_requise")
    assert not Visite.objects.filter(est_imprevue=True).exists()


@freeze_time("2026-10-13 11:45")
def test_vis008_ca2_imprevue_dans_le_programme_et_la_semaine(monde, terrain, approuvee):
    declarer(monde, **corps(terrain))
    c = client_de(monde["deleg.sn"])
    p = c.get("/api/v1/programme/").json()
    mardi = next(j for j in p["jours"] if j["date"] == "2026-10-13")
    imprevue = next(v for v in mardi["visites"] if v["id"] == IMPREVUE)
    assert imprevue["est_imprevue"] is True
    # En cours, elle passe devant la visite prévue qui attend.
    assert p["prochaine"] == IMPREVUE


@freeze_time("2026-10-13 11:45")
def test_l_imprevue_n_entre_dans_aucune_version_ni_controle(monde, terrain, approuvee):
    declarer(monde, **corps(terrain))
    planning = Planning.objects.get(pk=approuvee.planning_id)
    ids = [v["id"] for v in services._contenu(planning)["visites"]]
    assert IMPREVUE not in ids
    from apps.planning import controles

    assert IMPREVUE not in [str(v.pk) for v in controles._visites(planning)]


def test_vis008_rejoue_sans_doublon(monde, terrain, approuvee):
    with freeze_time("2026-10-13 15:00"):
        assert declarer(monde, **corps(terrain)).status_code == 201
        assert declarer(monde, **corps(terrain)).status_code == 201
    assert Visite.objects.filter(est_imprevue=True).count() == 1


@freeze_time("2026-10-13 11:45")
def test_sans_planning_approuve_pas_de_visite_imprevue(monde, terrain):
    r = declarer(monde, **corps(terrain))
    assert (r.status_code, r.json()["code"]) == (409, "semaine_non_approuvee")

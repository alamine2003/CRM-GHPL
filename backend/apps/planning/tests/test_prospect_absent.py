"""0.4.5 : prospect absent (VIS-005). CA1 : impossible sans motif.

Le motif se choisit dans la liste « Motifs d'écart » du pays, avec un commentaire facultatif
(prd.md §12). Comme le démarrage, la déclaration peut partir plus tard depuis la file du
téléphone, sans effet si elle est rejouée."""

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


def motif(monde, code="prospect_absent", pays="sn"):
    return Valeur.objects.get(pays=monde[pays], liste="motif_ecart", code=code)


def absent(monde, visite, **corps):
    return client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/absent/", corps,
                                             format="json")  # fmt: skip


@freeze_time("2026-10-13 09:10")
def test_vis005_le_prospect_absent_se_declare_avec_son_motif(monde, approuvee):
    r = absent(monde, approuvee, le="2026-10-13T09:08:00Z", motif=str(motif(monde).pk),
               commentaire="  Parti en congé sans prévenir  ")  # fmt: skip
    assert r.status_code == 200, r.json()
    v = r.json()
    assert (v["statut"], v["motif_ecart"]["libelle"], v["commentaire_ecart"]) == (
        "prospect_absent", "Prospect absent", "Parti en congé sans prévenir")  # fmt: skip
    assert EvenementAudit.objects.get(action="visite.prospect_absent").details["motif"] == (
        "prospect_absent")  # fmt: skip


@freeze_time("2026-10-13 09:10")
def test_vis005_ca1_impossible_sans_motif(monde, approuvee):
    for corps in ({}, {"motif": None}, {"motif": str(motif(monde, pays="tg").pk)}):
        r = absent(monde, approuvee, le="2026-10-13T09:08:00Z", **corps)
        assert (r.status_code, r.json()["code"]) == (400, "motif_requis")
    # Un motif retiré de la liste ne sert plus.
    retire = motif(monde, "greve")
    retire.archiver()
    r = absent(monde, approuvee, le="2026-10-13T09:08:00Z", motif=str(retire.pk))
    assert r.json()["code"] == "motif_requis"
    approuvee.refresh_from_db()
    assert approuvee.statut == "prevue"


@freeze_time("2026-10-13 09:30")
def test_vis005_une_visite_en_cours_peut_finir_prospect_absent(monde, approuvee):
    """Démarrée, le délégué attend : le prospect ne viendra pas."""
    from django.utils import timezone

    with freeze_time("2026-10-13 09:05"):
        execution.demarrer(approuvee, timezone.now())
    r = absent(monde, approuvee, le="2026-10-13T09:25:00Z", motif=str(motif(monde).pk))
    assert r.json()["statut"] == "prospect_absent"


def test_vis005_declare_sans_reseau_rejoue_sans_effet(monde, approuvee):
    corps = dict(le="2026-10-13T09:08:00Z", motif=str(motif(monde, "cabinet_ferme").pk))
    with freeze_time("2026-10-13 15:00"):
        assert absent(monde, approuvee, **corps).status_code == 200
        assert absent(monde, approuvee, **corps).status_code == 200
    assert EvenementAudit.objects.filter(action="visite.prospect_absent").count() == 1


@freeze_time("2026-10-13 09:10")
def test_le_programme_donne_les_motifs_et_passe_a_la_suivante(monde, approuvee):
    absent(monde, approuvee, le="2026-10-13T09:08:00Z", motif=str(motif(monde).pk))
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert "Prospect absent" in [m["libelle"] for m in p["motifs_ecart"]]
    (v,) = p["jours"][1]["visites"]
    assert (v["statut"], p["prochaine"]) == ("prospect_absent", None)


@freeze_time("2026-10-12 09:10")
def test_une_visite_prevue_ne_se_declare_que_le_jour_prevu(monde, approuvee):
    r = absent(monde, approuvee, le="2026-10-12T09:08:00Z", motif=str(motif(monde).pk))
    assert (r.status_code, r.json()["code"]) == (409, "autre_jour")

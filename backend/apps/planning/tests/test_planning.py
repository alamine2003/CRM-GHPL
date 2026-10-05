"""PLN-001 : le délégué crée son planning hebdomadaire (jours ouvrés du pays)."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning.models import Planning
from apps.planning.services import creer_jour_ferie
from apps.socle.services import definir_parametre

pytestmark = pytest.mark.django_db

SEMAINE = "/api/v1/plannings/semaine/"
URL = "/api/v1/plannings/"


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    """Le monde aussi est créé à cette heure : ses droits ne commencent pas après elle."""
    with freeze_time("2026-10-07 09:00"):
        yield


def occuper(monde, alias="deleg.sn"):
    sn = monde["sn"]
    secteur = org.creer_secteur(sn, org.creer_zone(sn, f"Zone {alias}"), f"Secteur {alias}")
    poste = org.creer_poste(sn, "vm", f"VM {alias}", [], [secteur])
    org.occuper(poste, monde[alias], date(2026, 1, 1))
    return poste


def test_la_semaine_montre_les_jours_ouvres_et_les_jours_feries(monde):
    """CA2 : un jour férié est affiché et non planifiable."""
    occuper(monde)
    creer_jour_ferie(monde["sn"], date=date(2026, 10, 9), libelle="Fête de la semaine")
    r = client_de(monde["deleg.sn"]).get(SEMAINE).json()
    assert r["semaine"] == "2026-10-05" and r["courante"] is True
    assert (r["precedente"], r["suivante"]) == ("2026-09-28", "2026-10-12")
    assert [j["date"] for j in r["jours"]] == [
        "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
    ]  # fmt: skip
    assert r["jours"][4] == {"date": "2026-10-09", "ferie": "Fête de la semaine",
                             "planifiable": False}  # fmt: skip
    assert r["planning"] is None and r["peut_creer"] is True


def test_les_jours_ouvres_suivent_le_pays(monde):
    """RG-014 : un pays qui travaille du lundi au samedi a six jours dans sa semaine."""
    definir_parametre(monde["sn"], "jours_ouvres", [1, 2, 3, 4, 5, 6])
    r = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-21"}).json()
    assert r["semaine"] == "2026-10-19"
    assert r["jours"][-1]["date"] == "2026-10-24"


def test_un_seul_planning_par_delegue_et_par_semaine(monde):
    """CA1 (RG-012)."""
    occuper(monde)
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(URL, {"semaine": "2026-10-12"}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["statut"] == "brouillon"
    double = deleg.post(URL, {"semaine": "2026-10-12"}, format="json")
    assert double.status_code == 409 and double.json()["code"] == "planning_existant"
    assert Planning.objects.count() == 1
    vue = deleg.get(SEMAINE, {"semaine": "2026-10-14"}).json()
    assert vue["planning"]["id"] == r.json()["id"] and vue["peut_creer"] is False
    assert EvenementAudit.objects.filter(action="planning.creation").count() == 1


def test_une_semaine_se_designe_par_son_lundi_et_ne_se_planifie_pas_dans_le_passe(monde):
    occuper(monde)
    deleg = client_de(monde["deleg.sn"])
    assert deleg.post(URL, {"semaine": "2026-10-13"}, format="json").json()["code"] == (
        "semaine_invalide"
    )
    assert deleg.post(URL, {"semaine": "2026-09-28"}, format="json").json()["code"] == (
        "semaine_passee"
    )
    # La semaine en cours se planifie encore.
    assert deleg.post(URL, {"semaine": "2026-10-05"}, format="json").status_code == 201
    assert deleg.get(SEMAINE, {"semaine": "2026-09-30"}).json()["peut_creer"] is False


def test_sans_poste_occupe_pas_de_planning(monde):
    """prd.md §6.3 : le superviseur ne planifie que s'il occupe un poste."""
    sup = client_de(monde["sup.sn"])
    assert sup.get(SEMAINE).json()["peut_creer"] is False
    r = sup.post(URL, {"semaine": "2026-10-12"}, format="json")
    assert r.status_code == 403 and r.json()["code"] == "sans_poste"
    occuper(monde, "sup.sn")
    assert sup.post(URL, {"semaine": "2026-10-12"}, format="json").status_code == 201


def test_chacun_ne_voit_que_son_planning(monde):
    occuper(monde)
    client_de(monde["deleg.sn"]).post(URL, {"semaine": "2026-10-12"}, format="json")
    occuper(monde, "sup.sn")
    autre = client_de(monde["sup.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert autre["planning"] is None
    # Le Togo ne voit rien du Sénégal (ORG-009, RLS).
    assert (
        client_de(monde["deleg.tg"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()["planning"]
        is None
    )

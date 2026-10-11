"""PLN-014 : nouvelle version après révision ; historique et comparaison des versions.
CA1 : la comparaison montre les visites ajoutées, retirées, déplacées.
CA2 : toutes les versions restent consultables (RG-037).
AUD-003 CA1 : chaque version se lit dans son état exact au moment de sa soumission."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
MERCREDI = date(2026, 10, 14)
JEUDI = date(2026, 10, 15)
VENDREDI = date(2026, 10, 16)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


@pytest.fixture
def deux_versions(monde, terrain):
    """Version 1 : deux visites ; révision ; version 2 : l'une déplacée et modifiée, l'autre
    retirée, une troisième ajoutée."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    visite = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
    gardee = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                     **visite)  # fmt: skip
    retiree = services.ajouter_visite(planning, date=MERCREDI, heure=time(11, 0), objectif="B",
                                      **visite)  # fmt: skip
    services.soumettre(planning)
    services.demander_revision(planning, monde["sup.sn"], "Revoyez mardi.")
    services.modifier_visite(gardee, date=JEUDI, heure=time(10, 0), objectif="A bis")
    services.retirer_visite(retiree)
    ajoutee = services.ajouter_visite(planning, date=VENDREDI, heure=time(15, 0), objectif="C",
                                      **visite)  # fmt: skip
    services.soumettre(planning)
    return planning, gardee, retiree, ajoutee


def adresse(planning, numero=None):
    base = f"/api/v1/plannings/{planning.pk}/versions/"
    return f"{base}{numero}/" if numero else base


def test_ca2_toutes_les_versions_restent_consultables(monde, deux_versions):
    planning, *_ = deux_versions
    versions = client_de(monde["sup.sn"]).get(adresse(planning)).json()
    assert [(v["numero"], v["decision"], v["visites"]) for v in versions] == [
        (2, None, 2), (1, "a_reviser", 2)]  # fmt: skip
    assert versions[1]["commentaire"] == "Revoyez mardi." and versions[1]["changements"] is None
    assert versions[0]["changements"] == {"ajoutees": 1, "retirees": 1, "deplacees": 1,
                                          "modifiees": 1}  # fmt: skip
    # AUD-003 CA1 : la version 1 se lit telle que soumise, même après les corrections.
    v1 = client_de(monde["sup.sn"]).get(adresse(planning, 1)).json()
    assert sorted(v["heure"] for v in v1["contenu_visites"]) == ["09:00", "11:00"]
    assert v1["comparaison"] is None


def test_ca1_la_comparaison_montre_ajoutees_retirees_deplacees(monde, deux_versions):
    planning, gardee, retiree, ajoutee = deux_versions
    v2 = client_de(monde["deleg.sn"]).get(adresse(planning, 2)).json()
    comparaison = v2["comparaison"]
    assert [v["id"] for v in comparaison["ajoutees"]] == [str(ajoutee.pk)]
    assert [v["id"] for v in comparaison["retirees"]] == [str(retiree.pk)]
    (deplacee,) = comparaison["deplacees"]
    assert deplacee["visite"]["id"] == str(gardee.pk)
    assert deplacee["avant"] == {"date": "2026-10-13", "heure": "09:00"}
    assert (deplacee["visite"]["date"], deplacee["visite"]["heure"]) == ("2026-10-15", "10:00")
    (modifiee,) = comparaison["modifiees"]
    assert modifiee["champs"] == ["objectif"]


def test_seuls_le_delegue_et_ceux_qui_decident_consultent(monde, deux_versions):
    planning, *_ = deux_versions
    voisin = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF", pays=monde["sn"])
    attribuer_role(voisin, Role.SUPERVISEUR, monde["sn"], par=None)
    assert client_de(voisin).get(adresse(planning)).status_code == 404
    assert client_de(monde["sup.tg"]).get(adresse(planning)).status_code == 404
    assert client_de(monde["deleg.sn"]).get(adresse(planning)).status_code == 200
    assert client_de(monde["sup.sn"]).get(adresse(planning, 3)).status_code == 404

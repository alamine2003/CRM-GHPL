"""0.3.2 : le superviseur consulte un planning soumis, semaine et détail, avec ses alertes.

PLN-011 CA1 (la file affiche les alertes) se prolonge dans la consultation : chaque alerte y
nomme ses visites. PLN-004 CA2 : un seuil dépassé n'empêche pas la soumission mais apparaît au
superviseur. Il consulte sans rien modifier."""

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


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def adresse(planning):
    return f"/api/v1/plannings/{planning.pk}/consultation/"


@pytest.fixture
def soumis(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), prospect=terrain["medecin"],
                            etablissement=terrain["clinique"], objectif="Vasculor")  # fmt: skip
    services.declarer_activite(planning, date=date(2026, 10, 16), type="formation",
                               periode="apres_midi")  # fmt: skip
    return services.soumettre(planning)


def test_le_superviseur_lit_la_semaine_soumise_avec_ses_alertes(monde, terrain, soumis):
    r = client_de(monde["sup.sn"]).get(adresse(soumis))
    assert r.status_code == 200, r.content
    corps = r.json()
    assert corps["planning"]["statut"] == "soumis" and corps["modifiable"] is False
    assert corps["delegue"]["id"] == str(monde["deleg.sn"].pk)
    assert corps["postes"] == [terrain["poste"].libelle]
    assert [j["date"] for j in corps["jours"]][0] == "2026-10-12"
    (visite,) = corps["visites"]
    assert (visite["date"], visite["heure"], visite["objectif"]) == ("2026-10-13", "09:00",
                                                                     "Vasculor")  # fmt: skip
    (activite,) = corps["activites"]
    assert (activite["type"], activite["periode"]) == ("formation", "apres_midi")
    # PLN-004 CA2 : les seuils du jour, non bloquants, sont là pour lui.
    codes = {c["code"] for c in corps["controles"]["signalements"]}
    assert "seuil_bas" in codes
    assert corps["kilometrage"] is not None


def test_une_alerte_nomme_ses_visites(monde, terrain, soumis):
    """Le détail d'une visite porte ses alertes : chaque signalement liste ses visites."""
    corps = client_de(monde["sup.sn"]).get(adresse(soumis)).json()
    (visite,) = corps["visites"]
    lies = [c for c in corps["controles"]["signalements"] if visite["id"] in c["visites"]]
    sans = [c for c in corps["controles"]["signalements"] if not c["visites"]]
    assert all(c["code"] != "seuil_bas" for c in lies)
    assert any(c["code"] == "seuil_bas" for c in sans)


def test_un_planning_en_preparation_n_existe_pas_pour_lui(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    assert client_de(monde["sup.sn"]).get(adresse(terrain["planning"])).status_code == 404


def test_seul_son_superviseur_le_consulte(monde, terrain, soumis):
    """Un autre superviseur du pays, d'un autre pays, ou le délégué : non."""
    voisin = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF", pays=monde["sn"])
    attribuer_role(voisin, Role.SUPERVISEUR, monde["sn"], par=None)
    assert client_de(voisin).get(adresse(soumis)).status_code == 404
    assert client_de(monde["sup.tg"]).get(adresse(soumis)).status_code == 404
    assert client_de(monde["deleg.sn"]).get(adresse(soumis)).status_code == 403


def test_il_consulte_sans_rien_modifier(monde, terrain, soumis):
    sup = client_de(monde["sup.sn"])
    visite = soumis.visites.get()
    r = sup.patch(f"/api/v1/visites/{visite.pk}/", {"heure": "10:00"}, format="json")
    assert r.status_code in (403, 404)
    visite.refresh_from_db()
    assert visite.heure == time(9, 0)

"""PLN-012 : le superviseur approuve un planning complet.
CA1 : l'approbation fige la version. CA2 : le délégué reçoit une notification.

PLN-017 : le planning d'un superviseur qui occupe un poste de délégué est approuvé par
l'administrateur pays (1.3.0 [D], à la place de son DM).
CA1 : il n'apparaît pas dans sa propre file.

RG-037 : chaque soumission crée une version figée et consultable."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.etats import StatutPlanning
from apps.planning.models import Planning

pytestmark = pytest.mark.django_db

LUNDI = date(2026, 10, 12)
MARDI = date(2026, 10, 13)
FILE = "/api/v1/plannings/a-valider/"


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def approuver(client, planning):
    return client.post(f"/api/v1/plannings/{planning.pk}/approuver/")


def soumettre(planning, terrain):
    services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), prospect=terrain["medecin"],
                            etablissement=terrain["clinique"], objectif="Vasculor")  # fmt: skip
    return services.soumettre(planning)


@pytest.fixture
def soumis(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    return soumettre(terrain["planning"], terrain)


def test_rg037_la_soumission_fige_une_version(soumis):
    (version,) = soumis.versions.all()
    assert (version.numero, version.decision, version.soumis_le) == (1, "", soumis.soumis_le)
    (visite,) = version.contenu["visites"]
    assert (visite["date"], visite["heure"], visite["objectif"]) == ("2026-10-13", "09:00",
                                                                     "Vasculor")  # fmt: skip


def test_pln012_ca1_l_approbation_fige_la_version(monde, terrain, soumis):
    r = approuver(client_de(monde["sup.sn"]), soumis)
    assert r.status_code == 200, r.content
    decision = r.json()["decision"]
    assert r.json()["statut"] == "approuve"
    assert (decision["numero"], decision["decision"], decision["mode"]) == (1, "approuve", "direct")
    assert decision["par"] == f"{monde['sup.sn'].first_name} {monde['sup.sn'].last_name}"
    version = soumis.versions.get()
    assert (version.decide_par, version.decision) == (monde["sup.sn"], "approuve")
    # Ni une seconde décision, ni un ajout incomplet : après approbation, un ajout est soumis
    # aussitôt et passe le contrôle final (PLN-015).
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{soumis.pk}/visites/",
        {"date": "2026-10-14", "heure": "10:00"}, format="json",
    )  # fmt: skip
    assert r.status_code == 400 and r.json()["code"] == "planning_bloque"
    r = approuver(client_de(monde["sup.sn"]), soumis)
    assert r.status_code == 409 and r.json()["code"] == "transition_interdite"
    # Il quitte la file ; la consultation reste ouverte, avec la décision.
    assert client_de(monde["sup.sn"]).get(FILE).json() == []
    consultation = client_de(monde["sup.sn"]).get(f"/api/v1/plannings/{soumis.pk}/consultation/")
    assert consultation.json()["planning"]["decision"]["decision"] == "approuve"
    assert EvenementAudit.objects.filter(action="planning.approbation").count() == 1


def test_pln012_ca2_le_delegue_est_notifie(monde, terrain, soumis):
    approuver(client_de(monde["sup.sn"]), soumis)
    deleg = client_de(monde["deleg.sn"])
    centre = deleg.get("/api/v1/notifications/").json()
    assert centre["non_lues"] == 1
    (notification,) = centre["notifications"]
    assert notification["type"] == "planning_approuve"
    assert notification["donnees"] == {"planning": str(soumis.pk), "semaine": "2026-10-12",
                                       "numero_semaine": 42}  # fmt: skip
    # Personne d'autre ne la voit ; « lue » la retire du compte.
    # Le superviseur, lui, n'a reçu que la soumission.
    centre_sup = client_de(monde["sup.sn"]).get("/api/v1/notifications/").json()
    assert [n["type"] for n in centre_sup["notifications"]] == ["planning_soumis"]
    r = deleg.post(f"/api/v1/notifications/{notification['id']}/lue/")
    assert r.status_code == 200 and r.json()["lue_le"] is not None
    assert deleg.get("/api/v1/notifications/").json()["non_lues"] == 0
    autre = client_de(monde["sup.sn"]).post(f"/api/v1/notifications/{notification['id']}/lue/")
    assert autre.status_code == 404


def test_seul_le_responsable_du_poste_decide(monde, terrain, soumis):
    voisin = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF", pays=monde["sn"])
    attribuer_role(voisin, Role.SUPERVISEUR, monde["sn"], par=None)
    assert approuver(client_de(voisin), soumis).status_code == 404
    assert approuver(client_de(monde["admin.sn"]), soumis).status_code == 404
    # 1.3.0 [D] : le DM ne décide plus, il lit.
    assert approuver(client_de(monde["dm.sn"]), soumis).status_code == 403
    assert approuver(client_de(monde["deleg.sn"]), soumis).status_code == 403
    soumis.refresh_from_db()
    assert soumis.statut == StatutPlanning.SOUMIS


def test_un_planning_en_preparation_ne_s_approuve_pas(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    assert approuver(client_de(monde["sup.sn"]), terrain["planning"]).status_code == 404


def test_un_point_bloquant_apparu_depuis_la_soumission_empeche_l_approbation(monde, soumis):
    """Le mardi devenu férié après la soumission : la visite est à déplacer."""
    services.creer_jour_ferie(monde["sn"], date=MARDI, libelle="Fête fictive")
    r = approuver(client_de(monde["sup.sn"]), soumis)
    assert r.status_code == 409 and r.json()["code"] == "planning_bloque"
    assert r.json()["details"]["anomalies"][0]["code"] == "jour_non_planifiable"


def test_un_planning_soumis_avant_les_versions_est_fige_a_la_decision(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), prospect=terrain["medecin"],
                            etablissement=terrain["clinique"], objectif="Vasculor")  # fmt: skip
    Planning.objects.filter(pk=planning.pk).update(statut="soumis", soumis_le="2026-10-06T16:00Z")
    assert approuver(client_de(monde["sup.sn"]), planning).status_code == 200
    (version,) = planning.versions.all()
    assert (version.numero, version.decision, len(version.contenu["visites"])) == (1, "approuve", 1)


def test_pln017_l_administrateur_approuve_le_planning_du_superviseur_visiteur(monde, terrain):
    """1.3.0 [D] : le poste reste rattaché au DM, mais c'est l'administrateur pays qui décide."""
    sup, dm, admin = monde["sup.sn"], monde["dm.sn"], monde["admin.sn"]
    poste = org.creer_poste(monde["sn"], "kam", "KAM Plateau", [terrain["cardio"]],
                            [terrain["secteur"]])  # fmt: skip
    org.occuper(poste, sup, date(2026, 1, 1))
    org.rattacher(poste, dm, date(2026, 1, 1))
    planning = soumettre(services.creer_planning(monde["sn"], sup, LUNDI), terrain)
    # CA1 : pas dans sa propre file ; dans celle de l'administrateur pays.
    assert client_de(sup).get(FILE).json() == []
    assert [x["planning"]["id"] for x in client_de(admin).get(FILE).json()] == [str(planning.pk)]
    assert approuver(client_de(sup), planning).status_code == 404
    assert approuver(client_de(dm), planning).status_code == 403
    r = approuver(client_de(admin), planning)
    assert r.status_code == 200, r.content
    assert r.json()["decision"]["mode"] == "direct"
    assert r.json()["decision"]["par"] == f"{admin.first_name} {admin.last_name}"
    assert client_de(sup).get("/api/v1/notifications/").json()["non_lues"] == 1


def test_rg037_la_version_figee_garde_passages_et_activites(monde, terrain):
    """RG-037 : la version figée garde aussi les passages et les activités connexes."""
    from .test_passages_activites import confrere

    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    visites = [services.ajouter_visite(planning, date=date(2026, 10, 13), heure=time(9, 0),
                                       prospect=p, etablissement=terrain["clinique"],
                                       objectif="Vasculor")
               for p in (terrain["medecin"], confrere(monde, terrain, "Fictif"))]  # fmt: skip
    services.regrouper(planning, visites)
    services.declarer_activite(planning, date=date(2026, 10, 16), type="formation")
    services.soumettre(planning)
    contenu = planning.versions.get().contenu
    assert len(contenu["passages"]) == 1 and len(contenu["activites"]) == 1

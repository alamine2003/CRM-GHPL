"""ORG-013 : le superviseur, le DM ou l'administrateur pays désigne un remplaçant daté pour un
superviseur (RG-020).
CA1 : pendant la période, le remplaçant voit et décide les plannings concernés.
CA2 : toute décision porte le mode `remplacement` et l'identité du remplaçant.
CA3 : à la fin de la période, l'accès cesse."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.notifications.models import Notification
from apps.organisation import services as org
from apps.organisation.models import Remplacement
from apps.perimetre.tests.conftest import client_de
from apps.planning import services as pln

pytestmark = pytest.mark.django_db

LISTE = "/api/v1/remplacements/"
FILE = "/api/v1/plannings/a-valider/"


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


@pytest.fixture
def remplacant(monde):
    personne = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF",
                                 pays=monde["sn"])  # fmt: skip
    attribuer_role(personne, Role.SUPERVISEUR, monde["sn"], par=None)
    return personne


@pytest.fixture
def soumis(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    pln.ajouter_visite(terrain["planning"], date=date(2026, 10, 13), heure=time(9, 0),
                       prospect=terrain["medecin"], etablissement=terrain["clinique"],
                       objectif="Vasculor")  # fmt: skip
    return pln.soumettre(terrain["planning"])


def designer(client, superviseur, remplacant, debut="2026-10-07", fin="2026-10-09"):
    return client.post(LISTE, {"superviseur": str(superviseur.pk), "remplacant": str(remplacant.pk),
                               "debut": debut, "fin": fin}, format="json")  # fmt: skip


def test_le_superviseur_designe_son_remplacant_qui_est_notifie(monde, remplacant):
    r = designer(client_de(monde["sup.sn"]), monde["sup.sn"], remplacant)
    assert r.status_code == 201, r.content
    assert (r.json()["etat"], r.json()["remplacant"]["id"]) == ("en_cours", str(remplacant.pk))
    notification = Notification.objects.get(destinataire=remplacant)
    assert notification.type == "remplacement_attribue"
    assert notification.donnees["debut"] == "2026-10-07"
    # Le remplaçant voit le remplacement, sans pouvoir y mettre fin ; le remplacé, si.
    (vu,) = client_de(remplacant).get(LISTE).json()
    assert vu["terminable"] is False
    assert client_de(monde["sup.sn"]).get(LISTE).json()[0]["terminable"] is True


def test_ca1_ca2_le_remplacant_decide_en_remplacement(monde, remplacant, soumis):
    org.designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 7),
                            date(2026, 10, 9), monde["sup.sn"])  # fmt: skip
    (ligne,) = client_de(remplacant).get(FILE).json()
    assert ligne["remplace"]["id"] == str(monde["sup.sn"].pk)
    consultation = client_de(remplacant).get(f"/api/v1/plannings/{soumis.pk}/consultation/")
    assert consultation.status_code == 200
    r = client_de(remplacant).post(f"/api/v1/plannings/{soumis.pk}/approuver/")
    assert r.status_code == 200, r.content
    decision = r.json()["decision"]
    assert (decision["mode"], decision["par"]) == ("remplacement", "Ousmane FICTIF")


def test_ca3_a_la_fin_de_la_periode_l_acces_cesse(monde, remplacant, soumis):
    org.designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 7),
                            date(2026, 10, 9), monde["sup.sn"])  # fmt: skip
    with freeze_time("2026-10-10 09:00"):
        assert client_de(remplacant).get(FILE).json() == []
        r = client_de(remplacant).post(f"/api/v1/plannings/{soumis.pk}/approuver/")
        assert r.status_code == 404


def test_terminer_avant_la_fin_coupe_l_acces(monde, remplacant, soumis):
    # Commencé la veille : la fin anticipée le termine hier.
    remplacement = Remplacement.objects.create(
        pays=monde["sn"], superviseur=monde["sup.sn"], remplacant=remplacant,
        debut=date(2026, 10, 6), fin=date(2026, 10, 30),
    )  # fmt: skip
    assert len(client_de(remplacant).get(FILE).json()) == 1
    r = client_de(monde["sup.sn"]).post(f"{LISTE}{remplacement.pk}/terminer/")
    assert r.status_code == 200 and r.json()["etat"] == "termine"
    assert r.json()["fin"] == "2026-10-06"
    assert client_de(remplacant).get(FILE).json() == []


def test_perimetre_de_la_designation(monde, terrain, remplacant):
    autre = creer_utilisateur("binta.fictive", prenom="Binta", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(autre, Role.SUPERVISEUR, monde["sn"], par=None)
    # Le superviseur ne désigne que pour lui-même.
    r = designer(client_de(monde["sup.sn"]), autre, remplacant)
    assert r.status_code == 404
    # Le DM pour les superviseurs de ses réseaux ; l'administrateur pays pour tous.
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    assert designer(client_de(monde["dm.sn"]), monde["sup.sn"], remplacant).status_code == 404
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    assert designer(client_de(monde["dm.sn"]), monde["sup.sn"], remplacant).status_code == 201
    assert designer(client_de(monde["admin.sn"]), autre, remplacant).status_code == 201
    assert client_de(monde["deleg.sn"]).get(LISTE).status_code == 403


def test_regles_de_la_periode(monde, remplacant):
    sup = client_de(monde["sup.sn"])
    r = designer(sup, monde["sup.sn"], monde["sup.sn"])
    assert r.status_code == 400 and r.json()["code"] == "remplacant_invalide"
    r = designer(sup, monde["sup.sn"], remplacant, debut="2026-10-06")
    assert r.status_code == 400 and r.json()["code"] == "periode_passee"
    r = designer(sup, monde["sup.sn"], remplacant, debut="2026-10-09", fin="2026-10-08")
    assert r.status_code == 400 and r.json()["code"] == "periode_invalide"
    assert designer(sup, monde["sup.sn"], remplacant).status_code == 201
    r = designer(sup, monde["sup.sn"], remplacant, debut="2026-10-08", fin="2026-10-20")
    assert r.status_code == 409 and r.json()["code"] == "remplacement_chevauchement"
    r = designer(sup, monde["sup.sn"], monde["deleg.sn"], debut="2026-10-12", fin="2026-10-13")
    assert r.status_code == 400 and r.json()["code"] == "superviseur_invalide"


def test_ca2_la_revision_du_remplacant_porte_le_mode_remplacement(monde, remplacant, soumis):
    """RG-020 : une demande de révision faite par le remplaçant porte son mode et son nom."""
    org.designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 7),
                            date(2026, 10, 9), par=monde["sup.sn"])  # fmt: skip
    corps = {"commentaire": "Ajoutez des visites."}
    r = client_de(remplacant).post(f"/api/v1/plannings/{soumis.pk}/reviser/", corps, format="json")
    assert r.status_code == 200, r.content
    decision = r.json()["decision"]
    assert (decision["decision"], decision["mode"]) == ("a_reviser", "remplacement")
    assert decision["par"] == "Ousmane FICTIF"
    assert soumis.versions.get().decide_par == remplacant

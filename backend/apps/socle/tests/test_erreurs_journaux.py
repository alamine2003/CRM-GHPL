"""Gestion des erreurs, journaux techniques et suivi (0.0.7, architecture §16.3 et §19)."""

import json
import logging

import pytest

from apps.socle import journalisation, suivi
from apps.socle.views import InformationsView

pytestmark = pytest.mark.django_db


@pytest.fixture
def lignes_json():
    """Capture les journaux tels qu'ils sortent en production (JSON)."""
    sortie: list[str] = []

    class Collecteur(logging.Handler):
        def emit(self, enregistrement):
            sortie.append(self.format(enregistrement))

    collecteur = Collecteur()
    collecteur.setFormatter(journalisation.FormatJSON())
    racine = logging.getLogger()
    racine.addHandler(collecteur)
    yield sortie
    racine.removeHandler(collecteur)


def test_chaque_reponse_porte_une_reference(api):
    reponse = api.get("/api/v1/informations/")
    assert len(reponse["X-Request-Id"]) == 32
    fournie = "0b7e4c1a-2f6d-4e8b-9a31-5c2d7e8f9a10"
    assert api.get("/api/v1/informations/", HTTP_X_REQUEST_ID=fournie)["X-Request-Id"] == fournie
    # Une valeur fantaisiste n'est pas reprise telle quelle.
    assert (
        api.get("/api/v1/informations/", HTTP_X_REQUEST_ID="<script>")["X-Request-Id"] != "<script>"
    )


def test_une_erreur_rappelle_sa_reference(api):
    reponse = api.get("/api/v1/auth/moi/")
    assert reponse.status_code == 401
    assert reponse.json()["reference"] == reponse["X-Request-Id"]


def test_un_chemin_inconnu_repond_en_json(api):
    reponse = api.get("/api/v1/chemin-qui-n-existe-pas/")
    assert reponse.status_code == 404
    assert reponse.json()["code"] == "introuvable"
    assert reponse.json()["reference"] == reponse["X-Request-Id"]


def test_une_erreur_inattendue_est_journalisee_sans_trace_pour_l_utilisateur(
    api, monkeypatch, lignes_json
):
    def panne(self, request):
        raise RuntimeError("panne simulée")

    monkeypatch.setattr(InformationsView, "get", panne)
    reponse = api.get("/api/v1/informations/", HTTP_ACCEPT_LANGUAGE="fr")
    assert reponse.status_code == 500
    corps = reponse.json()
    assert corps["code"] == "erreur_interne"
    assert corps["reference"] in corps["message"]
    assert "panne simulée" not in reponse.content.decode()
    erreurs = [json.loads(ligne) for ligne in lignes_json if '"erreur_interne"' in ligne]
    assert erreurs and erreurs[0]["reference"] == corps["reference"]
    assert "panne simulée" in erreurs[0]["exception"]


def test_journal_de_requete_structure_et_pseudonymise(monde_minimal, lignes_json):
    client, utilisateur = monde_minimal
    client.get("/api/v1/organisation/zones/")
    requetes = [json.loads(ligne) for ligne in lignes_json if '"requete"' in ligne]
    ligne = requetes[-1]
    assert ligne["chemin"] == "/api/v1/organisation/zones/" and ligne["statut"] == 200
    assert ligne["duree_ms"] >= 0 and ligne["pays"] == "SN"
    assert ligne["utilisateur"] == journalisation.pseudonyme(utilisateur.pk)
    texte = " ".join(lignes_json)
    assert utilisateur.username not in texte and utilisateur.last_name not in texte


@pytest.fixture
def monde_minimal(db):
    from apps.identite.models import Role
    from apps.identite.services import attribuer_role, creer_utilisateur
    from apps.perimetre.tests.conftest import client_de
    from apps.socle.services import creer_pays

    sn = creer_pays("SN")
    compte = creer_utilisateur("ibrahima.ndiaye", prenom="Ibrahima", nom="Ndiaye", pays=sn)
    attribuer_role(compte, Role.ADMIN_PAYS, sn, par=None)
    return client_de(compte), compte


def test_le_portail_signale_une_erreur(api, lignes_json):
    reponse = api.post(
        "/api/v1/erreurs-clients/",
        {"client": "portail", "version": "0.0.7", "message": "TypeError: x is undefined",
         "ecran": "/equipe"},
        format="json",
    )  # fmt: skip
    assert reponse.status_code == 202
    ligne = next(json.loads(lg) for lg in lignes_json if '"erreur_client"' in lg)
    assert ligne["client_client"] == "portail" and ligne["client_ecran"] == "/equipe"
    assert (
        api.post("/api/v1/erreurs-clients/", {"client": "autre"}, format="json").status_code == 400
    )


def test_rien_de_personnel_n_est_envoye_au_suivi():
    evenement = {
        "request": {
            "headers": {"Authorization": "Bearer abc", "Cookie": "x=y", "Accept": "json"},
            "cookies": {"x": "y"},
            "data": {"mot_de_passe": "z"},
        },
        "user": {"email": "awa@exemple.org", "username": "awa.diallo"},
    }
    nettoye = suivi.avant_envoi(evenement, None)
    assert nettoye["request"]["headers"]["Authorization"] == "[retiré]"
    assert "cookies" not in nettoye["request"] and "data" not in nettoye["request"]
    assert "user" not in nettoye or "email" not in nettoye["user"]


def test_etat_d_exploitation(monde):
    from apps.perimetre.tests.conftest import client_de

    etat = client_de(monde["theo.technique"]).get("/api/v1/exploitation/").json()
    assert etat["base"]["disponible"] and etat["base"]["migrations_en_attente"] == 0
    assert etat["isolation"]["tables_protegees"] == etat["isolation"]["tables_attendues"] > 5
    assert etat["format_journaux"] in {"json", "texte"}
    assert client_de(monde["admin.sn"]).get("/api/v1/exploitation/").status_code == 403

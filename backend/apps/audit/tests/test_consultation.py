"""0.9.2 : AUD-002, consultation et filtrage du journal d'audit.

Le siège lit tout le journal ; le responsable et l'administrateur pays, leur pays seulement
(CA1) ; les autres rôles, rien (prd.md §6.3)."""

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.audit.services import enregistrer
from apps.perimetre.tests.conftest import client_de

pytestmark = pytest.mark.django_db

URL = "/api/v1/audit/"


@pytest.fixture
def journal(monde):
    with freeze_time("2026-10-05 10:00"):
        enregistrer("rapport.validation", pays=monde["sn"], acteur=monde["sup.sn"],
                    details={"mode": "lot"})  # fmt: skip
    with freeze_time("2026-10-07 22:30"):  # 22 h 30 à Dakar
        enregistrer("connexion.echec", pays=monde["sn"], acteur=monde["deleg.sn"],
                    resultat="echec")  # fmt: skip
    with freeze_time("2026-10-06 09:00"):
        enregistrer("planning.approbation", pays=monde["tg"], acteur=monde["sup.tg"])
        enregistrer("pays.creation", pays=None, acteur=monde["ada.siege"])
    return EvenementAudit.objects.all()


#: Les événements du jeu d'essai ; ceux de la création des comptes (aujourd'hui) en restent hors.
FENETRE = {"du": "2026-10-05", "au": "2026-10-07"}


def lire(client, **filtres):
    return client.get(URL, {**FENETRE, **filtres})


def actions(reponse) -> list[str]:
    assert reponse.status_code == 200, reponse.content
    return [e["action"] for e in reponse.json()["resultats"]]


@pytest.mark.isolation
def test_aud002_ca1_l_administrateur_pays_ne_voit_que_son_pays(monde, journal):
    for alias in ("admin.sn", "resp.sn"):
        r = lire(client_de(monde[alias]))
        vus = actions(r)
        assert set(vus) == {"rapport.validation", "connexion.echec"}, alias
        assert {"connexion", "rapport"} <= set(r.json()["familles"])
    assert actions(lire(client_de(monde["admin.tg"]))) == ["planning.approbation"]
    # Un autre pays demandé par l'en-tête est refusé.
    assert client_de(monde["admin.tg"], pays="SN").get(URL).status_code == 403


def test_aud002_le_siege_voit_tout_ou_le_pays_choisi(monde, journal):
    siege = client_de(monde["ada.siege"])
    assert len(actions(lire(siege))) == 4
    assert set(actions(lire(client_de(monde["dina.direction"], pays="TG")))) == {
        "planning.approbation"
    }


def test_aud002_les_autres_roles_ne_lisent_pas_le_journal(monde, journal):
    for alias in ("df.sn", "dm.sn", "sup.sn", "deleg.sn", "theo.technique"):
        assert client_de(monde[alias]).get(URL).status_code == 403, alias


def test_aud002_filtres(monde, journal):
    admin = client_de(monde["admin.sn"])
    assert actions(lire(admin, famille="rapport")) == ["rapport.validation"]
    assert actions(lire(admin, resultat="echec")) == ["connexion.echec"]
    assert actions(lire(admin, q=monde["sup.sn"].username[:4])) == ["rapport.validation"]
    # Les dates se lisent à l'heure du pays : 22 h 30 à Dakar reste le 7 octobre.
    assert actions(lire(admin, du="2026-10-07", au="2026-10-07")) == ["connexion.echec"]
    assert actions(lire(admin, au="2026-10-06")) == ["rapport.validation"]
    r = lire(admin, du="2026-10-08", au="2026-10-01")
    assert r.json()["code"] == "dates_invalides"
    detail = lire(admin, famille="rapport").json()["resultats"][0]
    assert detail["details"] == {"mode": "lot"} and detail["pays"] == "SN"
    assert detail["acteur"] == monde["sup.sn"].username


def test_aud002_pagination_du_plus_recent_au_plus_ancien(monde, journal):
    r = lire(client_de(monde["ada.siege"]), taille=2, page=2).json()
    assert r["total"] == 4 and len(r["resultats"]) == 2
    assert r["resultats"][-1]["action"] == "rapport.validation"

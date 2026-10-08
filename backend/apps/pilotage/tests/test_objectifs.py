# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.6 : DSH-009, les objectifs par réseau ; DSH-006, réalisation et écarts justifiés.

CA1 : un objectif a une période, un réseau, un indicateur et une cible. CA2 : le tableau de bord
affiche l'avance ou le retard (réalisé contre attendu au prorata du temps écoulé)."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.pilotage import objectifs
from apps.pilotage.models import Objectif
from apps.rapports.tests.test_rapport import portefeuille  # noqa: F401
from apps.rapports.tests.test_validation import soumettre

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/objectifs/"


def appel(monde, qui, methode="get", url=URL, corps=None):
    with freeze_time("2026-10-15 12:00"):
        return getattr(client_de(monde[qui]), methode)(url, corps or {}, format="json")


@pytest.fixture
def dm(monde, terrain):
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    return monde["dm.sn"]


def saisie(terrain, **autres):
    return {"reseau": str(terrain["cardio"].pk), "indicateur": "visites",
            "debut": "2026-10-12", "fin": "2026-10-25", "cible": 10, **autres}  # fmt: skip


def test_dsh009_ca1_ca2_le_dm_fixe_un_objectif_et_suit_son_retard(monde, terrain, semaine, dm):
    r = appel(monde, "dm.sn", "post", corps=saisie(terrain))
    assert r.status_code == 201, r.content
    o = r.json()
    assert (o["indicateur"], o["cible"], o["reseau"]["libelle"]) == ("visites", 10, "Cardio")
    # 4 jours écoulés sur 14 : 3 visites attendues ; 1 faite.
    assert o["suivi"] == {"realise": 1, "attendu": 3, "etat": "en_retard", "taux": 0.1,
                          "delegues": 1}  # fmt: skip
    assert EvenementAudit.objects.filter(action="objectif.creation").count() == 1
    # Le superviseur du réseau le lit, sans pouvoir le gérer.
    lu = appel(monde, "sup.sn").json()
    assert [x["id"] for x in lu["objectifs"]] == [o["id"]]
    assert lu["objectifs"][0]["gerable"] is False and lu["reseaux_geres"] == []
    assert appel(monde, "sup.sn", "post", corps=saisie(terrain)).status_code == 403


def test_dsh009_seuls_le_dm_du_reseau_et_l_administrateur_pays(monde, terrain, semaine):
    r = appel(monde, "dm.sn", "post", corps=saisie(terrain))
    assert (r.status_code, r.json()["code"]) == (403, "objectif_hors_perimetre")
    assert appel(monde, "admin.sn", "post", corps=saisie(terrain)).status_code == 201
    # Le DM sans ce réseau ne le voit pas ; l'administrateur pays le gère.
    assert appel(monde, "dm.sn").json()["objectifs"] == []
    assert appel(monde, "admin.sn").json()["objectifs"][0]["gerable"] is True


def test_dsh009_saisies_refusees(monde, terrain, semaine, dm):
    refus = [
        saisie(terrain, fin="2026-10-01"),
        saisie(terrain, indicateur="couverture_ab", cible=120),
        saisie(terrain, indicateur="presentations"),  # sans produit
    ]
    for corps in refus:
        assert appel(monde, "dm.sn", "post", corps=corps).status_code == 400, corps


def test_dsh009_presentations_d_un_produit(monde, terrain, semaine, dm, portefeuille):
    cardiol = portefeuille[0]
    soumettre(monde, semaine["faite"], [cardiol])
    r = appel(
        monde,
        "dm.sn",
        "post",
        corps=saisie(terrain, indicateur="presentations", produit=str(cardiol.pk), cible=2),
    )
    assert r.status_code == 201, r.content
    assert r.json()["suivi"]["realise"] == 1
    assert r.json()["produit"]["libelle"] == "Cardiol"
    # Un produit hors du portefeuille du réseau est refusé.
    r = appel(
        monde,
        "dm.sn",
        "post",
        corps=saisie(terrain, indicateur="presentations", produit=str(portefeuille[2].pk)),
    )
    assert r.json()["code"] == "produit_hors_portefeuille"
    # Les produits proposés à la saisie sont ceux du portefeuille.
    (p,) = appel(monde, "dm.sn").json()["portefeuilles"]
    assert [x["libelle"] for x in p["produits"]] == ["Cardiol", "Tensio"]


def test_dsh009_etats(monde, terrain, semaine):
    def creer(**champs):
        valeurs = {"debut": date(2026, 10, 12), "fin": date(2026, 10, 25), "cible": 10,
                   "indicateur": "visites", **champs}  # fmt: skip
        return Objectif.objects.create(pays=monde["sn"], reseau=terrain["cardio"],
                                       cree_par=monde["admin.sn"], **valeurs)  # fmt: skip

    with freeze_time("2026-10-15 12:00"):
        assert objectifs.suivi(creer(cible=1))["etat"] == "atteint"
        assert objectifs.suivi(creer(debut=date(2026, 11, 2), fin=date(2026, 11, 8)))[
            "etat"] == "a_venir"  # fmt: skip
        fini = creer(debut=date(2026, 10, 12), fin=date(2026, 10, 14), cible=5)
        assert objectifs.suivi(fini)["etat"] == "non_atteint"
        assert objectifs.suivi(creer(cible=2, debut=date(2026, 10, 13),
                                     fin=date(2026, 10, 30)))["etat"] == "en_avance"  # fmt: skip
        couverture = creer(indicateur="couverture_ab", cible=50)
        assert objectifs.suivi(couverture)["realise"] == 0  # pas de liste cible


def test_dsh009_modifier_et_archiver(monde, terrain, semaine, dm):
    o = appel(monde, "dm.sn", "post", corps=saisie(terrain)).json()
    url = f"{URL}{o['id']}/"
    r = appel(monde, "dm.sn", "patch", url, {"cible": 4})
    assert (r.status_code, r.json()["cible"]) == (200, 4)
    assert appel(monde, "dm.sn", "post", f"{url}archiver/").status_code == 204
    assert appel(monde, "dm.sn").json()["objectifs"] == []
    actions = set(EvenementAudit.objects.filter(action__startswith="objectif.")
                  .values_list("action", flat=True))  # fmt: skip
    assert actions == {"objectif.creation", "objectif.modification", "objectif.archivage"}


def test_dsh006_ca1_la_realisation_suit_la_definition_de_kpi_03(monde, semaine):
    """KPI-03 : visites approuvées effectuées / visites approuvées (échues), et la part des
    écarts justifiés en second chiffre, jamais confondus."""
    with freeze_time("2026-10-15 12:00"):
        d = client_de(monde["resp.sn"]).get("/api/v1/pilotage/equipe/").json()
    t = d["total"]["semaine"]
    v = t["visites"]
    assert t["taux"]["realisation"] == round(v["effectuees_prevues"] / v["echues"], 3)
    assert t["taux"]["ecarts_justifies"] == round(v["ecarts_justifies"] / v["ecarts"], 3)

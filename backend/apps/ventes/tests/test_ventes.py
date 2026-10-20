"""Suivi des ventes (1.6.0, prd.md §14.84) : saisie, synthèse, périmètre, audit."""

from datetime import date

import pytest

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.socle.services import aujourdhui
from apps.ventes.models import Vente

pytestmark = pytest.mark.django_db


def _synthese(utilisateur, pays="SN", **params):
    params = {"annee": 2025, "mois_fin": 12, **params}
    return client_de(utilisateur, pays).get("/api/v1/ventes/synthese/", params)


def test_synthese_cumul_de_l_annee_face_a_l_an_passe(monde, ventes):
    reponse = _synthese(monde["admin.sn"], par="produit")
    assert reponse.status_code == 200
    donnees = reponse.json()
    assert donnees["devise"] == monde["sn"].devise
    assert donnees["ytd"]["montant_ttc"] == "3600.00"
    assert donnees["ytd"]["quantite"] == 360
    assert donnees["ytd"]["precedent_montant_ttc"] == "500.00"
    assert donnees["ytd"]["evolution"] == 620.0
    assert [m["mois"] for m in donnees["mensuel"]][:3] == ["2025-01", "2025-02", "2025-03"]
    assert len(donnees["mensuel"]) == 12
    janvier = donnees["mensuel"][0]
    assert (janvier["montant_ttc"], janvier["precedent_montant_ttc"]) == ("1500.00", "500.00")
    assert [(g["libelle"], g["montant_ttc"]) for g in donnees["ventilation"]] == [
        ("Cardiol 10 mg", "3000.00"),
        ("Gynopril", "600.00"),
    ]
    assert donnees["ventilation"][0]["part"] == 83.3


def test_le_cumul_s_arrete_au_mois_demande(monde, ventes):
    donnees = _synthese(monde["admin.sn"], mois_fin=1).json()
    assert donnees["ytd"]["montant_ttc"] == "1500.00"
    assert donnees["ytd"]["evolution"] == 200.0


@pytest.mark.parametrize(
    ("par", "attendu"),
    [
        ("delegue", {"Gabriel Sn": "3000.00", "Moussa Fall": "600.00"}),
        ("reseau", {"Cardio": "3000.00", "Gynéco": "600.00"}),
        ("zone", {"Dakar": "3000.00", "Thiès": "600.00"}),
        ("client", {"Pharmacie du Plateau": "3000.00", "Grossiste Sahel": "600.00"}),
        ("type_client", {"Pharmacie": "3000.00", "Grossiste": "600.00"}),
        ("classe", {"Sans classe thérapeutique": "3600.00"}),
    ],
)
def test_la_ventilation_eclatee(monde, ventes, par, attendu):
    donnees = _synthese(monde["admin.sn"], par=par).json()
    assert {g["libelle"]: g["montant_ttc"] for g in donnees["ventilation"]} == attendu


def test_les_filtres_se_combinent(monde, ventes):
    v = ventes
    donnees = _synthese(monde["admin.sn"], reseau=v["cardio"].pk, type_client="pharmacie").json()
    assert donnees["ytd"]["montant_ttc"] == "3000.00"
    donnees = _synthese(monde["admin.sn"], delegue=v["moussa"].pk, produit=v["cardiol"].pk).json()
    assert donnees["ytd"]["montant_ttc"] == "0.00"
    assert _synthese(monde["admin.sn"], type_client="inconnu").status_code == 400
    assert _synthese(monde["admin.sn"], par="inconnu").status_code == 400


def test_l_annee_par_defaut_est_celle_du_pays(monde, ventes):
    reponse = client_de(monde["admin.sn"], "SN").get("/api/v1/ventes/synthese/")
    assert reponse.json()["annee"] == aujourdhui(monde["sn"]).year


def test_le_perimetre_limite_ce_que_chacun_voit(monde, ventes):
    def total(compte, pays="SN"):
        return _synthese(compte, pays).json()["ytd"]["montant_ttc"]

    assert total(monde["resp.sn"]) == "3600.00"
    # Le superviseur n'a que le poste 1 ; le DF (rôle du DO), le réseau Cardio : les mêmes lignes.
    assert total(monde["sup.sn"]) == "3000.00"
    assert total(monde["df.sn"]) == "3000.00"
    # Un DM sans réseau ni poste rattaché ne voit rien.
    assert total(monde["dm.sn"]) == "0.00"


def test_le_delegue_n_a_pas_acces_a_la_plateforme(monde, ventes):
    assert _synthese(monde["deleg.sn"]).status_code == 403
    assert client_de(monde["deleg.sn"], "SN").get("/api/v1/ventes/lignes/").status_code == 403


def test_un_autre_pays_ne_voit_rien(monde, ventes):
    assert _synthese(monde["admin.tg"], "TG").json()["ytd"]["montant_ttc"] == "0.00"
    # Il n'a pas accès au Sénégal.
    assert _synthese(monde["admin.tg"], "SN").status_code == 403
    ligne = Vente.objects.first()
    assert (
        client_de(monde["admin.tg"], "TG")
        .patch(f"/api/v1/ventes/lignes/{ligne.pk}/", {"quantite": "1"})
        .status_code
        == 404
    )


def test_le_siege_choisit_un_pays_et_sa_consultation_nominative_est_auditee(monde, ventes):
    siege = client_de(monde["dina.direction"])
    assert siege.get("/api/v1/ventes/synthese/", {"annee": 2025}).status_code == 400
    avant = EvenementAudit.objects.filter(action="ventes.consultation_nominative").count()
    # Par produit : rien de nominatif.
    assert _synthese(monde["dina.direction"], par="produit").status_code == 200
    assert EvenementAudit.objects.filter(action="ventes.consultation_nominative").count() == avant
    assert _synthese(monde["dina.direction"], par="delegue").status_code == 200
    assert (
        EvenementAudit.objects.filter(action="ventes.consultation_nominative").count() == avant + 1
    )


def test_saisie_d_une_ligne(monde, ventes):
    v = ventes
    admin = client_de(monde["admin.sn"], "SN")
    corps = {"mois": "2025-04", "delegue": str(v["gabriel"].pk), "produit": str(v["cardiol"].pk),
             "client": str(v["para"].pk), "quantite": "12", "montant_ttc": "1 250,50"}  # fmt: skip
    reponse = admin.post("/api/v1/ventes/lignes/", corps, format="json")
    assert reponse.status_code == 201, reponse.content
    ligne = Vente.objects.get(pk=reponse.json()["id"])
    assert ligne.mois == date(2025, 4, 1)
    assert str(ligne.montant_ttc) == "1250.50"
    # Le poste et le réseau viennent de l'organisation, pas de la saisie.
    assert ligne.poste == v["poste1"]
    assert ligne.reseau == v["cardio"]
    assert reponse.json()["source"] == "saisie"
    assert EvenementAudit.objects.filter(action="ventes.saisie").exists()
    # La même ligne une seconde fois : on la corrige, on ne la double pas.
    doublon = admin.post("/api/v1/ventes/lignes/", corps, format="json")
    assert doublon.status_code == 400
    assert doublon.json()["code"] == "vente_existante"


def test_saisie_refusee(monde, ventes):
    v = ventes
    admin = client_de(monde["admin.sn"], "SN")
    base = {"mois": "2025-04", "delegue": str(v["gabriel"].pk), "produit": str(v["cardiol"].pk),
            "client": str(v["para"].pk), "quantite": "1", "montant_ttc": "1"}  # fmt: skip
    for corps, code in (
        ({**base, "quantite": "1,5"}, "nombre_invalide"),
        ({**base, "montant_ttc": "beaucoup"}, "nombre_invalide"),
        ({**base, "delegue": str(monde["resp.sn"].pk)}, "delegue_inconnu"),
    ):
        reponse = admin.post("/api/v1/ventes/lignes/", corps, format="json")
        assert reponse.status_code == 400, corps
        assert reponse.json()["code"] == code
    assert (
        client_de(monde["sup.sn"], "SN")
        .post("/api/v1/ventes/lignes/", base, format="json")
        .status_code
        == 403
    )


def test_corriger_puis_archiver_une_ligne(monde, ventes):
    admin = client_de(monde["admin.sn"], "SN")
    ligne = Vente.objects.get(mois=date(2025, 1, 1), produit=ventes["cardiol"])
    reponse = admin.patch(
        f"/api/v1/ventes/lignes/{ligne.pk}/",
        {"quantite": "110", "montant_ttc": "1100"},
        format="json",
    )
    assert reponse.status_code == 200
    assert (reponse.json()["quantite"], reponse.json()["montant_ttc"]) == (110, "1100.00")
    assert EvenementAudit.objects.filter(action="ventes.modification").exists()
    assert admin.post(f"/api/v1/ventes/lignes/{ligne.pk}/archiver/").status_code == 204
    assert _synthese(monde["admin.sn"]).json()["ytd"]["montant_ttc"] == "2600.00"
    assert EvenementAudit.objects.filter(action="ventes.archivage").exists()


def test_les_lignes_se_filtrent_et_se_paginent(monde, ventes):
    admin = client_de(monde["admin.sn"], "SN")
    page = admin.get("/api/v1/ventes/lignes/", {"mois": "2025-01"}).json()
    assert page["total"] == 2
    assert {ligne["delegue"]["nom"] for ligne in page["resultats"]} == {
        "Gabriel Sn", "Moussa Fall"}  # fmt: skip
    petite = admin.get("/api/v1/ventes/lignes/", {"taille": 2}).json()
    assert (petite["total"], len(petite["resultats"])) == (5, 2)
    assert admin.get("/api/v1/ventes/lignes/", {"mois": "n'importe"}).status_code == 400


def test_options_des_filtres(monde, ventes):
    options = client_de(monde["sup.sn"], "SN").get("/api/v1/ventes/options/").json()
    # Le superviseur ne se voit proposer que ce qu'il voit.
    assert [d["nom"] for d in options["delegues"]] == ["Gabriel Sn"]
    assert [p["libelle"] for p in options["produits"]] == ["Cardiol 10 mg"]
    assert [r["libelle"] for r in options["reseaux"]] == ["Cardio"]
    assert {2024, 2025} <= set(options["annees"])
    assert [t["valeur"] for t in options["types_client"]] == [
        "pharmacie", "parapharmacie", "grossiste"]  # fmt: skip


def test_les_clients(monde, ventes):
    admin = client_de(monde["admin.sn"], "SN")
    trouves = admin.get("/api/v1/ventes/clients/", {"q": "sahel"}).json()
    assert [c["nom"] for c in trouves] == ["Grossiste Sahel"]
    cree = admin.post(
        "/api/v1/ventes/clients/",
        {"nom": "Pharmacie Neuve", "type": "pharmacie", "zone": str(ventes["dakar"].pk)},
        format="json",
    )
    assert cree.status_code == 201
    assert cree.json()["zone"]["libelle"] == "Dakar"
    doublon = admin.post(
        "/api/v1/ventes/clients/", {"nom": "pharmacie neuve", "type": "pharmacie"}, format="json"
    )
    assert doublon.json()["code"] == "client_existant"

"""Référentiels d'un pays (PRP-001) et portefeuilles de produits des réseaux (ORG-004)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.referentiel import services
from apps.referentiel.models import Liste, Portefeuille, Valeur

pytestmark = pytest.mark.django_db

VALEURS = "/api/v1/referentiel/valeurs/"
PRODUITS = "/api/v1/referentiel/produits/"


def _valeurs(client, liste, actifs=False):
    url = f"{VALEURS}?liste={liste}" + ("&actifs=1" if actifs else "")
    return {v["libelle"]: v for v in client.get(url).json()}


@pytest.fixture
def reseaux(monde):
    sn = monde["sn"]
    cardio = org.creer_division(sn, "CARDIO", "Cardiologie")
    femme = org.creer_division(sn, "FEMME", "Santé de la femme")
    return {
        "cv": org.creer_reseau(sn, cardio, "CV", "Cardio Vasculaire"),
        "gyn": org.creer_reseau(sn, femme, "GYN", "Gynécologie"),
    }


def test_un_pays_ouvert_recoit_ses_listes_dans_sa_langue(monde):
    """PRP-001 : types de prospect et d'établissement du PRD, spécialités et motifs proposés."""
    sn = monde["sn"]
    codes = set(
        Valeur.objects.filter(pays=sn, liste=Liste.TYPE_PROSPECT).values_list("code", flat=True)
    )
    assert codes == {
        "medecin",
        "pharmacien",
        "sage_femme",
        "infirmier",
        "chirurgien_dentiste",
        "autre",
    }
    cardio = Valeur.objects.get(pays=sn, liste=Liste.SPECIALITE, code="cardiologie")
    assert cardio.parent.code == "medecin"
    assert Valeur.objects.filter(pays=sn, liste=Liste.MOTIF_ECART).count() >= 5
    from apps.socle.services import creer_pays

    gambie = creer_pays("GM")
    assert gambie.langue == "en"
    assert Valeur.objects.get(pays=gambie, liste=Liste.TYPE_PROSPECT, code="medecin").libelle == (
        "Doctor"
    )


@pytest.mark.parametrize("liste", Liste.values)
def test_l_administrateur_pays_modifie_chaque_liste(monde, liste):
    """PRP-001 CA1 : chaque liste est modifiable par l'administrateur pays."""
    admin = client_de(monde["admin.sn"])
    cree = admin.post(VALEURS, {"liste": liste, "libelle": "Valeur d'essai"}, format="json")
    assert cree.status_code == 201, cree.content
    assert cree.json()["code"] == "valeur_d_essai" and cree.json()["pays"] == "SN"
    modifie = admin.patch(
        f"{VALEURS}{cree.json()['id']}/", {"libelle": "Valeur renommée", "ordre": 1}, format="json"
    )
    assert modifie.status_code == 200 and modifie.json()["libelle"] == "Valeur renommée"
    assert modifie.json()["code"] == "valeur_d_essai"  # le code reste stable
    assert "Valeur renommée" in _valeurs(admin, liste)
    evenement = EvenementAudit.objects.filter(action="referentiel.valeur.modification").first()
    assert evenement.details["libelle"] == {
        "ancien": "Valeur d'essai",
        "nouveau": "Valeur renommée",
    }


def test_les_autres_roles_lisent_mais_ne_modifient_pas(monde):
    deleg = client_de(monde["deleg.sn"])
    assert "Médecin" in _valeurs(deleg, "type_prospect")
    refus = deleg.post(VALEURS, {"liste": "specialite", "libelle": "Allergologie"}, format="json")
    assert refus.status_code == 403
    tg = _valeurs(client_de(monde["admin.tg"]), "type_prospect")
    assert all(v["pays"] == "TG" for v in tg.values())


def test_libelle_en_double_refuse_dans_une_meme_liste(monde):
    admin = client_de(monde["admin.sn"])
    doublon = admin.post(VALEURS, {"liste": "specialite", "libelle": "Cardiologie"}, format="json")
    assert doublon.status_code == 400 and doublon.json()["code"] == "libelle_deja_utilise"
    # Le même libellé reste permis dans une autre liste ou un autre pays.
    autre = admin.post(VALEURS, {"liste": "motif_ecart", "libelle": "Cardiologie"}, format="json")
    assert autre.status_code == 201


def test_une_specialite_ne_depend_que_d_un_type_de_prospect(monde):
    admin = client_de(monde["admin.sn"])
    pharmacien = Valeur.objects.get(pays=monde["sn"], liste="type_prospect", code="pharmacien")
    officine = admin.post(
        VALEURS,
        {"liste": "specialite", "libelle": "Officine", "parent": str(pharmacien.pk)},
        format="json",
    )
    assert officine.json()["parent"] == str(pharmacien.pk)
    motif = Valeur.objects.filter(pays=monde["sn"], liste="motif_ecart").first()
    refus = admin.post(
        VALEURS, {"liste": "specialite", "libelle": "X", "parent": str(motif.pk)}, format="json"
    )
    assert refus.json()["code"] == "parent_invalide"


def test_une_valeur_utilisee_s_archive_et_ne_se_supprime_pas(monde, reseaux):
    """PRP-001 CA2."""
    admin = client_de(monde["admin.sn"])
    classe = admin.post(
        VALEURS, {"liste": "classe_therapeutique", "libelle": "Antihypertenseurs"}, format="json"
    ).json()
    produit = admin.post(
        PRODUITS,
        {"libelle": "Tensiovar 5 mg", "classe": classe["id"], "reseaux": [str(reseaux["cv"].pk)]},
        format="json",
    ).json()
    assert _valeurs(admin, "classe_therapeutique")["Antihypertenseurs"]["utilisations"] == 1
    # Aucune suppression : aucune action ne permet DELETE, et le modèle la refuse.
    assert admin.delete(f"{VALEURS}{classe['id']}/").status_code in {403, 405}
    with pytest.raises(TypeError):
        Valeur.objects.get(pk=classe["id"]).delete()
    # On n'archive pas une classe qui porte encore des produits actifs…
    bloque = admin.post(f"{VALEURS}{classe['id']}/archiver/")
    assert bloque.json()["code"] == "elements_actifs"
    # … mais un produit utilisé s'archive : il quitte les portefeuilles aujourd'hui.
    archive = admin.post(f"{PRODUITS}{produit['id']}/archiver/").json()
    assert archive["archive"] is True and archive["reseaux"] == []
    lien = Portefeuille.objects.get(produit_id=produit["id"])
    assert lien.fin is not None  # le passé reste : le lien est terminé, pas effacé
    assert admin.post(f"{VALEURS}{classe['id']}/archiver/").json()["archive"] is True
    actives = _valeurs(admin, "classe_therapeutique", actifs=True)
    assert "Antihypertenseurs" not in actives
    assert _valeurs(admin, "classe_therapeutique")["Antihypertenseurs"]["archive"] is True
    # Une archive par erreur se répare.
    assert admin.post(f"{VALEURS}{classe['id']}/reactiver/").json()["archive"] is False


def test_un_reseau_appartient_a_une_division(monde):
    """ORG-004 CA1."""
    admin = client_de(monde["admin.sn"])
    sans = admin.post("/api/v1/organisation/reseaux/", {"code": "R", "libelle": "R"}, format="json")
    assert sans.status_code == 400
    division = org.creer_division(monde["sn"], "D", "Division")
    avec = admin.post(
        "/api/v1/organisation/reseaux/",
        {"code": "R", "libelle": "R", "division": str(division.pk)},
        format="json",
    )
    assert avec.status_code == 201 and avec.json()["division"] == str(division.pk)


def test_un_produit_appartient_a_plusieurs_reseaux(monde, reseaux):
    """ORG-004 CA2 : portefeuilles gérés par réseau ou par produit, audités."""
    admin = client_de(monde["admin.sn"])
    produit = admin.post(PRODUITS, {"libelle": "Ferrogyn"}, format="json").json()
    assert produit["code"] == "FERROGYN" and produit["reseaux"] == []
    cv, gyn = str(reseaux["cv"].pk), str(reseaux["gyn"].pk)
    admin.put(
        f"/api/v1/referentiel/portefeuilles/{gyn}/", {"produits": [produit["id"]]}, format="json"
    )
    modifie = admin.patch(f"{PRODUITS}{produit['id']}/", {"reseaux": [cv, gyn]}, format="json")
    assert {r["code"] for r in modifie.json()["reseaux"]} == {"CV", "GYN"}
    portefeuilles = {
        p["reseau"]["code"]: p for p in admin.get("/api/v1/referentiel/portefeuilles/").json()
    }
    assert [x["libelle"] for x in portefeuilles["CV"]["produits"]] == ["Ferrogyn"]
    assert portefeuilles["GYN"]["division"] == "Santé de la femme"
    filtre = admin.get(f"{PRODUITS}?reseau={cv}").json()
    assert [p["libelle"] for p in filtre] == ["Ferrogyn"]
    retire = admin.put(f"/api/v1/referentiel/portefeuilles/{cv}/", {"produits": []}, format="json")
    assert retire.json()["produits"] == []
    actions = list(
        EvenementAudit.objects.filter(action__startswith="referentiel.portefeuille").values_list(
            "action", flat=True
        )
    )
    assert actions.count("referentiel.portefeuille.ajout") == 2
    assert actions.count("referentiel.portefeuille.retrait") == 1


def test_le_delegue_ne_voit_que_le_portefeuille_de_son_reseau(monde, reseaux):
    """ORG-004 CA3 (RG-033) : seuls les produits du portefeuille de son réseau lui sont
    proposés. Le rapport de visite (0.5) s'appuiera sur cette même sélection."""
    sn = monde["sn"]
    vasculo = services.creer_produit(sn, "Vasculor")
    gyneco = services.creer_produit(sn, "Gynofem")
    services.definir_portefeuille(reseaux["cv"], [vasculo])
    services.definir_portefeuille(reseaux["gyn"], [gyneco])
    poste = org.creer_poste(sn, "vm", "VM Dakar Cardio", [reseaux["cv"]], [])
    org.occuper(poste, monde["deleg.sn"])
    mien = client_de(monde["deleg.sn"]).get("/api/v1/referentiel/mon-portefeuille/").json()
    assert [p["reseau"]["code"] for p in mien] == ["CV"]
    assert [x["libelle"] for x in mien[0]["produits"]] == ["Vasculor"]
    jour = services.aujourdhui(sn)
    assert list(services.produits_du_portefeuille([reseaux["cv"]], jour)) == [vasculo]
    # Le DM voit les réseaux de son périmètre.
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], reseaux["gyn"])
    dm = client_de(monde["dm.sn"]).get("/api/v1/referentiel/mon-portefeuille/").json()
    assert [p["reseau"]["code"] for p in dm] == ["GYN"]


def test_un_autre_pays_ne_voit_pas_les_produits(monde, reseaux):
    services.creer_produit(monde["sn"], "Vasculor")
    tg = client_de(monde["admin.tg"])
    assert tg.get(PRODUITS).json() == []
    assert tg.get("/api/v1/referentiel/portefeuilles/").json() == []
    siege = client_de(monde["ada.siege"]).get(PRODUITS).json()
    assert [p["libelle"] for p in siege] == ["Vasculor"]

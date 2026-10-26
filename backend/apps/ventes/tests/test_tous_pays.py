"""La vue de tous les pays du siège (1.9.0, prd.md §14.90) : conversion en XOF à taux constant,
pays sans taux, courbe, classement, objectifs, export audité et droits."""

import csv
import io
from datetime import date
from decimal import Decimal

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.referentiel import services as ref
from apps.ventes import services
from apps.ventes.models import ObjectifVente, SourceVente, TauxChange, TypeClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/ventes/tous-pays/"
TAUX = "/api/v1/ventes/taux/"


@pytest.fixture
def deux_pays(monde, ventes):
    """Le Togo de ce monde paie en francs guinéens (fictif : pour éprouver la conversion), avec
    le même produit qu'au Sénégal et une vente en 2025."""
    tg = monde["tg"]
    tg.devise = "GNF"
    tg.save()
    division = org.creer_division(tg, "CAR", "Cardiologie")
    cardio = org.creer_reseau(tg, division, "CAR1", "Cardio")
    lome = org.creer_zone(tg, "Lomé")
    secteur = org.creer_secteur(tg, lome, "Centre")
    poste = org.creer_poste(tg, "vm", "VM Lomé", [cardio], [secteur])
    delegue = monde["deleg.tg"]
    org.occuper(poste, delegue, date(2024, 1, 1))
    cardiol = ref.creer_produit(tg, "Cardiol 10 mg")
    ref.definir_portefeuille(cardio, [cardiol])
    client = services.creer_client(tg, "Pharmacie de Lomé", TypeClient.PHARMACIE, lome)
    for mois, montant in ((date(2025, 2, 1), 100000), (date(2024, 2, 1), 50000)):
        services.enregistrer_ligne(
            tg, monde["admin.tg"], mois=mois, delegue=delegue, produit=cardiol, client=client,
            quantite=10, montant_ttc=montant, source=SourceVente.SAISIE,
        )  # fmt: skip
    return {"cardio_tg": cardio}


def _lire(utilisateur, pays=None, **params):
    return client_de(utilisateur, pays).get(URL, {"annee": 2025, "mois_fin": 3, **params})


def _par_code(donnees):
    return {p["code"]: p for p in donnees["pays"]}


def test_sans_taux_un_pays_reste_dans_sa_monnaie_hors_du_total(monde, deux_pays):
    reponse = _lire(monde["dina.direction"])
    assert reponse.status_code == 200, reponse.json()
    donnees = reponse.json()
    assert donnees["devise"] == "XOF" and donnees["devises_sans_taux"] == ["GNF"]
    sn, tg = _par_code(donnees)["SN"], _par_code(donnees)["TG"]
    # Le Sénégal, déjà en XOF : 1 000 + 2 000 + 500 + 100 de janvier à mars 2025.
    assert sn["taux"] == "1.000000" and sn["montant_converti"] == "3600.00"
    assert sn["precedent_converti"] == "500.00" and sn["part"] == 100.0
    assert tg["montant_ttc"] == "100000.00" and tg["taux"] is None
    assert tg["montant_converti"] is None and tg["part"] is None
    assert donnees["total"]["montant_ttc"] == "3600.00"
    # Le pays sans taux vient en dernier.
    assert [p["code"] for p in donnees["pays"]] == ["SN", "TG"]


def test_le_taux_du_siege_convertit_l_annee_et_l_an_passe(monde, deux_pays):
    reponse = client_de(monde["ada.siege"]).put(
        TAUX, {"annee": 2025, "taux": [{"devise": "gnf", "taux": "0,07"}]}, format="json"
    )
    assert reponse.status_code == 200, reponse.json()
    assert reponse.json()["devises"] == [
        {"devise": "GNF", "pays": ["Togo"], "taux": "0.070000",
         "modifie_le": reponse.json()["devises"][0]["modifie_le"]},
    ]  # fmt: skip
    donnees = _lire(monde["ada.siege"]).json()
    assert donnees["devises_sans_taux"] == []
    tg = _par_code(donnees)["TG"]
    # À taux constant : 100 000 GNF × 0,07 = 7 000 XOF, et 50 000 GNF l'an passé = 3 500 XOF.
    assert (tg["montant_converti"], tg["precedent_converti"]) == ("7000.00", "3500.00")
    assert tg["evolution"] == 100.0
    total = donnees["total"]
    assert (total["montant_ttc"], total["precedent_montant_ttc"]) == ("10600.00", "4000.00")
    assert total["evolution"] == 165.0
    assert [p["code"] for p in donnees["pays"]] == ["TG", "SN"]
    assert _par_code(donnees)["TG"]["part"] == 66.0
    # La courbe : février additionne 2 000 XOF et 7 000 XOF.
    fevrier = donnees["mensuel"][1]
    assert (fevrier["mois"], fevrier["montant_ttc"], fevrier["precedent_montant_ttc"]) == (
        "2025-02", "9000.00", "3500.00",
    )  # fmt: skip
    # Le classement réunit le même produit des deux pays par son code.
    premier = donnees["classement"][0]
    assert (premier["libelle"], premier["montant_ttc"], premier["pays"]) == (
        "Cardiol 10 mg", "10000.00", 2,
    )  # fmt: skip
    evenement = EvenementAudit.objects.get(action="ventes.taux_change")
    assert evenement.details["changements"] == [
        {"devise": "GNF", "avant": None, "apres": "0.070000"}
    ]


def test_classement_par_reseau_et_par_classe(monde, deux_pays):
    TauxChange.objects.create(annee=2025, devise="GNF", taux=Decimal("0.07"),
                              regle_par=monde["ada.siege"])  # fmt: skip
    classement = _lire(monde["ada.siege"], par="reseau").json()["classement"]
    reseaux = {g["libelle"]: g for g in classement}
    assert reseaux["Cardio"]["montant_ttc"] == "10000.00" and reseaux["Cardio"]["pays"] == 2
    assert reseaux["Gynéco"]["montant_ttc"] == "600.00"
    classes = _lire(monde["ada.siege"], par="classe").json()["classement"]
    assert [c["libelle"] for c in classes] == ["Sans classe thérapeutique"]


def test_les_objectifs_de_reseau_de_chaque_pays(monde, deux_pays, ventes):
    TauxChange.objects.create(annee=2025, devise="GNF", taux=Decimal("0.07"),
                              regle_par=monde["ada.siege"])  # fmt: skip
    ObjectifVente.objects.create(pays=monde["sn"], reseau=ventes["cardio"], annee=2025,
                                 cible=Decimal("12000"), cree_par=monde["admin.sn"])  # fmt: skip
    ObjectifVente.objects.create(pays=monde["tg"], reseau=deux_pays["cardio_tg"], annee=2025,
                                 cible=Decimal("1200000"), cree_par=monde["admin.tg"])  # fmt: skip
    donnees = _lire(monde["ada.siege"]).json()
    sn, tg = _par_code(donnees)["SN"], _par_code(donnees)["TG"]
    # Sénégal : 3 000 vendus en Cardio pour 3 000 attendus à fin mars, 25 % de la cible.
    assert (sn["objectif_cible_converti"], sn["taux_cible"], sn["taux_attendu"]) == (
        "12000.00", 25.0, 100.0,
    )  # fmt: skip
    # Togo : 100 000 GNF pour 300 000 attendus.
    assert tg["objectif_cible"] == "1200000.00" and tg["objectif_cible_converti"] == "84000.00"
    assert tg["taux_attendu"] == 33.3
    # Total en XOF : 3 000 + 7 000 réalisés, 3 000 + 21 000 attendus, 12 000 + 84 000 de cible.
    total = donnees["total"]
    assert (total["objectif_cible"], total["taux_cible"], total["taux_attendu"]) == (
        "96000.00", 10.4, 41.7,
    )  # fmt: skip


def test_la_vue_se_lit_sans_pays_choisi(monde, deux_pays):
    reponse = _lire(monde["ada.siege"], pays="SN")
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "vue_consolidee_requise"


@pytest.mark.parametrize("alias", ["resp.sn", "admin.sn", "df.sn", "dm.sn", "sup.sn"])
def test_reservee_au_siege(monde, deux_pays, alias):
    reponse = _lire(monde[alias])
    assert reponse.status_code == 403
    assert client_de(monde[alias]).get(f"{URL}export/").status_code == 403


def test_la_direction_lit_les_taux_sans_les_fixer(monde, deux_pays):
    client = client_de(monde["dina.direction"])
    donnees = client.get(TAUX, {"annee": 2025}).json()
    assert donnees["devise_reference"] == "XOF"
    assert donnees["devises"] == [
        {"devise": "GNF", "pays": ["Togo"], "taux": None, "modifie_le": None}
    ]
    reponse = client.put(TAUX, {"annee": 2025, "taux": [{"devise": "GNF", "taux": "1"}]},
                         format="json")  # fmt: skip
    assert reponse.status_code == 403


@pytest.mark.parametrize(
    ("saisie", "code"),
    [
        ({"devise": "XOF", "taux": "1"}, "devise_reference"),
        ({"devise": "GNF", "taux": "0"}, "taux_invalide"),
        ({"devise": "GNF", "taux": "abc"}, "taux_invalide"),
        ({"devise": "G1", "taux": "1"}, "devise_invalide"),
    ],
)
def test_un_taux_invalide_est_refuse(monde, deux_pays, saisie, code):
    reponse = client_de(monde["ada.siege"]).put(TAUX, {"annee": 2025, "taux": [saisie]},
                                                format="json")  # fmt: skip
    assert reponse.status_code == 400 and reponse.json()["code"] == code
    assert not TauxChange.objects.exists()


def test_corriger_un_taux_garde_une_ligne_et_un_journal(monde, deux_pays):
    client = client_de(monde["ada.siege"])
    for taux in ("0.07", "0.07", "0.08"):
        client.put(TAUX, {"annee": 2025, "taux": [{"devise": "GNF", "taux": taux}]},
                   format="json")  # fmt: skip
    assert TauxChange.objects.get().taux == Decimal("0.08")
    # La même valeur deux fois ne crée qu'un événement.
    assert EvenementAudit.objects.filter(action="ventes.taux_change").count() == 2


def test_export_par_pays_audite(monde, deux_pays):
    TauxChange.objects.create(annee=2025, devise="GNF", taux=Decimal("0.07"),
                              regle_par=monde["ada.siege"])  # fmt: skip
    reponse = client_de(monde["dina.direction"]).get(
        f"{URL}export/", {"annee": 2025, "mois_fin": 3, "contenu": "pays", "fichier": "csv"}
    )
    assert reponse.status_code == 200
    assert "ventes-tous-pays-pays-2025-03.csv" in reponse["Content-Disposition"]
    rangees = list(csv.reader(io.StringIO(reponse.content.decode("utf-8-sig")), delimiter=";"))
    assert rangees[0][:3] == ["Pays", "Monnaie", "Taux en XOF"]
    assert rangees[1][0] == "Togo" and rangees[1][6] == "7000,00"
    evenement = EvenementAudit.objects.get(action="export.ventes_tous_pays")
    assert evenement.pays is None and evenement.details["lignes"] == 2


@pytest.mark.parametrize("contenu", ["mensuel", "classement"])
def test_export_mensuel_et_classement_en_classeur(monde, deux_pays, contenu):
    reponse = client_de(monde["ada.siege"]).get(
        f"{URL}export/", {"annee": 2025, "contenu": contenu, "fichier": "xlsx"}
    )
    assert reponse.status_code == 200 and reponse.content[:2] == b"PK"

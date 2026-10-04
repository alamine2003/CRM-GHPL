"""Recherche, filtres, tri et pagination des fiches (PRP-005)."""

import pytest

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.prospects import ciblage, services
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/prospects/"


@pytest.fixture
def terrain(monde):
    """Le délégué occupe un poste sur le Plateau. Prospects : au Plateau par leur fiche,
    exerçant dans une clinique du Plateau, à Fann (hors périmètre) mais dans sa liste cible,
    et à Fann sans lien avec lui."""
    sn, admin = monde["sn"], monde["admin.sn"]
    dakar = org.creer_zone(sn, "Dakar")
    plateau, fann = org.creer_secteur(sn, dakar, "Plateau"), org.creer_secteur(sn, dakar, "Fann")
    centre = org.creer_localite(plateau, "Plateau Centre")
    division = org.creer_division(sn, "CARDIO", "Cardiologie")
    poste = org.creer_poste(
        sn, "vm", "VM Plateau", [org.creer_reseau(sn, division, "R1", "R1")], [plateau]
    )
    org.occuper(poste, monde["deleg.sn"])

    def valeur(liste, code):
        return Valeur.objects.get(pays=sn, liste=liste, code=code)

    medecin = valeur("type_prospect", "medecin")

    def prospect(nom, potentiel, specialite="cardiologie", **champs):
        return services.creer_prospect(
            sn, admin, actif=True, nom=nom, prenom="Awa", type=medecin, potentiel=potentiel,
            specialite=valeur("specialite", specialite), **champs,
        )  # fmt: skip

    clinique = services.creer_etablissement(
        sn, admin, actif=True, nom="Clinique du Cap", secteur=plateau,
        type=valeur("type_etablissement", "clinique"), localite=centre,
    )  # fmt: skip
    p = {
        "ndiaye": prospect("Ndiaye", "B", secteur=plateau, localite=centre),
        "dièye": prospect("Dièye", "A", "pediatrie"),
        "fall": prospect("Fall", "C", secteur=fann),
        "sarr": prospect("Sarr", "A", secteur=fann),
    }
    services.creer_exercice(p["dièye"], clinique, admin)
    ciblage.ajouter(poste, [p["fall"]], admin)
    return {"poste": poste, "plateau": plateau, "fann": fann, "centre": centre, **p, **monde}


def noms(reponse):
    assert reponse.status_code == 200, reponse.content
    return [x["nom"] for x in reponse.json()["resultats"]]


def test_recherche_tolerante_aux_accents_et_a_la_casse(terrain):
    """PRP-005 CA1."""
    admin = client_de(terrain["admin.sn"])
    assert noms(admin.get(f"{URL}?q=DIEYE")) == ["DIÈYE"]
    assert noms(admin.get(f"{URL}?q=dièye")) == ["DIÈYE"]
    assert noms(admin.get(f"{URL}?q=Dr  awa ndiaye")) == ["NDIAYE"]
    # Le nom d'un lieu d'exercice en cours trouve ceux qui y exercent.
    assert noms(admin.get(f"{URL}?q=clinique cap")) == ["DIÈYE"]


def test_les_resultats_restent_dans_le_perimetre(terrain):
    """PRP-005 CA2 : le délégué cherche dans les secteurs de son poste (par la fiche ou par un
    lieu d'exercice), sa liste cible et ses propres fiches ; l'administration, dans le pays."""
    deleg = client_de(terrain["deleg.sn"])
    assert sorted(noms(deleg.get(URL))) == ["DIÈYE", "FALL", "NDIAYE"]
    assert "SARR" not in noms(deleg.get(f"{URL}?q=sarr"))
    sienne = deleg.post(URL, {"nom": "Ba", "type": str(terrain["ndiaye"].type_id),
                              "specialite": str(terrain["ndiaye"].specialite_id),
                              "potentiel": "B"}, format="json")  # fmt: skip
    assert sienne.status_code == 201
    assert "BA" in noms(deleg.get(URL))
    # Hors secteur, un prospect reste planifiable (RG-024) : portée « pays » sur demande.
    assert "SARR" in noms(deleg.get(f"{URL}?portee=pays"))
    assert deleg.get(f"{URL}?portee=monde").status_code == 400
    assert len(noms(client_de(terrain["admin.sn"]).get(URL))) == 5  # avec la fiche « Ba »
    # La synthèse suit le même périmètre ; le Togo ne voit rien du Sénégal.
    assert deleg.get(f"{URL}synthese/").json()["actifs"] == 3
    assert noms(client_de(terrain["admin.tg"]).get(f"{URL}?portee=pays")) == []


def test_pagination_vingt_par_page(terrain):
    """PRP-005 CA3 : 20 résultats par page par défaut, 100 au plus."""
    admin = client_de(terrain["admin.sn"])
    for i in range(23):
        services.creer_prospect(
            terrain["sn"], terrain["admin.sn"], actif=True, nom=f"Test{i:02d}",
            type=terrain["ndiaye"].type, specialite=terrain["ndiaye"].specialite, potentiel="C",
        )  # fmt: skip
    premiere = admin.get(URL).json()
    assert (premiere["total"], premiere["page"], premiere["taille"]) == (27, 1, 20)
    assert len(premiere["resultats"]) == 20
    seconde = admin.get(f"{URL}?page=2").json()
    assert len(seconde["resultats"]) == 7
    assert not {x["id"] for x in premiere["resultats"]} & {x["id"] for x in seconde["resultats"]}
    assert admin.get(f"{URL}?taille=500").json()["taille"] == 100
    assert admin.get(f"{URL}?page=9").json()["resultats"] == []


def test_filtres_par_specialite_potentiel_lieu_et_delegue(terrain):
    admin, t = client_de(terrain["admin.sn"]), terrain
    pediatrie = str(t["dièye"].specialite_id)
    assert noms(admin.get(f"{URL}?specialite={pediatrie}")) == ["DIÈYE"]
    assert sorted(noms(admin.get(f"{URL}?potentiel=A"))) == ["DIÈYE", "SARR"]
    # Secteur et localité : par la fiche ou par un lieu d'exercice en cours.
    assert sorted(noms(admin.get(f"{URL}?secteur={t['plateau'].pk}"))) == ["DIÈYE", "NDIAYE"]
    assert sorted(noms(admin.get(f"{URL}?localite={t['centre'].pk}"))) == ["DIÈYE", "NDIAYE"]
    # Délégué : la liste cible de son poste.
    assert noms(admin.get(f"{URL}?poste={t['poste'].pk}")) == ["FALL"]
    assert "DIÈYE" not in noms(admin.get(f"{URL}?sans_lieu=1"))


def test_tris(terrain):
    admin = client_de(terrain["admin.sn"])
    assert noms(admin.get(URL)) == ["DIÈYE", "FALL", "NDIAYE", "SARR"]
    assert noms(admin.get(f"{URL}?tri=potentiel"))[:2] == ["DIÈYE", "SARR"]
    assert noms(admin.get(f"{URL}?tri=recents"))[0] == "SARR"
    assert noms(admin.get(f"{URL}?tri=inconnu")) == ["DIÈYE", "FALL", "NDIAYE", "SARR"]


def test_etablissements_pagines_et_dans_le_perimetre(terrain):
    url = "/api/v1/etablissements/"
    deleg, admin = client_de(terrain["deleg.sn"]), client_de(terrain["admin.sn"])
    services.creer_etablissement(
        terrain["sn"], terrain["admin.sn"], actif=True, nom="Pharmacie de Fann",
        secteur=terrain["fann"], type=Valeur.objects.get(
            pays=terrain["sn"], liste="type_etablissement", code="pharmacie"),
    )  # fmt: skip
    assert noms(deleg.get(url)) == ["Clinique du Cap"]
    assert len(noms(deleg.get(f"{url}?portee=pays"))) == 2
    corps = admin.get(f"{url}?tri=type&taille=1").json()
    assert corps["total"] == 2 and corps["taille"] == 1 and len(corps["resultats"]) == 1
    assert noms(admin.get(f"{url}?localite={terrain['centre'].pk}")) == ["Clinique du Cap"]

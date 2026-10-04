"""Fiches établissements (PRP-003) ; création par le délégué au statut `a_valider` (§14.6)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/etablissements/"


@pytest.fixture
def secteurs(monde):
    sn = monde["sn"]
    dakar = org.creer_zone(sn, "Dakar")
    return {
        "plateau": org.creer_secteur(sn, dakar, "Plateau"),
        "fann": org.creer_secteur(sn, dakar, "Fann"),
        "lome": org.creer_secteur(monde["tg"], org.creer_zone(monde["tg"], "Lomé"), "Bè"),
    }


def fiche(monde, secteurs, **champs):
    clinique = Valeur.objects.get(pays=monde["sn"], liste="type_etablissement", code="clinique")
    return {
        "nom": "Clinique du Cap",
        "type": str(clinique.pk),
        "secteur": str(secteurs["plateau"].pk),
        "adresse": "12 rue Carnot",
        "localite": "Plateau",
        "latitude": 14.6681,
        "longitude": -17.4369,
        "telephone": "33 821 00 00",
        **champs,
    }


def noms(reponse):
    return [e["nom"] for e in reponse.json()["resultats"]]


def test_un_etablissement_a_un_secteur(monde, secteurs):
    """PRP-003 CA1 : sans secteur, ou avec un secteur d'un autre pays, il est refusé."""
    admin = client_de(monde["admin.sn"])
    sans = admin.post(URL, fiche(monde, secteurs, secteur=None), format="json")
    assert sans.status_code == 400 and sans.json()["code"] == "secteur_requis"
    ailleurs = admin.post(URL, fiche(monde, secteurs, secteur=str(secteurs["lome"].pk)),
                          format="json")  # fmt: skip
    assert ailleurs.status_code == 400
    cree = admin.post(URL, fiche(monde, secteurs), format="json")
    assert cree.status_code == 201, cree.content
    e = cree.json()
    assert e["secteur"]["libelle"] == "Plateau" and e["secteur"]["zone"] == "Dakar"
    assert e["statut"] == "actif" and e["telephone"] == "+221338210000"
    assert e["type_libelle"] == "Clinique"


def test_les_coordonnees_gps_sont_facultatives_mais_completes(monde, secteurs):
    """PRP-003 CA2 : facultatives ; sans elles, l'établissement est signalé (contrôle de
    distance impossible). Les deux coordonnées vont ensemble et restent dans leurs bornes."""
    admin = client_de(monde["admin.sn"])
    sans = admin.post(URL, fiche(monde, secteurs, nom="Cabinet Fall", latitude=None,
                                 longitude=None), format="json").json()  # fmt: skip
    assert sans["a_coordonnees"] is False and sans["latitude"] is None
    avec = admin.post(URL, fiche(monde, secteurs), format="json").json()
    assert avec["a_coordonnees"] is True and avec["latitude"] == pytest.approx(14.6681)
    moitie = admin.post(URL, fiche(monde, secteurs, longitude=None), format="json")
    assert moitie.json()["code"] == "coordonnees_incompletes"
    hors = admin.post(URL, fiche(monde, secteurs, latitude=120), format="json")
    assert hors.json()["code"] == "coordonnees_invalides"
    synthese = admin.get(f"{URL}synthese/").json()
    assert synthese["sans_coordonnees"] == 1 and synthese["secteurs_couverts"] == 1
    assert noms(admin.get(f"{URL}?sans_coordonnees=1")) == ["Cabinet Fall"]
    # Positionner l'établissement plus tard ; le changement est audité.
    admin.patch(f"{URL}{sans['id']}/", {"latitude": 14.69, "longitude": -17.46}, format="json")
    e = EvenementAudit.objects.filter(action="etablissement.modification").first()
    assert e.details["latitude"]["nouveau"] == "14.690000"


def test_le_delegue_cree_un_etablissement_a_valider(monde, secteurs):
    """§14.6 : à valider, visible par son seul auteur, validé par l'administrateur pays."""
    deleg = client_de(monde["deleg.sn"])
    cree = deleg.post(URL, fiche(monde, secteurs, nom="Pharmacie Médina"), format="json")
    assert cree.status_code == 201 and cree.json()["statut"] == "a_valider"
    assert noms(deleg.get(URL)) == ["Pharmacie Médina"]
    assert noms(client_de(monde["sup.sn"]).get(URL)) == []
    admin = client_de(monde["admin.sn"])
    admin.post(f"{URL}{cree.json()['id']}/valider/")
    assert noms(client_de(monde["sup.sn"]).get(URL)) == ["Pharmacie Médina"]
    refus = deleg.patch(f"{URL}{cree.json()['id']}/", {"nom": "X"}, format="json")
    assert refus.status_code == 403


def test_recherche_filtres_et_archivage(monde, secteurs):
    admin = client_de(monde["admin.sn"])
    hopital = Valeur.objects.get(pays=monde["sn"], liste="type_etablissement", code="hopital")
    admin.post(URL, fiche(monde, secteurs), format="json")
    cree = admin.post(URL, fiche(monde, secteurs, nom="Hôpital de Fann", type=str(hopital.pk),
                                 secteur=str(secteurs["fann"].pk), localite="Fann"),
                      format="json").json()  # fmt: skip
    assert noms(admin.get(f"{URL}?q=hopital")) == ["Hôpital de Fann"]
    assert noms(admin.get(f"{URL}?q=fann")) == ["Hôpital de Fann"]
    assert noms(admin.get(f"{URL}?secteur={secteurs['plateau'].pk}")) == ["Clinique du Cap"]
    assert admin.get(f"{URL}synthese/").json()["types"] == {"clinique": 1, "hopital": 1}
    admin.post(f"{URL}{cree['id']}/archiver/", {"motif": "Fermé"}, format="json")
    assert noms(admin.get(URL)) == ["Clinique du Cap"]
    assert noms(admin.get(f"{URL}?statut=archive")) == ["Hôpital de Fann"]


def test_un_secteur_qui_porte_des_etablissements_ne_s_archive_pas(monde, secteurs):
    admin = client_de(monde["admin.sn"])
    admin.post(URL, fiche(monde, secteurs), format="json")
    reponse = admin.post(f"/api/v1/organisation/secteurs/{secteurs['plateau'].pk}/archiver/")
    assert reponse.status_code == 400 and reponse.json()["code"] == "elements_actifs"


def test_isolation_entre_pays(monde, secteurs):
    client_de(monde["admin.sn"]).post(URL, fiche(monde, secteurs), format="json")
    assert noms(client_de(monde["admin.tg"]).get(URL)) == []


def test_le_delegue_obtient_les_secteurs_du_pays_pour_sa_saisie(monde, secteurs):
    reponse = client_de(monde["deleg.sn"]).get(f"{URL}secteurs/").json()
    assert [(x["zone"], x["libelle"]) for x in reponse] == [("Dakar", "Fann"), ("Dakar", "Plateau")]

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
    plateau = org.creer_secteur(sn, dakar, "Plateau")
    return {
        "plateau": plateau,
        "fann": org.creer_secteur(sn, dakar, "Fann"),
        "plateau_centre": org.creer_localite(plateau, "Plateau centre"),
        "medina": org.creer_localite(org.creer_secteur(sn, dakar, "Médina"), "Gueule Tapée"),
        "lome": org.creer_secteur(monde["tg"], org.creer_zone(monde["tg"], "Lomé"), "Bè"),
    }


def fiche(monde, secteurs, **champs):
    clinique = Valeur.objects.get(pays=monde["sn"], liste="type_etablissement", code="clinique")
    return {
        "nom": "Clinique du Cap",
        "type": str(clinique.pk),
        "secteur": str(secteurs["plateau"].pk),
        "adresse": "12 rue Carnot",
        "localite": str(secteurs["plateau_centre"].pk),
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
    sans = admin.post(URL, fiche(monde, secteurs, secteur=None, localite=None), format="json")
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
    assert e["localite"]["libelle"] == "Plateau centre"
    # La localité donne son secteur ; elle doit appartenir au secteur indiqué.
    deduit = admin.post(URL, fiche(monde, secteurs, nom="Cabinet Ba", secteur=None), format="json")
    assert deduit.json()["secteur"]["libelle"] == "Plateau"
    hors = admin.post(URL, fiche(monde, secteurs, localite=str(secteurs["medina"].pk)),
                      format="json")  # fmt: skip
    assert hors.json()["code"] == "localite_hors_secteur"


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
    assert noms(client_de(monde["sup.sn"]).get(f"{URL}?portee=pays")) == []
    admin = client_de(monde["admin.sn"])
    admin.post(f"{URL}{cree.json()['id']}/valider/")
    assert noms(client_de(monde["sup.sn"]).get(f"{URL}?portee=pays")) == ["Pharmacie Médina"]
    refus = deleg.patch(f"{URL}{cree.json()['id']}/", {"nom": "X"}, format="json")
    assert refus.status_code == 403


def test_recherche_filtres_et_archivage(monde, secteurs):
    admin = client_de(monde["admin.sn"])
    hopital = Valeur.objects.get(pays=monde["sn"], liste="type_etablissement", code="hopital")
    hock = org.creer_localite(secteurs["fann"], "Fann Hock")
    admin.post(URL, fiche(monde, secteurs), format="json")
    cree = admin.post(URL, fiche(monde, secteurs, nom="Hôpital de Fann", type=str(hopital.pk),
                                 secteur=str(secteurs["fann"].pk), localite=str(hock.pk)),
                      format="json").json()  # fmt: skip
    assert noms(admin.get(f"{URL}?q=hopital")) == ["Hôpital de Fann"]
    assert noms(admin.get(f"{URL}?q=fann")) == ["Hôpital de Fann"]
    assert noms(admin.get(f"{URL}?q=hock")) == ["Hôpital de Fann"]  # par la localité
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
    assert [(x["zone"], x["libelle"]) for x in reponse] == [
        ("Dakar", "Fann"), ("Dakar", "Médina"), ("Dakar", "Plateau"),
    ]  # fmt: skip
    # Chaque secteur arrive avec ses localités actives, pour le choix en cascade.
    assert [loc["libelle"] for loc in reponse[2]["localites"]] == ["Plateau centre"]


def test_l_historique_d_un_etablissement_champ_par_champ(monde, secteurs):
    """PRP-012 CA1 : champ, ancienne et nouvelle valeur, auteur et date, pour un établissement
    comme pour un prospect ; l'archivage y figure aussi."""
    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde, secteurs), format="json").json()
    modifie = admin.patch(f"{URL}{cree['id']}/", {"telephone": "33 822 11 11",
                          "adresse": "14 rue Carnot"}, format="json")  # fmt: skip
    assert modifie.status_code == 200, modifie.content
    lignes = admin.get(f"{URL}{cree['id']}/historique/")
    assert lignes.status_code == 200, lignes.content
    par_champ = {x["champ"]: x for x in lignes.json()}
    assert (par_champ["telephone"]["ancienne"], par_champ["telephone"]["nouvelle"]) == (
        "+221338210000", "+221338221111")  # fmt: skip
    assert (par_champ["adresse"]["ancienne"], par_champ["adresse"]["nouvelle"]) == (
        "12 rue Carnot", "14 rue Carnot")  # fmt: skip
    assert par_champ["adresse"]["auteur"]["identifiant"] == monde["admin.sn"].username
    assert par_champ["adresse"]["le"]
    admin.post(f"{URL}{cree['id']}/archiver/", {"motif": "Fermé"}, format="json")
    statut = admin.get(f"{URL}{cree['id']}/historique/").json()[0]
    assert (statut["champ"], statut["nouvelle"]) == ("statut", "archive")


def test_aucune_route_ne_supprime_un_etablissement(monde, secteurs):
    """PRP-012 CA2 : aucune suppression physique, ni par l'API ni par le modèle."""
    from apps.prospects.models import Etablissement

    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde, secteurs), format="json").json()
    assert admin.delete(f"{URL}{cree['id']}/").status_code in {403, 405}
    assert Etablissement.objects.filter(pk=cree["id"]).exists()
    with pytest.raises(TypeError):
        Etablissement.objects.get(pk=cree["id"]).delete()


def test_dc55_le_rayon_de_pointage_s_ecrit_par_l_api(monde, secteurs):
    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde, secteurs, rayon_pointage_m=300), format="json")
    assert (cree.status_code, cree.json()["rayon_pointage_m"]) == (201, 300), cree.content
    ident = cree.json()["id"]
    # Hors des bornes (50 à 2 000 m) : refusé.
    for valeur in (20, 5000):
        r = admin.patch(f"{URL}{ident}/", {"rayon_pointage_m": valeur}, format="json")
        assert r.status_code == 400, (valeur, r.content)
    # Vidé : l'établissement reprend la distance du pays.
    r = admin.patch(f"{URL}{ident}/", {"rayon_pointage_m": None}, format="json")
    assert (r.status_code, r.json()["rayon_pointage_m"]) == (200, None)

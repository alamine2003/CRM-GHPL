"""Qualité des données du pays actif (0.1.9, stabilisation du cycle 0.1 « Référentiel »).

Le bilan compte les fiches à compléter (PRP-002, PRP-003, PRP-004, PRP-011) et ce qui reste à
trancher (PRP-006, PRP-009, PRP-014) ; chaque chiffre se retrouve par un filtre de la
recherche (PRP-005), pour ouvrir la liste des fiches concernées.
"""

import pytest

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.prospects import ciblage, services
from apps.prospects.models import Prospect
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/qualite/"


def valeur(monde, liste, code):
    return Valeur.objects.get(pays=monde["sn"], liste=liste, code=code)


def fiche(monde, **champs):
    v = {"nom": "Faye", "prenom": "Awa", "potentiel": "B",
         "type": valeur(monde, "type_prospect", "medecin"),
         "specialite": valeur(monde, "specialite", "cardiologie"), **champs}  # fmt: skip
    return services.creer_prospect(monde["sn"], monde["admin.sn"], actif=True, **v)


def sans_specialite(prospect):
    """La saisie exige la spécialité ; seule une fiche importée (BirdNotes) peut en manquer."""
    Prospect.objects.filter(pk=prospect.pk).update(specialite=None)
    return prospect


def test_le_bilan_compte_les_fiches_a_completer_et_a_trancher(monde):
    sn, admin_u = monde["sn"], monde["admin.sn"]
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Thiès"), "Thiès Ville")
    poste = org.creer_poste(sn, "vm", "VM Thiès", [], [secteur])
    complete = fiche(monde, nom="Sarr", telephone_mobile="+221770000001")
    lieu = services.creer_etablissement(
        sn, admin_u, actif=True, nom="Clinique T", secteur=secteur, latitude=14.79,
        longitude=-16.92, type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    services.creer_exercice(complete, lieu, admin_u)
    ciblage.ajouter(poste, [complete], admin_u)
    # Médecin sans spécialité, sans téléphone, sans lieu, hors liste cible.
    sans_specialite(fiche(monde))
    # Un grossiste n'a pas de spécialité : il ne manque rien de ce côté.
    fiche(monde, nom="Dépôt", type=valeur(monde, "type_prospect", "grossiste"), specialite=None,
          telephone_pro="+221338000000")  # fmt: skip
    services.creer_etablissement(
        sn, admin_u, actif=True, nom="Cabinet sans GPS", secteur=secteur,
        type=valeur(monde, "type_etablissement", "cabinet"),
    )  # fmt: skip
    services.creer_prospect(sn, monde["deleg.sn"], actif=False, nom="Kane", potentiel="C",
                            type=valeur(monde, "type_prospect", "medecin"),
                            specialite=valeur(monde, "specialite", "cardiologie"))  # fmt: skip

    r = client_de(admin_u).get(URL)

    assert r.status_code == 200
    assert r.json() == {
        "prospects": 3, "sans_lieu": 2, "sans_telephone": 1, "sans_specialite": 1,
        "hors_cible": 2, "a_valider": 1, "etablissements": 2, "sans_coordonnees": 1,
        "etablissements_a_valider": 0, "doublons": 0, "propositions": 0,
    }  # fmt: skip


def test_chaque_chiffre_ouvre_la_liste_des_fiches_concernees(monde):
    """PRP-005 : les filtres de la recherche retrouvent les fiches comptées."""
    sn = monde["sn"]
    complete = fiche(monde, nom="Sarr", telephone_mobile="+221770000001")
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Louga"), "Louga")
    poste = org.creer_poste(sn, "vm", "VM Louga", [], [secteur])
    ciblage.ajouter(poste, [complete], monde["admin.sn"])
    manque = sans_specialite(fiche(monde))
    admin = client_de(monde["admin.sn"])
    for filtre in ("sans_telephone", "sans_specialite", "hors_cible"):
        r = admin.get("/api/v1/prospects/", {filtre: "1"}).json()
        assert [p["id"] for p in r["resultats"]] == [str(manque.pk)], filtre


def test_le_bilan_est_reserve_a_l_administrateur_pays(monde):
    """§6.3 : l'administrateur pays tient le référentiel ; le délégué n'y accède pas."""
    assert client_de(monde["deleg.sn"]).get(URL).status_code == 403
    assert client_de(monde["admin.sn"]).get(URL).status_code == 200


def test_le_bilan_ne_compte_que_le_pays_actif(monde):
    """ORG-009 : le Togo ne voit aucun chiffre du Sénégal."""
    sans_specialite(fiche(monde))
    r = client_de(monde["admin.tg"]).get(URL).json()
    assert r["prospects"] == 0 and r["sans_specialite"] == 0

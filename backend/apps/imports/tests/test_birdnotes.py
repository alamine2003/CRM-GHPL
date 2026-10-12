"""Import contrôlé d'un export BirdNotes (PRP-013), sur un export entièrement fictif.

Le vrai fichier n'entre jamais dans le dépôt (CLAUDE.md) : cet export reprend seulement sa
structure (noms des tables et des colonnes) avec des valeurs inventées.
"""

import io
import json
import zipfile

import pytest

from apps.audit.models import EvenementAudit
from apps.imports.birdnotes import FichierInvalide, importer, lire_fichier, rapport_csv
from apps.imports.models import LotImport, ReferenceExterne
from apps.organisation.models import Localite, Secteur
from apps.perimetre.tests.conftest import client_de
from apps.prospects.models import Etablissement, Exercice, Prospect, StatutFiche
from apps.referentiel.models import Portefeuille, Produit

pytestmark = pytest.mark.django_db

URL = "/api/v1/imports/"


def prospect(ident, nom, specialite, potentiel="A", **champs):
    return {
        "ID prospect": ident, "Prénom": "Awa", "Nom": nom, "Nom complet": f"Awa {nom}",
        "Activité (H/P)": "P", "Potentiel": potentiel, "Spécialité": specialite,
        "Type prospect": "", "Établissement": "", "Secteur": "Fictif Nord",
        "Localité": "Quartier Un", "Téléphone": "", "GSM": "", "Email": "", "Grade": "",
        "Latitude": None, "Longitude": None, "Délégués affectés": "", **champs,
    }  # fmt: skip


def export() -> dict:
    return {
        "donnees": {
            "Secteurs": [
                {"ID secteur": 1, "Secteur": "Fictif Nord"},
                {"ID secteur": 2, "Secteur": "Fictif Sud"},
                {"ID secteur": 3, "Secteur": "FICTIF NORD "},  # variante : fusionnée
            ],
            "Localites": [
                {"ID localité": 1, "Localité": "Quartier Un", "Secteur": "Fictif Nord"},
                {"ID localité": 2, "Localité": "Quartier Deux", "Secteur": "Fictif Sud"},
                {"ID localité": 3, "Localité": "INTERMEDIARE 1", "Secteur": "Fictif Nord"},
            ],
            "Gammes": [
                {"Gamme": "Division Test", "Niveau": "Parente", "Gamme parente": ""},
                {"Gamme": "Réseau Test", "Niveau": "Fille", "Gamme parente": "Division Test"},
                {"Gamme": "Default", "Niveau": "Fille", "Gamme parente": ""},
            ],
            "Produits": [
                {"ID produit": 1, "Produit": "Produit Test A", "Code": "TESTA"},
                {"ID produit": 2, "Produit": "Produit Test B", "Code": ""},
            ],
            "Portefeuille": [
                {"Gamme": "Réseau Test", "Gamme parente": "Division Test", "ID produit": 1},
                {"Gamme": "Default", "Gamme parente": "", "ID produit": 2},
            ],
            "Etablissements": [
                {
                    "ID établissement": 1,
                    "Établissement": "POSTE DE SANTE TEST",
                    "Activité (H/P)": "H",
                    "Secteur": "Fictif Nord",
                },
                {
                    "ID établissement": 2,
                    "Établissement": "Lieu Inclassable",
                    "Activité (H/P)": "P",
                    "Secteur": "Fictif Sud",
                },
                # Sans secteur : déduit de ses prospects.
                {
                    "ID établissement": 3,
                    "Établissement": "PHARMACIE TEST",
                    "Activité (H/P)": "P",
                    "Secteur": None,
                },
                # Sans secteur ni prospect : écarté.
                {
                    "ID établissement": 4,
                    "Établissement": "CABINET ORPHELIN",
                    "Activité (H/P)": "P",
                    "Secteur": None,
                },
            ],  # fmt: skip
            "Prospects": [
                prospect(
                    1,
                    "Fictif",
                    "MEDECIN GENERALISTE",
                    Grade="Professeur",
                    GSM="77 000 00 01",
                    Établissement="PHARMACIE TEST",
                    **{"Date création": "2026-04-02"},
                ),
                prospect(2, "Fictive", "MEDECIN GENERALISTE", potentiel="X"),
                prospect(3, "Sansnom", "MEDECIN GENERALISTE", Nom="", **{"Nom complet": ""}),
                prospect(
                    4, "Faux", "MEDECIN GENERALISTE", GSM="12", Établissement="CABINET DISPARU"
                ),
                # Titre à la place du prénom, localité qui n'en est pas une.
                prospect(5, "MOUSSA DIOP", "INFIRMIER", Prénom="DR", Localité="INTERMEDIARE 1"),
                # Même nom qu'une autre fiche une fois le titre retiré : homonymes.
                prospect(
                    6, "Fictif", "INFIRMIER", Prénom="Dr Awa", Établissement="POSTE DE SANTE TEST"
                ),
            ],  # fmt: skip
            "Prospects en attente": [
                prospect(10, "Attente", "MEDECIN GENERALISTE"),
                prospect(11, "Modif", "MEDECIN GENERALISTE", **{"ID prospect d'origine": 1}),
            ],
            "Doublons prospects": [
                {"ID prospect": 1, "Groupe": "G1"},
                {"ID prospect": 2, "Groupe": "G1"},
            ],
        }
    }


def contenu(donnees=None) -> bytes:
    return json.dumps(donnees or export()).encode()


def test_lecture_json_ou_zip_et_refus_d_un_autre_fichier():
    brut = contenu()
    assert "Prospects" in lire_fichier(brut, "export.json")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("export.json", brut)
    assert "Prospects" in lire_fichier(archive.getvalue(), "export.zip")
    for mauvais in (b"pas du json", json.dumps({"autre": 1}).encode()):
        with pytest.raises(FichierInvalide):
            lire_fichier(mauvais, "x.json")


def test_la_simulation_n_ecrit_rien_et_donne_le_rapport(monde):
    """PRP-013 CA1 : la simulation calcule tout, annule tout, et garde le lot et son rapport."""
    lot = importer(monde["sn"], monde["admin.sn"], contenu(), "export.json", simulation=True)
    assert lot.statut == LotImport.Statut.SIMULE
    assert lot.compteurs["prospects"]["crees"] == 6  # 5 validés (sans nom : écarté) + 1 en attente
    assert lot.compteurs["secteurs"] == {"crees": 2, "fusionnes": 1}
    assert not Prospect.objects.exists() and not Secteur.objects.filter(pays=monde["sn"]).exists()
    assert not ReferenceExterne.objects.exists()
    assert LotImport.objects.get().pk == lot.pk
    assert EvenementAudit.objects.filter(action="import.birdnotes").count() == 1


def test_import_reel_et_rapport_des_anomalies(monde):
    """PRP-013 CA2 : chaque ligne écartée ou corrigée a son motif dans le rapport CSV."""
    sn = monde["sn"]
    lot = importer(sn, monde["admin.sn"], contenu(), "export.json", simulation=False)
    assert lot.statut == LotImport.Statut.TERMINE
    assert Localite.objects.filter(pays=sn).count() == 2
    assert Produit.objects.filter(pays=sn).count() == 2
    # La gamme technique « Default » n'est pas un réseau.
    assert Portefeuille.objects.filter(pays=sn).count() == 1

    etablissements = {e.nom: e for e in Etablissement.objects.filter(pays=sn)}
    assert set(etablissements) == {"POSTE DE SANTE TEST", "Lieu Inclassable", "PHARMACIE TEST"}
    assert etablissements["POSTE DE SANTE TEST"].type.code == "poste_sante"
    assert etablissements["POSTE DE SANTE TEST"].activite == "hospitalier"
    assert etablissements["Lieu Inclassable"].type.code == "autre"
    assert etablissements["PHARMACIE TEST"].secteur.libelle == "Fictif Nord"

    fictif = Prospect.objects.get(nom="FICTIF", prenom="Awa", civilite="pr")
    assert fictif.type.code == "medecin" and fictif.specialite.code == "medecine_generale"
    assert fictif.grade.code == "professeur" and fictif.civilite == "pr"
    assert fictif.localite.libelle == "Quartier Un" and fictif.activite == "prive"
    assert fictif.telephone_mobile == "+221770000001"
    assert Prospect.objects.get(nom="FICTIVE").potentiel == "C"  # « X » ramené à « C »
    assert Prospect.objects.get(nom="ATTENTE").statut == StatutFiche.A_VALIDER
    # Le titre sort du prénom ; prénom et nom collés restent à séparer à la main.
    diop = Prospect.objects.get(nom="MOUSSA DIOP")
    assert (diop.civilite, diop.prenom, diop.type.code) == ("dr", "", "paramedical")
    # « INTERMEDIARE » n'est pas une localité : secteur gardé, localité à préciser.
    assert diop.secteur.libelle == "Fictif Nord" and diop.localite is None
    assert not Localite.objects.filter(libelle__icontains="intermedia").exists()
    # Demande de modification : son auteur BirdNotes n'a pas de compte ; non reprise.
    assert not Prospect.objects.filter(nom="MODIF").exists()
    assert lot.compteurs["demandes_modification"] == {"non_reprises": 1}

    csv = rapport_csv(lot)
    assert csv.startswith("﻿Entité;Identifiant source;Niveau;Motif")
    for motif in ("Prospect sans nom", "Téléphone inexploitable", "« X » ramené à « C »",
                  "sans secteur ni prospect", "secteur déduit", "Type non reconnu",
                  "prénom et nom à séparer", "INTERMEDIARE", "Fiches au même nom (2)"):  # fmt: skip
        assert motif in csv, motif


def test_les_doublons_signales_sont_gardes(monde):
    """PRP-013 CA3 : les groupes de doublons BirdNotes restent attachés aux fiches reprises."""
    importer(monde["sn"], monde["admin.sn"], contenu(), "export.json", simulation=False)
    groupes = {
        r.identifiant: r.complements.get("groupe_doublons")
        for r in ReferenceExterne.objects.filter(entite="prospect")
    }
    assert groupes["1"] == groupes["2"] == "G1"
    # Noms identiques une fois le titre retiré : gardés ensemble pour la file des doublons.
    homonymes = {
        r.identifiant: r.complements.get("homonymes")
        for r in ReferenceExterne.objects.filter(entite="prospect")
    }
    assert homonymes["1"] == homonymes["6"] is not None and homonymes["2"] is None
    assert Prospect.objects.filter(nom="FICTIF").count() == 2  # rien n'est fusionné
    # PRP-009 : les deux sortes de groupes entrent dans la file de l'administrateur pays, une
    # fois chacune ; un réimport n'ajoute aucune paire.
    from apps.prospects.models import DoublonProbable

    file = DoublonProbable.objects.all()
    assert {c for d in file for c in d.criteres} >= {"groupe_birdnotes", "meme_nom"}
    paires = file.count()
    importer(monde["sn"], monde["admin.sn"], contenu(), "export.json", simulation=False)
    assert DoublonProbable.objects.count() == paires


def test_un_reimport_ne_cree_rien_de_nouveau(monde):
    """PRP-013 CA4 : les références externes rendent l'import rejouable sans doublon."""
    sn, admin = monde["sn"], monde["admin.sn"]
    importer(sn, admin, contenu(), "export.json", simulation=False)
    avant = (Prospect.objects.count(), Etablissement.objects.count(), Produit.objects.count())
    lot = importer(sn, admin, contenu(), "export.json", simulation=False)
    assert (Prospect.objects.count(), Etablissement.objects.count(),
            Produit.objects.count()) == avant  # fmt: skip
    assert "crees" not in lot.compteurs.get("prospects", {})
    assert lot.compteurs["prospects"]["existants"] == 6


def test_les_exercices_viennent_de_l_etablissement_de_la_fiche(monde):
    """PRP-004 : le prospect exerce dans l'établissement nommé sur sa fiche BirdNotes."""
    sn, admin = monde["sn"], monde["admin.sn"]
    lot = importer(sn, admin, contenu(), "export.json", simulation=False)
    assert lot.compteurs["exercices"] == {
        "crees": 2, "sans_etablissement": 3, "etablissement_non_repris": 1,
    }  # fmt: skip
    fictif = Prospect.objects.get(nom="FICTIF", prenom="Awa", civilite="pr")
    exercice = Exercice.objects.get(prospect=fictif)
    assert exercice.etablissement.nom == "PHARMACIE TEST" and exercice.principal
    assert str(exercice.debut) == "2026-04-02"
    # Un import antérieur à 0.1.5 n'avait pas d'exercices : le réimport les complète, une fois.
    ReferenceExterne.objects.filter(entite="exercice").delete()
    Exercice.objects.all().delete()
    lot = importer(sn, admin, contenu(), "export.json", simulation=False)
    assert lot.compteurs["exercices"]["crees"] == 2 and Exercice.objects.count() == 2
    lot = importer(sn, admin, contenu(), "export.json", simulation=False)
    assert "crees" not in lot.compteurs["exercices"] and Exercice.objects.count() == 2


def test_api_reservee_a_l_administrateur_pays(monde):
    from django.core.files.uploadedfile import SimpleUploadedFile

    def fichier():
        return SimpleUploadedFile("export.json", contenu(), content_type="application/json")

    admin = client_de(monde["admin.sn"])
    simule = admin.post(f"{URL}birdnotes/", {"fichier": fichier()}, format="multipart")
    assert simule.status_code == 201, simule.content
    assert simule.json()["simulation"] is True and simule.json()["statut"] == "simule"
    lot = simule.json()["id"]
    assert [lot_["id"] for lot_ in admin.get(URL).json()] == [lot]
    assert admin.get(f"{URL}{lot}/").json()["anomalies"]
    rapport = admin.get(f"{URL}{lot}/rapport/")
    assert rapport["Content-Type"].startswith("text/csv")
    for alias in ("deleg.sn", "sup.sn", "resp.sn"):
        refus = client_de(monde[alias]).post(f"{URL}birdnotes/", {"fichier": fichier()},
                                             format="multipart")  # fmt: skip
        assert refus.status_code == 403
    assert client_de(monde["admin.tg"]).get(f"{URL}{lot}/").status_code == 404


def test_apres_le_fichier_d_organisation_les_gammes_de_birdnotes_sont_ignorees(monde):
    """1.1.0 [D] : le fichier d'organisation fait foi pour gammes, réseaux et produits ;
    BirdNotes n'apporte plus que le terrain (secteurs, établissements, prospects)."""
    from apps.imports import organisation
    from apps.imports.tests.test_organisation import classeur
    from apps.organisation.models import Reseau

    sn = monde["sn"]
    organisation.importer(sn, monde["admin.sn"], classeur(), "orga.xlsx", simulation=False)
    reseaux = Reseau.objects.filter(pays=sn).count()
    produits = Produit.objects.filter(pays=sn).count()
    lot = importer(sn, monde["admin.sn"], contenu(), "export.json", simulation=False)
    assert lot.compteurs["gammes"] == {
        "ignorees_organisation_importee": len(export()["donnees"]["Gammes"])
    }
    assert Reseau.objects.filter(pays=sn).count() == reseaux
    assert Produit.objects.filter(pays=sn).count() == produits
    assert Prospect.objects.filter(pays=sn).exists()

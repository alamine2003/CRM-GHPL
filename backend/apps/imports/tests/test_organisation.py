"""Import du fichier d'organisation (ORG-014), sur un classeur fictif construit en mémoire.

Aucune donnée réelle : noms, réseaux et produits sont inventés.
"""

import io
import zipfile
from datetime import timedelta
from xml.sax.saxutils import escape

import pytest

from apps.audit.models import EvenementAudit
from apps.identite.models import Utilisateur
from apps.imports.models import LotImport
from apps.imports.organisation import importer, lire_fichier, type_poste
from apps.organisation.models import Occupation, PerimetreReseau, Poste, Rattachement, Reseau
from apps.perimetre.tests.conftest import client_de
from apps.referentiel import services as ref
from apps.referentiel.services import portefeuille_actif
from apps.socle.services import aujourdhui

pytestmark = pytest.mark.django_db

ENTETES = ["N°", "GAMME", "RESEAUX", "DF", "DM", "SUPERVISEUR", "ZONE", "SECTEUR / VILLE",
           "NOM ET PRENOMS", "FONCTION", "PRODUITS DE LA GAMME"]  # fmt: skip
LIGNES = [
    ["1", "GAMME TEST", "RESEAU ALPHA", "AMADOU DEMBA", "BINETOU CISSE", "COUMBA DIALLO",
     "DAKAR", "PLATEAU/MEDINA", "ELHADJ FAYE", "VM", "Fictivol 10 mg ; Produit Inconnu"],
    ["2", "GAMME TEST", "RESEAU ALPHA", "AMADOU DEMBA", "BINETOU CISSE", "COUMBA DIALLO",
     "REGIONS", "THIES", "POSTE NON POURVU", "VM", "Fictivol 10 mg"],
    ["3", "GAMME TEST", "RESEAU BETA", "", "", "COUMBA DIALLO", "REGIONS", "KAOLACK",
     "FATOU GUEYE NDIAYE", "VM OTC", ""],
    ["4", "GAMME TEST", "", "", "", "COUMBA DIALLO", "DAKAR", "YOFF", "IBOU KANE", "VM", ""],
    ["5", "GAMME TEST", "RESEAU BETA", "", "", "", "REGIONS", "LOUGA", "MOUSSA SOW",
     "CHAUFFEUR", ""],
    ["6", "GAMME TEST", "RESEAU BETA", "", "", "", "REGIONS", "LOUGA", "COUMBA DIALLO",
     "KAM (assuré par les superviseurs)", ""],
]  # fmt: skip


def classeur(lignes=LIGNES, feuille="ORGANISATION") -> bytes:
    """Classeur .xlsx minimal (chaînes en ligne), comme en produit Excel."""

    def colonne(i):
        lettres = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26)
            lettres = chr(65 + r) + lettres
        return lettres

    def ligne_xml(n, valeurs):
        cellules = "".join(
            f'<c r="{colonne(i)}{n}" t="inlineStr"><is><t>{escape(v)}</t></is></c>'
            for i, v in enumerate(valeurs) if v
        )  # fmt: skip
        return f'<row r="{n}">{cellules}</row>'

    lignes_xml = "".join(ligne_xml(n, v) for n, v in enumerate([ENTETES, *lignes], start=1))
    m = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        feuilles = (
            f'<sheet name="SOMMAIRE" sheetId="1" r:id="rId1"/>'
            f'<sheet name="{feuille}" sheetId="2" r:id="rId2"/>'
        )
        z.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{m}" xmlns:r="{r}"><sheets>{feuilles}</sheets></workbook>',
        )
        relations = "http://schemas.openxmlformats.org/package/2006/relationships"
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            f'<Relationships xmlns="{relations}">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        )
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{m}"><sheetData>'
                   '<row r="1"><c r="A1" t="inlineStr"><is><t>Sommaire</t></is></c></row>'
                   "</sheetData></worksheet>")  # fmt: skip
        z.writestr(
            "xl/worksheets/sheet2.xml",
            f'<worksheet xmlns="{m}"><sheetData>{lignes_xml}</sheetData></worksheet>',
        )
    return tampon.getvalue()


@pytest.fixture
def produit(monde):
    return ref.creer_produit(monde["sn"], "Fictivol 10 mg")


def test_lecture_du_classeur_et_types_de_poste():
    lignes = lire_fichier(classeur())
    assert len(lignes) == 6 and lignes[0]["reseau"] == "RESEAU ALPHA"
    assert lignes[0]["ligne"] == 2 and lignes[2]["personne"] == "FATOU GUEYE NDIAYE"
    assert type_poste("VM OTC") == ("vm_otc", False)
    assert type_poste("KAM / OTC (assuré par les superviseurs)") == ("kam", True)
    assert type_poste("DERMO CONSEILLERE") == ("dermo", False)
    assert type_poste("CHAUFFEUR") == (None, False)


def test_la_simulation_n_ecrit_rien(monde, produit):
    """ORG-014 CA1 : créations comptées, rien d'écrit sauf le lot."""
    postes, comptes = Poste.objects.count(), Utilisateur.objects.count()
    lot = importer(monde["sn"], monde["admin.sn"], classeur(), "orga.xlsx", simulation=True)
    assert lot.statut == LotImport.Statut.SIMULE and lot.simulation
    assert lot.compteurs["postes"]["crees"] == 4
    assert lot.compteurs["reseaux"]["crees"] == 2
    assert (Poste.objects.count(), Utilisateur.objects.count()) == (postes, comptes)
    assert not Reseau.objects.filter(libelle="RESEAU ALPHA").exists()


def test_import_motifs_poste_vacant_et_reimport(monde, produit):
    """ORG-014 CA2 (motif de chaque rejet), CA3 (non pourvu → vacant), CA4 (réimport sans
    doublon)."""
    sn = monde["sn"]
    lot = importer(sn, monde["admin.sn"], classeur(), "orga.xlsx", simulation=False)
    assert lot.statut == LotImport.Statut.TERMINE
    # Lignes du fichier : la 5 n'a pas de réseau, la 6 a une fonction inconnue.
    rejets = {a["identifiant"]: a["motif"] for a in lot.anomalies if a["niveau"] == "rejet"}
    assert set(rejets) == {"5", "6"}
    assert "RESEAUX" in rejets["5"] and "Fonction inconnue" in rejets["6"]
    assert lot.compteurs["lignes"] == {"importees": 4, "rejetes": 2}
    # 1.0.9 [D] : un produit cité par le fichier et absent du référentiel est créé.
    assert lot.compteurs["produits"] == {"crees": 1}
    assert not any(a["entite"] == "produit" for a in lot.anomalies)

    alpha = Reseau.objects.get(libelle="RESEAU ALPHA")
    postes = Poste.objects.filter(reseaux=alpha)
    assert postes.count() == 2
    vacant = postes.get(secteurs__libelle="Thies")
    assert not Occupation.objects.filter(poste=vacant).exists()  # CA3
    occupe = postes.get(secteurs__libelle="Plateau/Medina")
    occupant = Occupation.objects.get(poste=occupe).utilisateur
    assert (occupant.username, occupant.first_name, occupant.last_name) == (
        "elhadj.faye", "Elhadj", "FAYE")  # fmt: skip
    superviseur = Rattachement.objects.get(poste=occupe).superviseur
    assert superviseur.username == "coumba.diallo"
    # Le KAM « assuré par les superviseurs » : le superviseur occupe le poste.
    kam = Poste.objects.get(type_poste="kam")
    assert Occupation.objects.get(poste=kam).utilisateur == superviseur
    assert PerimetreReseau.objects.filter(reseau=alpha, utilisateur__username="amadou.demba")
    assert {p.produit.libelle for p in portefeuille_actif([alpha], aujourdhui(sn))} == {
        "Fictivol 10 mg", "Produit Inconnu"}  # fmt: skip

    # CA4 : un réimport du même fichier ne crée rien de nouveau.
    avant = (Poste.objects.count(), Utilisateur.objects.count(), Occupation.objects.count(),
             Rattachement.objects.count(), Reseau.objects.count())  # fmt: skip
    second = importer(sn, monde["admin.sn"], classeur(), "orga.xlsx", simulation=False)
    apres = (Poste.objects.count(), Utilisateur.objects.count(), Occupation.objects.count(),
             Rattachement.objects.count(), Reseau.objects.count())  # fmt: skip
    assert apres == avant
    assert "crees" not in second.compteurs.get("postes", {})
    assert second.compteurs["postes"]["existants"] == 4
    assert EvenementAudit.objects.filter(action="import.organisation").count() == 2


def test_la_simulation_compte_les_modifications(monde, produit):
    """ORG-014 CA1 : sur une organisation déjà importée, la simulation compte aussi les
    modifications (nouveau superviseur, produit ajouté au portefeuille) sans rien écrire."""
    sn = monde["sn"]
    importer(sn, monde["admin.sn"], classeur(), "orga.xlsx", simulation=False)
    # Le premier import date d'un mois : un changement ne commence pas le jour même.
    Rattachement.objects.update(debut=aujourdhui(sn) - timedelta(days=30))
    ref.creer_produit(sn, "Fictivol 20 mg")
    change = [list(ligne) for ligne in LIGNES]
    change[0][5] = "DIEYNABA SECK"
    change[0][10] = "Fictivol 10 mg ; Fictivol 20 mg"
    alpha = Reseau.objects.get(libelle="RESEAU ALPHA")
    occupe = Poste.objects.get(reseaux=alpha, secteurs__libelle="Plateau/Medina")
    avant = (Poste.objects.count(), Utilisateur.objects.count(), Rattachement.objects.count())

    lot = importer(sn, monde["admin.sn"], classeur(change), "orga.xlsx", simulation=True)
    assert lot.statut == LotImport.Statut.SIMULE
    assert lot.compteurs["rattachements"]["modifies"] == 1
    assert lot.compteurs["portefeuilles"]["modifies"] == 1
    # Rien n'est écrit : ni le compte du nouveau superviseur, ni le rattachement, ni le produit.
    assert (Poste.objects.count(), Utilisateur.objects.count(),
            Rattachement.objects.count()) == avant  # fmt: skip
    assert not Utilisateur.objects.filter(username="dieynaba.seck").exists()
    en_cours = Rattachement.objects.filter(poste=occupe, fin__isnull=True).get()
    assert en_cours.superviseur.username == "coumba.diallo"
    assert {p.produit.libelle for p in portefeuille_actif([alpha], aujourdhui(sn))} == {
        "Fictivol 10 mg", "Produit Inconnu"}  # fmt: skip


def test_un_secteur_au_nom_long_s_importe_et_se_reimporte(monde):
    """1.0.9 : le fichier réel nomme des secteurs de plus de 120 caractères (plusieurs villes) ;
    la référence externe dépasse alors 80 caractères et reste stable au réimport (CA4)."""
    sn = monde["sn"]
    long = " / ".join(["QUARTIER FICTIF NUMERO " + str(i) for i in range(1, 7)])
    assert 120 < len(long) <= 200
    lignes = [[*LIGNES[0][:7], long, *LIGNES[0][8:]]]
    lot = importer(sn, monde["admin.sn"], classeur(lignes), "orga.xlsx", simulation=False)
    assert lot.compteurs["lignes"] == {"importees": 1}
    assert Poste.objects.filter(secteurs__libelle__iexact=long).count() == 1
    second = importer(sn, monde["admin.sn"], classeur(lignes), "orga.xlsx", simulation=False)
    assert second.compteurs["postes"] == {"existants": 1}
    assert Poste.objects.count() == 1


def test_api_import_organisation(monde, produit):
    from django.core.files.uploadedfile import SimpleUploadedFile

    admin = client_de(monde["admin.sn"])
    fichier = SimpleUploadedFile("orga.xlsx", classeur())
    r = admin.post("/api/v1/imports/organisation/", {"fichier": fichier, "simulation": "true"},
                   format="multipart")  # fmt: skip
    assert r.status_code == 201, r.content
    assert r.json()["source"] == "organisation" and r.json()["statut"] == "simule"
    illisible = admin.post(
        "/api/v1/imports/organisation/",
        {"fichier": SimpleUploadedFile("x.xlsx", b"pas un classeur"), "simulation": "true"},
        format="multipart",
    )
    assert illisible.status_code == 400 and illisible.json()["code"] == "fichier_invalide"
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post("/api/v1/imports/organisation/",
                   {"fichier": SimpleUploadedFile("o.xlsx", classeur()), "simulation": "true"},
                   format="multipart")  # fmt: skip
    assert r.status_code == 403


def test_commande_importer_organisation(monde, tmp_path, capsys):
    """1.0.9 : la même importation en ligne de commande ; le pays absent est créé."""
    from django.core.management import CommandError, call_command

    from apps.socle.models import Pays

    fichier = tmp_path / "orga.xlsx"
    fichier.write_bytes(classeur())
    auteur = monde["admin.sn"].username
    call_command("importer_organisation", str(fichier), pays="SN", auteur=auteur,
                 simulation=True)  # fmt: skip
    assert "Simulation terminée" in capsys.readouterr().out
    assert not Reseau.objects.filter(libelle="RESEAU ALPHA").exists()
    call_command("importer_organisation", str(fichier), pays="SN", auteur=auteur)
    assert Reseau.objects.filter(libelle="RESEAU ALPHA").exists()
    # Un pays du catalogue pas encore créé l'est d'abord.
    assert not Pays.objects.filter(code="CI").exists()
    call_command("importer_organisation", str(fichier), pays="CI", auteur=auteur,
                 simulation=True)  # fmt: skip
    assert Pays.objects.filter(code="CI").exists()
    with pytest.raises(CommandError, match="introuvable"):
        call_command("importer_organisation", str(tmp_path / "absent.xlsx"), pays="SN",
                     auteur=auteur)  # fmt: skip

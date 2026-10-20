"""Import du fichier de ventes (1.6.0) : simulation, réimport sans doublon, rejets motivés."""

import io
import zipfile
from datetime import date
from xml.sax.saxutils import escape

import pytest

from apps.audit.models import EvenementAudit
from apps.imports.models import LotImport, Source
from apps.perimetre.tests.conftest import client_de
from apps.ventes.importation import lire_mois
from apps.ventes.models import Client, SourceVente, Vente

pytestmark = pytest.mark.django_db

ENTETES = ["MOIS", "DELEGUE", "PRODUIT", "CLIENT", "TYPE CLIENT", "ZONE", "QUANTITE", "CA TTC"]


def classeur(lignes, entetes=ENTETES) -> bytes:
    """Classeur .xlsx minimal (chaînes en ligne), comme en produit Excel."""

    def colonne(i):
        return chr(65 + i)

    def ligne_xml(n, valeurs):
        cellules = "".join(
            f'<c r="{colonne(i)}{n}" t="inlineStr"><is><t>{escape(v)}</t></is></c>'
            for i, v in enumerate(valeurs)
            if v
        )
        return f'<row r="{n}">{cellules}</row>'

    corps = "".join(ligne_xml(n, v) for n, v in enumerate([entetes, *lignes], start=1))
    m = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        z.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{m}" xmlns:r="{r}"><sheets>'
            '<sheet name="VENTES" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        z.writestr(
            "xl/worksheets/sheet1.xml",
            f'<worksheet xmlns="{m}"><sheetData>{corps}</sheetData></worksheet>',
        )
    return tampon.getvalue()


PLATEAU, CARDIOL = "Pharmacie du Plateau", "Cardiol 10 mg"
LIGNES = [
    ["2025-01", "Gabriel Sn", CARDIOL, PLATEAU, "Pharmacie", "", "40", "400"],
    # Deux factures du même mois pour la même clé : elles s'additionnent.
    ["01/2025", "Gabriel Sn", CARDIOL, PLATEAU, "Pharmacie", "", "10", "1 100,50"],
    ["2025-02", "Moussa Fall", "Gynopril", "Clinique Nouvelle", "Grossiste", "Thiès", "5", "50"],
    ["2025-02", "Moussa Fall", "Gynopril", "Para Neuve", "Parapharmacie", "Atlantide", "3", "30"],
]  # fmt: skip


def _importer(admin, lignes, simulation, nom="ventes.xlsx"):
    return admin.post(
        "/api/v1/ventes/import/",
        {"fichier": io.BytesIO(classeur(lignes)), "simulation": str(simulation).lower()},
        format="multipart",
    )


def test_lire_mois():
    assert lire_mois("2025-03") == date(2025, 3, 1)
    assert lire_mois("2025-03-17") == date(2025, 3, 1)
    assert lire_mois("03/2025") == date(2025, 3, 1)
    assert lire_mois("17/03/2025") == date(2025, 3, 1)
    assert lire_mois("45717") == date(2025, 3, 1)  # numéro de série Excel
    assert lire_mois("2025-13") is None
    assert lire_mois("mars") is None


def test_une_simulation_ne_ecrit_rien(monde, ventes):
    avant = Vente.objects.count()
    reponse = _importer(client_de(monde["admin.sn"], "SN"), LIGNES, True)
    assert reponse.status_code == 201, reponse.content
    lot = reponse.json()
    assert lot["statut"] == "simule"
    assert lot["compteurs"]["ventes"] == {"crees": 2, "remplacees": 1}
    assert Vente.objects.count() == avant
    assert not Client.objects.filter(nom="Clinique Nouvelle").exists()


def test_l_import_cree_les_lignes_les_clients_et_ne_double_pas(monde, ventes):
    admin = client_de(monde["admin.sn"], "SN")
    lot = _importer(admin, LIGNES, False).json()
    assert lot["statut"] == "termine"
    assert lot["compteurs"]["ventes"] == {"crees": 2, "remplacees": 1}
    assert lot["compteurs"]["clients"] == {"crees": 2}
    ligne = Vente.objects.get(mois=date(2025, 1, 1), client=ventes["pharmacie"], source="import")
    # La ligne saisie du fichier de démonstration est remplacée, et les deux factures cumulées.
    assert (ligne.quantite, str(ligne.montant_ttc)) == (50, "1500.50")
    assert ligne.source == SourceVente.IMPORT
    assert Client.objects.get(nom="Clinique Nouvelle").zone == ventes["thies"]
    # « Atlantide » n'existe pas : le client est créé sans zone, avec un avertissement.
    assert Client.objects.get(nom="Para Neuve").zone is None
    assert any("Atlantide" in a["motif"] for a in lot["anomalies"])
    assert EvenementAudit.objects.filter(action="import.ventes").exists()
    # Le même fichier une seconde fois remplace, il n'ajoute pas.
    total = Vente.objects.filter(archive_le__isnull=True).count()
    second = _importer(admin, LIGNES, False).json()
    assert second["compteurs"]["ventes"] == {"remplacees": 3}
    assert Vente.objects.filter(archive_le__isnull=True).count() == total
    assert LotImport.objects.filter(source=Source.VENTES).count() == 2


def test_les_lignes_fausses_sont_rejetees_avec_leur_motif(monde, ventes):
    lignes = [
        ["peut-être", "Gabriel Sn", "Cardiol 10 mg", "X", "Pharmacie", "", "1", "1"],
        ["2025-01", "Inconnu Total", "Cardiol 10 mg", "X", "Pharmacie", "", "1", "1"],
        ["2025-01", "Gabriel Sn", "Produit fantôme", "X", "Pharmacie", "", "1", "1"],
        ["2025-01", "Gabriel Sn", "Cardiol 10 mg", "X", "Cabinet", "", "1", "1"],
        ["2025-01", "Gabriel Sn", "Cardiol 10 mg", "", "Pharmacie", "", "1", "1"],
        ["2025-01", "Gabriel Sn", "Cardiol 10 mg", "X", "Pharmacie", "", "1,5", "1"],
        ["2025-01", "Gabriel Sn", "Cardiol 10 mg", "X", "Pharmacie", "", "1", "beaucoup"],
        ["2025-05", "Gabriel Sn", "Cardiol 10 mg", "Bonne", "Pharmacie", "", "7", "70"],
    ]
    lot = _importer(client_de(monde["admin.sn"], "SN"), lignes, False).json()
    assert lot["rejets"] == 7
    motifs = " | ".join(a["motif"] for a in lot["anomalies"])
    for morceau in ("Mois illisible", "Délégué inconnu", "Produit inconnu", "Type de client",
                    "Client manquant", "nombre entier", "pas un nombre"):  # fmt: skip
        assert morceau in motifs
    # Un produit absent du référentiel n'est jamais créé ; la bonne ligne passe.
    assert lot["compteurs"]["ventes"]["crees"] == 1
    assert Vente.objects.filter(mois=date(2025, 5, 1)).count() == 1


def test_un_fichier_au_mauvais_format_est_refuse(monde, ventes):
    admin = client_de(monde["admin.sn"], "SN")
    reponse = admin.post(
        "/api/v1/ventes/import/", {"fichier": io.BytesIO(b"pas un classeur")}, format="multipart"
    )
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "fichier_invalide"
    sans_colonnes = classeur([["a", "b"]], entetes=["X", "Y"])
    reponse = admin.post(
        "/api/v1/ventes/import/", {"fichier": io.BytesIO(sans_colonnes)}, format="multipart"
    )
    assert reponse.status_code == 400
    assert "format du fichier de ventes" in reponse.json()["message"]


def test_seul_l_administrateur_pays_importe(monde, ventes):
    for alias in ("sup.sn", "df.sn", "resp.sn"):
        assert _importer(client_de(monde[alias], "SN"), LIGNES, True).status_code == 403

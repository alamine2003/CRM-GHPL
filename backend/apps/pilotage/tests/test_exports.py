# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.8 : RPT-019, DSH-008, exports contrôlés et audités.

CA1 : l'export ne contient que le périmètre de l'utilisateur. CA2 : chaque export crée un
événement d'audit (filtres, nombre de lignes)."""

import csv
import io
import zipfile

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.rapports.models import Rapport
from apps.rapports.tests.test_rapport import portefeuille  # noqa: F401
from apps.rapports.tests.test_validation import soumettre

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/export/"


def exporter(monde, qui, **parametres):
    with freeze_time("2026-10-15 12:00"):
        return client_de(monde[qui]).get(URL, parametres)


def lire_csv(reponse) -> list[list[str]]:
    texte = reponse.content.decode("utf-8")
    assert texte.startswith("﻿")  # BOM : Excel lit l'UTF-8
    return list(csv.reader(io.StringIO(texte[1:]), delimiter=";"))


def test_rpt019_ca2_indicateurs_en_csv_audites(monde, semaine):
    r = exporter(monde, "resp.sn", periode="30j")
    assert r.status_code == 200, r.content
    assert r["Content-Type"].startswith("text/csv")
    assert r["Content-Disposition"].startswith('attachment; filename="indicateurs-sn-')
    entete, *lignes = lire_csv(r)
    assert entete[:4] == ["Délégué", "Poste", "Visites prévues échues", "Visites faites"]
    (ligne,) = [x for x in lignes if x[0] == "Deleg Sn"] or lignes[:1]
    assert ligne[3] == "1"
    e = EvenementAudit.objects.get(action="export.indicateurs")
    assert (e.acteur, e.pays.code) == (monde["resp.sn"], "SN")
    assert e.details["lignes"] == len(lignes) and e.details["format"] == "csv"
    assert e.details["periode"] == "30j"


def test_rpt019_rapports_soumis_et_texte_neutralise(monde, semaine, portefeuille):
    rapport = soumettre(monde, semaine["faite"], [portefeuille[0]])
    Rapport.objects.filter(pk=rapport.pk).update(resume='=HYPERLINK("http://exemple")')
    r = exporter(monde, "sup.sn", contenu="rapports", periode="30j")
    assert r.status_code == 200, r.content
    entete, *lignes = lire_csv(r)
    assert entete[0] == "Date de la visite" and entete[-1] == "Résumé"
    (ligne,) = lignes
    assert ligne[0] == semaine["faite"].date.isoformat()
    assert ligne[4] == "Soumis"
    assert ligne[5] == "2026-10-13 20:00"  # à l'heure du pays
    # Une cellule qui commence par « = » n'est pas une formule pour le tableur.
    assert ligne[-1] == '\'=HYPERLINK("http://exemple")'
    e = EvenementAudit.objects.get(action="export.rapports")
    assert e.details["lignes"] == 1


def test_rpt019_ca1_le_perimetre_seulement(monde, semaine, portefeuille):
    soumettre(monde, semaine["faite"], [portefeuille[0]])
    # Le DM sans réseau ne pilote personne : un export vide, mais audité.
    entete, *lignes = lire_csv(exporter(monde, "dm.sn", contenu="rapports", periode="30j"))
    assert lignes == []
    assert EvenementAudit.objects.get(action="export.rapports").details["lignes"] == 0
    # Le délégué n'exporte pas ; l'administrateur pays non plus (il ne pilote pas).
    assert exporter(monde, "deleg.sn").status_code == 403
    assert exporter(monde, "admin.sn").status_code == 403


def test_dsh008_classeur_excel(monde, semaine):
    r = exporter(monde, "resp.sn", fichier="xlsx", periode="30j")
    assert r.status_code == 200, r.content
    assert r["Content-Type"].startswith("application/vnd.openxmlformats")
    with zipfile.ZipFile(io.BytesIO(r.content)) as classeur:
        noms = set(classeur.namelist())
        assert {"[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"} <= noms
        feuille = classeur.read("xl/worksheets/sheet1.xml").decode()
        assert "Délégué" in feuille and 'state="frozen"' in feuille
        assert "Indicateurs" in classeur.read("xl/workbook.xml").decode()
    assert EvenementAudit.objects.get(action="export.indicateurs").details["format"] == "xlsx"

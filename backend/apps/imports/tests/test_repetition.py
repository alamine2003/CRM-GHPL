"""0.9.6 : migration BirdNotes à blanc (PRP-013, prd.md §14.7).

Sur un export entièrement fictif, à la structure du vrai : simulation, import, second import
sans rien recréer, rapprochement table par table sans écart inexpliqué."""

import json

import pytest

from apps.imports.fictif import export_fictif
from apps.imports.repetition import repeter
from apps.prospects.models import Prospect

pytestmark = pytest.mark.django_db


def test_l_export_fictif_a_la_structure_du_vrai():
    donnees = export_fictif(prospects=40)["donnees"]
    assert {
        "Secteurs",
        "Localites",
        "Gammes",
        "Produits",
        "Portefeuille",
        "Etablissements",
        "Prospects",
        "Prospects en attente",
        "Doublons prospects",
    } <= donnees.keys()
    assert len(donnees["Prospects"]) == 40
    # Les défauts du vrai fichier y sont : potentiels hors A/B/C, titres, fiches sans nom.
    lignes = export_fictif(prospects=600)["donnees"]["Prospects"]
    assert any(x["Potentiel"] in ("X", "D", "BB") for x in lignes)
    assert any(x["Prénom"] == "DR" for x in lignes)
    assert any(not x["Nom"] for x in lignes)
    assert export_fictif(prospects=40) == export_fictif(prospects=40)  # reproductible


def test_la_repetition_importe_une_fois_et_rapproche_tout(monde):
    contenu = json.dumps(export_fictif(prospects=60)).encode()
    r = repeter(monde["sn"], monde["admin.sn"], contenu, "export-fictif.json")
    assert r.crees["prospects"] > 0 and Prospect.objects.filter(pays=monde["sn"]).exists()
    # Un second import ne crée rien : chaque ligne est reconnue par son identifiant.
    assert r.recrees == {}
    assert all(x["ecart"] == 0 for x in r.rapprochement), r.rapprochement
    assert r.conforme

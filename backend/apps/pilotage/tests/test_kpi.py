# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.9.7 : indicateurs de succès du pilote (prd.md §5, §21.2 condition 4)."""

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command
from freezegun import freeze_time

from apps.identite.models import JourDeContact
from apps.pilotage.kpi import kpi

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db


def test_kpi_du_pilote_sur_la_semaine(monde, semaine):
    gabriel = monde["deleg.sn"]
    for jour in (12, 13, 14):  # trois jours de synchronisation : adopté (KPI-05)
        JourDeContact.objects.create(utilisateur=gabriel, jour=date(2026, 10, jour))
    with freeze_time("2026-10-15 12:00"):
        r = kpi(monde["sn"], date(2026, 10, 12), date(2026, 10, 18))
    par_code = {x["code"]: x for x in r["indicateurs"]}
    assert r["delegues"] == 1
    assert set(par_code) == {"KPI-01", "KPI-02", "KPI-03", "KPI-04", "KPI-05", "KPI-06",
                             "KPI-07", "KPI-09"}  # fmt: skip
    # Le même calcul que le tableau de pilotage : 1 visite faite sur 3 échues.
    assert par_code["KPI-03"]["valeur"] == 0.333 and par_code["KPI-03"]["atteinte"] is False
    assert par_code["KPI-05"]["valeur"] == 1.0 and par_code["KPI-05"]["atteinte"] is True
    assert r["adoption"][0]["actifs"] == 1
    # KPI-06 ne se lit pas dans les données : la suite d'isolation le prouve.
    assert par_code["KPI-06"]["valeur"] is None


def test_rapport_pilote_en_ligne_de_commande(monde, semaine):
    sortie = StringIO()
    with freeze_time("2026-10-15 12:00"):
        call_command("rapport_pilote", "--pays", "SN", "--du", "2026-10-12", "--au",
                     "2026-10-18", stdout=sortie)  # fmt: skip
    texte = sortie.getvalue()
    assert "KPI-01" in texte and "KPI-09" in texte and "1 délégué\n" in texte

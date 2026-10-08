# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.8.1 : OFF-001, l'historique des 3 dernières visites par prospect de la liste cible, en une
lecture, pour travailler sans réseau ; RPT-011 CA1 : un délégué n'y lit que ses rapports."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.perimetre.tests.conftest import client_de
from apps.planning.models import Visite
from apps.prospects import ciblage
from apps.prospects.models import Cible
from apps.rapports.models import Rapport

from .test_chronologie import soumis  # noqa: F401
from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/synchro/historique/"


@pytest.fixture
def cible(monde, terrain):
    with freeze_time("2026-01-01 08:00"):
        ciblage.ajouter(terrain["poste"], [terrain["medecin"]], monde["admin.sn"])
    return Cible.objects.get(poste=terrain["poste"], prospect=terrain["medecin"])


def anciennes(monde, soumis, n):
    """`n` rapports plus anciens, sur des copies de la visite (une par jour)."""
    for jour in range(1, n + 1):
        v = Visite.objects.get(pk=soumis.pk)
        v.pk, v._state.adding = None, True
        v.date = date(2026, 9, jour)
        v.save()
        Rapport.objects.create(
            pays=monde["sn"], visite=v, delegue=monde["deleg.sn"], statut="valide",
            soumis_le=f"2026-09-{jour:02d}T18:00:00Z",
        )  # fmt: skip


@freeze_time("2026-10-14 08:00")
def test_off001_les_trois_derniers_rapports_de_la_liste_cible(monde, terrain, soumis, cible):
    anciennes(monde, soumis, 4)
    r = client_de(monde["deleg.sn"]).get(URL)
    assert r.status_code == 200, r.content
    (prospect,) = r.json()["prospects"]
    assert prospect["prospect"] == str(terrain["medecin"].pk)
    dates = [x["date"] for x in prospect["rapports"]]
    assert dates == ["2026-10-13", "2026-09-04", "2026-09-03"]
    assert prospect["rapports"][0]["presentations"][0]["libelle"] == "Cardiol"


@freeze_time("2026-10-14 08:00")
def test_off001_hors_liste_cible_rien_et_rpt011_ca1(monde, terrain, soumis, cible):
    # Retiré de la liste : plus d'historique emporté.
    Cible.objects.filter(pk=cible.pk).update(fin=date(2026, 10, 1))
    assert client_de(monde["deleg.sn"]).get(URL).json()["prospects"] == []
    # Un autre délégué, le même prospect dans sa liste : il ne lit pas les rapports du collègue.
    Cible.objects.filter(pk=cible.pk).update(fin=None)
    from apps.organisation import services as org

    autre = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(autre, Role.DELEGUE, monde["sn"], par=None)
    poste = org.creer_poste(monde["sn"], "vm", "VM Médina", [terrain["cardio"]],
                            list(terrain["poste"].secteurs.all()))  # fmt: skip
    org.occuper(poste, autre, date(2026, 1, 1))
    with freeze_time("2026-01-01 08:00"):
        ciblage.ajouter(poste, [terrain["medecin"]], monde["admin.sn"])
    assert client_de(autre).get(URL).json()["prospects"] == []

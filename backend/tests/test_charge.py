"""0.9.4 : NFR-001, NFR-002, DC-56 — charge et temps de réponse.

La mesure complète se fait sur une base de 500 délégués (`mesurer_charge`, docs/charge.md ;
`generer_charge` retirée en 1.0.8). Ici, à chaque livraison : l'outil de mesure tourne sur la démonstration, et le
nombre de requêtes des écrans qui grandissent avec le pays (pilotage) ne dépend pas du nombre
de délégués."""

from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.demonstration.generateur import Generateur, Volumes
from apps.identite.models import Utilisateur
from apps.planning.models import Planning
from apps.socle.mesure_charge import mesurer
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

pytestmark = pytest.mark.django_db


@pytest.fixture
def demonstration():
    return Generateur("Demo-" + "x9Y" * 6).tout(Volumes().reduits(0.1))


def test_nfr002_la_mesure_couvre_les_ecrans_de_chaque_role(demonstration):
    resultats = mesurer(Pays.objects.get(code="SN"), par_role=2, repetitions=1)
    attendues = {"programme", "semaine", "synchro_rapports", "a_traiter", "pilotage_equipe",
                 "pilotage_pays", "prospects", "audit"}  # fmt: skip
    assert attendues <= resultats.keys()
    for route, r in resultats.items():
        # Marge large en CI : la cible de 500 ms se vérifie sur la base de charge.
        assert r["p95"] < 3000, (route, r)


def test_nfr001_le_pilotage_ne_fait_pas_plus_de_requetes_avec_plus_de_delegues(demonstration):
    from apps.pilotage.indicateurs import Lot

    pays = Pays.objects.get(code="SN")
    fin = aujourdhui(pays)
    debut = fin - timedelta(weeks=4)
    # Un délégué en poste, aux semaines approuvées dans la fenêtre, d'abord : les deux lots
    # lisent alors les mêmes tables (une table sans ligne à lire n'est pas interrogée).
    approuve = Utilisateur.objects.get(
        pk=Planning.objects.filter(versions__decision="approuve", semaine__gte=debut,
                                   semaine__lte=fin, delegue__occupations__fin__isnull=True)
        .order_by("delegue_id").values("delegue_id")[:1]
    )  # fmt: skip
    autres = list(Utilisateur.objects.filter(pk__in=Planning.objects.values("delegue_id"))
                  .exclude(pk=approuve.pk))  # fmt: skip
    delegues = [approuve, *autres]
    assert len(delegues) >= 2

    def requetes(liste):
        with CaptureQueriesContext(connection) as capture:
            Lot(pays, liste, debut, fin)
        return len(capture)

    assert requetes(delegues[:1]) == requetes(delegues)

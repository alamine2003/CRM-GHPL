"""0.8.8 : OFF-006, réseau faible. Les réponses JSON de l'API sont compressées (sauf `/auth/`,
BREACH) ; une synchronisation quotidienne typique pèse moins de 500 Ko hors pièces jointes (CA1).
Les envois partent déjà un par un et reprennent où ils se sont arrêtés (file du téléphone,
0.2.7, 0.8.3)."""

import gzip

import pytest
from django.core.management import call_command

from apps.demonstration.generateur import Generateur, Volumes
from apps.identite.models import Utilisateur
from apps.perimetre.tests.conftest import client_de
from apps.socle.mesure_synchro import SEUIL_OCTETS, mesurer

pytestmark = pytest.mark.django_db

#: Une liste cible chargée : au-delà de ce que porte un délégué aujourd'hui [H].
CIBLES_CHARGEES = 300


def test_off006_le_json_de_l_api_est_compresse(monde):
    c = client_de(monde["admin.sn"])
    r = c.get("/api/v1/referentiel/valeurs/", HTTP_ACCEPT_ENCODING="gzip")
    assert r.status_code == 200 and r["Content-Encoding"] == "gzip"
    assert gzip.decompress(r.content).startswith(b"[")
    # Sans « Accept-Encoding », la réponse part telle quelle.
    assert not c.get("/api/v1/referentiel/valeurs/").has_header("Content-Encoding")


def test_off006_les_routes_d_authentification_ne_le_sont_jamais(monde):
    c = client_de(monde["deleg.sn"])
    r = c.get("/api/v1/auth/preferences/notifications/", HTTP_ACCEPT_ENCODING="gzip")
    assert r.status_code == 200 and not r.has_header("Content-Encoding")


def test_off006_ca1_une_synchronisation_quotidienne_pese_moins_de_500_ko():
    bilan = Generateur("Demo-" + "x9Y" * 6).tout(Volumes().reduits(0.1))
    delegue = Utilisateur.objects.get(username=bilan.comptes["delegue (SN)"])
    m = mesurer(delegue)
    routes = m["routes"]
    assert {"programme", "semaine", "detail_visite", "liste_cible", "historique",
            "rapports", "mes_chiffres"} <= routes.keys()  # fmt: skip
    assert routes["detail_visite"][0] >= 5 and m["compresse"] < SEUIL_OCTETS
    # Projection sur une liste cible chargée : ce qui grandit avec elle (liste, historique).
    from apps.organisation.models import Occupation
    from apps.prospects.models import Cible

    postes = Occupation.objects.filter(utilisateur=delegue).values("poste")
    cibles = Cible.objects.filter(poste__in=postes, fin__isnull=True).count()
    par_cible = (routes["liste_cible"][2] + routes["historique"][2]) / max(cibles, 1)
    projete = m["compresse"] + par_cible * max(CIBLES_CHARGEES - cibles, 0)
    assert projete < SEUIL_OCTETS, f"{projete / 1024:.0f} Ko projetés"


def test_off006_la_commande_affiche_le_detail(monde, capsys):
    call_command("mesurer_synchro", monde["deleg.sn"].username)
    sortie = capsys.readouterr().out
    assert "Total" in sortie and "seuil 500.0 Ko" in sortie

"""PLN-011 : le superviseur dispose d'une file des plannings en attente.
CA1 : la file est triée par ancienneté de soumission et affiche les alertes.

Il y voit les plannings soumis des délégués dont un poste occupé cette semaine-là lui est
rattaché, avec leurs signalements et leurs activités connexes expliquées (PLN-018)."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services

pytestmark = pytest.mark.django_db

FILE = "/api/v1/plannings/a-valider/"
LUNDI = date(2026, 10, 12)
MARDI = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def collegue(monde, terrain):
    """Un second délégué, sur un second poste du même superviseur."""
    utilisateur = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(utilisateur, Role.DELEGUE, monde["sn"], par=None)
    poste = org.creer_poste(monde["sn"], "vm", "VM Plateau 2", [terrain["cardio"]],
                            [terrain["secteur"]])  # fmt: skip
    org.occuper(poste, utilisateur, date(2026, 1, 1))
    org.rattacher(poste, monde["sup.sn"], date(2026, 1, 1))
    return utilisateur


def soumis(planning, terrain, **activite):
    services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), prospect=terrain["medecin"],
                            etablissement=terrain["clinique"], objectif="Vasculor")  # fmt: skip
    if activite:
        services.declarer_absence(planning, date=LUNDI, **activite)
    return services.soumettre(planning)


def test_pln011_ca1_la_file_suit_l_anciennete_et_dit_les_alertes(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    autre = collegue(monde, terrain)
    with freeze_time("2026-10-07 10:00"):
        recent = soumis(terrain["planning"], terrain, type="commando",
                        commentaire="Commando à Mbour, lancement produit")  # fmt: skip
    with freeze_time("2026-10-06 16:00"):
        ancien = soumis(services.creer_planning(monde["sn"], autre, LUNDI), terrain)
    # Un planning en préparation n'est pas dans la file.
    services.creer_planning(monde["sn"], autre, date(2026, 10, 19))
    file = client_de(monde["sup.sn"]).get(FILE).json()
    assert [ligne["planning"]["id"] for ligne in file] == [str(ancien.pk), str(recent.pk)]
    premier, second = file
    assert premier["delegue"] == {"id": str(autre.pk), "prenom": "Awa", "nom": "FICTIVE"}
    assert premier["postes"] == ["VM Plateau 2"] and premier["visites"] == 1
    # Les alertes : chaque code de signalement avec son nombre.
    assert {"code": "seuil_bas", "nombre": 5} in premier["signalements"]
    # L'activité connexe et son explication (PLN-018).
    (activite,) = second["activites"]
    assert (activite["type"], activite["commentaire"], activite["avec_visites"]) == (
        "commando", "Commando à Mbour, lancement produit", True)  # fmt: skip


def test_seuls_les_postes_rattaches_entrent_dans_la_file(monde, terrain):
    """Sans rattachement à ce superviseur, le planning va ailleurs ; le délégué n'a pas de file."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    soumis(terrain["planning"], terrain)
    assert len(client_de(monde["sup.sn"]).get(FILE).json()) == 1
    assert client_de(monde["sup.tg"]).get(FILE).json() == []
    assert client_de(monde["deleg.sn"]).get(FILE).status_code == 403

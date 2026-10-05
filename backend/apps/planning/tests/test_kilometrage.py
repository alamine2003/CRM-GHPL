"""PLN-010 : kilométrage estimé de la semaine, sans montant. CA1 : calculé à partir des
coordonnées des établissements (à vol d'oiseau [H]). CA2 : aucun montant de frais."""

from datetime import date, time
from decimal import Decimal

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.planning import kilometrage, services
from apps.prospects.services import creer_etablissement, creer_exercice, creer_prospect

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def lieu(monde, terrain, nom, lat=None, lon=None):
    return creer_etablissement(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, secteur=terrain["secteur"],
        type=valeur(monde, "type_etablissement", "clinique"),
        latitude=Decimal(lat) if lat else None, longitude=Decimal(lon) if lon else None,
    )  # fmt: skip


def medecin(monde, nom, etablissement):
    fiche = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, potentiel="B",
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip
    creer_exercice(fiche, etablissement, monde["admin.sn"])
    return fiche


def test_la_distance_a_vol_d_oiseau():
    # Dakar Plateau → Thiès : environ 58 km à vol d'oiseau.
    assert 55 < kilometrage.distance_km((14.6708, -17.4381), (14.7910, -16.9359)) < 60
    assert kilometrage.distance_km((14.7, -17.4), (14.7, -17.4)) == 0


def test_ca1_le_kilometrage_suit_l_ordre_de_la_journee(monde, terrain):
    plateau = lieu(monde, terrain, "Clinique Plateau", "14.670800", "-17.438100")
    thies = lieu(monde, terrain, "Hôpital Thiès", "14.791000", "-16.935900")
    flou = lieu(monde, terrain, "Cabinet sans coordonnées")
    p = terrain["planning"]
    for heure, nom, endroit in ((9, "Ba", plateau), (11, "Sy", thies), (15, "Ka", plateau),
                                (16, "Lo", flou)):  # fmt: skip
        services.ajouter_visite(p, date=MARDI, heure=time(heure, 0), etablissement=endroit,
                                prospect=medecin(monde, nom, endroit))  # fmt: skip
    km = kilometrage.estimer(p)
    (jour,) = km.jours
    # Plateau → Thiès → Plateau : deux fois ~58 km ; le cabinet sans coordonnées est compté à part.
    assert 110 < jour.km < 120 and jour.sans_coordonnees == 1
    assert [e.km is None for e in jour.etapes] == [True, False, False, True]
    assert km.total_km == jour.km


def test_un_passage_compte_pour_un_seul_arret(monde, terrain):
    plateau = lieu(monde, terrain, "Clinique Plateau", "14.670800", "-17.438100")
    thies = lieu(monde, terrain, "Hôpital Thiès", "14.791000", "-16.935900")
    p = terrain["planning"]
    a = services.ajouter_visite(p, date=MARDI, heure=time(9, 0), etablissement=thies,
                                prospect=medecin(monde, "Ba", thies))  # fmt: skip
    b = services.ajouter_visite(p, date=MARDI, etablissement=thies,
                                prospect=medecin(monde, "Sy", thies))  # fmt: skip
    services.regrouper(p, [a, b])
    services.ajouter_visite(p, date=MARDI, heure=time(15, 0), etablissement=plateau,
                            prospect=medecin(monde, "Ka", plateau))  # fmt: skip
    (jour,) = kilometrage.estimer(p).jours
    assert [e.km for e in jour.etapes][:2] == [None, 0.0]
    assert 55 < jour.km < 60


def test_ca2_la_semaine_donne_des_kilometres_jamais_un_montant(monde, terrain):
    services.ajouter_visite(terrain["planning"], date=MARDI, prospect=terrain["medecin"],
                            etablissement=terrain["clinique"])  # fmt: skip
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    km = semaine["kilometrage"]
    assert set(km) == {"total_km", "sans_coordonnees", "jours"}
    assert km["jours"][0]["date"] == "2026-10-13"
    assert "montant" not in str(semaine) and "frais" not in str(semaine)

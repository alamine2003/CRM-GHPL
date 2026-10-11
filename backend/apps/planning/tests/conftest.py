"""Terrain commun aux tests du planning : un délégué sur un poste du réseau Cardio, sa semaine
du 12 octobre 2026 en préparation, un médecin qui exerce dans une clinique."""

from datetime import date

import pytest

from apps.organisation import services as org
from apps.perimetre.tests.conftest import _courriels_immediats, api, monde  # noqa: F401
from apps.planning import services
from apps.prospects.services import creer_etablissement, creer_exercice, creer_prospect
from apps.referentiel.models import Valeur

SEMAINE = "/api/v1/plannings/semaine/"


def valeur(monde, liste, code, pays="sn"):  # noqa: F811
    return Valeur.objects.get(pays=monde[pays], liste=liste, code=code)


@pytest.fixture
def terrain(monde):  # noqa: F811
    """Un délégué sur un poste du réseau Cardio, sa semaine du 12 octobre en préparation, un
    médecin qui exerce dans une clinique."""
    sn, admin = monde["sn"], monde["admin.sn"]
    division = org.creer_division(sn, "CAR", "Cardiologie")
    cardio = org.creer_reseau(sn, division, "CAR1", "Cardio")
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Dakar"), "Plateau")
    poste = org.creer_poste(sn, "vm", "VM Plateau", [cardio], [secteur])
    org.occuper(poste, monde["deleg.sn"], date(2026, 1, 1))
    planning = services.creer_planning(sn, monde["deleg.sn"], date(2026, 10, 12))
    medecin = creer_prospect(
        sn, admin, actif=True, nom="Ndiaye", prenom="Awa", potentiel="A",
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip
    clinique = creer_etablissement(
        sn, admin, actif=True, nom="Clinique du Cap", secteur=secteur,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    creer_exercice(medecin, clinique, admin)
    return {"planning": planning, "poste": poste, "cardio": cardio, "division": division,
            "medecin": medecin, "clinique": clinique, "secteur": secteur}  # fmt: skip

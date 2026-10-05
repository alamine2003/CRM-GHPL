"""PLN-018 : activités connexes (0.3.1). L'activité principale et obligatoire du délégué, ce
sont les visites ; un commando, un déplacement (justifié ou demandé par le superviseur) ou un
accompagnement du superviseur se déclarent dans le planning, avec leur explication.

CA1 : une activité avec visites exige une explication ; ses visites hors secteur ou hors liste
cible ne sont pas signalées comme anomalies.
CA2 : elle ne réduit pas l'objectif du jour ; une absence (congé, maladie…) le réduit toujours.
"""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import controles, services
from apps.prospects.services import creer_etablissement, creer_exercice

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
MERCREDI = date(2026, 10, 14)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def declarer(monde, terrain, **corps):
    return client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/absences/", corps, format="json"
    )


def hors_secteur(monde, terrain, jour):
    """Une visite dans un hôpital d'un autre secteur, ce jour-là."""
    ailleurs = org.creer_secteur(monde["sn"], org.creer_zone(monde["sn"], f"Zone {jour}"),
                                 f"Secteur {jour}")  # fmt: skip
    hopital = creer_etablissement(
        monde["sn"], monde["admin.sn"], actif=True, nom=f"Hôpital {jour}", secteur=ailleurs,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    creer_exercice(terrain["medecin"], hopital, monde["admin.sn"])
    return services.ajouter_visite(
        terrain["planning"], date=jour, heure=time(9, 0), prospect=terrain["medecin"],
        etablissement=hopital, objectif="Vasculor",
    )  # fmt: skip


def test_ca1_un_commando_s_explique(monde, terrain):
    r = declarer(monde, terrain, date=str(MARDI), type="commando")
    assert r.status_code == 400 and r.json()["code"] == "explication_requise"
    explication = "Commando à Mbour avec l'équipe de Thiès, lancement produit"
    r = declarer(monde, terrain, date=str(MARDI), type="commando", commentaire=explication)
    assert r.status_code == 201, r.content
    assert (r.json()["avec_visites"], r.json()["demande_superviseur"]) == (True, False)


def test_ca1_les_visites_d_un_jour_de_deplacement_ne_sont_pas_des_anomalies(monde, terrain):
    couverte = hors_secteur(monde, terrain, MARDI)
    signalee = hors_secteur(monde, terrain, MERCREDI)
    services.declarer_absence(terrain["planning"], date=MARDI, type="deplacement",
                              commentaire="Aide à un collègue à Mbour",
                              demande_superviseur=True)  # fmt: skip
    hors = [a for a in controles.signalements(terrain["planning"])
            if a.code in ("hors_secteur", "hors_cible")]  # fmt: skip
    assert {v for a in hors for v in a.visites} == {str(signalee.pk)}
    assert str(couverte.pk) not in {v for a in hors for v in a.visites}
    # Le superviseur lit l'activité, son explication et qui l'a demandée.
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    (activite,) = semaine["absences"]
    assert activite == activite | {"type": "deplacement", "demande_superviseur": True,
                                   "commentaire": "Aide à un collègue à Mbour"}  # fmt: skip


def test_ca2_une_activite_avec_visites_ne_reduit_pas_l_objectif(monde, terrain):
    services.declarer_absence(terrain["planning"], date=MARDI, type="accompagnement",
                              commentaire="Double visite avec le superviseur")  # fmt: skip
    assert services.part_travaillee(terrain["planning"], MARDI) == 1.0
    # La journée reçoit ses visites ; un congé la vide, lui.
    services.ajouter_visite(terrain["planning"], date=MARDI, heure=time(9, 0),
                            prospect=terrain["medecin"], etablissement=terrain["clinique"],
                            objectif="Vasculor")  # fmt: skip
    services.declarer_absence(terrain["planning"], date=MERCREDI, type="conge")
    assert services.part_travaillee(terrain["planning"], MERCREDI) == 0.0
    objectifs = {o.date: o for o in controles.bilan(terrain["planning"]).objectifs}
    assert MERCREDI not in objectifs and objectifs[MARDI].min == 6


def test_seul_un_deplacement_se_dit_demande_par_le_superviseur(terrain):
    commando = services.declarer_absence(
        terrain["planning"], date=MARDI, type="commando", commentaire="Commando",
        demande_superviseur=True,
    )  # fmt: skip
    assert commando.demande_superviseur is False

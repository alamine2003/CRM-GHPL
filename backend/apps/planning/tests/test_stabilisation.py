"""Stabilisation du cycle 0.2 (0.2.9) : défauts trouvés à la revue du planning.

- PLN-001 CA2, RG-022 : une visite restée sur un jour devenu férié, ou d'absence toute la
  journée, bloque la soumission (`jour_non_planifiable`).
- Les commandes relisent le statut du planning sous verrou : une soumission ne se croise pas
  avec le rejeu de la file du téléphone.
- Les changements en série (ordre, passage) gardent version et journal des changements.
"""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import controles, services
from apps.planning.models import Planning
from apps.prospects.services import creer_etablissement, creer_exercice
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import JournalChangement

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db

JEUDI = date(2026, 10, 15)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def visite(terrain, jour=JEUDI, heure=time(9, 30)):
    return services.ajouter_visite(
        terrain["planning"], date=jour, heure=heure, prospect=terrain["medecin"],
        etablissement=terrain["clinique"], objectif="Vasculor",
    )  # fmt: skip


def test_pln001_ca2_une_visite_sur_un_jour_devenu_ferie_bloque_la_soumission(monde, terrain):
    v = visite(terrain)
    assert controles.bloquants(terrain["planning"]) == []
    # La fête est annoncée après la pose de la visite.
    services.creer_jour_ferie(monde["sn"], date=JEUDI, libelle="Fête fictive", variable=True)
    (anomalie,) = controles.bloquants(terrain["planning"])
    assert (anomalie.code, anomalie.date, anomalie.visites) == (
        "jour_non_planifiable",
        JEUDI,
        [str(v.pk)],
    )
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    r = client_de(monde["deleg.sn"]).post(f"/api/v1/plannings/{terrain['planning'].pk}/soumettre/")
    assert r.status_code == 400 and r.json()["code"] == "planning_bloque"
    assert r.json()["details"]["anomalies"][0]["code"] == "jour_non_planifiable"


def test_le_statut_est_relu_sous_verrou(terrain):
    """Un planning chargé avant sa soumission ne reçoit plus de visite."""
    perime = Planning.objects.get(pk=terrain["planning"].pk)
    Planning.objects.filter(pk=perime.pk).update(statut="soumis")
    assert perime.statut == "brouillon"
    with pytest.raises(ErreurMetier) as refus:
        services.ajouter_visite(perime, date=JEUDI)
    assert refus.value.code == "planning_non_modifiable"


def test_l_ordre_et_le_passage_gardent_version_et_journal(monde, terrain):
    a = visite(terrain, heure=None)
    b = visite(terrain, heure=None)
    b.refresh_from_db()
    version = b.version
    services.ordonner(terrain["planning"], JEUDI, [b.pk, a.pk])
    b.refresh_from_db()
    assert (b.ordre, b.version) == (1, version + 1)
    assert JournalChangement.objects.filter(entite_id=b.pk, version=b.version).exists()
    passage = services.regrouper(terrain["planning"], [a, b])
    a.refresh_from_db()
    assert a.passage_id == passage.pk
    assert JournalChangement.objects.filter(entite_id=a.pk, version=a.version).exists()


def test_modifier_une_visite_ou_une_absence_est_audite(terrain):
    v = visite(terrain)
    services.modifier_visite(v, objectif="Échantillons")
    absence = services.declarer_absence(terrain["planning"], date=date(2026, 10, 16),
                                        periode="matin", type="formation")  # fmt: skip
    services.modifier_absence(absence, type="reunion")
    modif = EvenementAudit.objects.get(action="visite.modification")
    assert modif.details["champs"] == ["objectif"]
    assert EvenementAudit.objects.get(action="absence.modification").details["champs"] == ["type"]


def test_le_lieu_principal_a_valider_d_un_autre_n_est_pas_propose(monde, terrain):
    autre = creer_etablissement(
        monde["sn"], monde["sup.sn"], actif=False, nom="Cabinet à valider",
        secteur=terrain["secteur"], type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    creer_exercice(terrain["medecin"], autre, monde["admin.sn"], principal=True)
    assert (
        services.lieu_principal(terrain["medecin"], JEUDI, monde["deleg.sn"])
        == (terrain["clinique"])
    )


def test_la_semaine_donne_le_fuseau_du_pays(monde, terrain):
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert semaine["fuseau"] == monde["sn"].fuseau

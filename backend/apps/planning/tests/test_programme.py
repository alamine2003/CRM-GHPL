"""0.4.1 : programme du jour et de la semaine (VIS-001), passage « en cours » puis « terminé »
(prd.md §17.1).

VIS-001 : le programme liste les visites approuvées, ordonnées, la prochaine en tête (§12). Le
délégué exécute la version approuvée (RG-018) : une modification qui attend la décision n'y
entre pas. CA1 (hors connexion) est prouvé au téléphone, qui garde le programme."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import echeances, services

from .test_passages_activites import confrere

pytestmark = pytest.mark.django_db

URL = "/api/v1/programme/"
MARDI, MERCREDI = date(2026, 10, 13), date(2026, 10, 14)


@pytest.fixture
def approuve(monde, terrain):
    """Approuvé le jeudi 8 : mardi 11 h puis 9 h (dans le désordre), mercredi 10 h."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    autre = confrere(monde, terrain, "Fictif")
    lieu = dict(etablissement=terrain["clinique"], objectif="Vasculor")
    with freeze_time("2026-10-08 09:00"):
        tard = services.ajouter_visite(planning, date=MARDI, heure=time(11, 0),
                                       prospect=terrain["medecin"], **lieu)  # fmt: skip
        tot = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), prospect=autre,
                                      **lieu)  # fmt: skip
        mercredi = services.ajouter_visite(planning, date=MERCREDI, heure=time(10, 0),
                                           prospect=terrain["medecin"], **lieu)  # fmt: skip
        services.declarer_activite(planning, date=date(2026, 10, 16), type="formation")
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    planning.refresh_from_db()
    return planning, tot, tard, mercredi


def lire(monde, **params):
    return client_de(monde["deleg.sn"]).get(URL, params).json()


def test_vis001_le_programme_du_jour_est_ordonne_avec_la_prochaine_en_tete(monde, approuve):
    planning, tot, tard, _ = approuve
    with freeze_time("2026-10-13 07:00"):
        p = lire(monde)
    assert (p["semaine"], p["aujourdhui"], p["etat"], p["version"]) == (
        "2026-10-12", "2026-10-13", "approuve", 1)  # fmt: skip
    mardi = next(j for j in p["jours"] if j["date"] == "2026-10-13")
    assert [v["id"] for v in mardi["visites"]] == [str(tot.pk), str(tard.pk)]
    assert p["prochaine"] == str(tot.pk)
    # La semaine entière est là, avec l'activité du vendredi.
    assert [len(j["visites"]) for j in p["jours"]] == [0, 2, 1, 0, 0]
    assert p["jours"][4]["activites"][0]["type"] == "formation"


def test_un_jour_sans_visite_a_faire_n_a_pas_de_prochaine(monde, approuve):
    with freeze_time("2026-10-12 08:00"):
        assert lire(monde)["prochaine"] is None


def test_le_programme_suit_la_version_approuvee(monde, approuve):
    """RG-018 : une modification majeure en attente n'entre pas au programme ; la visite
    déplacée reste prévue à sa place approuvée, signalée « en attente »."""
    planning, tot, tard, mercredi = approuve
    with freeze_time("2026-10-09 10:00"):
        services.modifier_visite(tard, heure=time(15, 0))  # mineure : suivie
        services.modifier_visite(mercredi, date=date(2026, 10, 15))  # majeure : en attente
        p = lire(monde, semaine="2026-10-12")
    mardi, mercredi_j, jeudi = p["jours"][1], p["jours"][2], p["jours"][3]
    assert [(v["id"], v["heure"]) for v in mardi["visites"]] == [
        (str(tot.pk), "09:00"), (str(tard.pk), "15:00")]  # fmt: skip
    assert [v["id"] for v in mercredi_j["visites"]] == [str(mercredi.pk)]
    assert mercredi_j["visites"][0]["modification_en_attente"] is True
    assert jeudi["visites"] == []


@pytest.mark.parametrize("cas", ["brouillon", "soumis"])
def test_sans_version_approuvee_le_programme_le_dit(monde, terrain, cas):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    if cas == "soumis":
        with freeze_time("2026-10-08 09:00"):
            services.ajouter_visite(terrain["planning"], date=MARDI, heure=time(9, 0),
                                    prospect=terrain["medecin"],
                                    etablissement=terrain["clinique"], objectif="A")  # fmt: skip
            services.soumettre(terrain["planning"])
    with freeze_time("2026-10-13 08:00"):
        p = lire(monde)
    assert (p["etat"], p["planning"]["statut"], p["prochaine"]) == ("non_approuve", cas, None)
    assert all(j["visites"] == [] for j in p["jours"])


def test_sans_planning_ni_poste(monde, terrain):
    with freeze_time("2026-10-20 08:00"):
        assert lire(monde)["etat"] == "sans_planning"
        # Le superviseur qui n'occupe aucun poste n'a pas de programme.
        assert client_de(monde["sup.sn"]).get(URL).json()["etat"] == "sans_poste"
        assert client_de(monde["dm.sn"]).get(URL).status_code == 403


def test_chacun_ne_voit_que_son_programme(monde, approuve):
    """Le programme se lit sur le délégué connecté : celui d'un collègue n'apparaît jamais."""
    with freeze_time("2026-10-13 07:00"):
        org.occuper(org.creer_poste(monde["sn"], "vm", "VM Fictif", [], []), monde["sup.sn"],
                    date(2026, 1, 1))  # fmt: skip
        p = client_de(monde["sup.sn"]).get(URL).json()
    assert p["etat"] == "sans_planning" and all(j["visites"] == [] for j in p["jours"])


def test_approuve_en_cours_le_premier_jour_puis_termine(monde, approuve):
    planning, *_ = approuve
    with freeze_time("2026-10-11 23:59"):
        assert echeances.executer()["plannings"] == 0
    with freeze_time("2026-10-12 00:00"):
        assert echeances.executer()["plannings"] == 1
        assert echeances.executer()["plannings"] == 0
    planning.refresh_from_db()
    assert planning.statut == "en_cours"
    with freeze_time("2026-10-19 00:00"):
        assert echeances.executer()["plannings"] == 1
    planning.refresh_from_db()
    assert planning.statut == "termine"
    actions = set(EvenementAudit.objects.values_list("action", flat=True))
    assert {"planning.en_cours", "planning.termine"} <= actions


def test_une_semaine_passee_approuvee_finit_terminee_en_une_passe(monde, approuve):
    planning, *_ = approuve
    with freeze_time("2026-10-26 08:00"):
        assert echeances.executer()["plannings"] == 2
    planning.refresh_from_db()
    assert planning.statut == "termine"
    # Terminé, le programme reste lisible.
    with freeze_time("2026-10-26 08:00"):
        assert lire(monde, semaine="2026-10-12")["etat"] == "approuve"

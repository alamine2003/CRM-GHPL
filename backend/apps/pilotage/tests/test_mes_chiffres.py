# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.1 : DSH-001, les indicateurs du délégué ; moteur commun du cycle 0.7.

Semaine du 12 octobre, lue le jeudi 15 à midi : le mardi, une visite faite (rapport soumis à
l'heure) et une annulée avec son motif ; le mercredi, une visite oubliée ; le vendredi, une à
venir. Une visite imprévue s'ajoute le mardi, sans rapport."""

from datetime import UTC, date, datetime, time

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.pilotage import indicateurs
from apps.planning import execution, services
from apps.planning.models import Visite
from apps.prospects import ciblage
from apps.prospects.services import creer_exercice, creer_prospect
from apps.rapports.tests.test_rapport import portefeuille  # noqa: F401
from apps.rapports.tests.test_validation import imprevue, soumettre
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/mes-chiffres/"
MARDI, MERCREDI, VENDREDI = date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 16)


@pytest.fixture
def semaine(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    lieu = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
    autres = [medecin(monde, terrain, nom) for nom in ("Diop", "Ba", "Kane")]
    with freeze_time("2026-10-08 09:00"):
        faite = services.ajouter_visite(
            planning, date=MARDI, heure=time(9, 0), objectif="A", **lieu
        )
        annulee = services.ajouter_visite(
            planning,
            date=MARDI,
            heure=time(11, 0),
            objectif="A",
            prospect=autres[0],
            etablissement=terrain["clinique"],
        )
        oubliee = services.ajouter_visite(
            planning,
            date=MERCREDI,
            heure=time(9, 0),
            objectif="A",
            prospect=autres[1],
            etablissement=terrain["clinique"],
        )
        services.ajouter_visite(
            planning,
            date=VENDREDI,
            heure=time(9, 0),
            objectif="A",
            prospect=autres[2],
            etablissement=terrain["clinique"],
        )
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    with freeze_time("2026-10-13 09:40"):
        execution.demarrer(faite, datetime(2026, 10, 13, 9, 2, tzinfo=UTC))
        faite.refresh_from_db()
        execution.terminer(faite, datetime(2026, 10, 13, 9, 30, tzinfo=UTC))
        motif = Valeur.objects.get(pays=monde["sn"], liste="motif_ecart",
                                   code="rendez_vous_reporte")  # fmt: skip
        execution.annuler(annulee, datetime(2026, 10, 13, 9, 35, tzinfo=UTC), motif.pk)
    # Le pointage du démarrage de la visite faite : à 40 m de la clinique, précis à 10 m.
    Visite.objects.filter(pk=faite.pk).update(
        distance_debut_m=40, debut_precision_m=10, sans_gps=False
    )
    return {"faite": faite, "annulee": annulee, "oubliee": oubliee}


def medecin(monde, terrain, nom, potentiel="C"):
    fiche = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, prenom="Test", potentiel=potentiel,
        type=terrain["medecin"].type, specialite=terrain["medecin"].specialite,
    )  # fmt: skip
    creer_exercice(fiche, terrain["clinique"], monde["admin.sn"])
    return fiche


def lire(monde, **params):
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde["deleg.sn"]).get(URL, params)
    assert r.status_code == 200, r.content
    return r.json()


def test_dsh001_les_chiffres_de_la_semaine(monde, terrain, semaine, portefeuille):
    soumettre(monde, semaine["faite"], portefeuille[:1])
    imprevue(monde, terrain)
    d = lire(monde)
    s = d["semaine"]
    assert (s["debut"], s["fin"], s["activite"]) == ("2026-10-12", "2026-10-18", True)
    assert s["visites"] == {
        "prevues": 4, "echues": 3, "a_venir": 1, "effectuees_prevues": 1, "ecarts": 2,
        "ecarts_justifies": 1, "a_justifier": 1, "imprevues": 1, "effectuees": 2,
        "geolocalisees": 1,
    }  # fmt: skip
    assert s["rapports"] == {"soumis": 1, "dans_delai": 1, "valides": 0, "a_soumettre": 1,
                             "en_retard": 1}  # fmt: skip
    # DC-50 : réalisation et écarts justifiés, deux chiffres distincts ; les jours à venir
    # n'abaissent rien.
    assert s["taux"]["realisation"] == 0.333
    assert s["taux"]["ecarts_justifies"] == 0.5
    assert s["taux"]["geolocalisation"] == 0.5
    assert s["taux"]["rapports_dans_delai"] == 0.5
    assert s["taux"]["part_planifiee"] == 0.5
    # La courbe des jours : prévues et faites.
    assert [(j["date"], j["prevues"], j["effectuees"]) for j in d["jours"][:3]] == [
        ("2026-10-12", 0, 0), ("2026-10-13", 2, 2), ("2026-10-14", 1, 0)]  # fmt: skip
    assert d["aujourdhui"] == "2026-10-15" and d["calcule_le"].startswith("2026-10-15T12:00")
    # La semaine précédente, sans visite : « Aucune activité » (DSH-012 CA2).
    assert d["precedente"]["activite"] is False
    assert set(d["precedente"]["taux"].values()) == {None}


def test_dsh012_ca1_une_visite_imprevue_n_abaisse_aucun_taux(monde, terrain, semaine):
    sans = lire(monde)["semaine"]["taux"]
    v = imprevue(monde, terrain)
    Visite.objects.filter(pk=v.pk).update(distance_debut_m=20, debut_precision_m=5, sans_gps=False)
    avec = lire(monde)["semaine"]["taux"]
    for cle in ("realisation", "ecarts_justifies", "geolocalisation", "couverture"):
        assert avec[cle] == sans[cle] or (avec[cle] or 0) >= (sans[cle] or 0), cle
    assert avec["part_planifiee"] == 0.5  # une information, pas une note


def test_couverture_de_la_liste_cible(monde, terrain, semaine):
    confrere = medecin(monde, terrain, "Fall", "B")
    with freeze_time("2026-10-01 09:00"):
        ciblage.ajouter(terrain["poste"], [terrain["medecin"], confrere], monde["sup.sn"],
                        frequence=2)  # fmt: skip
    c = lire(monde)
    assert c["semaine"]["couverture"] == {"cibles": 2, "visitees": 1, "cibles_ab": 2,
                                          "visitees_ab": 1, "frequence_ab": 1}  # fmt: skip
    assert c["semaine"]["taux"]["couverture"] == 0.5
    # Sur le cycle de 4 semaines, 2 visites par cycle sont attendues : une seule ne suffit pas.
    assert (c["cycle"]["semaines"], c["cycle"]["debut"]) == (4, "2026-09-21")
    assert c["cycle"]["couverture"]["frequence_ab"] == 0


def test_taux_bornes_a_100():
    assert indicateurs.taux(3, 2) == 1.0
    assert indicateurs.taux(0, 0) is None
    assert indicateurs.taux(1, 3) == 0.333


def test_dsh001_une_autre_semaine_et_une_date_invalide(monde, semaine):
    d = lire(monde, semaine="2026-10-21")
    assert (d["semaine"]["debut"], d["semaine"]["activite"]) == ("2026-10-19", False)
    assert d["precedente"]["visites"]["prevues"] == 4
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde["deleg.sn"]).get(URL, {"semaine": "demain"})
    assert r.status_code == 400


def test_dsh001_chacun_ses_chiffres(monde, terrain, semaine):
    """Le superviseur lit ses propres chiffres (aucune visite), jamais ceux de son équipe."""
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde["sup.sn"]).get(URL)
    assert r.status_code == 200
    assert r.json()["semaine"]["activite"] is False
    with freeze_time("2026-10-15 12:00"):
        assert client_de(monde["dm.sn"]).get(URL).status_code == 403

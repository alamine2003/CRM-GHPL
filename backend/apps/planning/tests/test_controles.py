"""PLN-004 : contrôles bloquants à la soumission (RG-015) et signalements non bloquants (RG-016).
CA1 : deux visites à la même heure sont refusées. CA2 : un seuil dépassé n'empêche pas la
soumission mais apparaît au superviseur."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import controles, services
from apps.planning.models import Visite
from apps.prospects.ciblage import ajouter
from apps.prospects.services import creer_etablissement, creer_exercice, creer_prospect

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def medecin(monde, terrain, nom, potentiel="B", lieu=None):
    fiche = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, potentiel=potentiel,
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip
    creer_exercice(fiche, lieu or terrain["clinique"], monde["admin.sn"])
    return fiche


def visite(terrain, prospect=None, jour=MARDI, heure=None, planning=None, **champs):
    return services.ajouter_visite(
        planning or terrain["planning"], date=jour, prospect=prospect or terrain["medecin"],
        etablissement=champs.pop("etablissement", terrain["clinique"]),
        heure=heure, objectif=champs.pop("objectif", "Vasculor"), **champs,
    )  # fmt: skip


def soumettre(terrain):
    return f"/api/v1/plannings/{terrain['planning'].pk}/soumettre/"


def codes(anomalies):
    return sorted(a.code for a in anomalies)


def test_ca1_deux_visites_a_la_meme_heure_sont_bloquantes(monde, terrain):
    a = visite(terrain, heure=time(9, 0))
    b = visite(terrain, medecin(monde, terrain, "Sow"), heure=time(9, 0))
    (anomalie,) = controles.bloquants(terrain["planning"])
    assert anomalie.code == "meme_heure" and anomalie.heure == "09:00"
    assert sorted(anomalie.visites) == sorted([str(a.pk), str(b.pk)])
    # Refusées à la soumission, avec l'heure et les visites en cause.
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    r = client_de(monde["deleg.sn"]).post(soumettre(terrain))
    assert r.status_code == 400 and r.json()["code"] == "planning_bloque"
    (refus,) = r.json()["details"]["anomalies"]
    assert (refus["code"], refus["heure"]) == ("meme_heure", "09:00")
    # Les visites d'un même passage partagent leur heure : ce n'est pas un conflit.
    services.regrouper(terrain["planning"], [a, b])
    assert controles.bloquants(terrain["planning"]) == []
    controles.exiger_sans_bloquant(terrain["planning"])


def test_rg015_meme_prospect_le_meme_jour_et_champs_obligatoires(monde, terrain):
    visite(terrain, heure=time(9, 0))
    visite(terrain, heure=time(15, 0))
    services.ajouter_visite(terrain["planning"], date=date(2026, 10, 14))
    assert codes(controles.bloquants(terrain["planning"])) == ["incomplete", "meme_prospect"]
    incomplete = next(a for a in controles.bloquants(terrain["planning"])
                      if a.code == "incomplete")  # fmt: skip
    assert incomplete.manquants == ["heure", "prospect", "etablissement", "objectif"]


def test_rg015_prospect_et_lieu_lies_par_un_exercice_actif(monde, terrain):
    cabinet = creer_etablissement(
        monde["sn"], monde["admin.sn"], actif=True, nom="Cabinet Médina",
        secteur=terrain["secteur"], type=valeur(monde, "type_etablissement", "cabinet"),
    )  # fmt: skip
    visite(terrain, heure=time(9, 0), etablissement=cabinet)
    assert codes(controles.bloquants(terrain["planning"])) == ["sans_exercice"]


def test_rg015_une_fiche_devenue_inactive_bloque(monde, terrain):
    visite(terrain, heure=time(9, 0))
    terrain["medecin"].archiver()
    (anomalie,) = controles.bloquants(terrain["planning"])
    assert (anomalie.code, anomalie.fiche) == ("fiche_inactive", "prospect")


def test_ca2_les_seuils_du_jour_sont_signales_au_prorata_des_absences(monde, terrain):
    # VM : 6 à 10 visites par jour (paramètre par défaut).
    visite(terrain, heure=time(9, 0))
    services.declarer_absence(terrain["planning"], date=date(2026, 10, 15), periode="matin",
                              type="formation")  # fmt: skip
    bilan = controles.bilan(terrain["planning"])
    objectifs = {o.date: (o.visites, o.min, o.max) for o in bilan.objectifs}
    assert objectifs[MARDI] == (1, 6, 10)
    # Une demi-journée d'absence réduit de moitié les seuils (PLN-009 CA1).
    assert objectifs[date(2026, 10, 15)] == (0, 3, 5)
    bas = [a for a in bilan.signalements if a.code == "seuil_bas"]
    assert len(bas) == 5 and all(a.gravite == "signalement" for a in bas)
    # Un seuil dépassé n'empêche pas la soumission (CA2).
    for n in range(10):
        visite(terrain, medecin(monde, terrain, f"Confrere{n}"), heure=time(8 + n % 10, 30))
    hauts = [a for a in controles.signalements(terrain["planning"]) if a.code == "seuil_haut"]
    assert [(a.date, a.nombre, a.max) for a in hauts] == [(MARDI, 11, 10)]
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    r = client_de(monde["deleg.sn"]).post(soumettre(terrain))
    assert r.status_code == 200 and r.json()["statut"] == "soumis"
    # … et reste dit pour le superviseur (sa revue arrive au cycle 0.3).
    terrain["planning"].refresh_from_db()
    assert "seuil_haut" in codes(controles.signalements(terrain["planning"]))


def test_un_jour_ferie_ou_une_journee_d_absence_sort_des_seuils(monde, terrain):
    services.creer_jour_ferie(monde["sn"], date=date(2026, 10, 16), libelle="Fête fictive")
    services.declarer_absence(terrain["planning"], date=date(2026, 10, 14), type="conge")
    jours = [o.date for o in controles.bilan(terrain["planning"]).objectifs]
    assert jours == [date(2026, 10, 12), MARDI, date(2026, 10, 15)]


def test_rg016_hors_liste_cible_et_hors_secteur(monde, terrain):
    v = visite(terrain, heure=time(9, 0))
    assert codes(controles.signalements(terrain["planning"])
                 ) == ["hors_cible"] + ["seuil_bas"] * 5  # fmt: skip
    ajouter(terrain["poste"], [terrain["medecin"]], monde["admin.sn"])
    assert "hors_cible" not in codes(controles.signalements(terrain["planning"]))
    # RG-024 : un lieu hors des secteurs du poste reste planifiable, et il est signalé.
    ailleurs = org.creer_secteur(monde["sn"], org.creer_zone(monde["sn"], "Thiès"), "Mbour")
    hopital = creer_etablissement(
        monde["sn"], monde["admin.sn"], actif=True, nom="Hôpital de Mbour", secteur=ailleurs,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    creer_exercice(terrain["medecin"], hopital, monde["admin.sn"])
    services.modifier_visite(v, etablissement=hopital)
    (hors,) = [a for a in controles.signalements(terrain["planning"]) if a.code == "hors_secteur"]
    assert hors.visites == [str(v.pk)]


def test_rg016_prospect_a_non_planifie_dans_le_mois(monde, terrain):
    ajouter(terrain["poste"], [terrain["medecin"]], monde["admin.sn"])  # potentiel A
    oublie = medecin(monde, terrain, "Faye", potentiel="A")
    ajouter(terrain["poste"], [oublie], monde["admin.sn"])
    # Semaine du 12 octobre : ce n'est pas la dernière du mois, rien n'est encore signalé.
    assert "a_non_planifie" not in codes(controles.signalements(terrain["planning"]))
    visite(terrain, heure=time(9, 0))
    # Dernière semaine d'octobre : le 30 est le dernier jour ouvré du mois.
    fin = services.creer_planning(monde["sn"], monde["deleg.sn"], date(2026, 10, 26))
    (oubli,) = [a for a in controles.signalements(fin) if a.code == "a_non_planifie"]
    assert oubli.mois == "2026-10" and oubli.date == date(2026, 10, 30)
    assert [p["id"] for p in oubli.prospects] == [str(oublie.pk)]
    # Ciblé aussi par un second poste du délégué, il n'est nommé qu'une fois (0.2.9).
    second = org.creer_poste(monde["sn"], "vm", "VM Plateau 2", [terrain["cardio"]],
                             [terrain["secteur"]])  # fmt: skip
    org.occuper(second, monde["deleg.sn"], date(2026, 1, 1))
    ajouter(second, [oublie], monde["admin.sn"])
    (oubli,) = [a for a in controles.signalements(fin) if a.code == "a_non_planifie"]
    assert [p["id"] for p in oubli.prospects] == [str(oublie.pk)]


def test_la_semaine_renvoie_les_controles(monde, terrain):
    a = visite(terrain, heure=time(9, 0))
    visite(terrain, medecin(monde, terrain, "Sow"), heure=time(9, 0))
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    c = semaine["controles"]
    assert [x["code"] for x in c["bloquants"]] == ["meme_heure"]
    assert c["bloquants"][0]["gravite"] == "bloquant"
    assert str(a.pk) in c["bloquants"][0]["visites"]
    assert {"date": "2026-10-13", "visites": 2, "min": 6, "max": 10} in c["objectifs"]
    assert {x["code"] for x in c["signalements"]} == {"hors_cible", "seuil_bas"}
    assert Visite.objects.count() == 2

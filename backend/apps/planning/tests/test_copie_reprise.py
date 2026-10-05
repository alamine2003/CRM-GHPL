"""PLN-005 : déplacer, copier, supprimer une visite avant soumission ; poser depuis la liste
cible. CA1 : une visite posée depuis la liste cible est pré-remplie (prospect, établissement
principal). CA2 : copier la semaine précédente est possible."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.models import Passage, Visite
from apps.prospects.services import creer_etablissement, creer_exercice, creer_prospect

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def medecin(monde, nom):
    return creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, potentiel="A",
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip


def test_ca1_poser_depuis_la_liste_cible_preremplit_le_lieu_principal(monde, terrain):
    hopital = creer_etablissement(
        monde["sn"], monde["admin.sn"], actif=True, nom="Hôpital Principal",
        secteur=terrain["secteur"], type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    creer_exercice(terrain["medecin"], hopital, monde["admin.sn"], principal=True)
    sans_lieu = medecin(monde, "Sow")
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/poser/",
                   {"date": "2026-10-14", "prospects": [str(terrain["medecin"].pk),
                                                         str(sans_lieu.pk)]},
                   format="json")  # fmt: skip
    assert r.status_code == 201, r.content
    posees = r.json()
    # Le médecin exerce à la clinique et à l'hôpital, principal : c'est l'hôpital.
    assert posees[0]["etablissement"]["nom"] == "Hôpital Principal"
    assert posees[0]["reseau"]["libelle"] == "Cardio"
    assert posees[0]["manquants"] == ["heure", "objectif"]
    # Sans lieu d'exercice, la visite reste à compléter.
    assert posees[1]["etablissement"] is None
    assert "etablissement" in posees[1]["manquants"]


def test_poser_refuse_une_fiche_d_un_autre_pays(monde, terrain):
    togolais = creer_prospect(
        monde["tg"], monde["admin.tg"], actif=True, nom="Agbeko", potentiel="B",
        type=valeur(monde, "type_prospect", "medecin", "tg"),
        specialite=valeur(monde, "specialite", "cardiologie", "tg"),
    )  # fmt: skip
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/poser/",
        {"date": "2026-10-14", "prospects": [str(togolais.pk)]}, format="json",
    )  # fmt: skip
    assert r.status_code == 400 and r.json()["code"] == "prospect_invalide"
    assert not Visite.objects.exists()


def test_copier_une_visite_sur_un_autre_jour(monde, terrain):
    visite = services.ajouter_visite(
        terrain["planning"], date=date(2026, 10, 13), heure=time(9, 30),
        prospect=terrain["medecin"], etablissement=terrain["clinique"], objectif="Vasculor",
        note="Parking",
    )  # fmt: skip
    r = client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/copier/",
                                          {"date": "2026-10-15"}, format="json")  # fmt: skip
    assert r.status_code == 201, r.content
    copie = r.json()
    assert copie["id"] != str(visite.pk)
    assert (copie["date"], copie["heure"], copie["objectif"], copie["note"]) == (
        "2026-10-15", "09:30", "Vasculor", "Parking")  # fmt: skip
    assert copie["prospect"]["id"] == str(terrain["medecin"].pk)
    # La copie suit les mêmes règles qu'un ajout : pas sur un jour hors semaine.
    r = client_de(monde["deleg.sn"]).post(f"/api/v1/visites/{visite.pk}/copier/",
                                          {"date": "2026-10-19"}, format="json")  # fmt: skip
    assert r.status_code == 400 and r.json()["code"] == "jour_hors_semaine"


def test_ca2_reprendre_la_semaine_precedente(monde, terrain):
    # Semaine du 12 octobre préparée : deux visites en passage le mardi, une le vendredi.
    precedente = terrain["planning"]
    confrere = medecin(monde, "Faye")
    creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
    a = services.ajouter_visite(precedente, date=date(2026, 10, 13), heure=time(10, 0),
                                prospect=terrain["medecin"], etablissement=terrain["clinique"],
                                objectif="Vasculor")  # fmt: skip
    b = services.ajouter_visite(precedente, date=date(2026, 10, 13), prospect=confrere,
                                etablissement=terrain["clinique"])  # fmt: skip
    services.regrouper(precedente, [a, b])
    services.ajouter_visite(precedente, date=date(2026, 10, 16), prospect=confrere,
                            etablissement=terrain["clinique"])  # fmt: skip
    services.declarer_absence(precedente, date=date(2026, 10, 14), type="formation")
    # Semaine suivante : le vendredi 23 est férié.
    services.creer_jour_ferie(monde["sn"], date=date(2026, 10, 23), libelle="Fête fictive")
    suivante = services.creer_planning(monde["sn"], monde["deleg.sn"], date(2026, 10, 19))
    deleg = client_de(monde["deleg.sn"])
    semaine = deleg.get(SEMAINE, {"semaine": "2026-10-19"}).json()
    assert semaine["reprenables"] == 3
    r = deleg.post(f"/api/v1/plannings/{suivante.pk}/reprendre/")
    assert r.status_code == 200, r.content
    assert r.json()["copiees"] == 2
    assert r.json()["ignorees"][0] | {"visite": None} == {
        "visite": None, "date": "2026-10-23", "raison": "jour_ferie"}  # fmt: skip
    copies = suivante.visites.filter(archive_le__isnull=True)
    assert {(str(v.date), str(v.heure), v.objectif) for v in copies} == {
        ("2026-10-20", "10:00:00", "Vasculor"), ("2026-10-20", "10:00:00", "")}  # fmt: skip
    # Le passage suit ; l'absence, non.
    assert Passage.objects.filter(planning=suivante, archive_le__isnull=True).count() == 1
    assert not suivante.absences.exists()
    assert EvenementAudit.objects.filter(action="planning.reprise").exists()
    # Une semaine qui a déjà des visites ne se reprend pas (pas de doublons).
    assert deleg.get(SEMAINE, {"semaine": "2026-10-19"}).json()["reprenables"] == 0
    r = deleg.post(f"/api/v1/plannings/{suivante.pk}/reprendre/")
    assert r.status_code == 409 and r.json()["code"] == "semaine_non_vide"


def test_sans_semaine_precedente_rien_a_reprendre(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["reprenables"] == 0
    r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/reprendre/")
    assert r.status_code == 404 and r.json()["code"] == "sans_semaine_precedente"

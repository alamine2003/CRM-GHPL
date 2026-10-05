"""0.2.3 : ordre de la journée, passages (PLN-003) et absences (PLN-009).

PLN-003 CA1 : un passage affiche une ligne « Établissement · n prescripteurs ». CA2 : chaque
visite du passage garde son prospect et son rapport.
PLN-009 CA1 : une demi-journée d'absence réduit de moitié les seuils du jour. CA2 : l'absence
est validée avec le planning (cycle 0.3).
"""

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.etats import StatutPlanning
from apps.planning.models import Absence, Passage, Visite
from apps.planning.services import creer_jour_ferie
from apps.prospects.services import creer_exercice, creer_prospect

from .conftest import SEMAINE, valeur

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


def confrere(monde, terrain, nom):
    medecin = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom=nom, potentiel="B",
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip
    creer_exercice(medecin, terrain["clinique"], monde["admin.sn"])
    return medecin


def poser(deleg, terrain, prospect=None, **champs):
    corps = {"date": "2026-10-13", "prospect": str((prospect or terrain["medecin"]).pk),
             "etablissement": str(terrain["clinique"].pk), **champs}  # fmt: skip
    r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/visites/", corps, format="json")
    assert r.status_code == 201, r.content
    return r.json()


def ordre_du_jour(deleg, jour="2026-10-13"):
    visites = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["visites"]
    return [v["id"] for v in visites if v["date"] == jour]


# --- Ordre de la journée ----------------------------------------------------------------------


def test_les_visites_a_heure_fixe_suivent_l_ordre_chronologique(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    a = poser(deleg, terrain, heure="15:00")
    b = poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    c = poser(deleg, terrain, confrere(monde, terrain, "Fall"), heure="09:00")
    # La visite de 9 h prend la première place à heure fixe ; celle sans heure ne bouge pas.
    assert ordre_du_jour(deleg) == [c["id"], b["id"], a["id"]]
    # Le délégué place la visite sans heure en tête ; l'heure garde le dernier mot.
    url = f"/api/v1/plannings/{terrain['planning'].pk}/ordre/"
    r = deleg.post(url, {"date": "2026-10-13", "visites": [b["id"], a["id"], c["id"]]},
                   format="json")  # fmt: skip
    assert r.status_code == 200, r.content
    assert [v["id"] for v in r.json()] == [b["id"], c["id"], a["id"]]
    assert [v["ordre"] for v in r.json()] == [1, 2, 3]
    # Une heure changée replace la visite.
    deleg.patch(f"/api/v1/visites/{a['id']}/", {"heure": "08:00"}, format="json")
    assert ordre_du_jour(deleg) == [b["id"], a["id"], c["id"]]


def test_l_ordre_reprend_exactement_les_visites_du_jour(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    a = poser(deleg, terrain)
    poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/ordre/",
                   {"date": "2026-10-13", "visites": [a["id"]]}, format="json")  # fmt: skip
    assert r.status_code == 400 and r.json()["code"] == "ordre_invalide"


# --- Passages (PLN-003) -----------------------------------------------------------------------


def test_pln003_ca1_ca2_un_passage_regroupe_les_visites_d_un_lieu(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    a = poser(deleg, terrain, heure="10:00", objectif="Vasculor")
    b = poser(deleg, terrain, confrere(monde, terrain, "Sow"), heure="11:30")
    autre = poser(deleg, terrain, confrere(monde, terrain, "Fall"), date="2026-10-14")
    url = f"/api/v1/plannings/{terrain['planning'].pk}/passages/"
    # Pas de passage entre deux jours différents.
    r = deleg.post(url, {"visites": [a["id"], autre["id"]]}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "passage_disparate"
    r = deleg.post(url, {"visites": [a["id"], b["id"]]}, format="json")
    assert r.status_code == 201, r.content
    passage = r.json()
    # CA1 : « Clinique du Cap · 2 prescripteurs », à l'heure la plus matinale.
    assert passage["etablissement"]["nom"] == "Clinique du Cap"
    assert sorted(passage["visites"]) == sorted([a["id"], b["id"]])
    assert passage["heure"] == "10:00"
    semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert [p["id"] for p in semaine["passages"]] == [passage["id"]]
    # CA2 : chaque visite garde son prospect et son objectif ; toutes prennent l'heure du passage.
    visites = {v["id"]: v for v in semaine["visites"]}
    assert visites[a["id"]]["prospect"]["nom"] == "NDIAYE"
    assert visites[a["id"]]["objectif"] == "Vasculor"
    assert {visites[i]["passage"] for i in (a["id"], b["id"])} == {passage["id"]}
    assert {visites[i]["heure"] for i in (a["id"], b["id"])} == {"10:00"}
    assert EvenementAudit.objects.filter(action="passage.creation").exists()


def test_l_heure_et_les_membres_d_un_passage_restent_coherents(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    a = poser(deleg, terrain, heure="10:00")
    b = poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    services.regrouper(terrain["planning"], list(Visite.objects.filter(pk__in=[a["id"], b["id"]])))
    # L'heure changée sur une visite vaut pour tout le passage.
    deleg.patch(f"/api/v1/visites/{b['id']}/", {"heure": "08:45"}, format="json")
    passage = Passage.objects.get()
    assert str(passage.heure) == "08:45:00"
    assert set(Visite.objects.values_list("heure", flat=True)) == {passage.heure}
    # Une nouvelle visite dans ce lieu ce jour-là rejoint le passage et en prend l'heure.
    c = poser(deleg, terrain, confrere(monde, terrain, "Fall"), heure="17:00")
    assert c["passage"] == str(passage.pk) and c["heure"] == "08:45"
    # Les visites du passage restent ensemble dans l'ordre de la journée.
    seule = poser(deleg, terrain, confrere(monde, terrain, "Ba"), etablissement=None, heure="08:00")
    assert ordre_du_jour(deleg) == [seule["id"], a["id"], b["id"], c["id"]]
    # Déplacée à un autre jour, une visite quitte le passage ; à une seule visite, il se défait.
    deleg.patch(f"/api/v1/visites/{c['id']}/", {"date": "2026-10-14"}, format="json")
    deleg.post(f"/api/v1/visites/{b['id']}/retirer/")
    passage.refresh_from_db()
    assert passage.archive_le is not None
    assert Visite.objects.get(pk=a["id"]).passage is None


def test_dissocier_un_passage(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    poser(deleg, terrain, heure="10:00")
    poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    passage = services.regrouper(terrain["planning"], list(Visite.objects.all()))
    r = deleg.post(f"/api/v1/passages/{passage.pk}/dissocier/")
    assert r.status_code == 200, r.content
    assert not Visite.objects.filter(passage__isnull=False).exists()
    # Les visites gardent l'heure du passage.
    assert set(Visite.objects.values_list("heure", flat=True)) == {passage.heure}
    assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["passages"] == []


# --- Absences (PLN-009) -----------------------------------------------------------------------


def absences(terrain):
    return f"/api/v1/plannings/{terrain['planning'].pk}/absences/"


def test_pln009_ca1_une_demi_journee_reduit_de_moitie_les_seuils(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(absences(terrain), {"date": "2026-10-15", "periode": "matin",
                                       "type": "formation"}, format="json")  # fmt: skip
    assert r.status_code == 201, r.content
    assert r.json() == {"id": r.json()["id"], "date": "2026-10-15", "periode": "matin",
                        "type": "formation", "commentaire": ""}  # fmt: skip
    planning = terrain["planning"]
    jour = Absence.objects.get().date
    assert services.part_travaillee(planning, jour) == 0.5
    # L'après-midi se déclare aussi ; la journée entière ne chevauche pas.
    r = deleg.post(absences(terrain), {"date": "2026-10-15", "periode": "journee",
                                       "type": "conge"}, format="json")  # fmt: skip
    assert r.status_code == 409 and r.json()["code"] == "absence_chevauchement"
    deleg.post(absences(terrain), {"date": "2026-10-15", "periode": "apres_midi",
                                   "type": "reunion"}, format="json")  # fmt: skip
    assert services.part_travaillee(planning, jour) == 0.0
    # Une demi-journée d'absence laisse planifier des visites ce jour-là.
    poser(deleg, terrain, date="2026-10-15")
    semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert [a["periode"] for a in semaine["absences"]] == ["apres_midi", "matin"]
    assert EvenementAudit.objects.filter(action="absence.declaration").count() == 2


def test_une_journee_d_absence_ne_recoit_pas_de_visite(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    visite = poser(deleg, terrain, date="2026-10-14")
    corps = {"date": "2026-10-14", "type": "maladie"}
    r = deleg.post(absences(terrain), corps, format="json")
    assert r.status_code == 409 and r.json()["code"] == "absence_avec_visites"
    deleg.post(f"/api/v1/visites/{visite['id']}/retirer/")
    assert deleg.post(absences(terrain), corps, format="json").status_code == 201
    r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/visites/",
                   {"date": "2026-10-14"}, format="json")  # fmt: skip
    assert r.status_code == 400 and r.json()["code"] == "jour_absent"


def test_absence_motif_jour_ferie_modification_et_retrait(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    creer_jour_ferie(monde["sn"], date=__import__("datetime").date(2026, 10, 16),
                     libelle="Fête fictive")  # fmt: skip
    r = deleg.post(absences(terrain), {"date": "2026-10-16", "type": "conge"}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "jour_ferie"
    r = deleg.post(absences(terrain), {"date": "2026-10-13", "type": "autre"}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "motif_requis"
    r = deleg.post(absences(terrain), {"date": "2026-10-13", "type": "autre",
                                       "commentaire": "Rendez-vous"}, format="json")  # fmt: skip
    absence = r.json()["id"]
    r = deleg.patch(f"/api/v1/absences/{absence}/", {"periode": "apres_midi"}, format="json")
    assert r.status_code == 200 and r.json()["periode"] == "apres_midi"
    assert deleg.post(f"/api/v1/absences/{absence}/retirer/").status_code == 200
    assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["absences"] == []


def test_un_planning_soumis_ne_change_plus(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    a = poser(deleg, terrain)
    b = poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    terrain["planning"].statut = StatutPlanning.SOUMIS
    terrain["planning"].save()
    for chemin, corps in (
        ("passages/", {"visites": [a["id"], b["id"]]}),
        ("absences/", {"date": "2026-10-15", "type": "formation"}),
        ("ordre/", {"date": "2026-10-13", "visites": [b["id"], a["id"]]}),
    ):
        r = deleg.post(f"/api/v1/plannings/{terrain['planning'].pk}/{chemin}", corps,
                       format="json")  # fmt: skip
        assert r.status_code == 409 and r.json()["code"] == "planning_non_modifiable", chemin


def test_un_autre_delegue_ne_touche_ni_passage_ni_absence(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    poser(deleg, terrain)
    poser(deleg, terrain, confrere(monde, terrain, "Sow"))
    passage = services.regrouper(terrain["planning"], list(Visite.objects.all()))
    absence = services.declarer_absence(terrain["planning"], date=passage.date.replace(day=15),
                                        type="formation")  # fmt: skip
    autre = client_de(monde["sup.sn"])
    assert autre.post(f"/api/v1/passages/{passage.pk}/dissocier/").status_code == 404
    assert autre.post(f"/api/v1/absences/{absence.pk}/retirer/").status_code == 404


# --- Envoi rejoué après une coupure (0.2.7) ----------------------------------------------------


def test_une_visite_renvoyee_avec_son_identifiant_n_est_creee_qu_une_fois(monde, terrain):
    import uuid

    deleg = client_de(monde["deleg.sn"])
    identifiant = str(uuid.uuid4())
    url = f"/api/v1/plannings/{terrain['planning'].pk}/visites/"
    corps = {"id": identifiant, "date": "2026-10-13", "prospect": str(terrain["medecin"].pk)}
    premiere = deleg.post(url, corps, format="json")
    assert premiere.status_code == 201 and premiere.json()["id"] == identifiant
    # La réponse s'est perdue : le téléphone renvoie la même saisie.
    seconde = deleg.post(url, corps, format="json")
    assert seconde.status_code == 201 and seconde.json()["id"] == identifiant
    assert Visite.objects.filter(pk=identifiant).count() == Visite.objects.count() == 1
    assert EvenementAudit.objects.filter(action="visite.planification").count() == 1


def test_une_absence_renvoyee_n_est_declaree_qu_une_fois(monde, terrain):
    import uuid

    deleg = client_de(monde["deleg.sn"])
    corps = {"id": str(uuid.uuid4()), "date": "2026-10-15", "type": "formation"}
    for _ in range(2):
        assert deleg.post(absences(terrain), corps, format="json").status_code == 201
    assert Absence.objects.count() == 1


def test_un_identifiant_deja_pris_ailleurs_est_refuse(monde, terrain):
    autre = services.creer_planning(monde["sn"], monde["deleg.sn"], terrain["planning"].semaine
                                    + __import__("datetime").timedelta(days=7))  # fmt: skip
    visite = services.ajouter_visite(autre, date=autre.semaine)
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{terrain['planning'].pk}/visites/",
        {"id": str(visite.pk), "date": "2026-10-13"}, format="json",
    )  # fmt: skip
    assert r.status_code == 409 and r.json()["code"] == "identifiant_pris"

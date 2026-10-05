"""PLN-002 : une visite planifiée contient date, heure, prospect, établissement, objectif,
réseau ; note facultative. CA1 : une visite incomplète est refusée à la soumission avec la
liste des champs manquants."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.etats import StatutPlanning
from apps.planning.models import Planning, Visite
from apps.planning.services import creer_jour_ferie
from apps.prospects.services import creer_etablissement, creer_exercice, creer_prospect
from apps.referentiel.models import Valeur
from apps.socle.erreurs import ErreurMetier

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


SEMAINE = "/api/v1/plannings/semaine/"


def valeur(monde, liste, code, pays="sn"):
    return Valeur.objects.get(pays=monde[pays], liste=liste, code=code)


@pytest.fixture
def terrain(monde):
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


def url(terrain):
    return f"/api/v1/plannings/{terrain['planning'].pk}/visites/"


def complete(terrain, **champs):
    return {
        "date": "2026-10-13", "heure": "09:30", "prospect": str(terrain["medecin"].pk),
        "etablissement": str(terrain["clinique"].pk), "objectif": "Présenter Vasculor",
        "note": "Parking derrière la clinique", **champs,
    }  # fmt: skip


def test_une_visite_complete_reprend_tous_les_champs(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(url(terrain), complete(terrain), format="json")
    assert r.status_code == 201, r.content
    v = r.json()
    assert (v["date"], v["heure"], v["objectif"]) == ("2026-10-13", "09:30", "Présenter Vasculor")
    assert v["prospect"]["nom"] == "NDIAYE" and v["etablissement"]["nom"] == "Clinique du Cap"
    # Un seul réseau possible : il est retenu d'office.
    assert v["reseau"]["libelle"] == "Cardio"
    assert v["manquants"] == [] and v["statut"] == "prevue"
    assert Visite.objects.get().poste == terrain["poste"]
    semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert [x["id"] for x in semaine["visites"]] == [v["id"]]
    assert semaine["modifiable"] is True
    assert semaine["reseaux"] == [{"id": str(terrain["cardio"].pk), "libelle": "Cardio"}]


def test_ca1_une_visite_incomplete_est_refusee_a_la_soumission(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    # En préparation, une visite peut rester incomplète : elle dit ce qui lui manque.
    r = deleg.post(url(terrain), {"date": "2026-10-14"}, format="json")
    assert r.status_code == 201
    assert r.json()["manquants"] == ["heure", "prospect", "etablissement", "objectif"]
    deleg.post(url(terrain), complete(terrain), format="json")
    with pytest.raises(ErreurMetier) as refus:
        services.exiger_complet(terrain["planning"])
    assert refus.value.code == "planning_incomplet"
    assert refus.value.details["visites"] == [
        {"visite": r.json()["id"], "date": "2026-10-14",
         "manquants": ["heure", "prospect", "etablissement", "objectif"]},
    ]  # fmt: skip
    # Complétée, elle passe.
    deleg.patch(f"/api/v1/visites/{r.json()['id']}/", complete(terrain, date="2026-10-14",
                heure="11:00"), format="json")  # fmt: skip
    services.exiger_complet(terrain["planning"])


def test_une_visite_se_pose_sur_un_jour_ouvre_non_ferie_de_la_semaine(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    creer_jour_ferie(monde["sn"], date=date(2026, 10, 16), libelle="Fête fictive")
    for jour, code in (("2026-10-16", "jour_ferie"), ("2026-10-17", "jour_hors_semaine"),
                       ("2026-10-20", "jour_hors_semaine")):  # fmt: skip
        r = deleg.post(url(terrain), complete(terrain, date=jour), format="json")
        assert r.status_code == 400 and r.json()["code"] == code, jour


def test_rg025_prospect_et_etablissement_actifs_du_pays(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    togolais = creer_prospect(
        monde["tg"], monde["admin.tg"], actif=True, nom="Agbeko", potentiel="B",
        type=valeur(monde, "type_prospect", "medecin", "tg"),
        specialite=valeur(monde, "specialite", "cardiologie", "tg"),
    )  # fmt: skip
    r = deleg.post(url(terrain), complete(terrain, prospect=str(togolais.pk)), format="json")
    assert r.status_code == 400 and r.json()["code"] == "prospect_invalide"
    # Sa propre fiche à valider sert aussitôt (PRP-006) ; celle d'un autre, non.
    sienne = creer_prospect(monde["sn"], monde["deleg.sn"], actif=False, nom="Sow", potentiel="C",
                            type=valeur(monde, "type_prospect", "medecin"),
                            specialite=valeur(monde, "specialite", "cardiologie"))  # fmt: skip
    autre = creer_prospect(monde["sn"], monde["sup.sn"], actif=False, nom="Diop", potentiel="C",
                           type=valeur(monde, "type_prospect", "medecin"),
                           specialite=valeur(monde, "specialite", "cardiologie"))  # fmt: skip
    ok = deleg.post(url(terrain), complete(terrain, prospect=str(sienne.pk)), format="json")
    assert ok.status_code == 201
    r = deleg.post(url(terrain), complete(terrain, prospect=str(autre.pk)), format="json")
    assert r.status_code == 400
    terrain["clinique"].archiver()
    r = deleg.post(url(terrain), complete(terrain), format="json")
    assert r.status_code == 400 and r.json()["code"] == "etablissement_invalide"


def test_le_reseau_est_celui_d_un_poste_occupe(monde, terrain):
    sn = monde["sn"]
    diabeto = org.creer_reseau(sn, terrain["division"], "CAR2", "Diabéto")
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(url(terrain), complete(terrain, reseau=str(diabeto.pk)), format="json")
    assert r.status_code == 400 and r.json()["code"] == "reseau_invalide"
    # Deux réseaux sur le poste : le délégué choisit, rien n'est retenu d'office.
    terrain["poste"].reseaux.add(diabeto)
    r = deleg.post(url(terrain), complete(terrain), format="json")
    assert r.json()["reseau"] is None and r.json()["manquants"] == ["reseau"]
    r = deleg.patch(f"/api/v1/visites/{r.json()['id']}/", {"reseau": str(diabeto.pk)},
                    format="json")  # fmt: skip
    assert r.json()["reseau"]["libelle"] == "Diabéto" and r.json()["manquants"] == []


def test_modifier_et_retirer_tant_que_le_planning_se_prepare(monde, terrain):
    deleg = client_de(monde["deleg.sn"])
    v = deleg.post(url(terrain), complete(terrain), format="json").json()
    r = deleg.patch(f"/api/v1/visites/{v['id']}/", {"heure": "15:00", "objectif": "  "},
                    format="json")  # fmt: skip
    assert r.json()["heure"] == "15:00" and r.json()["manquants"] == ["objectif"]
    assert deleg.post(f"/api/v1/visites/{v['id']}/retirer/").status_code == 200
    assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["visites"] == []
    # Soumis, le planning ne se modifie plus ici (modifications après approbation : 0.3.7).
    Planning.objects.filter(pk=terrain["planning"].pk).update(statut=StatutPlanning.SOUMIS)
    r = deleg.post(url(terrain), complete(terrain), format="json")
    assert r.status_code == 409 and r.json()["code"] == "planning_non_modifiable"
    assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["modifiable"] is False


def test_personne_d_autre_ne_touche_aux_visites_du_delegue(monde, terrain):
    v = client_de(monde["deleg.sn"]).post(url(terrain), complete(terrain), format="json").json()
    sup = client_de(monde["sup.sn"])
    assert sup.patch(f"/api/v1/visites/{v['id']}/", {"heure": "08:00"},
                     format="json").status_code == 404  # fmt: skip
    assert sup.post(url(terrain), complete(terrain), format="json").status_code == 404


def test_l_heure_attend_le_format_hh_mm(monde, terrain):
    r = client_de(monde["deleg.sn"]).post(url(terrain), complete(terrain, heure="9h30"),
                                         format="json")  # fmt: skip
    assert r.status_code == 400

"""0.5.1 : le rapport de visite, son socle et les champs du pays.

RPT-001 : un rapport par visite effectuée ; CA1 : sans rapport soumis, elle est « rapport
attendu ». RPT-002 : socle obligatoire (produits présentés du portefeuille du réseau,
résultat, résumé, prochaine action) ; CA1 : impossible de soumettre sans. RPT-008 : champs
supplémentaires par pays ; CA1 : un champ ajouté ne s'applique qu'aux nouveaux rapports."""

from datetime import UTC, date, datetime, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services
from apps.rapports.models import Rapport
from apps.rapports.services import creer_champ
from apps.referentiel import services as ref
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture
def effectuee(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        visite = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                         prospect=terrain["medecin"],
                                         etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    with freeze_time("2026-10-13 09:40"):
        execution.demarrer(visite, datetime(2026, 10, 13, 9, 2, tzinfo=UTC))
        visite.refresh_from_db()
        execution.terminer(visite, datetime(2026, 10, 13, 9, 30, tzinfo=UTC))
    return visite


@pytest.fixture
def portefeuille(monde, terrain):
    produits = [ref.creer_produit(monde["sn"], nom) for nom in ("Cardiol", "Tensio", "Lipido")]
    ref.definir_portefeuille(terrain["cardio"], produits[:2])
    return produits


def url(visite, suite=""):
    return f"/api/v1/visites/{visite.pk}/rapport/{suite}"


def resultat(monde, code="objectif_atteint"):
    return Valeur.objects.get(pays=monde["sn"], liste="resultat_visite", code=code)


def type_action(monde, code="revisiter"):
    return Valeur.objects.get(pays=monde["sn"], liste="type_action", code=code)


def complet(monde, produits, **autres):
    return {"presentations": [{"produit": str(p.pk), "retour": "prescrit"} for p in produits],
            "resultat": str(resultat(monde).pk),
            "resume": "Intérêt pour la nouvelle forme", "prochaine_action": "Revenir avec l'étude",
            "prochaine_action_type": str(type_action(monde).pk),
            **autres}  # fmt: skip


@freeze_time("2026-10-13 10:00")
def test_rpt001_ca1_une_visite_effectuee_sans_rapport_est_attendue(monde, effectuee):
    p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    (v,) = next(j for j in p["jours"] if j["date"] == "2026-10-13")["visites"]
    assert (v["statut"], v["rapport_statut"]) == ("effectuee", "attendu")


@freeze_time("2026-10-13 10:00")
def test_rpt001_le_rapport_s_ouvre_en_brouillon_une_seule_fois(monde, effectuee, portefeuille):
    c = client_de(monde["deleg.sn"])
    r1, r2 = c.get(url(effectuee)).json(), c.get(url(effectuee)).json()
    assert r1["id"] == r2["id"] and r1["statut"] == "brouillon"
    # RG-033 : seuls les produits du portefeuille du réseau sont proposés.
    assert [p["libelle"] for p in r1["produits_proposes"]] == ["Cardiol", "Tensio"]
    assert "Objectif atteint" in [r["libelle"] for r in r1["resultats_proposes"]]
    assert r1["manquants"] == [
        "produits",
        "resultat",
        "resume",
        "prochaine_action_type",
        "prochaine_action",
    ]
    assert Rapport.objects.count() == 1


@freeze_time("2026-10-13 10:00")
def test_rpt002_ca1_impossible_de_soumettre_sans_le_socle(monde, effectuee, portefeuille):
    c = client_de(monde["deleg.sn"])
    c.put(url(effectuee), {"resume": "Bonne écoute"}, format="json")
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert (r.status_code, r.json()["code"]) == (400, "rapport_incomplet")
    assert r.json()["details"]["manquants"] == [
        "produits",
        "resultat",
        "prochaine_action_type",
        "prochaine_action",
    ]
    r = c.put(url(effectuee), complet(monde, portefeuille[:2]), format="json")
    assert r.json()["manquants"] == []
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert (r.status_code, r.json()["statut"]) == (200, "soumis")
    # L'ordre de présentation est gardé.
    assert [p["produit"] for p in r.json()["presentations"]] == [
        str(portefeuille[0].pk), str(portefeuille[1].pk)]  # fmt: skip
    assert EvenementAudit.objects.filter(action="rapport.soumission").count() == 1
    p = c.get("/api/v1/programme/").json()
    (v,) = next(j for j in p["jours"] if j["date"] == "2026-10-13")["visites"]
    assert v["rapport_statut"] == "soumis"
    # Soumis, il ne se modifie plus (validation et correction au cycle 0.6).
    r = c.put(url(effectuee), {"resume": "Autre"}, format="json")
    assert (r.status_code, r.json()["code"]) == (409, "rapport_non_modifiable")


@freeze_time("2026-10-13 10:00")
def test_rg033_un_produit_hors_portefeuille_est_refuse(monde, effectuee, portefeuille):
    saisie = {"presentations": [{"produit": str(portefeuille[2].pk)}]}
    r = client_de(monde["deleg.sn"]).put(url(effectuee), saisie, format="json")
    assert (r.status_code, r.json()["code"]) == (400, "produit_hors_portefeuille")


@freeze_time("2026-10-13 10:00")
def test_rpt008_les_champs_du_pays_et_leur_caractere_obligatoire(monde, effectuee, portefeuille):
    creer_champ(monde["sn"], libelle="Patients par semaine", type="nombre", obligatoire=True)
    creer_champ(monde["sn"], libelle="Disponibilité", type="liste",
                options=["Matin", "Après-midi"])  # fmt: skip
    c = client_de(monde["deleg.sn"])
    r = c.get(url(effectuee)).json()
    assert [(d["code"], d["type"], d["obligatoire"]) for d in r["definitions"]] == [
        ("patients_par_semaine", "nombre", True), ("disponibilite", "liste", False)]  # fmt: skip
    # Un nombre attendu, un choix de la liste.
    r = c.put(url(effectuee), {"champs": {"patients_par_semaine": "beaucoup"}}, format="json")
    assert (r.status_code, r.json()["code"]) == (400, "champ_invalide")
    r = c.put(url(effectuee), {"champs": {"disponibilite": "Soir"}}, format="json")
    assert r.json()["code"] == "champ_invalide"
    c.put(url(effectuee), complet(monde, portefeuille[:1], champs={"disponibilite": "Matin"}),
          format="json")  # fmt: skip
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert r.json()["details"]["manquants"] == ["patients_par_semaine"]
    c.put(url(effectuee), {"champs": {"patients_par_semaine": 40, "disponibilite": "Matin"}},
          format="json")  # fmt: skip
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert r.json()["statut"] == "soumis"
    assert r.json()["champs"] == {"patients_par_semaine": 40, "disponibilite": "Matin"}


@freeze_time("2026-10-13 10:00")
def test_rpt008_ca1_un_champ_ajoute_ne_vaut_que_pour_les_nouveaux(monde, effectuee):
    c = client_de(monde["deleg.sn"])
    assert c.get(url(effectuee)).json()["definitions"] == []
    creer_champ(monde["sn"], libelle="Patients par semaine", type="nombre", obligatoire=True)
    r = c.get(url(effectuee)).json()
    assert r["definitions"] == [] and r["manquants"] == [
        "produits", "resultat", "resume", "prochaine_action_type", "prochaine_action"]  # fmt: skip


@freeze_time("2026-10-13 08:00")
def test_pas_de_rapport_avant_la_fin_de_la_visite(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        visite = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                         prospect=terrain["medecin"],
                                         etablissement=terrain["clinique"])  # fmt: skip
    r = client_de(monde["deleg.sn"]).get(url(visite))
    assert (r.status_code, r.json()["code"]) == (409, "visite_non_effectuee")


def test_rpt008_l_administrateur_pays_gere_les_champs(monde):
    admin, deleg = client_de(monde["admin.sn"]), client_de(monde["deleg.sn"])
    r = admin.post("/api/v1/rapports/champs/", {"libelle": "Disponibilité", "type": "liste",
                                                "options": ["Matin"]}, format="json")  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (400, "options_requises")
    r = admin.post("/api/v1/rapports/champs/", {"libelle": "Disponibilité", "type": "liste",
                                                "options": ["Matin", "Après-midi"],
                                                "obligatoire": True}, format="json")  # fmt: skip
    assert r.status_code == 201, r.json()
    champ = r.json()["id"]
    r = admin.patch(f"/api/v1/rapports/champs/{champ}/", {"obligatoire": False}, format="json")
    assert r.json()["obligatoire"] is False
    assert [c["libelle"] for c in admin.get("/api/v1/rapports/champs/").json()] == [
        "Disponibilité"]  # fmt: skip
    assert admin.post(f"/api/v1/rapports/champs/{champ}/archiver/").status_code == 200
    assert admin.get("/api/v1/rapports/champs/").json() == []
    # Le délégué ne les gère pas.
    r = deleg.post("/api/v1/rapports/champs/", {"libelle": "X", "type": "texte"}, format="json")
    assert r.status_code == 403

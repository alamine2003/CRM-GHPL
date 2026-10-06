"""0.3.8 : escalade vers le DM (PLN-016, RG-019) et rappels (NOT-006).

PLN-016 CA1 : l'escalade notifie le DM du périmètre. CA2 : la décision du DM porte le mode
`escalade`. RG-019 : sans planning approuvé le lundi matin, le DM est alerté. NOT-006 CA1 : les
heures suivent le fuseau du pays (Dakar est à UTC+0 : le dernier test l'éprouve sur un
fuseau décalé)."""

from datetime import UTC, date, datetime, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.notifications.models import Notification
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import echeances, services

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)
FILE = "/api/v1/plannings/a-valider/"


def instant(texte: str) -> datetime:
    return datetime.fromisoformat(texte).replace(tzinfo=UTC)


@pytest.fixture
def perimetre(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    return terrain


@pytest.fixture
def soumis_vendredi(monde, perimetre):
    """Soumis le vendredi 9 octobre à 17 h (Dakar), sans décision."""
    planning = perimetre["planning"]
    with freeze_time("2026-10-09 17:00"):
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=perimetre["medecin"],
                                etablissement=perimetre["clinique"], objectif="A")  # fmt: skip
        services.soumettre(planning)
    return planning


def notifications(utilisateur, type_):
    return Notification.objects.filter(destinataire=utilisateur, type=type_)


def test_heures_ouvrees_sans_le_week_end(monde):
    sn = monde["sn"]
    vendredi = instant("2026-10-09 17:00")
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-12 00:00")) == 7
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-12 17:00")) == 24
    services.creer_jour_ferie(sn, date=date(2026, 10, 12), libelle="Férié fictif")
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-13 17:00")) == 24


def test_pln016_ca1_sans_decision_24_h_ouvrees_le_dm_est_notifie(monde, soumis_vendredi):
    dm = monde["dm.sn"]
    with freeze_time("2026-10-12 16:59"):
        assert echeances.executer()["escalades"] == 0
    with freeze_time("2026-10-12 17:00"):
        assert echeances.executer()["escalades"] == 1
        # Une seule fois : la passe suivante ne répète rien.
        assert echeances.executer()["escalades"] == 0
    notif = notifications(dm, "escalade").get()
    assert (notif.donnees["planning"], notif.donnees["heures"]) == (str(soumis_vendredi.pk), 24)
    assert soumis_vendredi.versions.first().escalade_le is not None
    assert EvenementAudit.objects.filter(action="planning.escalade").exists()
    # Le DM le trouve dans sa file, escaladé, avec le responsable resté sans décision.
    with freeze_time("2026-10-12 17:05"):
        ligne = client_de(dm).get(FILE).json()[0]
    assert ligne["planning"]["id"] == str(soumis_vendredi.pk)
    assert [r["id"] for r in ligne["escalade"]["responsables"]] == [str(monde["sup.sn"].pk)]


def test_pln016_ca2_la_decision_du_dm_porte_le_mode_escalade(monde, soumis_vendredi):
    with freeze_time("2026-10-12 17:00"):
        echeances.executer()
    with freeze_time("2026-10-12 18:00"):
        r = client_de(monde["dm.sn"]).post(f"/api/v1/plannings/{soumis_vendredi.pk}/approuver/")
    assert r.status_code == 200, r.json()
    assert (r.json()["decision"]["mode"], r.json()["statut"]) == ("escalade", "approuve")


def test_avant_l_escalade_le_dm_ne_decide_pas_et_le_superviseur_garde_la_main(
    monde, soumis_vendredi
):
    with freeze_time("2026-10-12 10:00"):
        r = client_de(monde["dm.sn"]).post(f"/api/v1/plannings/{soumis_vendredi.pk}/approuver/")
        assert r.status_code == 404
        assert client_de(monde["dm.sn"]).get(FILE).json() == []
    with freeze_time("2026-10-12 17:00"):
        echeances.executer()
    with freeze_time("2026-10-12 18:00"):
        r = client_de(monde["sup.sn"]).post(f"/api/v1/plannings/{soumis_vendredi.pk}/approuver/")
    assert r.json()["decision"]["mode"] == "direct"


def test_rg019_lundi_matin_le_dm_apprend_les_plannings_non_approuves(monde, soumis_vendredi):
    dm = monde["dm.sn"]
    with freeze_time("2026-10-12 08:59"):
        assert echeances.executer()["alertes"] == 0
    with freeze_time("2026-10-12 09:00"):
        assert echeances.executer()["alertes"] == 1
        assert echeances.executer()["alertes"] == 0
    assert notifications(dm, "plannings_non_approuves").get().donnees["nombre"] == 1


def test_un_planning_approuve_n_alerte_pas_le_dm(monde, soumis_vendredi):
    with freeze_time("2026-10-12 08:00"):
        services.approuver(soumis_vendredi, monde["sup.sn"])
    with freeze_time("2026-10-12 09:00"):
        assert echeances.executer()["alertes"] == 0


def test_not006_rappel_du_planning_non_soumis_le_mercredi(monde, perimetre):
    deleg = monde["deleg.sn"]
    with freeze_time("2026-10-07 08:59"):
        assert echeances.executer()["rappels"] == 0
    with freeze_time("2026-10-07 09:00"):
        assert echeances.executer()["rappels"] == 1
        assert echeances.executer()["rappels"] == 0
    notif = notifications(deleg, "rappel_planning").get()
    assert (notif.donnees["semaine"], notif.donnees["numero_semaine"]) == ("2026-10-12", 42)
    # Après l'échéance (jeudi 18 h), plus de rappel : le retard se dit autrement.
    Notification.objects.all().delete()
    with freeze_time("2026-10-08 18:00"):
        assert echeances.executer()["rappels"] == 0


def test_not006_un_planning_soumis_n_est_pas_rappele(monde, perimetre):
    planning = perimetre["planning"]
    with freeze_time("2026-10-06 10:00"):
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=perimetre["medecin"],
                                etablissement=perimetre["clinique"], objectif="A")  # fmt: skip
        services.soumettre(planning)
    with freeze_time("2026-10-07 09:00"):
        assert echeances.executer()["rappels"] == 0


def test_not006_un_mercredi_ferie_reporte_le_rappel(monde, perimetre):
    services.creer_jour_ferie(monde["sn"], date=date(2026, 10, 7), libelle="Férié fictif")
    with freeze_time("2026-10-07 10:00"):
        assert echeances.executer()["rappels"] == 0
    with freeze_time("2026-10-08 08:00"):
        assert echeances.executer()["rappels"] == 1


def test_not006_ca1_l_heure_est_celle_du_pays(monde, perimetre):
    """Un pays à UTC+1 : 9 h locales, c'est 8 h UTC."""
    sn = monde["sn"]
    sn.fuseau = "Africa/Lagos"
    sn.save(update_fields=["fuseau"])
    with freeze_time("2026-10-07 07:59"):
        assert echeances.executer()["rappels"] == 0
    with freeze_time("2026-10-07 08:00"):
        assert echeances.executer()["rappels"] == 1


def test_la_tache_du_worker_fait_la_meme_passe(monde, perimetre):
    """Toutes les 15 minutes (architecture §7.5) ; sans Redis, la tâche s'exécute sur place."""
    from apps.planning.taches import echeances as tache

    with freeze_time("2026-10-07 09:00"):
        assert tache.delay().get()["rappels"] == 1

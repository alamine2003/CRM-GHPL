"""0.3.8 : escalade (PLN-016, RG-019) et rappels (NOT-006) ; 0.3.9 : rappel du
vendredi 9 h et fermeture du lundi 0 h (décision du 6 octobre 2026).

PLN-016 CA1 : l'escalade notifie l'administrateur pays (1.3.0 [D], à la place du DM). CA2 : sa
décision porte le mode `escalade`. RG-019 : sans planning approuvé à la fermeture du lundi 0 h,
il est alerté.
NOT-006 CA1 : les heures suivent le fuseau du pays (Dakar est à UTC+0 : un test l'éprouve sur
un fuseau décalé)."""

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


def soumis_le(perimetre, instant_: str):
    planning = perimetre["planning"]
    with freeze_time(instant_):
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=perimetre["medecin"],
                                etablissement=perimetre["clinique"], objectif="A")  # fmt: skip
        services.soumettre(planning)
    return planning


@pytest.fixture
def soumis_mardi(monde, perimetre):
    """Soumis le mardi 6 octobre à 17 h (Dakar), sans décision : 24 h ouvrées plus tard, le
    mercredi 7 à 17 h, bien avant la fermeture du lundi 12 à 0 h."""
    return soumis_le(perimetre, "2026-10-06 17:00")


@pytest.fixture
def soumis_vendredi(monde, perimetre):
    """Soumis le vendredi 9 octobre à 17 h (Dakar), sans décision."""
    return soumis_le(perimetre, "2026-10-09 17:00")


def notifications(utilisateur, type_):
    return Notification.objects.filter(destinataire=utilisateur, type=type_)


def test_heures_ouvrees_sans_le_week_end(monde):
    sn = monde["sn"]
    vendredi = instant("2026-10-09 17:00")
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-12 00:00")) == 7
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-12 17:00")) == 24
    services.creer_jour_ferie(sn, date=date(2026, 10, 12), libelle="Férié fictif")
    assert echeances.heures_ouvrees(sn, vendredi, instant("2026-10-13 17:00")) == 24


def test_pln016_ca1_sans_decision_24_h_ouvrees_l_administrateur_est_notifie(monde, soumis_mardi):
    admin = monde["admin.sn"]
    soumis_vendredi = soumis_mardi
    with freeze_time("2026-10-07 16:59"):
        assert echeances.executer()["escalades"] == 0
    with freeze_time("2026-10-07 17:00"):
        assert echeances.executer()["escalades"] == 1
        # Une seule fois : la passe suivante ne répète rien.
        assert echeances.executer()["escalades"] == 0
    notif = notifications(admin, "escalade").get()
    assert (notif.donnees["planning"], notif.donnees["heures"]) == (str(soumis_vendredi.pk), 24)
    assert soumis_vendredi.versions.first().escalade_le is not None
    assert EvenementAudit.objects.filter(action="planning.escalade").exists()
    # L'administrateur le trouve dans sa file, escaladé, avec le responsable resté sans décision.
    with freeze_time("2026-10-07 17:05"):
        ligne = client_de(admin).get(FILE).json()[0]
    assert ligne["planning"]["id"] == str(soumis_vendredi.pk)
    assert [r["id"] for r in ligne["escalade"]["responsables"]] == [str(monde["sup.sn"].pk)]


def test_pln016_ca2_la_decision_de_l_administrateur_porte_le_mode_escalade(monde, soumis_mardi):
    with freeze_time("2026-10-07 17:00"):
        echeances.executer()
    with freeze_time("2026-10-07 18:00"):
        r = client_de(monde["admin.sn"]).post(f"/api/v1/plannings/{soumis_mardi.pk}/approuver/")
    assert r.status_code == 200, r.json()
    assert (r.json()["decision"]["mode"], r.json()["statut"]) == ("escalade", "approuve")


def test_avant_l_escalade_l_administrateur_ne_decide_pas_et_le_superviseur_garde_la_main(
    monde, soumis_mardi
):
    with freeze_time("2026-10-07 10:00"):
        r = client_de(monde["admin.sn"]).post(f"/api/v1/plannings/{soumis_mardi.pk}/approuver/")
        assert r.status_code == 404
        assert client_de(monde["admin.sn"]).get(FILE).json() == []
    with freeze_time("2026-10-07 17:00"):
        echeances.executer()
    with freeze_time("2026-10-07 18:00"):
        r = client_de(monde["sup.sn"]).post(f"/api/v1/plannings/{soumis_mardi.pk}/approuver/")
    assert r.json()["decision"]["mode"] == "direct"


def test_un_planning_ferme_n_escalade_pas_avant_sa_reouverture(monde, soumis_vendredi):
    """Soumis le vendredi 17 h, il ferme le lundi 0 h sans décision : l'escalade du lundi 17 h
    n'a plus lieu d'être, sauf si le superviseur rouvre sa rédaction."""
    with freeze_time("2026-10-12 17:00"):
        assert echeances.executer()["escalades"] == 0
    with freeze_time("2026-10-12 18:00"):
        services.rouvrir(monde["sn"], monde["deleg.sn"], date(2026, 10, 12), monde["sup.sn"])
        assert echeances.executer()["escalades"] == 1


def test_rg019_a_la_fermeture_l_administrateur_apprend_les_plannings_non_approuves(
    monde, soumis_vendredi
):
    admin = monde["admin.sn"]
    semaine_42 = notifications(admin, "plannings_non_approuves").filter(
        donnees__semaine="2026-10-12"
    )
    with freeze_time("2026-10-11 23:59"):
        echeances.executer()
        assert not semaine_42.exists()
    with freeze_time("2026-10-12 00:00"):
        assert echeances.executer()["alertes"] == 1
        assert echeances.executer()["alertes"] == 0
    assert semaine_42.get().donnees["nombre"] == 1


def test_un_planning_approuve_n_alerte_pas_l_administrateur(monde, soumis_vendredi):
    with freeze_time("2026-10-10 08:00"):
        services.approuver(soumis_vendredi, monde["sup.sn"])
    Notification.objects.all().delete()
    with freeze_time("2026-10-12 00:00"):
        assert echeances.executer()["alertes"] == 0


def test_not006_rappel_du_planning_non_soumis_le_vendredi(monde, perimetre):
    deleg = monde["deleg.sn"]
    with freeze_time("2026-10-09 08:59"):
        assert echeances.executer()["rappels"] == 0
    with freeze_time("2026-10-09 09:00"):
        assert echeances.executer()["rappels"] == 1
        assert echeances.executer()["rappels"] == 0
    notif = notifications(deleg, "rappel_planning").get()
    assert (notif.donnees["semaine"], notif.donnees["numero_semaine"]) == ("2026-10-12", 42)
    assert notif.donnees["echeance"] == "2026-10-12T00:00:00+00:00"
    # Le rappel vaut jusqu'à la fermeture du lundi 0 h, pas au-delà.
    Notification.objects.all().delete()
    with freeze_time("2026-10-11 23:45"):
        assert echeances.executer()["rappels"] == 1
    Notification.objects.all().delete()
    with freeze_time("2026-10-12 00:00"):
        assert echeances.executer()["rappels"] == 0


def test_not006_un_planning_soumis_n_est_pas_rappele(monde, perimetre):
    planning = perimetre["planning"]
    with freeze_time("2026-10-06 10:00"):
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=perimetre["medecin"],
                                etablissement=perimetre["clinique"], objectif="A")  # fmt: skip
        services.soumettre(planning)
    with freeze_time("2026-10-09 09:00"):
        assert echeances.executer()["rappels"] == 0


def test_not006_ca1_l_heure_est_celle_du_pays(monde, perimetre):
    """Un pays à UTC+1 : 9 h locales, c'est 8 h UTC."""
    sn = monde["sn"]
    sn.fuseau = "Africa/Lagos"
    sn.save(update_fields=["fuseau"])
    with freeze_time("2026-10-09 07:59"):
        assert echeances.executer()["rappels"] == 0
    with freeze_time("2026-10-09 08:00"):
        assert echeances.executer()["rappels"] == 1


def test_la_tache_du_worker_fait_la_meme_passe(monde, perimetre):
    """Toutes les 15 minutes (architecture §7.5) ; sans Redis, la tâche s'exécute sur place."""
    from apps.planning.taches import echeances as tache

    with freeze_time("2026-10-09 09:00"):
        assert tache.delay().get()["rappels"] == 1


def test_rg019_un_delegue_sans_planning_compte_dans_l_alerte(monde, perimetre):
    """Le délégué qui n'a rien préparé compte parmi les plannings non approuvés."""
    from apps.planning.models import Planning

    Planning.objects.filter(pk=perimetre["planning"].pk).delete()
    with freeze_time("2026-10-12 00:00"):
        assert echeances.executer()["alertes"] == 1
    notif = notifications(monde["admin.sn"], "plannings_non_approuves").get(
        donnees__semaine="2026-10-12")  # fmt: skip
    assert notif.donnees["nombre"] == 1

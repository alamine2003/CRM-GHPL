"""0.8.5 : NOT-002 (notifications push) et NOT-003 (regroupement anti-saturation)."""

from datetime import timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.identite.models import Appareil
from apps.identite.services import revoquer_appareil
from apps.notifications import push
from apps.notifications.models import Notification, TypeNotification
from apps.notifications.services import notifier, notifier_regroupe

from .conftest import connecter

pytestmark = pytest.mark.django_db

JETON = "ExponentPushToken[aBcDeFgHiJkLmNoP0123]"


def session_mobile(api):
    jetons = connecter(api).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {jetons['acces']}")
    return api


@pytest.fixture
def envois(monkeypatch, settings):
    """Le service d'Expo est remplacé : on garde ce qui serait parti."""
    settings.PUSH_ACTIF = True
    partis: list[dict] = []

    def transport(messages):
        partis.extend(messages)
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push, "transport", transport)
    return partis


@pytest.fixture
def inscrit(delegue):
    appareil = Appareil.objects.create(
        utilisateur=delegue, identifiant_installation="tel-1", plateforme="android",
        jeton_push=JETON,
    )  # fmt: skip
    return appareil


def test_not002_le_telephone_donne_son_adresse_et_la_retire(api, delegue):
    c = session_mobile(api)
    assert c.put("/api/v1/auth/push/", {"jeton": "pas-un-jeton"}, format="json").status_code == 400
    assert c.put("/api/v1/auth/push/", {"jeton": JETON}, format="json").status_code == 204
    appareil = Appareil.objects.get(utilisateur=delegue)
    assert appareil.jeton_push == JETON and appareil.jeton_push_le is not None
    # Déconnecté, le téléphone ne reçoit plus rien.
    assert c.post("/api/v1/auth/deconnexion/").status_code == 204
    appareil.refresh_from_db()
    assert appareil.jeton_push == ""


def test_not002_le_portail_n_a_pas_d_adresse_push(api, delegue):
    jetons = connecter(api, client="portail").json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {jetons['acces']}")
    r = api.put("/api/v1/auth/push/", {"jeton": JETON}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "appareil_requis"


def test_not002_un_telephone_revoque_ne_recoit_plus_rien(delegue, inscrit):
    revoquer_appareil(inscrit, par=None)
    inscrit.refresh_from_db()
    assert inscrit.jeton_push == ""


def test_not003_ca1_vingt_rapports_en_dix_minutes_une_seule_notification(delegue, inscrit, envois):
    """CA1 : 20 rapports soumis en 10 minutes, une seule notification « 20 rapports à
    valider » ; puis au plus une par heure pour ce type."""
    pays = delegue.pays_principal
    debut = timezone.now().replace(microsecond=0)
    with freeze_time(debut) as horloge:
        for _ in range(20):
            notifier_regroupe(delegue, TypeNotification.RAPPORTS_SOUMIS, pays, cle="2026-10-13")
            horloge.tick(timedelta(seconds=27))
        assert push.envoyer(debut + timedelta(minutes=5)) == 0  # la rafale se regroupe
        assert push.envoyer(debut + timedelta(minutes=12)) == 1
    assert [m["body"] for m in envois] == ["20 rapports à valider."]
    assert envois[0]["to"] == JETON and envois[0]["title"] == "INNOV CRM"
    # Un vingt et unième, vingt minutes plus tard : il attend l'heure.
    with freeze_time(debut + timedelta(minutes=20)):
        notifier_regroupe(delegue, TypeNotification.RAPPORTS_SOUMIS, pays, cle="2026-10-13")
    assert push.envoyer(debut + timedelta(minutes=40)) == 0
    assert push.envoyer(debut + timedelta(minutes=73)) == 1
    assert envois[-1]["body"] == "21 rapports à valider."


def test_not002_ca2_ni_nom_ni_texte_libre_sur_l_ecran_verrouille(delegue, inscrit, envois):
    """CA2 : la phrase est générique ; les données jointes ne portent que des identifiants
    et des dates, pour ouvrir l'objet au toucher (CA1)."""
    pays = delegue.pays_principal
    il_y_a = timezone.now() - timedelta(minutes=15)
    with freeze_time(il_y_a):
        n = notifier(delegue, TypeNotification.CORRECTION_DEMANDEE, pays, nom="Dr Fatou SECRET",
                     visite="0190aaaa-0000-7000-8000-000000000001", date="2026-10-13",
                     commentaire="Diabète : préciser le traitement")  # fmt: skip
    assert push.envoyer() == 1
    (message,) = envois
    assert message["body"] == "Une correction de rapport est demandée."
    assert "SECRET" not in str(message) and "Diabète" not in str(message)
    assert message["data"] == {"notification": str(n.pk), "type": "correction_demandee",
                               "visite": "0190aaaa-0000-7000-8000-000000000001",
                               "date": "2026-10-13"}  # fmt: skip
    n.refresh_from_db()
    assert n.push_du is None and n.push_le is not None


def test_not002_dans_la_langue_de_la_personne(delegue, inscrit, envois):
    delegue.langue = "en"
    delegue.save(update_fields=["langue"])
    with freeze_time(timezone.now() - timedelta(minutes=15)):
        notifier(delegue, TypeNotification.PLANNING_APPROUVE, delegue.pays_principal)
    push.envoyer()
    assert envois[0]["body"] == "Your plan is approved."


def test_not002_sans_telephone_la_notification_reste_au_centre(delegue, envois):
    with freeze_time(timezone.now() - timedelta(minutes=15)):
        n = notifier(delegue, TypeNotification.PLANNING_APPROUVE, delegue.pays_principal)
    assert push.envoyer() == 0 and envois == []
    n.refresh_from_db()
    assert (n.push_du, n.push_le, n.lue_le) == (None, None, None)


def test_not002_service_injoignable_et_application_desinstallee(
    delegue, inscrit, monkeypatch, settings
):
    settings.PUSH_ACTIF = True
    with freeze_time(timezone.now() - timedelta(minutes=15)):
        n = notifier(delegue, TypeNotification.PLANNING_APPROUVE, delegue.pays_principal)

    def injoignable(messages):
        raise OSError("réseau")

    monkeypatch.setattr(push, "transport", injoignable)
    assert push.envoyer() == 0
    n.refresh_from_db()
    assert n.push_du is not None  # due, la passe suivante réessaiera
    desinstallee = [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]
    monkeypatch.setattr(push, "transport", lambda m: desinstallee)
    assert push.envoyer() == 1
    inscrit.refresh_from_db()
    assert inscrit.jeton_push == ""


def test_not002_desactive_rien_ne_part(delegue, inscrit, settings):
    settings.PUSH_ACTIF = False
    notifier(delegue, TypeNotification.PLANNING_APPROUVE, delegue.pays_principal)
    assert push.envoyer(timezone.now() + timedelta(hours=1)) == 0
    assert Notification.objects.get().push_du is not None


def test_les_taches_periodiques_sont_connues_du_worker():
    """Chaque tâche de l'ordonnanceur est enregistrée auprès du worker (modules `taches`)."""
    from config.celery import app

    app.loader.import_default_modules()
    for entree in app.conf.beat_schedule.values():
        assert entree["task"] in app.tasks, entree["task"]

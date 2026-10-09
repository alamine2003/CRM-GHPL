"""0.8.6 : NOT-004 (courriels de sécurité seulement) et NOT-005 (préférences de notification)."""

import ast
from datetime import timedelta
from pathlib import Path

import pytest
from django.core import mail
from django.utils import timezone
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role
from apps.notifications import preferences, push, secours
from apps.notifications.models import Notification, TypeNotification
from apps.notifications.services import notifier, notifier_regroupe
from apps.socle.erreurs import ErreurMetier

from .conftest import MOT_DE_PASSE, TELEPHONE, connecter
from .test_double_auth import activer

pytestmark = pytest.mark.django_db

RACINE = Path(__file__).resolve().parents[3]
#: NOT-004 : les seuls courriels d'INNOV CRM, tous dans `identite/courriels.py`.
COURRIELS_PERMIS = {
    "courriel_reinitialisation", "courriel_verrouillage", "courriel_nouvel_appareil",
    "courriel_double_auth", "courriel_secours",
}  # fmt: skip


def test_not004_ca1_aucun_autre_module_n_envoie_de_courriel():
    """CA1 : aucun autre courriel n'est envoyé ; tout envoi passe par les courriels de sécurité."""
    envoi = {"send_mail", "send_mass_mail", "EmailMessage", "EmailMultiAlternatives",
             "mail_admins", "mail_managers"}  # fmt: skip
    fautifs = []
    for fichier in RACINE.glob("apps/**/*.py"):
        if "tests" in fichier.parts or fichier.name == "courriels.py":
            continue
        for noeud in ast.walk(ast.parse(fichier.read_text(encoding="utf-8"))):
            nom = getattr(noeud, "id", None) or getattr(noeud, "attr", None)
            if nom in envoi:
                fautifs.append(f"{fichier.relative_to(RACINE)}:{noeud.lineno}")
    assert fautifs == []
    module = ast.parse((RACINE / "apps/identite/courriels.py").read_text(encoding="utf-8"))
    publiques = {
        f.name for f in module.body
        if isinstance(f, ast.FunctionDef) and not f.name.startswith("_")
    }  # fmt: skip
    assert publiques == COURRIELS_PERMIS


def test_not004_un_nouveau_telephone_est_signale(api, delegue):
    connecter(api)
    assert mail.outbox == []  # le premier téléphone du compte n'est pas une alerte
    autre = {**TELEPHONE, "identifiant_installation": "f0e1d2c3-b4a5-4968-8776-655443322110"}
    api.post("/api/v1/auth/connexion/", {"identifiant": "awa.diallo", "mot_de_passe": MOT_DE_PASSE,
                                         "client": "mobile", "appareil": autre},
             format="json")  # fmt: skip
    (courriel,) = mail.outbox
    assert courriel.to == ["awa.diallo@exemple.org"] and "Galaxy A15" in courriel.body
    assert "nouveau téléphone" in courriel.subject


def test_not004_la_double_authentification_activee_est_signalee(delegue):
    activer(delegue)
    (courriel,) = mail.outbox
    assert "double authentification" in courriel.subject


def test_not004_secours_d_une_decision_en_attente_depuis_48_h(delegue):
    """Un seul courriel, sans nom ni détail, et une seule fois par demande."""
    pays = delegue.pays_principal
    il_y_a = timezone.now() - timedelta(hours=49)
    with freeze_time(il_y_a):
        notifier(delegue, TypeNotification.PLANNING_SOUMIS, pays, nom="Fatou SECRET")
        notifier_regroupe(delegue, TypeNotification.RAPPORTS_SOUMIS, pays, cle="j1")
    # Des rapports soumis depuis s'ajoutent sans repousser l'attente du premier.
    notifier_regroupe(delegue, TypeNotification.RAPPORTS_SOUMIS, pays, cle="j1")
    with freeze_time(timezone.now() - timedelta(hours=2)):
        notifier(delegue, TypeNotification.REOUVERTURE_DEMANDEE, pays)  # trop récente
        notifier(delegue, TypeNotification.PLANNING_APPROUVE, pays)  # pas une décision
    assert secours.courriels(pays, timezone.now()) == 1
    (courriel,) = mail.outbox
    assert "3 demande(s)" in courriel.body and "SECRET" not in courriel.body
    assert secours.courriels(pays, timezone.now()) == 0
    assert Notification.objects.filter(secours_le__isnull=False).count() == 2


def test_not004_lue_la_demande_ne_declenche_rien(delegue):
    pays = delegue.pays_principal
    with freeze_time(timezone.now() - timedelta(hours=50)):
        n = notifier(delegue, TypeNotification.PLANNING_SOUMIS, pays)
    n.lue_le = timezone.now()
    n.save(update_fields=["lue_le"])
    assert secours.courriels(pays, timezone.now()) == 0 and mail.outbox == []


@pytest.fixture
def deleg(delegue):
    attribuer_role(delegue, Role.DELEGUE, delegue.pays_principal, par=None)
    return delegue


def test_not005_chacun_ses_preferences_dans_les_limites_du_pays(api, deleg):
    connecter(api, client="portail")
    jetons = connecter(api).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {jetons['acces']}")
    liste = api.get("/api/v1/auth/preferences/notifications/").json()
    par_type = {p["type"]: p for p in liste}
    assert par_type["correction_demandee"] == {"type": "correction_demandee",
                                               "obligatoire": True, "push": True}  # fmt: skip
    assert par_type["rapports_valides"]["obligatoire"] is False
    assert "rapports_soumis" not in par_type  # le délégué ne valide pas
    r = api.put("/api/v1/auth/preferences/notifications/",
                {"coupes": ["rapports_valides", "rappel_planning"]}, format="json")  # fmt: skip
    assert r.status_code == 200
    assert {p["type"]: p["push"] for p in r.json()}["rapports_valides"] is False


def test_not005_ca1_une_notification_obligatoire_ne_se_coupe_pas(api, deleg):
    for obligatoire in ("revision_demandee", "correction_demandee"):
        with pytest.raises(ErreurMetier) as refus:
            preferences.changer(deleg, [obligatoire])
        assert refus.value.code == "notification_obligatoire"
    with pytest.raises(ErreurMetier) as refus:
        preferences.changer(deleg, ["rapports_soumis"])
    assert refus.value.code == "notification_inconnue"
    # Le pays peut en rendre d'autres obligatoires.
    from apps.socle.services import definir_parametre

    definir_parametre(deleg.pays_principal, "notifications_obligatoires", ["rappel_rapport"])
    with pytest.raises(ErreurMetier):
        preferences.changer(deleg, ["rappel_rapport"])


def test_not005_coupee_elle_reste_au_centre_sans_push(deleg, settings, monkeypatch):
    from apps.identite.models import Appareil

    settings.PUSH_ACTIF = True
    partis = []
    monkeypatch.setattr(push, "transport", lambda m: partis.extend(m) or [{} for _ in m])
    Appareil.objects.create(utilisateur=deleg, identifiant_installation="t", plateforme="ios",
                            jeton_push="ExponentPushToken[abcdefgh12]")  # fmt: skip
    preferences.changer(deleg, ["rapports_valides"])
    pays = deleg.pays_principal
    with freeze_time(timezone.now() - timedelta(minutes=15)):
        notifier(deleg, TypeNotification.RAPPORTS_VALIDES, pays)
        notifier(deleg, TypeNotification.CORRECTION_DEMANDEE, pays)
    assert push.envoyer() == 1
    assert [m["data"]["type"] for m in partis] == ["correction_demandee"]
    assert Notification.objects.filter(type="rapports_valides", lue_le__isnull=True).exists()

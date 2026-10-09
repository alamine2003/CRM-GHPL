"""USR-006 (appareils) et USR-004 (langue de l'utilisateur)."""

import pytest

from apps.identite.models import Appareil, Role
from apps.identite.services import attribuer_role, creer_utilisateur

from .conftest import TELEPHONE, connecter

pytestmark = pytest.mark.django_db


def jetons(api):
    reponse = connecter(api)
    assert reponse.status_code == 200, reponse.content
    return reponse.json()


def test_le_telephone_est_enregistre_a_la_premiere_connexion(api, delegue):
    jetons(api)
    jetons(api)
    appareil = Appareil.objects.get(utilisateur=delegue)
    assert (appareil.plateforme, appareil.systeme, appareil.modele, appareil.version_app) == (
        "android", "Android 14", "Galaxy A15", "0.0.6",
    )  # fmt: skip


def test_la_connexion_mobile_exige_la_description_du_telephone(api, delegue):
    from .conftest import MOT_DE_PASSE

    reponse = api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "awa.diallo", "mot_de_passe": MOT_DE_PASSE, "client": "mobile"},
        format="json",
    )
    assert reponse.status_code == 400 and reponse.json()["code"] == "appareil_requis"


@pytest.fixture
def admin_pays(senegal):
    compte = creer_utilisateur("ibrahima.ndiaye", prenom="Ibrahima", nom="Ndiaye", pays=senegal)
    attribuer_role(compte, Role.ADMIN_PAYS, senegal, par=None)
    attribuer_role(
        creer_utilisateur("rokhaya.sarr", prenom="R", nom="S", pays=senegal),
        Role.RESPONSABLE_PAYS, senegal, par=None,
    )  # fmt: skip
    return compte


def client_de(utilisateur):
    from apps.perimetre.tests.conftest import client_de as client

    return client(utilisateur)


def test_l_administrateur_pays_voit_les_appareils(api, delegue, admin_pays):
    """CA1 : appareil, système, version, dernier contact."""
    attribuer_role(delegue, Role.DELEGUE, delegue.pays_principal, par=None)
    jetons(api)
    liste = client_de(admin_pays).get("/api/v1/appareils/").json()
    assert len(liste) == 1
    ligne = liste[0]
    assert ligne["identifiant"] == "awa.diallo" and ligne["systeme"] == "Android 14"
    assert ligne["version_app"] == "0.0.6" and ligne["dernier_contact"] and not ligne["revoque"]


def test_un_appareil_revoque_ne_peut_plus_se_connecter_ni_rafraichir(api, delegue, admin_pays):
    """CA2 : sans session ni reconnexion, plus de synchronisation possible."""
    attribuer_role(delegue, Role.DELEGUE, delegue.pays_principal, par=None)
    rafraichissement = jetons(api)["rafraichissement"]
    appareil = Appareil.objects.get(utilisateur=delegue)
    reponse = client_de(admin_pays).post(f"/api/v1/appareils/{appareil.pk}/revoquer/")
    assert reponse.status_code == 200 and reponse.json()["revoque"] is True
    rafraichi = api.post(
        "/api/v1/auth/rafraichir/", {"rafraichissement": rafraichissement}, format="json"
    )
    # SEC-006 CA1 : le téléphone apprend la révocation, pas une simple expiration.
    assert rafraichi.status_code == 403 and rafraichi.json()["code"] == "appareil_revoque"
    refus = connecter(api)
    assert refus.status_code == 403 and refus.json()["code"] == "appareil_revoque"
    # Un autre téléphone du même compte reste utilisable.
    from .conftest import MOT_DE_PASSE

    autre = {**TELEPHONE, "identifiant_installation": "f0e1d2c3-b4a5-4968-8776-655443322110"}
    reponse = api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "awa.diallo", "mot_de_passe": MOT_DE_PASSE, "client": "mobile",
         "appareil": autre},
        format="json",
    )  # fmt: skip
    assert reponse.status_code == 200


def test_le_responsable_pays_ne_revoque_pas(api, delegue, admin_pays):
    from apps.identite.models import Utilisateur

    jetons(api)
    appareil = Appareil.objects.get(utilisateur=delegue)
    responsable = Utilisateur.objects.get(username="rokhaya.sarr")
    reponse = client_de(responsable).post(f"/api/v1/appareils/{appareil.pk}/revoquer/")
    assert reponse.status_code == 403


def test_un_autre_pays_ne_voit_pas_les_appareils(api, delegue, admin_pays):
    from apps.socle.services import creer_pays

    tg = creer_pays("TG")
    admin_tg = creer_utilisateur("kossi.mensah", prenom="Kossi", nom="Mensah", pays=tg)
    attribuer_role(admin_tg, Role.ADMIN_PAYS, tg, par=None)
    jetons(api)
    appareil = Appareil.objects.get(utilisateur=delegue)
    assert client_de(admin_tg).get("/api/v1/appareils/").json() == []
    assert client_de(admin_tg).post(f"/api/v1/appareils/{appareil.pk}/revoquer/").status_code == 404


def test_l_utilisateur_choisit_sa_langue(api, delegue):
    """USR-004 : la langue par défaut est celle du pays ; l'utilisateur la change."""
    assert delegue.langue == "fr"
    acces = jetons(api)["acces"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
    reponse = api.patch("/api/v1/auth/moi/", {"langue": "en"}, format="json")
    assert reponse.status_code == 200 and reponse.json()["langue"] == "en"
    delegue.refresh_from_db()
    assert delegue.langue == "en"
    assert api.patch("/api/v1/auth/moi/", {"langue": "wo"}, format="json").status_code == 400


def test_sec006_un_compte_suspendu_le_dit_au_telephone(api, delegue, admin_pays):
    """SEC-006 CA1 : le compte suspendu, la session fermée répond « compte_desactive » au lieu
    d'une expiration ; le téléphone efface alors ses données."""
    from apps.identite.services import suspendre_utilisateur

    rafraichissement = jetons(api)["rafraichissement"]
    suspendre_utilisateur(delegue)
    rafraichi = api.post(
        "/api/v1/auth/rafraichir/", {"rafraichissement": rafraichissement}, format="json"
    )
    assert rafraichi.status_code == 403 and rafraichi.json()["code"] == "compte_desactive"
    # Une session simplement expirée reste une expiration.
    from apps.identite.services import reactiver_utilisateur

    reactiver_utilisateur(delegue)
    rafraichissement = jetons(api)["rafraichissement"]
    from apps.identite.models import Session

    Session.objects.filter(utilisateur=delegue).update(expire_le="2020-01-01T00:00:00Z")
    rafraichi = api.post(
        "/api/v1/auth/rafraichir/", {"rafraichissement": rafraichissement}, format="json"
    )
    assert rafraichi.status_code == 401 and rafraichi.json()["code"] == "session_expiree"


def test_kpi05_chaque_jour_de_synchronisation_est_note_une_fois(api, delegue):
    """0.9.7 : la connexion et chaque rafraîchissement du téléphone notent le jour (à la date
    du pays), une seule fois par jour, pour mesurer l'adoption (KPI-05)."""
    from freezegun import freeze_time

    from apps.identite.models import JourDeContact

    with freeze_time("2026-10-12 08:00"):
        rafraichissement = jetons(api)["rafraichissement"]
        for _ in range(2):
            r = api.post("/api/v1/auth/rafraichir/", {"rafraichissement": rafraichissement},
                         format="json")  # fmt: skip
            rafraichissement = r.json()["rafraichissement"]
    with freeze_time("2026-10-13 08:00"):
        api.post("/api/v1/auth/rafraichir/", {"rafraichissement": rafraichissement},
                 format="json")  # fmt: skip
    jours = sorted(str(j) for j in JourDeContact.objects.filter(utilisateur=delegue)
                   .values_list("jour", flat=True))  # fmt: skip
    assert jours == ["2026-10-12", "2026-10-13"]

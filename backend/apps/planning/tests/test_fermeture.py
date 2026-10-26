"""0.3.9 : fermeture de la semaine le lundi 0 h et réouverture par le superviseur (RG-013,
PLN-008 ; décisions du 6 octobre 2026, prd.md §14.21).

Le délégué rédige son planning, le superviseur le valide. Le lundi 0 h de la semaine, tout
planning qui n'est pas validé est fermé : plus de soumission, de décision ni de modification.
Le délégué demande la réouverture ; seul le superviseur l'accorde, et elle reste inscrite : on
sait que le planning n'a pas été fait à temps. Un planning validé ne se modifie plus dès le
lundi 0 h."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.notifications.models import Notification
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services

from .conftest import SEMAINE

pytestmark = pytest.mark.django_db

LUNDI = date(2026, 10, 12)
MARDI = date(2026, 10, 13)
FERMES = "/api/v1/plannings/fermes/"
ROUVRIR = "/api/v1/plannings/fermes/rouvrir/"
DEMANDE = "/api/v1/plannings/semaine/reouverture/"
#: Mardi de la semaine du 12 octobre, après la fermeture (Dakar est à UTC+0).
APRES = "2026-10-13 10:00"


@pytest.fixture
def supervise(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    return terrain


def visite(terrain, jour=MARDI, heure=time(9, 0)):
    return dict(date=jour, heure=heure, prospect=terrain["medecin"],
                etablissement=terrain["clinique"], objectif="A")  # fmt: skip


def corps_visite(terrain) -> dict:
    return {"date": "2026-10-14", "heure": "16:00", "prospect": str(terrain["medecin"].pk),
            "etablissement": str(terrain["clinique"].pk), "objectif": "B"}  # fmt: skip


def sans_planning(terrain):
    """Le délégué n'a rien préparé : le planning du terrain n'existe pas."""
    from apps.planning.models import Planning

    Planning.objects.filter(pk=terrain["planning"].pk).delete()


def rouvrir(client, monde):
    return client.post(ROUVRIR, {"delegue": str(monde["deleg.sn"].pk), "semaine": "2026-10-12"},
                       format="json")  # fmt: skip


def test_l_echeance_est_le_lundi_0_h_de_la_semaine(supervise):
    echeance = services.echeance(supervise["planning"])
    assert echeance.isoformat() == "2026-10-12T00:00:00+00:00"


def test_un_brouillon_est_ferme_le_lundi_0_h(monde, supervise):
    planning = supervise["planning"]
    with freeze_time("2026-10-11 23:59"):
        assert not services.est_ferme(planning)
    with freeze_time("2026-10-12 00:00"):
        deleg = client_de(monde["deleg.sn"])
        r = deleg.post(f"/api/v1/plannings/{planning.pk}/visites/", corps_visite(supervise),
                       format="json")  # fmt: skip
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")
        r = deleg.post(f"/api/v1/plannings/{planning.pk}/soumettre/")
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")
        semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert (semaine["fermee"], semaine["modifiable"], semaine["demande_envoyee"]) == (
        True, False, False)  # fmt: skip
    assert semaine["planning"]["ferme"] is True


def test_sans_planning_la_semaine_ne_se_cree_plus_apres_la_fermeture(monde, supervise):
    sans_planning(supervise)
    with freeze_time(APRES):
        deleg = client_de(monde["deleg.sn"])
        r = deleg.post("/api/v1/plannings/", {"semaine": "2026-10-12"}, format="json")
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")
        semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
        assert (semaine["fermee"], semaine["peut_creer"]) == (True, False)
        # La semaine suivante, elle, se prépare normalement.
        suivante = deleg.get(SEMAINE, {"semaine": "2026-10-19"}).json()
        assert (suivante["fermee"], suivante["peut_creer"]) == (False, True)


def test_un_planning_soumis_sans_decision_est_ferme_aussi(monde, supervise):
    planning = supervise["planning"]
    with freeze_time("2026-10-09 17:00"):
        services.ajouter_visite(planning, **visite(supervise))
        services.soumettre(planning)
    sup = client_de(monde["sup.sn"])
    with freeze_time(APRES):
        sup = client_de(monde["sup.sn"])
        r = sup.post(f"/api/v1/plannings/{planning.pk}/approuver/")
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")
        r = sup.post(f"/api/v1/plannings/{planning.pk}/reviser/", {"commentaire": "Revoir"},
                     format="json")  # fmt: skip
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")
        # Il quitte la file des plannings à décider pour la liste des semaines fermées.
        assert sup.get("/api/v1/plannings/a-valider/").json() == []
        (ligne,) = sup.get(FERMES).json()
    assert (ligne["delegue"]["id"], ligne["semaine"]) == (str(monde["deleg.sn"].pk), "2026-10-12")
    assert (ligne["planning"]["statut"], ligne["demande"]) == ("soumis", False)


def test_un_planning_valide_ne_se_modifie_plus_des_le_lundi_0_h(monde, supervise):
    planning = supervise["planning"]
    with freeze_time("2026-10-08 09:00"):
        mardi = services.ajouter_visite(planning, **visite(supervise))
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    with freeze_time("2026-10-11 20:00"):
        r = client_de(monde["deleg.sn"]).patch(f"/api/v1/visites/{mardi.pk}/", {"heure": "10:00"},
                                               format="json")  # fmt: skip
        assert r.status_code == 200
    with freeze_time("2026-10-12 00:00"):
        deleg = client_de(monde["deleg.sn"])
        r = deleg.patch(f"/api/v1/visites/{mardi.pk}/", {"heure": "11:00"}, format="json")
        assert (r.status_code, r.json()["code"]) == (409, "semaine_commencee")
        r = deleg.post(f"/api/v1/plannings/{planning.pk}/visites/", corps_visite(supervise),
                       format="json")  # fmt: skip
        assert (r.status_code, r.json()["code"]) == (409, "semaine_commencee")
        semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
        # Validé, il n'est pas « fermé » : c'est la référence de la semaine.
        assert (semaine["fermee"], semaine["planning"]["ferme"]) == (False, False)
        assert semaine["approbation"]["modifiable"] is False
        assert client_de(monde["sup.sn"]).get(FERMES).json() == []


def test_le_delegue_demande_la_reouverture_une_seule_fois(monde, supervise):
    with freeze_time(APRES):
        deleg = client_de(monde["deleg.sn"])
        r = deleg.post(DEMANDE, {"semaine": "2026-10-12"}, format="json")
        assert r.status_code == 200, r.json()
        assert r.json()["destinataires"] == 1
        assert deleg.post(DEMANDE, {"semaine": "2026-10-12"}, format="json").json() == {
            "destinataires": 0}  # fmt: skip
        assert deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()["demande_envoyee"] is True
        (ligne,) = client_de(monde["sup.sn"]).get(FERMES).json()
    assert ligne["demande"] is True
    notif = Notification.objects.get(destinataire=monde["sup.sn"], type="reouverture_demandee")
    assert notif.donnees["semaine"] == "2026-10-12"
    assert notif.donnees["nom"].startswith(monde["deleg.sn"].first_name)


def test_pas_de_demande_avant_la_fermeture(monde, supervise):
    with freeze_time("2026-10-11 10:00"):
        r = client_de(monde["deleg.sn"]).post(DEMANDE, {"semaine": "2026-10-12"}, format="json")
    assert (r.status_code, r.json()["code"]) == (409, "semaine_ouverte")


def test_le_superviseur_rouvre_la_redaction_et_la_reouverture_reste_inscrite(monde, supervise):
    planning = supervise["planning"]
    with freeze_time(APRES):
        r = rouvrir(client_de(monde["sup.sn"]), monde)
        assert r.status_code == 200, r.json()
        assert (r.json()["id"], r.json()["ferme"]) == (str(planning.pk), False)
        assert r.json()["reouvert_le"].startswith("2026-10-13T10:00")
        # Une seule fois : rien à rouvrir ensuite.
        assert rouvrir(client_de(monde["sup.sn"]), monde).json()["code"] == "semaine_ouverte"
    planning.refresh_from_db()
    assert planning.reouvert_par == monde["sup.sn"]
    assert EvenementAudit.objects.filter(action="planning.reouverture").exists()
    assert Notification.objects.filter(destinataire=monde["deleg.sn"],
                                       type="redaction_rouverte").exists()  # fmt: skip
    # Le délégué rédige et soumet : la soumission est en retard, le superviseur décide.
    with freeze_time("2026-10-13 11:00"):
        deleg = client_de(monde["deleg.sn"])
        r = deleg.post(f"/api/v1/plannings/{planning.pk}/visites/", corps_visite(supervise),
                       format="json")  # fmt: skip
        assert r.status_code == 201, r.json()
        r = deleg.post(f"/api/v1/plannings/{planning.pk}/soumettre/")
        assert (r.json()["statut"], r.json()["en_retard"]) == ("soumis", True)
        r = client_de(monde["sup.sn"]).post(f"/api/v1/plannings/{planning.pk}/approuver/")
        assert r.json()["statut"] == "approuve"


def test_sans_planning_la_reouverture_le_cree(monde, supervise):
    sans_planning(supervise)
    with freeze_time(APRES):
        (ligne,) = client_de(monde["sup.sn"]).get(FERMES).json()
        assert ligne["planning"] is None
        r = rouvrir(client_de(monde["sup.sn"]), monde)
        assert (r.status_code, r.json()["statut"]) == (200, "brouillon")
        semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert (semaine["fermee"], semaine["modifiable"]) == (False, True)


def test_seul_le_superviseur_du_poste_rouvre(monde, supervise):
    with freeze_time(APRES):
        r = rouvrir(client_de(monde["admin.sn"]), monde)
        assert (r.status_code, r.json()["code"]) == (403, "non_decideur")
        # 1.3.0 [D] : le DM ne décide plus.
        r = rouvrir(client_de(monde["dm.sn"]), monde)
        assert (r.status_code, r.json()["code"]) == (403, "interdit")
        # Le délégué ne se rouvre pas lui-même : la réouverture n'est pas dans ses droits.
        assert rouvrir(client_de(monde["deleg.sn"]), monde).status_code == 403
        assert services.est_ferme(supervise["planning"])


def test_rien_a_rouvrir_avant_la_fermeture_ni_une_semaine_passee(monde, supervise):
    with freeze_time("2026-10-11 10:00"):
        assert rouvrir(client_de(monde["sup.sn"]), monde).json()["code"] == "semaine_ouverte"
    with freeze_time("2026-10-20 10:00"):
        assert rouvrir(client_de(monde["sup.sn"]), monde).json()["code"] == "semaine_passee"
        # Seule la semaine en cours (celle du 19) figure parmi les semaines fermées.
        assert [ligne["semaine"] for ligne in client_de(monde["sup.sn"]).get(FERMES).json()] == [
            "2026-10-19"]  # fmt: skip


def test_un_planning_a_reviser_est_ferme_aussi(monde, supervise):
    planning = supervise["planning"]
    with freeze_time("2026-10-08 09:00"):
        services.ajouter_visite(planning, **visite(supervise))
        services.soumettre(planning)
        services.demander_revision(planning, monde["sup.sn"], "Ajoutez des visites.")
    with freeze_time(APRES):
        planning.refresh_from_db()
        assert (planning.statut, services.est_ferme(planning)) == ("a_reviser", True)
        r = client_de(monde["deleg.sn"]).post(f"/api/v1/plannings/{planning.pk}/soumettre/")
        assert (r.status_code, r.json()["code"]) == (409, "semaine_fermee")


def test_le_remplacant_recoit_la_demande_et_rouvre(monde, supervise):
    """Pendant un remplacement (ORG-013), la demande va aussi au remplaçant, qui rouvre."""
    from apps.identite.models import Role
    from apps.identite.services import attribuer_role, creer_utilisateur

    remplacant = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF",
                                   pays=monde["sn"])  # fmt: skip
    attribuer_role(remplacant, Role.SUPERVISEUR, monde["sn"], par=None)
    with freeze_time(APRES):
        org.designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 13),
                                date(2026, 10, 16), par=monde["sup.sn"])  # fmt: skip
        r = client_de(monde["deleg.sn"]).post(DEMANDE, {"semaine": "2026-10-12"}, format="json")
        assert r.json()["destinataires"] == 2
        assert Notification.objects.filter(destinataire=remplacant,
                                           type="reouverture_demandee").exists()  # fmt: skip
        (ligne,) = client_de(remplacant).get(FERMES).json()
        assert ligne["demande"] is True
        r = rouvrir(client_de(remplacant), monde)
        assert r.status_code == 200, r.json()
    supervise["planning"].refresh_from_db()
    assert supervise["planning"].reouvert_par == remplacant

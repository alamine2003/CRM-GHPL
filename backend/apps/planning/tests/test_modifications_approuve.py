"""0.3.7 : verrouillage et modifications d'un planning approuvé (PLN-015, RG-018).

CA1 : changer l'heure d'une visite dans la même journée ne change pas le statut.
CA2 : ajouter une visite crée une version soumise ; les autres visites restent exécutables.
Tout autre changement — jour, prospect, lieu, objectif, retrait, activité — est majeur ; une
journée passée ne se modifie plus."""

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

MARDI = date(2026, 10, 13)
MERCREDI = date(2026, 10, 14)
JEUDI = date(2026, 10, 15)


@pytest.fixture
def approuve(monde, terrain):
    """Soumis le mercredi 7 à temps, approuvé le lendemain : mardi 9 h et mercredi 11 h."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    visite = dict(prospect=terrain["medecin"], etablissement=terrain["clinique"])
    with freeze_time("2026-10-07 09:00"):
        mardi = services.ajouter_visite(planning, date=MARDI, heure=time(9, 0), objectif="A",
                                        **visite)  # fmt: skip
        mercredi = services.ajouter_visite(planning, date=MERCREDI, heure=time(11, 0),
                                           objectif="B", **visite)  # fmt: skip
        services.soumettre(planning)
    with freeze_time("2026-10-08 10:00"):
        services.approuver(planning, monde["sup.sn"])
    planning.refresh_from_db()
    return planning, mardi, mercredi


def visite_url(visite) -> str:
    return f"/api/v1/visites/{visite.pk}/"


@freeze_time("2026-10-10 09:00")
def test_ca1_l_heure_changee_dans_la_journee_reste_approuvee_et_tracee(monde, terrain, approuve):
    planning, mardi, _ = approuve
    deleg = client_de(monde["deleg.sn"])
    # Le téléphone renvoie tout le formulaire : seule l'heure change vraiment.
    r = deleg.patch(visite_url(mardi), {"date": "2026-10-13", "heure": "10:30", "objectif": "A"},
                    format="json")  # fmt: skip
    assert r.status_code == 200, r.json()
    planning.refresh_from_db()
    assert planning.statut == "approuve"
    assert planning.versions.count() == 1
    trace = planning.versions.get().modifications
    assert [(m["visite"], m["avant"], m["apres"]) for m in trace] == [
        (str(mardi.pk), "09:00", "10:30")]  # fmt: skip
    assert EvenementAudit.objects.filter(action="visite.modification_mineure").exists()
    # Le superviseur la lit dans la consultation, avec le prospect.
    c = client_de(monde["sup.sn"]).get(f"/api/v1/plannings/{planning.pk}/consultation/").json()
    assert c["approbation"]["reference"] == 1
    assert [(m["prospect"], m["avant"], m["apres"]) for m in c["approbation"]["mineures"]] == [
        ("Awa NDIAYE", "09:00", "10:30")]  # fmt: skip
    assert c["approbation"]["en_attente"] == []
    # Le délégué peut encore le modifier : il est verrouillé, pas figé.
    semaine = deleg.get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert semaine["modifiable"] is False and semaine["approbation"]["modifiable"] is True


@freeze_time("2026-10-10 09:00")
def test_ca2_ajouter_une_visite_cree_une_version_soumise(monde, terrain, approuve):
    planning, mardi, mercredi = approuve
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{planning.pk}/visites/",
        {"date": "2026-10-15", "heure": "16:00", "prospect": str(terrain["medecin"].pk),
         "etablissement": str(terrain["clinique"].pk), "objectif": "C"},
        format="json",
    )  # fmt: skip
    assert r.status_code == 201, r.json()
    planning.refresh_from_db()
    assert (planning.statut, planning.en_retard) == ("soumis", False)
    v2 = planning.versions.first()
    assert (v2.numero, v2.motif) == (2, "modification")
    # Le superviseur est notifié de la modification à décider.
    notif = Notification.objects.filter(destinataire=monde["sup.sn"], type="planning_soumis")
    assert notif.first().donnees["motif"] == "modification"
    # Seule la visite ajoutée attend la décision ; les autres restent exécutables.
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    assert semaine["planning"]["motif_version"] == "modification"
    assert semaine["approbation"]["en_attente"] == [r.json()["id"]]
    assert semaine["approbation"]["modifiable"] is False


@freeze_time("2026-10-10 09:00")
@pytest.mark.parametrize(
    "champs",
    [{"date": JEUDI}, {"heure": time(10, 0), "date": JEUDI}, {"objectif": "Autre"},
     {"note": "Apporter les échantillons"}],
    ids=["jour", "jour_et_heure", "objectif", "note"],
)  # fmt: skip
def test_tout_autre_changement_est_majeur(approuve, champs):
    planning, mardi, _ = approuve
    services.modifier_visite(mardi, **champs)
    planning.refresh_from_db()
    assert planning.statut == "soumis"
    assert services.suivi_apres_approbation(planning)["en_attente"] == [str(mardi.pk)]


@freeze_time("2026-10-10 09:00")
def test_le_retrait_attend_la_decision_et_la_suite_aussi(monde, approuve):
    planning, mardi, mercredi = approuve
    services.retirer_visite(mercredi)
    planning.refresh_from_db()
    suivi = services.suivi_apres_approbation(planning)
    assert [v["id"] for v in suivi["retraits"]] == [str(mercredi.pk)]
    assert suivi["en_attente"] == []
    # Tant que la modification attend la décision, rien d'autre ne change.
    r = client_de(monde["deleg.sn"]).patch(visite_url(mardi), {"heure": "10:00"}, format="json")
    assert (r.status_code, r.json()["code"]) == (409, "modification_en_attente")


@freeze_time("2026-10-10 09:00")
def test_un_changement_majeur_bloque_est_refuse_sans_rien_changer(monde, terrain, approuve):
    planning, *_ = approuve
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{planning.pk}/visites/",
        {"date": "2026-10-13", "heure": "15:00", "prospect": str(terrain["medecin"].pk),
         "etablissement": str(terrain["clinique"].pk), "objectif": "Même jour"},
        format="json",
    )  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (400, "planning_bloque")
    planning.refresh_from_db()
    assert planning.statut == "approuve"
    assert planning.visites.filter(archive_le__isnull=True).count() == 2


def test_des_le_lundi_0_h_plus_rien_ne_change(monde, approuve):
    """Décision du 6 octobre 2026 : la semaine commencée, le planning validé ne se modifie
    plus, même l'heure d'une visite à venir."""
    planning, mardi, mercredi = approuve
    with freeze_time("2026-10-14 08:00"):
        deleg = client_de(monde["deleg.sn"])
        for visite, champs in ((mardi, {"heure": "15:00"}), (mercredi, {"date": "2026-10-13"}),
                               (mercredi, {"heure": "14:00"})):  # fmt: skip
            r = deleg.patch(visite_url(visite), champs, format="json")
            assert (r.status_code, r.json()["code"]) == (409, "semaine_commencee")
    planning.refresh_from_db()
    assert planning.statut == "approuve"


@freeze_time("2026-10-10 09:00")
def test_poser_depuis_la_liste_cible_demande_des_visites_completes(monde, terrain, approuve):
    """Les visites posées depuis la liste cible restent à compléter : sur un planning approuvé,
    où chaque ajout est soumis aussitôt, elles s'ajoutent complètes, une à une."""
    planning, *_ = approuve
    r = client_de(monde["deleg.sn"]).post(
        f"/api/v1/plannings/{planning.pk}/poser/",
        {"date": "2026-10-15", "prospects": [str(terrain["medecin"].pk)]}, format="json",
    )  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "ajout_incomplet")
    planning.refresh_from_db()
    assert planning.statut == "approuve"


def test_la_modification_approuvee_devient_la_reference(monde, approuve):
    planning, mardi, mercredi = approuve
    with freeze_time("2026-10-09 09:00"):
        services.modifier_visite(mardi, heure=time(10, 30))  # mineure
        services.modifier_visite(mercredi, date=JEUDI)  # majeure
    with freeze_time("2026-10-09 15:00"):
        services.approuver(planning, monde["sup.sn"])
    planning.refresh_from_db()
    assert planning.statut == "approuve"
    suivi = services.suivi_apres_approbation(planning)
    assert (suivi["reference"], suivi["mineures"], suivi["modifiable"]) == (2, [], True)
    # L'historique ne compte que le changement majeur : l'heure changée était tracée à part.
    (v2, comparaison), (v1, _) = services.versions_avec_comparaison(planning)
    assert [d["visite"]["id"] for d in comparaison["deplacees"]] == [str(mercredi.pk)]
    assert (v2.motif, len(v1.modifications)) == ("modification", 1)

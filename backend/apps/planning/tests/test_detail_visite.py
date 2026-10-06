"""0.4.2 : détail d'une visite (VIS-002) : prospect, lieu, objectif, coordonnées, et les trois
dernières visites du délégué chez ce prospect. CA1 : l'historique ne montre que les visites du
délégué."""

from datetime import date, time, timedelta

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services
from apps.planning.models import Planning

pytestmark = pytest.mark.django_db


def semaine_approuvee(monde, terrain, delegue, lundi, jours=(1,), objectif="A", statut=None):
    """Une visite chez le médecin par jour donné ; la semaine est soumise et approuvée, ou
    posée directement dans l'état voulu (une semaine passée, déjà « terminée »)."""
    planning, _ = Planning.objects.get_or_create(pays=monde["sn"], delegue=delegue,
                                                 semaine=lundi)  # fmt: skip
    visites = [
        services.ajouter_visite(planning, date=lundi + timedelta(days=j), heure=time(9, 0),
                                prospect=terrain["medecin"], etablissement=terrain["clinique"],
                                objectif=f"{objectif} {j}")
        for j in jours
    ]  # fmt: skip
    if statut:
        Planning.objects.filter(pk=planning.pk).update(statut=statut)
    else:
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    return visites


@pytest.fixture
def passe(monde, terrain):
    """Quatre semaines de visites chez le même médecin, approuvées, avant celle du 12 octobre."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    anciennes = []
    for lundi in (date(2026, 9, 14), date(2026, 9, 21), date(2026, 9, 28)):
        with freeze_time(lundi - timedelta(days=4)):
            anciennes += semaine_approuvee(monde, terrain, monde["deleg.sn"], lundi, jours=(1, 3),
                                           statut="termine")  # fmt: skip
    with freeze_time("2026-10-08 09:00"):
        (actuelle,) = semaine_approuvee(monde, terrain, monde["deleg.sn"], date(2026, 10, 12))
    return anciennes, actuelle


def test_vis002_le_detail_dit_le_prospect_le_lieu_et_les_coordonnees(monde, terrain, passe):
    _, actuelle = passe
    medecin, clinique = terrain["medecin"], terrain["clinique"]
    medecin.telephone_mobile = "+221 70 000 00 00"
    medecin.save(update_fields=["telephone_mobile"])
    clinique.adresse, clinique.latitude, clinique.longitude = "Rue fictive 1", 14.7, -17.4
    clinique.save(update_fields=["adresse", "latitude", "longitude"])
    with freeze_time("2026-10-13 08:00"):
        d = client_de(monde["deleg.sn"]).get(f"/api/v1/visites/{actuelle.pk}/detail/").json()
    assert (d["visite"]["id"], d["visite"]["objectif"]) == (str(actuelle.pk), "A 1")
    assert d["prospect"]["telephone_mobile"] == "+221 70 000 00 00"
    assert (d["lieu"]["nom"], d["lieu"]["adresse"]) == ("Clinique du Cap", "Rue fictive 1")
    assert (d["lieu"]["latitude"], d["lieu"]["longitude"]) == ("14.700000", "-17.400000")


def test_vis002_les_trois_dernieres_visites_de_la_plus_recente(monde, passe):
    anciennes, actuelle = passe
    with freeze_time("2026-10-13 08:00"):
        d = client_de(monde["deleg.sn"]).get(f"/api/v1/visites/{actuelle.pk}/detail/").json()
    attendues = sorted(anciennes, key=lambda v: v.date, reverse=True)[:3]
    assert [h["id"] for h in d["historique"]] == [str(v.pk) for v in attendues]
    assert [h["date"] for h in d["historique"]] == ["2026-10-01", "2026-09-29", "2026-09-24"]
    assert d["historique"][0]["etablissement"] == "Clinique du Cap"


def test_vis002_ca1_l_historique_ne_montre_que_les_visites_du_delegue(monde, terrain, passe):
    """Un collègue a vu le même médecin plus récemment : son passage n'apparaît pas."""
    _, actuelle = passe
    collegue = monde["deleg2.sn"] if "deleg2.sn" in monde else None
    if collegue is None:
        from apps.identite.models import Role
        from apps.identite.services import attribuer_role, creer_utilisateur

        collegue = creer_utilisateur("moussa.fictif", prenom="Moussa", nom="FICTIF",
                                     pays=monde["sn"])  # fmt: skip
        attribuer_role(collegue, Role.DELEGUE, monde["sn"], par=None)
    poste = org.creer_poste(monde["sn"], "vm", "VM Fictif", [terrain["cardio"]],
                            [terrain["secteur"]])  # fmt: skip
    org.occuper(poste, collegue, date(2026, 1, 1))
    org.rattacher(poste, monde["sup.sn"], date(2026, 1, 1))
    with freeze_time("2026-10-01 09:00"):
        (sienne,) = semaine_approuvee(monde, terrain, collegue, date(2026, 10, 5), jours=(2,),
                                      statut="termine")  # fmt: skip
    with freeze_time("2026-10-13 08:00"):
        d = client_de(monde["deleg.sn"]).get(f"/api/v1/visites/{actuelle.pk}/detail/").json()
        # Le collègue ne lit pas la visite d'un autre.
        r = client_de(collegue).get(f"/api/v1/visites/{actuelle.pk}/detail/")
    assert str(sienne.pk) not in [h["id"] for h in d["historique"]]
    assert r.status_code == 404


def test_un_planning_non_approuve_n_entre_pas_dans_l_historique(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    with freeze_time("2026-10-01 09:00"):
        semaine_approuvee(monde, terrain, monde["deleg.sn"], date(2026, 10, 5), statut="brouillon")
    with freeze_time("2026-10-08 09:00"):
        (actuelle,) = semaine_approuvee(monde, terrain, monde["deleg.sn"], date(2026, 10, 12))
        d = client_de(monde["deleg.sn"]).get(f"/api/v1/visites/{actuelle.pk}/detail/").json()
    assert d["historique"] == []

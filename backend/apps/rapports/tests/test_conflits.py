# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.8.4 : OFF-004, conflits sans perte silencieuse (RG-050 à RG-053) ; rapports et visites."""

from datetime import time

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.planning import services as pln
from apps.planning.models import Visite
from apps.rapports import validation
from apps.rapports.models import Rapport

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db


@freeze_time("2026-10-13 10:00")
def test_rg052_une_saisie_sur_une_version_perimee_est_un_conflit(monde, effectuee, portefeuille):
    """RG-052 : deux téléphones partent de la même version ; le second ne remplace pas le
    premier en silence. Le rapport et sa version sont relus pour choisir (RG-053)."""
    c = client_de(monde["deleg.sn"])
    lu = c.get(url(effectuee)).json()
    assert lu["version"] == 1
    premier = c.put(url(effectuee), {"resume": "Téléphone A", "version": 1}, format="json")
    assert premier.status_code == 200 and premier.json()["version"] == 2
    second = c.put(url(effectuee), {"resume": "Téléphone B", "version": 1}, format="json")
    assert second.status_code == 409, second.content
    assert second.json()["code"] == "conflit_version"
    assert second.json()["details"]["version"] == 2
    assert Rapport.objects.get().resume == "Téléphone A"
    # Le délégué choisit sa version en connaissance de cause : il repart de la version 2.
    choisi = c.put(url(effectuee), {"resume": "Téléphone B", "version": 2}, format="json")
    assert choisi.status_code == 200 and Rapport.objects.get().resume == "Téléphone B"


@freeze_time("2026-10-13 10:00")
def test_off002_le_modele_vierge_part_de_la_version_0(monde, effectuee, portefeuille):
    """Le modèle gardé par le téléphone (version 0) s'enregistre à la première écriture ; si un
    autre appareil a déjà écrit le rapport, c'est un conflit."""
    c = client_de(monde["deleg.sn"])
    assert c.put(url(effectuee), {"resume": "Hors ligne", "version": 0},
                 format="json").status_code == 200  # fmt: skip
    refus = c.put(url(effectuee), {"resume": "Autre téléphone", "version": 0}, format="json")
    assert refus.status_code == 409 and refus.json()["code"] == "conflit_version"
    # Sans version (portail, anciens clients), l'enregistrement reste possible.
    assert c.put(url(effectuee), {"resume": "Sans version"}, format="json").status_code == 200


@freeze_time("2026-10-13 10:00")
def test_off004_ca1_une_decision_du_superviseur_n_est_jamais_ecrasee(
    monde, effectuee, portefeuille
):
    """CA1, RG-050 : le rapport validé ne prend pas la saisie restée sur le téléphone."""
    c = client_de(monde["deleg.sn"])
    c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
    soumis = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:55:00Z"},
                    format="json")  # fmt: skip
    assert soumis.status_code == 200, soumis.content
    rapport = Rapport.objects.get()
    validation.valider_rapport(rapport, monde["sup.sn"])
    rapport.refresh_from_db()
    refus = c.put(url(effectuee), {"resume": "Saisie restée hors ligne",
                                   "version": rapport.version}, format="json")  # fmt: skip
    assert refus.status_code == 409 and refus.json()["code"] == "rapport_non_modifiable"
    rapport.refresh_from_db()
    assert rapport.statut == "valide" and rapport.resume == "Intérêt pour la nouvelle forme"


def _avant(visite: Visite) -> dict:
    return {"date": str(visite.date), "heure": visite.heure.strftime("%H:%M"),
            "objectif": visite.objectif, "note": visite.note}  # fmt: skip


@freeze_time("2026-10-08 09:00")
def test_off004_ca2_une_visite_changee_des_deux_cotes(monde, terrain):
    """CA2, RG-053 : l'heure changée ailleurs et sur le téléphone, autrement : conflit, avec la
    valeur du serveur pour la présenter au délégué. Rien n'est écrit."""
    visite = pln.ajouter_visite(terrain["planning"], date=terrain["planning"].semaine,
                                heure=time(9, 0), objectif="Présenter",
                                prospect=terrain["medecin"],
                                etablissement=terrain["clinique"])  # fmt: skip
    avant = _avant(visite)
    pln.modifier_visite(visite, heure=time(10, 0))
    c = client_de(monde["deleg.sn"])
    r = c.patch(f"/api/v1/visites/{visite.pk}/",
                {"heure": "11:00", "objectif": "Présenter", "avant": avant},
                format="json")  # fmt: skip
    assert r.status_code == 409, r.content
    assert r.json()["code"] == "conflit_version"
    assert r.json()["details"] == {"champs": ["heure"], "serveur": {"heure": "10:00:00"}}
    visite.refresh_from_db()
    assert visite.heure == time(10, 0)
    # Le délégué garde sa version : il repart de celle du serveur.
    avant["heure"] = "10:00"
    r = c.patch(f"/api/v1/visites/{visite.pk}/", {"heure": "11:00", "avant": avant},
                format="json")  # fmt: skip
    assert r.status_code == 200 and r.json()["heure"] == "11:00"


@freeze_time("2026-10-08 09:00")
def test_rg053_le_formulaire_renvoye_tel_quel_n_ecrase_pas_ce_qui_a_change(monde, terrain):
    """Le téléphone renvoie tout le formulaire : seuls les champs que le délégué a changés
    s'écrivent ; la note posée ailleurs reste. Un rangement de la journée n'est pas un
    conflit."""
    planning = terrain["planning"]
    visite = pln.ajouter_visite(planning, date=planning.semaine, heure=time(9, 0),
                                objectif="Présenter", prospect=terrain["medecin"],
                                etablissement=terrain["clinique"])  # fmt: skip
    avant = _avant(visite)
    pln.modifier_visite(visite, note="Apporter l'étude")
    pln.ranger(planning, visite.date)
    c = client_de(monde["deleg.sn"])
    r = c.patch(f"/api/v1/visites/{visite.pk}/",
                {**avant, "objectif": "Relancer", "avant": avant}, format="json")  # fmt: skip
    assert r.status_code == 200, r.content
    visite.refresh_from_db()
    assert (visite.objectif, visite.note) == ("Relancer", "Apporter l'étude")
    assert r.json()["version"] == visite.version

# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.9.4 : NFR-002, DSH-011. Les tableaux du pays entier et du siège sont gardés 5 minutes et
recalculés d'avance par le worker ; ceux d'une équipe se calculent à chaque demande. Un tableau
gardé ne sert qu'à sa portée."""

from datetime import date
from unittest import mock

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role
from apps.organisation import services as org
from apps.perimetre.tests.conftest import DEBUT_ROLES, client_de
from apps.pilotage import tableaux

from .test_equipe import delegue
from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

EQUIPE = "/api/v1/pilotage/equipe/"


def lire(monde, qui, url=EQUIPE, pays=None, **params):
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde[qui], pays).get(url, params)
    assert r.status_code == 200, r.content
    return r.json()


class calculs:
    """Compte les calculs des tableaux d'équipe, du siège et de la prescription."""

    def __enter__(self):
        from apps.pilotage import indicateurs, prescription

        self.espions = [
            mock.patch.object(module, nom, wraps=getattr(module, nom))
            for module, nom in ((indicateurs, "tableau_pilotage"), (indicateurs, "tableau_siege"),
                                (prescription, "prescription"))
        ]  # fmt: skip
        self.appels = [e.__enter__() for e in self.espions]
        return self

    def __exit__(self, *erreur):
        for e in self.espions:
            e.__exit__(*erreur)

    @property
    def nombre(self) -> int:
        return sum(a.call_count for a in self.appels)


def test_dsh011_le_pays_entier_est_garde_et_partage(monde, terrain, semaine):
    with calculs() as calcul:
        premier = lire(monde, "resp.sn")
        # Le siège qui descend au Sénégal lit le même tableau, sans le recalculer.
        siege = lire(monde, "dina.direction", pays="SN")
        assert calcul.nombre == 1
    assert premier["calcule_le"] == siege["calcule_le"]
    # DSH-011 : l'heure du calcul reste affichée, et une autre période se calcule à part.
    with calculs() as calcul:
        lire(monde, "resp.sn", periode="30j")
        assert calcul.nombre == 1


def test_dsh011_l_equipe_se_calcule_a_chaque_demande(monde, terrain, semaine):
    lire(monde, "sup.sn")
    # Un délégué rattaché après une première lecture se voit aussitôt.
    delegue(monde, terrain, "aminata.ba", "VM Médina")
    noms = [x["delegue"]["nom"] for x in lire(monde, "sup.sn")["delegues"]]
    assert "Ba" in noms


def test_dsh011_le_responsable_qui_occupe_un_poste_a_son_propre_tableau(monde, terrain):
    poste = org.creer_poste(monde["sn"], "vm", "VM Almadies", [terrain["cardio"]],
                            [terrain["secteur"]])  # fmt: skip
    # Aussi superviseur-visiteur (RG-023) : il occupe un poste du pays.
    attribuer_role(monde["resp.sn"], Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    org.occuper(poste, monde["resp.sn"], date(2026, 1, 1))
    with freeze_time("2026-10-15 12:00"):
        from apps.perimetre.perimetre import calculer_perimetre

        assert not tableaux.pays_entier(calculer_perimetre(monde["resp.sn"], "SN"))
        assert tableaux.pays_entier(calculer_perimetre(monde["dina.direction"], "SN"))


def test_dsh011_un_tableau_garde_ne_sert_qu_a_son_pays(monde, terrain, semaine):
    gabriel = str(monde["deleg.sn"].pk)
    assert gabriel in [x["delegue"]["id"] for x in lire(monde, "resp.sn")["delegues"]]
    assert gabriel not in [x["delegue"]["id"] for x in lire(monde, "resp.tg")["delegues"]]


def test_nfr002_le_worker_prepare_les_tableaux_par_defaut(monde, terrain, semaine):
    with freeze_time("2026-10-15 12:00"):
        durees = tableaux.prechauffer()
    assert {"SN", "TG", "siege"} <= durees.keys()
    # Préparés d'avance : le responsable et le siège les lisent sans calcul.
    with calculs() as calcul:
        sn = lire(monde, "resp.sn")
        lire(monde, "dina.direction", "/api/v1/pilotage/siege/")
        lire(monde, "resp.sn", "/api/v1/pilotage/prescription/")
        assert calcul.nombre == 0
    assert [x["delegue"]["id"] for x in sn["delegues"]] == [str(monde["deleg.sn"].pk)]

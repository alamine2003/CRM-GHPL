"""0.5.4 : RPT-006, prochaine action typée, avec échéance et, au besoin, visite proposée.

CA1 : la prochaine action est rappelée lors de la visite suivante du même prospect par le même
délégué (détail de la visite et rapport)."""

from datetime import UTC, date, datetime, time

import pytest
from freezegun import freeze_time

from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import execution, services

from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db

MARDI, MERCREDI = date(2026, 10, 13), date(2026, 10, 14)


@pytest.fixture
def deux_visites(monde, terrain):
    """Le même prospect, mardi puis mercredi ; la visite de mardi est effectuée."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-08 09:00"):
        visites = [services.ajouter_visite(planning, date=jour, heure=time(9, 0), objectif="A",
                                           prospect=terrain["medecin"],
                                           etablissement=terrain["clinique"])
                   for jour in (MARDI, MERCREDI)]  # fmt: skip
        services.soumettre(planning)
        services.approuver(planning, monde["sup.sn"])
    with freeze_time("2026-10-13 09:40"):
        execution.demarrer(visites[0], datetime(2026, 10, 13, 9, 2, tzinfo=UTC))
        visites[0].refresh_from_db()
        execution.terminer(visites[0], datetime(2026, 10, 13, 9, 30, tzinfo=UTC))
    return visites


@freeze_time("2026-10-13 10:00")
def test_rpt006_le_type_est_obligatoire_et_l_echeance_suit_la_visite(
    monde,
    deux_visites,
    portefeuille,  # noqa: F811
):
    mardi = deux_visites[0]
    c = client_de(monde["deleg.sn"])
    r = c.put(url(mardi), complet(monde, portefeuille[:1], prochaine_action_type=None),
              format="json").json()  # fmt: skip
    assert r["manquants"] == ["prochaine_action_type"]
    assert "Revisiter le prescripteur" in [x["libelle"] for x in r["types_action_proposes"]]
    r = c.put(url(mardi), {"prochaine_action_echeance": "2026-10-12"}, format="json")
    assert (r.status_code, r.json()["code"]) == (400, "echeance_passee")


@freeze_time("2026-10-13 10:00")
def test_rpt006_ca1_rappelee_a_la_visite_suivante(monde, deux_visites, portefeuille):  # noqa: F811
    mardi, mercredi = deux_visites
    c = client_de(monde["deleg.sn"])
    detail = f"/api/v1/visites/{mercredi.pk}/detail/"
    assert c.get(detail).json()["action_precedente"] is None
    saisie = complet(monde, portefeuille[:1], prochaine_action="Apporter l'étude pédiatrique",
                     prochaine_action_type=str(type_action(monde, "etude").pk),
                     prochaine_action_echeance="2026-10-20", visite_proposee=True)  # fmt: skip
    c.put(url(mardi), saisie, format="json")
    # Un brouillon ne se rappelle pas : seule l'action d'un rapport soumis compte.
    assert c.get(detail).json()["action_precedente"] is None
    c.post(url(mardi, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    attendu = {"date": "2026-10-13", "type": "Présenter une étude",
               "texte": "Apporter l'étude pédiatrique", "echeance": "2026-10-20",
               "visite_proposee": True}  # fmt: skip
    assert c.get(detail).json()["action_precedente"] == attendu
    with freeze_time("2026-10-14 10:00"):
        execution.demarrer(mercredi, datetime(2026, 10, 14, 9, 2, tzinfo=UTC))
        mercredi.refresh_from_db()
        execution.terminer(mercredi, datetime(2026, 10, 14, 9, 30, tzinfo=UTC))
        r = client_de(monde["deleg.sn"]).get(url(mercredi)).json()
        assert r["action_precedente"] == attendu
    # Jamais l'action d'un collègue : un autre délégué ne voit pas cette visite.
    assert client_de(monde["sup.sn"]).get(detail).status_code in {403, 404}


def test_dc47_preparer_ma_visite(monde, terrain, effectuee, portefeuille):  # noqa: F811
    """Le dernier retour sur chaque produit et les échantillons remis, à la visite suivante."""
    from apps.planning import services as pln

    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        saisie = complet(monde, portefeuille[:1],
                         remises=[{"type": "echantillon", "produit": str(portefeuille[0].pk),
                                   "quantite": 3}])  # fmt: skip
        assert c.put(url(effectuee), saisie, format="json").status_code == 200
        c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T20:00:00Z"}, format="json")
        suivante = pln.creer_planning(monde["sn"], monde["deleg.sn"], date(2026, 10, 19))
        visite = pln.ajouter_visite(suivante, date=date(2026, 10, 20), heure=time(9, 0),
                                    prospect=terrain["medecin"],
                                    etablissement=terrain["clinique"])  # fmt: skip
        d = c.get(f"/api/v1/visites/{visite.pk}/detail/").json()
    p = d["preparation"]
    assert (p["visites"], p["derniere"]) == (1, "2026-10-13")
    assert p["retours"] == [{"libelle": "Cardiol", "retour": "prescrit", "date": "2026-10-13"}]
    assert p["echantillons"] == [{"libelle": "Cardiol", "quantite": 3}]

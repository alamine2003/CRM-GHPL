"""RPT-011 (0.5.8) : chronologie des rapports d'un prospect, dans le périmètre.

CA1 : un délégué ne voit que les siens. Le superviseur voit les rapports soumis des postes qui
lui sont rattachés, jamais un brouillon ; le responsable pays, ceux du pays [H]."""

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.perimetre.tests.conftest import client_de

from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db


def chronologie(compte, prospect):
    return client_de(compte).get(f"/api/v1/prospects/{prospect.pk}/rapports/")


@pytest.fixture
def soumis(monde, terrain, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
        assert c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T20:00:00Z"},
                      format="json").status_code == 200  # fmt: skip
    return effectuee


@freeze_time("2026-10-14 08:00")
def test_rpt011_le_delegue_lit_ses_rapports_du_plus_recent(monde, terrain, soumis):
    r = chronologie(monde["deleg.sn"], terrain["medecin"])
    assert r.status_code == 200, r.content
    (rapport,) = r.json()
    assert (rapport["date"], rapport["heure"], rapport["statut"]) == (
        "2026-10-13",
        "09:00",
        "soumis",
    )
    assert rapport["presentations"][0]["libelle"] == "Cardiol"
    assert rapport["resultat"] == "Objectif atteint"
    assert rapport["prochaine_action_type"] == "Revisiter le prescripteur"
    assert rapport["etablissement"] == terrain["clinique"].nom
    assert rapport["de_moi"] is True


@freeze_time("2026-10-14 08:00")
def test_rpt011_ca1_un_autre_delegue_ne_voit_rien(monde, terrain, soumis):
    autre = creer_utilisateur("binta.fictive", prenom="Binta", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(autre, Role.DELEGUE, monde["sn"], par=None)
    r = chronologie(autre, terrain["medecin"])
    assert (r.status_code, r.json()) == (200, [])


@freeze_time("2026-10-13 12:00")
def test_rpt011_superviseur_jamais_un_brouillon(monde, terrain, effectuee, portefeuille):  # noqa: F811
    client_de(monde["deleg.sn"]).put(url(effectuee), complet(monde, portefeuille[:1]),
                                     format="json")  # fmt: skip
    # Le brouillon : le délégué le voit, son superviseur non.
    assert len(chronologie(monde["deleg.sn"], terrain["medecin"]).json()) == 1
    assert chronologie(monde["sup.sn"], terrain["medecin"]).json() == []


@freeze_time("2026-10-14 08:00")
def test_rpt011_superviseur_et_responsable_pays_lisent_le_soumis(monde, terrain, soumis):
    for compte in ("sup.sn", "resp.sn"):
        r = chronologie(monde[compte], terrain["medecin"])
        assert [(x["delegue_nom"], x["de_moi"]) for x in r.json()] == [("Gabriel Sn", False)]


@freeze_time("2026-10-14 08:00")
def test_rpt011_hors_perimetre(monde, terrain, soumis):
    # L'administration du pays n'encadre pas le terrain : pas de lecture des rapports [H].
    assert chronologie(monde["admin.sn"], terrain["medecin"]).status_code == 403
    # Un DM sans réseau dans son périmètre ne voit rien.
    assert chronologie(monde["dm.sn"], terrain["medecin"]).json() == []
    # Un autre pays : la fiche n'existe pas.
    assert chronologie(monde["resp.tg"], terrain["medecin"]).status_code == 404


def test_dc61_la_visite_proposee_revient_a_la_preparation(monde, terrain, effectuee, portefeuille):  # noqa: F811
    from datetime import date, time

    from apps.planning import services

    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        r = c.put(url(effectuee), complet(monde, portefeuille[:1], visite_proposee=True),
                  format="json")  # fmt: skip
        assert r.status_code == 200, r.content
        r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T20:00:00Z"},
                   format="json")  # fmt: skip
        assert r.json()["visite_proposee"] is True
    with freeze_time("2026-10-15 09:00"):
        c = client_de(monde["deleg.sn"])
        r = c.get("/api/v1/rapports/visites-proposees/")
        assert r.status_code == 200, r.content
        (proposee,) = r.json()
        assert proposee["prospect"]["nom"] == "NDIAYE"
        assert (proposee["date"], proposee["action"]) == ("2026-10-13", "Revisiter le prescripteur")
        # Le superviseur n'a pas de visites proposées à lui.
        assert client_de(monde["sup.sn"]).get("/api/v1/rapports/visites-proposees/").json() == []
        # Replanifiée la semaine suivante : elle ne se propose plus.
        suivante = services.creer_planning(monde["sn"], monde["deleg.sn"], date(2026, 10, 19))
        services.ajouter_visite(suivante, date=date(2026, 10, 20), heure=time(9, 0),
                                prospect=terrain["medecin"],
                                etablissement=terrain["clinique"])  # fmt: skip
        assert c.get("/api/v1/rapports/visites-proposees/").json() == []


def test_rpt011_du_plus_recent_au_plus_ancien(monde, terrain, effectuee, portefeuille):  # noqa: F811
    from datetime import UTC, datetime

    from apps.planning import execution

    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
        c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T20:00:00Z"}, format="json")
    with freeze_time("2026-10-15 11:00"):
        seconde = execution.visite_imprevue(
            monde["deleg.sn"], monde["sn"], le=datetime(2026, 10, 15, 10, 0, tzinfo=UTC),
            prospect=terrain["medecin"], etablissement=terrain["clinique"],
            justification="Rappel du prescripteur",
        )  # fmt: skip
        execution.terminer(seconde, datetime(2026, 10, 15, 10, 30, tzinfo=UTC))
        c = client_de(monde["deleg.sn"])
        assert c.put(url(seconde), complet(monde, portefeuille[:1]),
                     format="json").status_code == 200  # fmt: skip
        dates = [r["date"] for r in chronologie(monde["deleg.sn"], terrain["medecin"]).json()]
    assert dates == ["2026-10-15", "2026-10-13"]


@freeze_time("2026-10-14 08:00")
def test_dc62_dm_et_df_lisent_les_rapports_soumis_de_leurs_reseaux(monde, terrain, soumis):
    from datetime import date

    from apps.organisation import services as org

    for compte in ("dm.sn", "df.sn"):
        assert chronologie(monde[compte], terrain["medecin"]).json() == []
        org.ajouter_reseau_au_perimetre(monde[compte], terrain["cardio"], date(2026, 1, 1))
        r = chronologie(monde[compte], terrain["medecin"])
        assert [(x["delegue_nom"], x["statut"]) for x in r.json()] == [("Gabriel Sn", "soumis")]

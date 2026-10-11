"""0.6.2 : le superviseur consulte une journée de son délégué : ses visites, leurs rapports
soumis en entier, ses contrôles. RPT-007 CA2 : il lit la pièce jointe du rapport soumis.
RPT-010 CA1 : la mention « horodatage douteux » lui est visible. RG-037 : versions."""

import uuid

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de

from .test_pieces import PDF, envoi
from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/rapports/journee/"


@pytest.fixture(autouse=True)
def fichiers(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def lire(compte, delegue, jour="2026-10-13"):
    return client_de(compte).get(URL, {"delegue": str(delegue.pk), "date": jour})


def test_le_superviseur_lit_la_journee_et_le_rapport_soumis(monde, effectuee, portefeuille):  # noqa: F811
    ident = uuid.uuid4()
    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        c.put(url(effectuee), complet(monde, portefeuille[:1], resultat_obtenu="Essai accepté"),
              format="json")  # fmt: skip
        assert c.post(url(effectuee, "pieces/"), envoi(ident=ident),
                      format="multipart").status_code == 201  # fmt: skip
        # Le téléphone affiche une heure à 40 minutes de celle du serveur : horodatage douteux.
        r = c.post(url(effectuee, "soumettre/"),
                   {"soumis_le": "2026-10-13T20:00:00Z", "envoye_le": "2026-10-13T20:40:00Z"},
                   format="json")  # fmt: skip
        assert r.status_code == 200, r.content
    with freeze_time("2026-10-14 08:00"):
        r = lire(monde["sup.sn"], monde["deleg.sn"])
        assert r.status_code == 200, r.content
        j = r.json()
    assert (j["date"], j["classement"], j["fige"]) == ("2026-10-13", "conforme", False)
    assert j["planning"] == str(effectuee.planning_id)
    (visite,) = j["visites"]
    assert (visite["heure"], visite["prospect"], visite["statut"], visite["rapport_statut"]) == (
        "09:00", "Awa NDIAYE", "effectuee", "soumis")  # fmt: skip
    rapport = visite["rapport"]
    assert rapport["presentations"][0]["libelle"] == "Cardiol"
    assert (rapport["resultat"], rapport["resultat_obtenu"]) == ("Objectif atteint",
                                                                "Essai accepté")  # fmt: skip
    assert rapport["prochaine_action_type"] == "Revisiter le prescripteur"
    # RPT-010 CA1 : le superviseur voit l'horodatage douteux et les deux heures.
    assert rapport["horodatage_douteux"] is True
    assert rapport["heure_telephone"].startswith("2026-10-13T20:00")
    assert rapport["recu_le"].startswith("2026-10-13T20:00")
    assert rapport["versions"] == 1
    # RPT-007 CA2 : la pièce du rapport soumis se lit par le superviseur.
    (piece,) = rapport["pieces_jointes"]
    with freeze_time("2026-10-14 08:00"):
        lu = client_de(monde["sup.sn"]).get(f"/api/v1/rapports/pieces/{piece['id']}/")
        assert lu.status_code == 200 and b"".join(lu.streaming_content) == PDF
        assert lu["Cache-Control"] == "private, no-store"
        # Hors périmètre : un autre délégué ne la lit pas.
        assert client_de(monde["deleg.tg"]).get(
            f"/api/v1/rapports/pieces/{piece['id']}/"
        ).status_code in (403, 404)


def test_un_brouillon_reste_au_delegue(monde, effectuee, portefeuille):  # noqa: F811
    ident = uuid.uuid4()
    with freeze_time("2026-10-13 12:00"):
        c = client_de(monde["deleg.sn"])
        c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
        c.post(url(effectuee, "pieces/"), envoi(ident=ident), format="multipart")
    with freeze_time("2026-10-14 08:00"):
        (visite,) = lire(monde["sup.sn"], monde["deleg.sn"]).json()["visites"]
        assert (visite["rapport_statut"], visite["rapport"]) == ("brouillon", None)
        # Sa pièce jointe non plus : elle appartient encore au délégué.
        lu = client_de(monde["sup.sn"]).get(f"/api/v1/rapports/pieces/{ident}/")
        assert lu.status_code == 404


@freeze_time("2026-10-14 08:00")
def test_hors_supervision_la_journee_n_existe_pas(monde, effectuee):  # noqa: F811
    from apps.identite.models import Role
    from apps.identite.services import attribuer_role, creer_utilisateur
    from apps.perimetre.tests.conftest import DEBUT_ROLES

    autre = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(autre, Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    assert lire(autre, monde["deleg.sn"]).status_code == 404
    # Un jour sans visite n'a rien à consulter.
    assert lire(monde["sup.sn"], monde["deleg.sn"], "2026-10-14").status_code == 404
    # Le délégué n'a pas ce droit.
    assert lire(monde["deleg.sn"], monde["deleg.sn"]).status_code == 403
    # Paramètres manquants : refusé proprement.
    assert client_de(monde["sup.sn"]).get(URL).status_code == 400

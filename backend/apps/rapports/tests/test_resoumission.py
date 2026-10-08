# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.5 : RPT-015, correction et nouvelle soumission par le délégué.

CA1 : la version précédente reste consultable. 28.A : qui a demandé la correction est prévenu
du retour du rapport. 29.A : le délégué retrouve ses rapports à corriger, toutes semaines
confondues."""

import pytest
from freezegun import freeze_time

from apps.notifications.models import Notification
from apps.perimetre.tests.conftest import client_de

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import journee, soumettre


def corriger_et_resoumettre(monde, visite, produits):
    rapport = soumettre(monde, visite, produits)
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post(
            f"/api/v1/rapports/{rapport.pk}/correction/",
            {"commentaire": "Précisez le résumé.", "champs": ["resume"]}, format="json",
        )  # fmt: skip
        assert r.status_code == 200, r.content
    with freeze_time("2026-10-14 09:00"):
        c = client_de(monde["deleg.sn"])
        corps = complet(monde, produits, resume="Le médecin trouve le prix élevé.")
        assert c.put(url(visite), corps, format="json").status_code == 200
        r = c.post(url(visite, "soumettre/"), {"soumis_le": "2026-10-14T09:00:00Z"},
                   format="json")  # fmt: skip
        assert r.status_code == 200, r.content
    return rapport


pytestmark = pytest.mark.django_db


def test_rpt015_ca1_la_version_precedente_reste_consultable(monde, effectuee, portefeuille):
    corriger_et_resoumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 10:00"):
        j = client_de(monde["sup.sn"]).get("/api/v1/rapports/journee/", journee(monde)).json()
    (visite,) = j["visites"]
    lu = visite["rapport"]
    assert (lu["statut"], lu["versions"], lu["resume"]) == (
        "soumis", 2, "Le médecin trouve le prix élevé.")  # fmt: skip
    # Ce que disait la version 1, et ce qui a changé depuis.
    assert lu["precedente"]["resume"] == "Intérêt pour la nouvelle forme"
    assert lu["precedente"]["resultat"] == lu["resultat"]
    assert lu["modifies"] == ["resume"]
    # La version 2 répond à la demande de correction ; la version 1 à rien.
    v1, v2 = lu["historique"]
    assert (v1["numero"], v1["correction"]) == (1, None)
    c = v2["correction"]
    assert (v2["numero"], c["commentaire"], c["champs"], c["par"]) == (
        2, "Précisez le résumé.", ["resume"], "Nicolas Sn")  # fmt: skip


def test_rpt015_un_rapport_soumis_une_fois_n_a_pas_de_precedente(monde, effectuee, portefeuille):
    soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 10:00"):
        j = client_de(monde["sup.sn"]).get("/api/v1/rapports/journee/", journee(monde)).json()
    lu = j["visites"][0]["rapport"]
    assert (lu["precedente"], lu["modifies"], len(lu["historique"])) == (None, [], 1)


def test_28a_le_superviseur_est_prevenu_du_rapport_corrige(monde, effectuee, portefeuille):
    corriger_et_resoumettre(monde, effectuee, portefeuille[:1])
    (n,) = Notification.objects.filter(destinataire=monde["sup.sn"], type="rapport_corrige")
    assert n.donnees == {"delegue": str(monde["deleg.sn"].pk), "date": "2026-10-13",
                         "visite": str(effectuee.pk), "nom": "Gabriel Sn"}  # fmt: skip
    # Une première soumission ne prévient personne de cette façon.
    assert Notification.objects.filter(type="rapport_corrige").count() == 1


def test_29a_le_rapport_a_corriger_suit_le_delegue_d_une_semaine_a_l_autre(
    monde, effectuee, portefeuille
):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/correction/",
                                        {"commentaire": "Précisez."}, format="json")  # fmt: skip
    # La semaine suivante, le programme le liste encore.
    with freeze_time("2026-10-21 08:00"):
        p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
    assert [(v["id"], v["rapport_statut"]) for v in p["a_corriger"]] == [
        (str(effectuee.pk), "a_corriger")]  # fmt: skip

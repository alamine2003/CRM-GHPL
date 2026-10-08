# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.7 : RPT-017, rapports en retard et alerte au superviseur à 48 h (RG-032).

CA1 : la liste des retards est filtrable par délégué. 34.A : l'alerte part 48 h après la
visite, une fois. 35.A : la liste vit dans « À traiter » (onglet « Retards ») et reprend les
journées de plus de 4 semaines non validées (20.A)."""

import uuid
from datetime import UTC, datetime

import pytest
from freezegun import freeze_time

from apps.notifications.models import Notification
from apps.perimetre.tests.conftest import client_de
from apps.rapports import retards

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import soumettre

pytestmark = pytest.mark.django_db

URL = "/api/v1/rapports/retards/"


def test_rpt017_ca1_le_rapport_non_soumis_est_liste_et_filtrable(monde, effectuee):
    with freeze_time("2026-10-13 12:00"):
        client_de(monde["deleg.sn"]).get(url(effectuee))  # crée le brouillon
    with freeze_time("2026-10-16 08:00"):
        r = client_de(monde["sup.sn"]).get(URL)
        assert r.status_code == 200, r.content
        d = r.json()
        (v,) = d["rapports"]
        assert (v["visite"], v["etat"], v["jours_de_retard"]) == (
            str(effectuee.pk), "brouillon", 3)  # fmt: skip
        assert [x["id"] for x in d["delegues"]] == [str(monde["deleg.sn"].pk)]
        # CA1 : filtré sur le délégué, ou sur un autre.
        mien = client_de(monde["sup.sn"]).get(URL, {"delegue": str(monde["deleg.sn"].pk)})
        assert len(mien.json()["rapports"]) == 1
        autre = client_de(monde["sup.sn"]).get(URL, {"delegue": str(uuid.uuid4())}).json()
        assert (autre["rapports"], len(autre["delegues"])) == ([], 1)
        # Le délégué n'a pas cette liste.
        assert client_de(monde["deleg.sn"]).get(URL).status_code == 403


def test_rpt017_soumis_ou_renvoye_n_est_pas_en_retard(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        assert client_de(monde["sup.sn"]).get(URL).json()["rapports"] == []
        client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/correction/",
                                        {"commentaire": "Précisez."}, format="json")  # fmt: skip
        # DC-60 : renvoyé pour correction, il n'a plus d'échéance.
        assert client_de(monde["sup.sn"]).get(URL).json()["rapports"] == []


def test_34a_l_alerte_part_48_h_apres_la_visite_une_seule_fois(monde, effectuee):
    sn = monde["sn"]
    # La visite s'est terminée le 13 à 9 h 30 (UTC).
    assert retards.alertes(sn, datetime(2026, 10, 15, 9, 0, tzinfo=UTC)) == 0
    assert retards.alertes(sn, datetime(2026, 10, 15, 10, 0, tzinfo=UTC)) == 1
    assert retards.alertes(sn, datetime(2026, 10, 15, 11, 0, tzinfo=UTC)) == 0
    (n,) = Notification.objects.filter(type="rapport_en_retard")
    assert n.destinataire == monde["sup.sn"]
    attendu = {"delegue": str(monde["deleg.sn"].pk), "date": "2026-10-13", "nombre": 1}
    assert {k: n.donnees[k] for k in attendu} == attendu


def test_34a_les_visites_d_un_meme_jour_font_une_seule_alerte(monde, terrain, effectuee):
    from .test_validation import imprevue

    imprevue(monde, terrain)  # une seconde visite effectuée le même jour, sans rapport
    assert retards.alertes(monde["sn"], datetime(2026, 10, 16, 10, 0, tzinfo=UTC)) == 1
    (n,) = Notification.objects.filter(type="rapport_en_retard")
    assert n.donnees["nombre"] == 2


def test_34a_pas_d_alerte_au_dela_de_7_jours(monde, effectuee):
    assert retards.alertes(monde["sn"], datetime(2026, 10, 22, 10, 0, tzinfo=UTC)) == 0


def test_20a_une_journee_de_plus_de_4_semaines_non_validee_passe_aux_retards(
    monde, effectuee, portefeuille
):
    soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-11-20 08:00"):
        sup = client_de(monde["sup.sn"])
        assert sup.get("/api/v1/rapports/a-traiter/").json()["delegues"] == []
        (j,) = sup.get(URL).json()["journees"]
        assert (j["date"], j["rapports_a_valider"]) == ("2026-10-13", 1)

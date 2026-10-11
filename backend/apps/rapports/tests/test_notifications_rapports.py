# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.8 : notifications du workflow de rapport (prd.md §18, NOT-006).

Rapports soumis au superviseur et validés au délégué, regroupés par jour (NOT-003) ; rappel au
délégué à 18 h (37.A) ; une notification d'escalade par journée au DM (38.A)."""

from datetime import UTC, date, datetime

import pytest
from freezegun import freeze_time

from apps.notifications.models import Notification
from apps.perimetre.tests.conftest import client_de
from apps.rapports import retards

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import imprevue, soumettre

pytestmark = pytest.mark.django_db


def test_rapports_soumis_regroupes_pour_le_superviseur(monde, terrain, effectuee, portefeuille):
    seconde = imprevue(monde, terrain)
    soumettre(monde, effectuee, portefeuille[:1])
    soumettre(monde, seconde, portefeuille[:1])
    (n,) = Notification.objects.filter(type="rapports_soumis", destinataire=monde["sup.sn"])
    assert n.donnees["nombre"] == 2
    # Lue, la suivante repart de un.
    n.lue_le = n.cree_le
    n.save(update_fields=["lue_le"])
    from apps.notifications.services import notifier_regroupe

    nouvelle = notifier_regroupe(monde["sup.sn"], "rapports_soumis", monde["sn"],
                                 n.donnees["cle"])  # fmt: skip
    assert (nouvelle.pk != n.pk, nouvelle.donnees["nombre"]) == (True, 1)


def test_rapports_valides_regroupes_pour_le_delegue(monde, terrain, effectuee, portefeuille):
    seconde = imprevue(monde, terrain)
    soumettre(monde, effectuee, portefeuille[:1])
    soumettre(monde, seconde, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post("/api/v1/rapports/journee/valider/",
                                            {"delegue": str(monde["deleg.sn"].pk),
                                             "date": "2026-10-13"}, format="json")  # fmt: skip
        assert r.status_code == 200, r.content
    (n,) = Notification.objects.filter(type="rapports_valides", destinataire=monde["deleg.sn"])
    assert n.donnees["nombre"] == 2


def test_37a_rappel_a_18_h_le_jour_de_la_visite(monde, effectuee):
    sn = monde["sn"]  # Dakar : UTC+0
    assert retards.rappels(sn, datetime(2026, 10, 13, 17, 59, tzinfo=UTC)) == 0
    assert retards.rappels(sn, datetime(2026, 10, 13, 18, 0, tzinfo=UTC)) == 1
    assert retards.rappels(sn, datetime(2026, 10, 13, 20, 0, tzinfo=UTC)) == 0
    (n,) = Notification.objects.filter(type="rappel_rapport")
    assert (n.destinataire, n.donnees["nombre"], n.donnees["date"]) == (
        monde["deleg.sn"], 1, "2026-10-13")  # fmt: skip


def test_37a_pas_de_rappel_si_le_rapport_est_soumis(monde, effectuee, portefeuille):
    soumettre(monde, effectuee, portefeuille[:1])
    assert retards.rappels(monde["sn"], datetime(2026, 10, 13, 21, 0, tzinfo=UTC)) == 0


def test_38a_le_dm_est_prevenu_une_fois_par_journee_escaladee(
    monde, terrain, effectuee, portefeuille
):
    from apps.organisation import services as org

    soumettre(monde, effectuee, portefeuille[:1])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    assert retards.escalades(monde["sn"], datetime(2026, 10, 14, 8, 0, tzinfo=UTC)) == 0
    assert retards.escalades(monde["sn"], datetime(2026, 10, 20, 8, 0, tzinfo=UTC)) == 1
    assert retards.escalades(monde["sn"], datetime(2026, 10, 21, 8, 0, tzinfo=UTC)) == 0
    (n,) = Notification.objects.filter(type="journee_escaladee")
    assert (n.destinataire, n.donnees["date"], n.donnees["delegue"]) == (
        monde["dm.sn"], "2026-10-13", str(monde["deleg.sn"].pk))  # fmt: skip


def test_38a_pas_d_escalade_notifiee_pour_une_journee_de_plus_de_7_jours(
    monde, terrain, effectuee, portefeuille
):
    from apps.organisation import services as org

    soumettre(monde, effectuee, portefeuille[:1])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    assert retards.escalades(monde["sn"], datetime(2026, 10, 21, 8, 0, tzinfo=UTC)) == 0

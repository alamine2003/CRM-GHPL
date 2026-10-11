# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.6 : RPT-016, réouverture d'un rapport validé : superviseur jusqu'à 30 jours, DM
au-delà ; motif obligatoire.

CA1 : un superviseur ne peut pas rouvrir un rapport validé il y a 31 jours. CA2 : la
réouverture est auditée et notifiée (31.A : au délégué ; au superviseur aussi quand c'est le DM
qui rouvre). 32.A : la journée revient dans « À traiter », son classement reste figé."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.notifications.models import Notification
from apps.perimetre.tests.conftest import client_de

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import figee, journee, soumettre

pytestmark = pytest.mark.django_db


def valide(monde, visite, produits):
    rapport = soumettre(monde, visite, produits)
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post("/api/v1/rapports/journee/valider/", journee(monde),
                                            format="json")  # fmt: skip
        assert r.status_code == 200, r.content
    rapport.refresh_from_db()
    return rapport


def rouvrir(compte, rapport, motif="Le résultat ne correspond pas à l'échange."):
    return client_de(compte).post(f"/api/v1/rapports/{rapport.pk}/rouvrir/", {"motif": motif},
                                  format="json")  # fmt: skip


def dm_du_perimetre(monde, terrain):
    from apps.organisation import services as org

    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))


def test_rpt016_ca1_le_superviseur_rouvre_jusqu_a_30_jours(monde, effectuee, portefeuille):
    rapport = valide(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-11-13 08:00"):  # 30 jours après la validation
        r = rouvrir(monde["sup.sn"], rapport)
        assert r.status_code == 200, r.content
        assert (r.json()["statut"], r.json()["reouverture"]["motif"]) == (
            "rouvert", "Le résultat ne correspond pas à l'échange.")  # fmt: skip


def test_rpt016_ca1_a_31_jours_seul_le_dm_rouvre(monde, terrain, effectuee, portefeuille):
    rapport = valide(monde, effectuee, portefeuille[:1])
    dm_du_perimetre(monde, terrain)
    with freeze_time("2026-11-14 09:00"):  # 31 jours après la validation
        r = rouvrir(monde["sup.sn"], rapport)
        assert (r.status_code, r.json()["code"]) == (403, "delai_reouverture")
        # La journée le dit : le bouton n'est plus proposé au superviseur…
        j = client_de(monde["sup.sn"]).get("/api/v1/rapports/journee/", journee(monde)).json()
        assert j["visites"][0]["rapport"]["rouvrable"] is False
        # … mais l'est au DM, qui lit la journée en consultation.
        j = client_de(monde["dm.sn"]).get("/api/v1/rapports/journee/", journee(monde)).json()
        assert (j["mode"], j["visites"][0]["rapport"]["rouvrable"]) == ("consultation", True)
        assert rouvrir(monde["dm.sn"], rapport).status_code == 200


def test_rpt016_motif_obligatoire_et_rapport_valide_seulement(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        assert rouvrir(monde["sup.sn"], rapport).json()["code"] == "rapport_non_valide"
    with freeze_time("2026-10-14 08:00"):
        assert (
            client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code
            == 200
        )
    with freeze_time("2026-10-15 08:00"):
        r = rouvrir(monde["sup.sn"], rapport, motif="  ")
        assert (r.status_code, r.json()["code"]) == (400, "motif_requis")
        assert rouvrir(monde["deleg.sn"], rapport).status_code == 403


def test_rpt016_ca2_auditee_et_notifiee(monde, terrain, effectuee, portefeuille):
    rapport = valide(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-15 08:00"):
        assert rouvrir(monde["sup.sn"], rapport).status_code == 200
    (evt,) = EvenementAudit.objects.filter(action="rapport.reouverture")
    assert evt.details["motif"] == "Le résultat ne correspond pas à l'échange."
    (n,) = Notification.objects.filter(type="rapport_rouvert")
    assert (n.destinataire, n.donnees) == (monde["deleg.sn"], {
        "visite": str(effectuee.pk), "date": "2026-10-13", "nom": "Nicolas Sn"})  # fmt: skip


def test_31a_quand_le_dm_rouvre_le_superviseur_est_prevenu(monde, terrain, effectuee, portefeuille):
    rapport = valide(monde, effectuee, portefeuille[:1])
    dm_du_perimetre(monde, terrain)
    with freeze_time("2026-11-20 08:00"):
        assert rouvrir(monde["dm.sn"], rapport).status_code == 200
    destinataires = set(Notification.objects.filter(type="rapport_rouvert")
                        .values_list("destinataire", flat=True))  # fmt: skip
    assert destinataires == {monde["deleg.sn"].pk, monde["sup.sn"].pk}
    n = Notification.objects.get(type="rapport_rouvert", destinataire=monde["sup.sn"])
    assert n.donnees["delegue"] == str(monde["deleg.sn"].pk)


def test_32a_la_journee_revient_puis_se_valide_a_nouveau(monde, effectuee, portefeuille):
    rapport = valide(monde, effectuee, portefeuille[:1])
    fige_le = figee(monde)
    with freeze_time("2026-10-15 08:00"):
        sup = client_de(monde["sup.sn"])
        rouvrir(monde["sup.sn"], rapport)
        r = sup.get("/api/v1/rapports/a-traiter/")
        assert r.status_code == 200, r.content
        (ligne,) = r.json()["delegues"]
        (jour,) = ligne["journees"]
        assert (jour["date"], jour["rapports_rouverts"]) == ("2026-10-13", 1)
        j = sup.get("/api/v1/rapports/journee/", journee(monde)).json()
        assert (j["fige"], j["rapports_manquants"]) == (False, 1)
        # Le délégué le retrouve dans sa liste « à corriger », avec le motif.
        p = client_de(monde["deleg.sn"]).get("/api/v1/programme/").json()
        assert [v["id"] for v in p["a_corriger"]] == [str(effectuee.pk)]
        lu = client_de(monde["deleg.sn"]).get(url(effectuee)).json()
        assert lu["reouverture"]["par"] == "Nicolas Sn"
    with freeze_time("2026-10-15 09:00"):
        c = client_de(monde["deleg.sn"])
        corps = complet(monde, portefeuille[:1], resume="Objectif revu avec le médecin.")
        assert c.put(url(effectuee), corps, format="json").status_code == 200
        r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-15T09:00:00Z"},
                   format="json")  # fmt: skip
        assert r.status_code == 200, r.content
    # La version 2 répond à la réouverture ; qui a rouvert est prévenu.
    with freeze_time("2026-10-15 10:00"):
        sup = client_de(monde["sup.sn"])
        lu = sup.get("/api/v1/rapports/journee/", journee(monde)).json()["visites"][0]["rapport"]
        assert lu["historique"][1]["correction"]["reouverture"] is True
        assert Notification.objects.filter(type="rapport_corrige",
                                           destinataire=monde["sup.sn"]).count() == 1  # fmt: skip
        assert sup.post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code == 200
        assert sup.get("/api/v1/rapports/a-traiter/").json()["delegues"] == []
    # Le classement n'a jamais été recalculé : la date de figement est restée la même.
    assert figee(monde) == fige_le

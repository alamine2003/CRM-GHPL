# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.4 : RPT-014, demande de correction motivée sur une visite précise, avec les champs
concernés ; sans échéance (DC-60).

CA1 : impossible sans commentaire. CA2 : les autres rapports de la journée peuvent être
validés."""

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.notifications.models import Notification
from apps.perimetre.tests.conftest import client_de
from apps.rapports.models import Rapport

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import imprevue, journee, soumettre

pytestmark = pytest.mark.django_db


def corriger(compte, rapport, **corps):
    return client_de(compte).post(f"/api/v1/rapports/{rapport.pk}/correction/", corps,
                                  format="json")  # fmt: skip


def test_rpt014_ca1_sans_commentaire_rien_ne_part(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = corriger(monde["sup.sn"], rapport, commentaire="   ", champs=["resume"])
        assert (r.status_code, r.json()["code"]) == (400, "commentaire_requis")
    rapport.refresh_from_db()
    assert rapport.statut == "soumis"


def test_rpt014_la_correction_part_au_delegue(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = corriger(monde["sup.sn"], rapport, commentaire="Précisez le résumé.",
                     champs=["resume", "presentations"])  # fmt: skip
        assert r.status_code == 200, r.content
        lu = r.json()
        assert lu["statut"] == "a_corriger"
        assert (lu["correction"]["commentaire"], lu["correction"]["champs"],
                lu["correction"]["par"]) == ("Précisez le résumé.",
                                             ["resume", "presentations"], "Nicolas Sn")  # fmt: skip
        # Le délégué la lit sur son rapport, et reçoit une notification sans nom de prospect.
        sien = client_de(monde["deleg.sn"]).get(url(effectuee)).json()
        assert (sien["statut"], sien["correction"]["commentaire"]) == (
            "a_corriger", "Précisez le résumé.")  # fmt: skip
        (n,) = Notification.objects.filter(destinataire=monde["deleg.sn"],
                                           type="correction_demandee")  # fmt: skip
        assert n.donnees == {"visite": str(effectuee.pk), "date": "2026-10-13",
                             "nom": "Nicolas Sn"}  # fmt: skip
        # La journée l'affiche au superviseur, et attend la nouvelle soumission (22.A).
        j = client_de(monde["sup.sn"]).get("/api/v1/rapports/journee/", journee(monde)).json()
        (visite,) = j["visites"]
        assert (visite["rapport_statut"], j["rapports_manquants"]) == ("a_corriger", 1)
        (ligne,) = client_de(monde["sup.sn"]).get("/api/v1/rapports/a-traiter/").json()["delegues"]
        assert ligne["journees"][0]["rapports_a_corriger"] == 1
    assert EvenementAudit.objects.filter(action="rapport.correction_demandee").count() == 1


def test_rpt014_ca2_les_autres_rapports_se_valident(monde, terrain, effectuee, portefeuille):
    seconde = imprevue(monde, terrain)
    a_revoir = soumettre(monde, effectuee, portefeuille[:1])
    autre = soumettre(monde, seconde, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        assert corriger(monde["sup.sn"], a_revoir, commentaire="Le résultat ne correspond pas.",
                        champs=["resultat"]).status_code == 200  # fmt: skip
        c = client_de(monde["sup.sn"])
        assert c.post(f"/api/v1/rapports/{autre.pk}/valider/").status_code == 200
        # La journée, elle, attend le rapport corrigé.
        r = c.post("/api/v1/rapports/journee/valider/", journee(monde), format="json")
        assert r.json()["code"] == "rapports_non_soumis"


def test_rpt014_corrige_et_resoumis_le_rapport_revient(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        corriger(monde["sup.sn"], rapport, commentaire="Précisez le résumé.", champs=["resume"])
    with freeze_time("2026-10-14 09:00"):
        c = client_de(monde["deleg.sn"])
        assert c.put(url(effectuee), complet(monde, portefeuille[:1], resume="Plus précis."),
                     format="json").status_code == 200  # fmt: skip
        r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-14T09:00:00Z"},
                   format="json")  # fmt: skip
        assert (r.status_code, r.json()["statut"], r.json()["correction"]) == (200, "soumis", None)
    assert Rapport.objects.get().versions.count() == 2


def test_rpt014_champs_inconnus_et_brouillon_refuses(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = corriger(monde["sup.sn"], rapport, commentaire="X", champs=["inexistant"])
        assert (r.status_code, r.json()["code"]) == (400, "champ_inconnu")
        assert corriger(monde["sup.sn"], rapport, commentaire="X",
                        champs=["resume"]).status_code == 200  # fmt: skip
        # Déjà renvoyé : plus soumis, il ne se renvoie pas une seconde fois.
        r = corriger(monde["sup.sn"], rapport, commentaire="Encore")
        assert r.json()["code"] == "rapport_non_soumis"
        # Le délégué n'a pas ce droit.
        assert corriger(monde["deleg.sn"], rapport, commentaire="X").status_code == 403

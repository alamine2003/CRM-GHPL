"""PLN-013 : le superviseur demande une révision, sur le planning ou une visite précise, avec
commentaire obligatoire (RG-017).
CA1 : une demande sans commentaire est refusée.
CA2 : le délégué voit le commentaire sur la visite concernée."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import services

from .conftest import SEMAINE

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture(autouse=True)
def _mercredi_7_octobre():
    with freeze_time("2026-10-07 09:00"):
        yield


@pytest.fixture
def soumis(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    services.ajouter_visite(terrain["planning"], date=MARDI, heure=time(9, 0),
                            prospect=terrain["medecin"], etablissement=terrain["clinique"],
                            objectif="Vasculor")  # fmt: skip
    return services.soumettre(terrain["planning"])


def reviser(client, planning, **corps):
    return client.post(f"/api/v1/plannings/{planning.pk}/reviser/", corps, format="json")


def test_ca1_une_demande_sans_commentaire_est_refusee(monde, soumis):
    sup = client_de(monde["sup.sn"])
    r = reviser(sup, soumis, commentaire="   ")
    assert r.status_code == 400 and r.json()["code"] == "commentaire_requis"
    visite = soumis.visites.get()
    r = reviser(sup, soumis, remarques=[{"visite": str(visite.pk), "commentaire": " "}])
    assert r.status_code == 400
    r = reviser(sup, soumis, remarques=[{"visite": str(soumis.pk), "commentaire": "Ailleurs"}])
    assert r.status_code == 400 and r.json()["code"] == "visite_inconnue"
    soumis.refresh_from_db()
    assert soumis.statut == "soumis"


def test_ca2_le_delegue_lit_le_commentaire_sur_la_visite(monde, soumis):
    visite = soumis.visites.get()
    remarque = {"visite": str(visite.pk), "commentaire": "Prévoir 10 h plutôt."}
    r = reviser(client_de(monde["sup.sn"]), soumis, commentaire="Trop peu de visites mardi.",
                remarques=[remarque])  # fmt: skip
    assert r.status_code == 200, r.content
    assert r.json()["statut"] == "a_reviser"
    semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
    decision = semaine["planning"]["decision"]
    assert decision["decision"] == "a_reviser"
    assert decision["commentaire"] == "Trop peu de visites mardi."
    assert decision["remarques"] == [
        {"visite": str(visite.pk), "commentaire": "Prévoir 10 h plutôt."}
    ]
    assert semaine["modifiable"] is True
    centre = client_de(monde["deleg.sn"]).get("/api/v1/notifications/").json()
    assert [n["type"] for n in centre["notifications"]] == ["revision_demandee"]
    assert EvenementAudit.objects.get(action="planning.revision").details["remarques"] == 1


def test_une_visite_seule_suffit_et_le_delegue_soumet_la_version_suivante(monde, soumis):
    visite = soumis.visites.get()
    sup = client_de(monde["sup.sn"])
    r = reviser(sup, soumis, remarques=[{"visite": str(visite.pk), "commentaire": "Heure ?"}])
    assert r.status_code == 200
    # Une révision ne s'approuve pas : le délégué corrige d'abord.
    r = sup.post(f"/api/v1/plannings/{soumis.pk}/approuver/")
    assert r.status_code == 409 and r.json()["code"] == "transition_interdite"
    services.modifier_visite(visite, heure=time(10, 0))
    services.soumettre(soumis)
    assert [v.numero for v in soumis.versions.all()] == [2, 1]
    assert soumis.versions.get(numero=1).decision == "a_reviser"
    assert [x["planning"]["id"] for x in sup.get("/api/v1/plannings/a-valider/").json()] == [
        str(soumis.pk)
    ]

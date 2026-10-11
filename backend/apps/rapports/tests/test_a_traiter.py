"""RPT-012 (0.6.1) : file de travail du superviseur, ses journées à traiter par délégué.

CA1 : chaque journée affiche « conforme » ou « à vérifier » et le détail des écarts."""

from datetime import UTC, date, datetime, time

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.perimetre.tests.conftest import DEBUT_ROLES, client_de
from apps.planning import execution, services
from apps.planning.tests.conftest import valeur
from apps.prospects.services import creer_exercice, creer_prospect

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/rapports/a-traiter/"


def file(compte):
    r = client_de(compte).get(URL)
    assert r.status_code == 200, r.content
    return r.json()


def soumettre(monde, visite, produits, le="2026-10-13T20:00:00Z"):
    c = client_de(monde["deleg.sn"])
    c.put(url(visite), complet(monde, produits), format="json")
    r = c.post(url(visite, "soumettre/"), {"soumis_le": le}, format="json")
    assert r.status_code == 200, r.content


def test_rpt012_ca1_la_journee_conforme_et_ses_rapports(monde, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-14 08:00"):
        (ligne,) = file(monde["sup.sn"])["delegues"]
        assert (ligne["delegue"]["prenom"], ligne["delegue"]["nom"]) == ("Gabriel", "Sn")
        (journee,) = ligne["journees"]
        assert (journee["date"], journee["classement"], journee["ecarts"]) == (
            "2026-10-13", "conforme", [])  # fmt: skip
        assert journee["planning"] == str(effectuee.planning_id)
        # Visite effectuée, rapport pas encore soumis : il est attendu.
        assert (journee["effectuees"], journee["rapports_attendus"],
                journee["rapports_a_valider"]) == (1, 1, 0)  # fmt: skip
    with freeze_time("2026-10-14 09:00"):
        soumettre(monde, effectuee, portefeuille[:1], le="2026-10-14T09:00:00Z")
        (journee,) = file(monde["sup.sn"])["delegues"][0]["journees"]
        # Soumis le lendemain : à valider, et en retard (RG-032).
        assert (journee["rapports_attendus"], journee["rapports_a_valider"],
                journee["rapports_en_retard"]) == (0, 1, 1)  # fmt: skip


@freeze_time("2026-10-13 12:00")
def test_rpt012_la_journee_du_jour_n_est_pas_encore_a_traiter(monde, effectuee):  # noqa: F811
    assert file(monde["sup.sn"])["delegues"] == []


def test_rpt012_ca1_une_journee_a_verifier_detaille_ses_ecarts(monde, terrain, effectuee):  # noqa: F811
    confrere = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom="Sarr", prenom="Ibou", potentiel="B",
        type=valeur(monde, "type_prospect", "medecin"),
        specialite=valeur(monde, "specialite", "cardiologie"),
    )  # fmt: skip
    creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
    with freeze_time("2026-10-13 10:00"):
        # Une visite imprévue (VIS-008) : un écart à vérifier, avec sa justification.
        imprevue = execution.visite_imprevue(
            monde["deleg.sn"], monde["sn"], le=datetime(2026, 10, 13, 9, 45, tzinfo=UTC),
            prospect=confrere, etablissement=terrain["clinique"], justification="De passage",
        )  # fmt: skip
        execution.terminer(imprevue, datetime(2026, 10, 13, 9, 55, tzinfo=UTC))
    with freeze_time("2026-10-14 08:00"):
        (journee,) = file(monde["sup.sn"])["delegues"][0]["journees"]
    assert journee["classement"] == "a_verifier"
    assert [(e["code"], e["prospect"], e["justification"]) for e in journee["ecarts"]] == [
        ("imprevue", "Ibou SARR", "De passage")]  # fmt: skip
    assert (journee["visites"], journee["effectuees"], journee["rapports_attendus"]) == (2, 2, 2)


@freeze_time("2026-10-14 08:00")
def test_rpt012_seul_le_responsable_du_poste(monde, effectuee):  # noqa: F811
    # Le délégué, l'administration et le responsable pays n'ont pas cette file.
    for compte in ("deleg.sn", "admin.sn", "resp.sn"):
        assert client_de(monde[compte]).get(URL).status_code == 403
    # Un autre superviseur du pays, sans ce poste : rien.
    autre = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(autre, Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    assert file(autre)["delegues"] == []
    # Un DM sans superviseur-visiteur rattaché : rien non plus.
    assert file(monde["dm.sn"])["delegues"] == []


def test_rpt012_le_remplacant_voit_les_journees_du_remplace(monde, effectuee):  # noqa: F811
    from apps.organisation.services import designer_remplacant

    remplacant = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(remplacant, Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    with freeze_time("2026-10-14 08:00"):
        designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 14),
                            date(2026, 10, 16), par=monde["admin.sn"])  # fmt: skip
        (ligne,) = file(remplacant)["delegues"]
        assert [j["date"] for j in ligne["journees"]] == ["2026-10-13"]


def test_rpt012_les_plannings_a_valider_sont_comptes(monde, terrain):
    from apps.organisation import services as org

    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    with freeze_time("2026-10-08 09:00"):
        services.ajouter_visite(terrain["planning"], date=date(2026, 10, 13), heure=time(9, 0),
                                objectif="A", prospect=terrain["medecin"],
                                etablissement=terrain["clinique"])  # fmt: skip
        services.soumettre(terrain["planning"])
        assert file(monde["sup.sn"]) == {"delegues": [], "plannings_a_valider": 1}

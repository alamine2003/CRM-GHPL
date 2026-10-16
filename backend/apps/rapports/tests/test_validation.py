# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.3 : validation des rapports (RPT-013, RPT-018, RG-034, RG-035).

RPT-013 CA1 : « Valider les n conformes » ne valide que les journées « conformes ». CA2 :
chaque rapport validé porte validateur, date et mode. RPT-018 CA1 : le mode (escalade,
remplacement) est visible. 22.A : une journée se valide quand tous ses rapports sont soumis.
23.A : le lot écarte les journées incomplètes ou à l'horodatage douteux."""

from datetime import UTC, date, datetime

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.perimetre.tests.conftest import DEBUT_ROLES, client_de
from apps.planning import execution
from apps.planning.models import ConformiteJournee
from apps.prospects.services import creer_exercice, creer_prospect
from apps.rapports.models import Rapport

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db

DELEGUE_JOUR = {"date": "2026-10-13"}


def soumettre(monde, visite, produits, envoye_le=None):
    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        assert c.put(url(visite), complet(monde, produits), format="json").status_code == 200
        corps = {"soumis_le": "2026-10-13T20:00:00Z"}
        if envoye_le:
            corps["envoye_le"] = envoye_le
        r = c.post(url(visite, "soumettre/"), corps, format="json")
        assert r.status_code == 200, r.content
    return Rapport.objects.get(visite=visite)


def journee(monde):
    return {"delegue": str(monde["deleg.sn"].pk), **DELEGUE_JOUR}


def figee(monde):
    return ConformiteJournee.objects.get(delegue=monde["deleg.sn"], date=date(2026, 10, 13)).fige_le


def imprevue(monde, terrain):
    """Une seconde visite le mardi, imprévue : elle rend la journée « à vérifier »."""
    confrere = creer_prospect(
        monde["sn"], monde["admin.sn"], actif=True, nom="Sarr", prenom="Ibou", potentiel="B",
        type=terrain["medecin"].type, specialite=terrain["medecin"].specialite,
    )  # fmt: skip
    creer_exercice(confrere, terrain["clinique"], monde["admin.sn"])
    with freeze_time("2026-10-13 12:00"):
        v = execution.visite_imprevue(
            monde["deleg.sn"], monde["sn"], le=datetime(2026, 10, 13, 11, 0, tzinfo=UTC),
            prospect=confrere, etablissement=terrain["clinique"], justification="De passage",
        )  # fmt: skip
        execution.terminer(v, datetime(2026, 10, 13, 11, 20, tzinfo=UTC))
    return v


def test_rpt013_ca2_un_rapport_valide_seul_porte_validateur_date_et_mode(
    monde,
    effectuee,
    portefeuille,  # noqa: F811
):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/")
        assert r.status_code == 200, r.content
        lu = r.json()
        assert (lu["statut"], lu["mode_validation"], lu["valide_par"]) == (
            "valide", "unitaire", "Nicolas Sn")  # fmt: skip
        assert lu["valide_le"].startswith("2026-10-14T08:00")
        # Le dernier rapport de la journée validé, la journée l'est aussi : elle se fige et
        # quitte « À traiter ».
        assert figee(monde) is not None
        assert client_de(monde["sup.sn"]).get("/api/v1/rapports/a-traiter/").json()[
            "delegues"] == []  # fmt: skip
        # Une seconde validation est refusée.
        again = client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/")
        assert again.json()["code"] == "rapport_non_soumis"
    assert EvenementAudit.objects.filter(action="rapport.validation").count() == 1


def test_22a_une_journee_incomplete_ne_se_valide_pas(monde, terrain, effectuee, portefeuille):  # noqa: F811
    imprevue(monde, terrain)  # effectuée, rapport jamais soumis
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        c = client_de(monde["sup.sn"])
        r = c.post("/api/v1/rapports/journee/valider/", journee(monde), format="json")
        assert (r.status_code, r.json()["code"]) == (409, "rapports_non_soumis")
        # Le rapport soumis, lui, se valide seul ; la journée reste à traiter.
        assert c.post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code == 200
        assert figee(monde) is None
        j = c.get("/api/v1/rapports/journee/", journee(monde)).json()
        assert (j["rapports_manquants"], j["fige"]) == (1, False)


def test_rpt013_la_journee_se_valide_d_un_geste(monde, terrain, effectuee, portefeuille):  # noqa: F811
    seconde = imprevue(monde, terrain)
    soumettre(monde, effectuee, portefeuille[:1])
    soumettre(monde, seconde, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post("/api/v1/rapports/journee/valider/", journee(monde),
                                            format="json")  # fmt: skip
        assert r.json() == {"journees": 1, "rapports": 2}
    assert set(Rapport.objects.values_list("mode_validation", flat=True)) == {"journee"}
    assert figee(monde) is not None


def test_rpt013_ca1_le_lot_ne_prend_que_les_journees_conformes(
    monde, terrain, effectuee, portefeuille
):  # noqa: F811
    seconde = imprevue(monde, terrain)  # la journée devient « à vérifier »
    soumettre(monde, effectuee, portefeuille[:1])
    soumettre(monde, seconde, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        c = client_de(monde["sup.sn"])
        (ligne,) = c.get("/api/v1/rapports/a-traiter/").json()["delegues"]
        assert ligne["journees"][0]["eligible_lot"] is False
        r = c.post("/api/v1/rapports/lot/valider/", {"journees": [journee(monde)]},
                   format="json")  # fmt: skip
        assert r.json() == {"journees": 0, "rapports": 0}
    assert figee(monde) is None


def test_23a_le_lot_ecarte_l_horodatage_douteux(monde, effectuee, portefeuille):  # noqa: F811
    soumettre(monde, effectuee, portefeuille[:1], envoye_le="2026-10-13T20:40:00Z")
    with freeze_time("2026-10-14 08:00"):
        c = client_de(monde["sup.sn"])
        r = c.post("/api/v1/rapports/lot/valider/", {"journees": [journee(monde)]},
                   format="json")  # fmt: skip
        assert r.json() == {"journees": 0, "rapports": 0}


def test_rpt013_le_lot_valide_les_journees_conformes(monde, effectuee, portefeuille):  # noqa: F811
    soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        c = client_de(monde["sup.sn"])
        (ligne,) = c.get("/api/v1/rapports/a-traiter/").json()["delegues"]
        assert ligne["journees"][0]["eligible_lot"] is True
        r = c.post("/api/v1/rapports/lot/valider/", {"journees": [journee(monde)]},
                   format="json")  # fmt: skip
        assert r.json() == {"journees": 1, "rapports": 1}
    assert Rapport.objects.get().mode_validation == "lot"


def test_rpt018_le_remplacant_valide_en_mode_remplacement(monde, effectuee, portefeuille):  # noqa: F811
    from apps.organisation.services import designer_remplacant

    rapport = soumettre(monde, effectuee, portefeuille[:1])
    remplacant = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(remplacant, Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    with freeze_time("2026-10-14 08:00"):
        designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 14),
                            date(2026, 10, 16), par=monde["admin.sn"])  # fmt: skip
        r = client_de(remplacant).post(f"/api/v1/rapports/{rapport.pk}/valider/")
        assert (r.status_code, r.json()["mode_validation"]) == (200, "remplacement"), r.content


def test_rpt018_l_administrateur_valide_par_escalade(monde, terrain, effectuee, portefeuille):  # noqa: F811
    """1.3.0 [D] : l'escalade revient à l'administrateur pays, à la place du DM."""
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    file, valider = "/api/v1/rapports/a-traiter/", f"/api/v1/rapports/{rapport.pk}/valider/"
    with freeze_time("2026-10-14 08:00"):
        # Moins de 24 heures ouvrées : la journée reste au superviseur.
        admin = client_de(monde["admin.sn"])
        assert admin.get(file).json()["delegues"] == []
        assert admin.post(valider).status_code == 404
    with freeze_time("2026-10-19 08:00"):
        admin = client_de(monde["admin.sn"])
        (ligne,) = admin.get(file).json()["delegues"]
        assert ligne["journees"][0]["escalade"] is True
        r = admin.post(valider)
        assert (r.status_code, r.json()["mode_validation"]) == (200, "escalade"), r.content


@freeze_time("2026-10-14 08:00")
def test_un_brouillon_ne_se_valide_pas_et_le_delegue_ne_valide_rien(monde, effectuee, portefeuille):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
    rapport = Rapport.objects.get()
    r = client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/")
    assert r.json()["code"] == "rapport_non_soumis"
    assert c.post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code == 403

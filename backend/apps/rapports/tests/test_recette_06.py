# ruff: noqa: F811 — les fixtures importées de test_rapport sont redéfinies en paramètres.
"""0.6.9 : recette du cycle 0.6 « Validation des rapports ».

REC-08 de bout en bout, et les critères que la recette avait trouvés sans test : RG-034 (audit
des validations par journée et par lot), RG-035 (aucune validation automatique), RG-036 (un
rapport validé ne se modifie pas), RG-032 (une resoumission n'est jamais en retard), 23.A (le
lot écarte une journée incomplète), lecture des retards par le remplaçant et le DM, et la tâche
périodique qui déclenche alertes, rappels et escalades."""

from datetime import UTC, date, datetime

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.perimetre.tests.conftest import DEBUT_ROLES, client_de
from apps.planning.echeances import executer
from apps.rapports.models import Rapport

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401
from .test_validation import figee, imprevue, journee, soumettre

pytestmark = pytest.mark.django_db


def test_rec08_correction_sur_une_visite_le_reste_valide_puis_le_rapport_corrige(
    monde, terrain, effectuee, portefeuille
):
    """REC-08 : le superviseur demande une correction sur une visite, valide le reste de la
    journée, puis valide le rapport corrigé."""
    seconde = imprevue(monde, terrain)
    a_corriger = soumettre(monde, effectuee, portefeuille[:1])
    autre = soumettre(monde, seconde, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        sup = client_de(monde["sup.sn"])
        r = sup.post(f"/api/v1/rapports/{a_corriger.pk}/correction/",
                     {"commentaire": "Précisez le résumé.", "champs": ["resume"]},
                     format="json")  # fmt: skip
        assert r.status_code == 200, r.content
        # Le reste de la journée se valide (RPT-014 CA2) ; la journée, elle, attend (22.A).
        assert sup.post(f"/api/v1/rapports/{autre.pk}/valider/").status_code == 200
        r = sup.post("/api/v1/rapports/journee/valider/", journee(monde), format="json")
        assert (r.status_code, r.json()["code"]) == (409, "rapports_non_soumis")
    with freeze_time("2026-10-16 09:00"):
        deleg = client_de(monde["deleg.sn"])
        corps = complet(monde, portefeuille[:1], resume="Le médecin attend l'étude.")
        assert deleg.put(url(effectuee), corps, format="json").status_code == 200
        r = deleg.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-16T09:00:00Z"},
                       format="json")  # fmt: skip
        # RPT-015 : version 2 ; RG-032 : une resoumission n'est jamais en retard.
        assert (r.json()["statut"], r.json()["en_retard"]) == ("soumis", False)
    with freeze_time("2026-10-16 10:00"):
        sup = client_de(monde["sup.sn"])
        lu = sup.get("/api/v1/rapports/journee/", journee(monde)).json()
        corrige = next(v["rapport"] for v in lu["visites"] if v["id"] == str(effectuee.pk))
        assert (corrige["versions"], corrige["modifies"]) == (2, ["resume"])
        assert sup.post(f"/api/v1/rapports/{a_corriger.pk}/valider/").status_code == 200
        # La journée est validée : figée, sortie de « À traiter ».
        assert sup.get("/api/v1/rapports/a-traiter/").json()["delegues"] == []
    assert figee(monde) is not None
    assert set(Rapport.objects.values_list("statut", flat=True)) == {"valide"}
    actions = set(EvenementAudit.objects.values_list("action", flat=True))
    assert {"rapport.correction_demandee", "rapport.validation", "rapport.soumission"} <= actions


def test_rg034_validations_par_journee_et_par_lot_auditees_avec_auteur_et_mode(
    monde, terrain, effectuee, portefeuille
):
    soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post("/api/v1/rapports/lot/valider/",
                                            {"journees": [journee(monde)]},
                                            format="json")  # fmt: skip
        assert r.json() == {"journees": 1, "rapports": 1}
    (rapport,) = EvenementAudit.objects.filter(action="rapport.validation")
    assert (rapport.details["mode"], rapport.acteur) == ("lot", monde["sup.sn"])
    (jour,) = EvenementAudit.objects.filter(action="rapport.validation_journee")
    assert (jour.details["mode"], jour.details["date"], jour.acteur) == (
        "lot", "2026-10-13", monde["sup.sn"])  # fmt: skip


def test_rg035_aucune_validation_automatique(monde, terrain, effectuee, portefeuille):
    from apps.organisation import services as org

    soumettre(monde, effectuee, portefeuille[:1])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    # Des passes de la tâche périodique, bien après le délai d'escalade : rien ne se valide.
    for jour in (14, 16, 20, 27):
        executer(datetime(2026, 10, jour, 9, 0, tzinfo=UTC))
    assert Rapport.objects.get().statut == "soumis"
    assert figee(monde) is None


def test_rg036_un_rapport_valide_ne_se_modifie_pas(monde, effectuee, portefeuille):
    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        assert (
            client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code
            == 200
        )
        corps = complet(monde, portefeuille[:1], resume="Autre chose.")
        r = client_de(monde["deleg.sn"]).put(url(effectuee), corps, format="json")
        assert (r.status_code, r.json()["code"]) == (409, "rapport_non_modifiable")


def test_23a_le_lot_ecarte_une_journee_dont_un_rapport_n_est_pas_soumis(
    monde, terrain, effectuee, portefeuille
):
    seconde = imprevue(monde, terrain)
    soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-13 21:00"):
        client_de(monde["deleg.sn"]).get(url(seconde))  # brouillon, jamais soumis
    with freeze_time("2026-10-14 08:00"):
        r = client_de(monde["sup.sn"]).post("/api/v1/rapports/lot/valider/",
                                            {"journees": [journee(monde)]},
                                            format="json")  # fmt: skip
        assert r.json() == {"journees": 0, "rapports": 0}


def test_rpt017_le_remplacant_et_l_administrateur_lisent_les_retards(monde, terrain, effectuee):
    from apps.organisation import services as org
    from apps.organisation.services import designer_remplacant

    remplacant = creer_utilisateur("awa.fictive", prenom="Awa", nom="FICTIVE", pays=monde["sn"])
    attribuer_role(remplacant, Role.SUPERVISEUR, monde["sn"], par=None, debut=DEBUT_ROLES)
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    with freeze_time("2026-10-15 08:00"):
        designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 15),
                            date(2026, 10, 17), par=monde["admin.sn"])  # fmt: skip
        for compte in (remplacant, monde["admin.sn"]):
            r = client_de(compte).get("/api/v1/rapports/retards/")
            assert [v["visite"] for v in r.json()["rapports"]] == [str(effectuee.pk)], compte


def test_la_tache_periodique_declenche_rappels_alertes_et_escalades(
    monde, terrain, effectuee, portefeuille
):
    from apps.organisation import services as org

    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    bilan = executer(datetime(2026, 10, 13, 18, 30, tzinfo=UTC))
    assert bilan["rappels_rapport"] == 1
    bilan = executer(datetime(2026, 10, 15, 10, 0, tzinfo=UTC))
    assert bilan["rapports"] == 1
    soumettre(monde, effectuee, portefeuille[:1])
    bilan = executer(datetime(2026, 10, 16, 10, 0, tzinfo=UTC))
    assert bilan["journees_escaladees"] == 1


def test_rpt007_ca2_l_encadrement_du_perimetre_lit_la_piece_du_rapport_soumis(
    monde, terrain, effectuee, portefeuille
):
    import uuid

    from apps.organisation import services as org

    from .test_pieces import PDF, envoi

    ident = uuid.uuid4()
    with freeze_time("2026-10-13 20:00"):
        c = client_de(monde["deleg.sn"])
        c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
        assert c.post(url(effectuee, "pieces/"), envoi(ident=ident),
                      format="multipart").status_code == 201  # fmt: skip
        c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T20:00:00Z"}, format="json")
    for compte in ("dm.sn", "df.sn"):
        org.ajouter_reseau_au_perimetre(monde[compte], terrain["cardio"], date(2026, 1, 1))
    with freeze_time("2026-10-14 08:00"):
        for compte in ("dm.sn", "df.sn", "resp.sn"):
            lu = client_de(monde[compte]).get(f"/api/v1/rapports/pieces/{ident}/")
            assert lu.status_code == 200, compte
            assert b"".join(lu.streaming_content) == PDF
        # Un autre pays, jamais.
        r = client_de(monde["resp.tg"]).get(f"/api/v1/rapports/pieces/{ident}/")
        assert r.status_code in (403, 404)


def test_25a_apres_l_escalade_le_superviseur_garde_la_main(monde, terrain, effectuee, portefeuille):
    from apps.organisation import services as org

    rapport = soumettre(monde, effectuee, portefeuille[:1])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    with freeze_time("2026-10-20 08:00"):
        admin = client_de(monde["admin.sn"])
        (ligne,) = admin.get("/api/v1/rapports/a-traiter/").json()["delegues"]
        assert ligne["journees"][0]["escalade"] is True
        r = client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/")
        assert (r.status_code, r.json()["mode_validation"]) == (200, "unitaire")


def test_32a_rouvert_au_dela_de_4_semaines_la_journee_revient_dans_la_file(
    monde, terrain, effectuee, portefeuille
):
    from apps.organisation import services as org

    rapport = soumettre(monde, effectuee, portefeuille[:1])
    with freeze_time("2026-10-14 08:00"):
        assert (
            client_de(monde["sup.sn"]).post(f"/api/v1/rapports/{rapport.pk}/valider/").status_code
            == 200
        )
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], terrain["cardio"], date(2026, 1, 1))
    with freeze_time("2026-11-20 08:00"):  # 5 semaines plus tard : hors de la file
        r = client_de(monde["admin.sn"]).post(f"/api/v1/rapports/{rapport.pk}/rouvrir/",
                                              {"motif": "Échantillons à recompter."},
                                              format="json")  # fmt: skip
        assert r.status_code == 200, r.content
        (ligne,) = client_de(monde["sup.sn"]).get("/api/v1/rapports/a-traiter/").json()[
            "delegues"]  # fmt: skip
        assert [j["date"] for j in ligne["journees"]] == ["2026-10-13"]

"""RPT-010 (0.5.7) : soumission, version figée (RG-037), marquage en retard (RG-032).

La visite a lieu le mardi 13 octobre 2026 à Dakar (UTC) ; le rapport est attendu avant minuit.
"""

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.rapports.models import Rapport, VersionRapport

from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db


def rediger(monde, visite, produits):
    c = client_de(monde["deleg.sn"])
    assert c.put(url(visite), complet(monde, produits), format="json").status_code == 200
    return c


def soumettre(c, visite, soumis_le, envoye_le=None):
    corps = {"soumis_le": soumis_le, **({"envoye_le": envoye_le} if envoye_le else {})}
    return c.post(url(visite, "soumettre/"), corps, format="json")


def test_rpt010_soumis_le_jour_meme_a_l_heure_et_fige(monde, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-13 20:00"):
        c = rediger(monde, effectuee, portefeuille[:1])
        r = soumettre(c, effectuee, "2026-10-13T20:00:00Z", "2026-10-13T20:00:00Z")
    assert r.status_code == 200, r.content
    corps = r.json()
    assert (corps["statut"], corps["en_retard"], corps["horodatage_douteux"]) == (
        "soumis", False, False)  # fmt: skip
    assert corps["echeance"] == "2026-10-14T00:00:00Z"
    # RG-037 : une version figée, qui ne suit plus le rapport.
    (version,) = VersionRapport.objects.all()
    assert (version.numero, version.contenu["resume"]) == (1, "Intérêt pour la nouvelle forme")
    Rapport.objects.update(resume="changé ailleurs")
    version.refresh_from_db()
    assert version.contenu["resume"] == "Intérêt pour la nouvelle forme"
    audit = EvenementAudit.objects.get(action="rapport.soumission")
    assert audit.details["en_retard"] is False


def test_rpt010_ca1_redige_hors_connexion_le_jour_j_envoye_a_j1_reste_a_l_heure(
    monde, effectuee, portefeuille,  # noqa: F811
):  # fmt: skip
    with freeze_time("2026-10-13 21:00"):
        rediger(monde, effectuee, portefeuille[:1])
    # Soumis sur le téléphone à 22 h, sans réseau ; parti le lendemain à 8 h.
    with freeze_time("2026-10-14 08:00"):
        r = soumettre(client_de(monde["deleg.sn"]), effectuee, "2026-10-13T22:00:00Z",
                      "2026-10-14T08:00:00Z")  # fmt: skip
    assert r.status_code == 200, r.content
    assert (r.json()["en_retard"], r.json()["soumis_le"]) == (False, "2026-10-13T22:00:00Z")
    assert VersionRapport.objects.get().recu_le.isoformat() == "2026-10-14T08:00:00+00:00"


def test_rg032_soumis_apres_minuit_en_retard(monde, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-13 21:00"):
        rediger(monde, effectuee, portefeuille[:1])
    # Brouillon non soumis : en retard dès minuit passé.
    with freeze_time("2026-10-13 23:59"):
        assert client_de(monde["deleg.sn"]).get(url(effectuee)).json()["en_retard"] is False
    with freeze_time("2026-10-14 00:30"):
        c = client_de(monde["deleg.sn"])
        assert c.get(url(effectuee)).json()["en_retard"] is True
        r = soumettre(c, effectuee, "2026-10-14T00:30:00Z", "2026-10-14T00:30:00Z")
    assert r.json()["en_retard"] is True
    assert VersionRapport.objects.get().en_retard is True


def test_rpt010_ca1_horloge_incoherente_signalee_et_heure_du_serveur_retenue(
    monde, effectuee, portefeuille,  # noqa: F811
):  # fmt: skip
    with freeze_time("2026-10-13 21:00"):
        rediger(monde, effectuee, portefeuille[:1])
    # Le téléphone, retardé de deux heures, prétend soumettre la veille au soir.
    with freeze_time("2026-10-14 01:00"):
        r = soumettre(client_de(monde["deleg.sn"]), effectuee, "2026-10-13T23:00:00Z",
                      "2026-10-13T23:00:00Z")  # fmt: skip
    corps = r.json()
    assert (corps["horodatage_douteux"], corps["en_retard"]) == (True, True)
    assert corps["soumis_le"] == "2026-10-14T01:00:00Z"


def test_rpt010_soumission_avant_la_fin_de_visite_douteuse(monde, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-13 10:00"):
        c = rediger(monde, effectuee, portefeuille[:1])
        # La visite s'est terminée à 9 h 30 : soumettre à 8 h est incohérent.
        r = soumettre(c, effectuee, "2026-10-13T08:00:00Z")
    assert (r.json()["horodatage_douteux"], r.json()["soumis_le"]) == (True, "2026-10-13T10:00:00Z")


def test_rpt010_rejeu_du_meme_envoi_sans_seconde_version(monde, effectuee, portefeuille):  # noqa: F811
    with freeze_time("2026-10-13 21:00"):
        c = rediger(monde, effectuee, portefeuille[:1])
        soumettre(c, effectuee, "2026-10-13T21:00:00Z")
    with freeze_time("2026-10-14 08:00"):
        # Rejoué depuis la file avec une horloge fausse : reconnu, rien ne change.
        r = soumettre(client_de(monde["deleg.sn"]), effectuee, "2026-10-13T21:00:00Z",
                      "2026-10-14T05:00:00Z")  # fmt: skip
    assert r.status_code == 200
    assert (r.json()["en_retard"], VersionRapport.objects.count()) == (False, 1)
    r = soumettre(client_de(monde["deleg.sn"]), effectuee, "2026-10-14T08:01:00Z")
    assert (r.status_code, r.json()["code"]) == (409, "rapport_non_modifiable")


def test_off004_le_rapport_dit_quand_il_a_ete_enregistre(monde, effectuee, portefeuille):  # noqa: F811
    """Maquette 1.5.8 : l'écran de conflit place l'heure de la version du serveur."""
    with freeze_time("2026-10-13 10:40"):
        c = rediger(monde, effectuee, portefeuille[:1])
        corps = c.get(url(effectuee)).json()
    assert corps["modifie_le"].startswith("2026-10-13T10:40")

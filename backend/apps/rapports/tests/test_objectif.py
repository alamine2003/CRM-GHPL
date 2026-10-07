"""0.5.2 : RPT-003, rappel de l'objectif prévu et saisie du résultat obtenu.

CA1 : l'objectif planifié est affiché en tête du rapport ; il est relevé à l'ouverture du
rapport et ne bouge plus."""

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.planning.models import Visite

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db


@freeze_time("2026-10-13 10:00")
def test_rpt003_ca1_l_objectif_planifie_en_tete_du_rapport(monde, effectuee):  # noqa: F811
    r = client_de(monde["deleg.sn"]).get(url(effectuee)).json()
    assert (r["objectif_prevu"], r["est_imprevue"], r["resultat_obtenu"]) == ("A", False, "")
    # Relevé à l'ouverture : un changement ultérieur de la visite ne le touche plus.
    Visite.objects.filter(pk=effectuee.pk).update(objectif="Autre objectif")
    r = client_de(monde["deleg.sn"]).get(url(effectuee)).json()
    assert r["objectif_prevu"] == "A"


@freeze_time("2026-10-13 10:00")
def test_rpt003_le_resultat_obtenu_se_saisit_et_se_soumet(monde, effectuee, portefeuille):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    saisie = complet(
        monde, portefeuille[:1], resultat_obtenu="  Accord pour un essai sur 5 patients "
    )
    r = c.put(url(effectuee), saisie, format="json").json()
    assert r["resultat_obtenu"] == "Accord pour un essai sur 5 patients"
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert (r.status_code, r.json()["resultat_obtenu"]) == (
        200,
        "Accord pour un essai sur 5 patients",
    )

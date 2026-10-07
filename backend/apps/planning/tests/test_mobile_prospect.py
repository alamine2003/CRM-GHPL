"""DC-58 (0.5.9) : le mobile personnel d'un prescripteur ne s'affiche qu'à l'administration,
et aux délégués qui l'ont dans leur liste cible s'il accepte d'être contacté sur ce numéro."""

import pytest

from apps.perimetre.tests.conftest import client_de
from apps.prospects import ciblage
from apps.prospects.services import modifier_prospect

pytestmark = pytest.mark.django_db

MOBILE = "+221 70 000 00 01"


def fiche(compte, prospect):
    return client_de(compte).get(f"/api/v1/prospects/{prospect.pk}/").json()


def test_dc58_le_mobile_suit_la_liste_cible_et_l_accord(monde, terrain):
    medecin = terrain["medecin"]
    modifier_prospect(medecin, telephone_mobile=MOBILE)
    medecin.refresh_from_db()
    numero = medecin.telephone_mobile
    # L'administration, qui tient les fiches, le voit toujours.
    assert fiche(monde["admin.sn"], medecin)["telephone_mobile"] == numero
    # Le délégué : ni liste cible ni accord, rien.
    assert fiche(monde["deleg.sn"], medecin)["telephone_mobile"] == ""
    ciblage.ajouter(terrain["poste"], [medecin], monde["admin.sn"])
    # Dans sa liste, mais sans l'accord du médecin : toujours rien, même dans « ma liste ».
    assert fiche(monde["deleg.sn"], medecin)["telephone_mobile"] == ""
    (liste,) = client_de(monde["deleg.sn"]).get("/api/v1/ciblage/moi/").json()
    assert liste["cibles"][0]["prospect"]["telephone_mobile"] == ""
    # L'historique ne le révèle pas non plus.
    historique = client_de(monde["deleg.sn"]).get(f"/api/v1/prospects/{medecin.pk}/historique/")
    assert "telephone_mobile" not in {x["champ"] for x in historique.json()}
    # Avec l'accord : le délégué qui l'a dans sa liste peut l'appeler.
    modifier_prospect(medecin, contact_mobile_accepte=True)
    lue = fiche(monde["deleg.sn"], medecin)
    assert lue.get("telephone_mobile") == numero, lue
    (liste,) = client_de(monde["deleg.sn"]).get("/api/v1/ciblage/moi/").json()
    assert liste["cibles"][0]["prospect"]["telephone_mobile"] == numero
    # Son superviseur, qui ne l'a dans aucune liste qu'il occupe, ne le voit pas.
    assert fiche(monde["sup.sn"], medecin)["telephone_mobile"] == ""


def test_dc58_l_accord_s_ecrit_par_l_api(monde, terrain):
    medecin = terrain["medecin"]
    admin = client_de(monde["admin.sn"])
    r = admin.patch(f"/api/v1/prospects/{medecin.pk}/",
                    {"telephone_mobile": MOBILE, "contact_mobile_accepte": True},
                    format="json")  # fmt: skip
    assert (r.status_code, r.json()["contact_mobile_accepte"]) == (200, True), r.content
    medecin.refresh_from_db()
    assert medecin.contact_mobile_accepte is True

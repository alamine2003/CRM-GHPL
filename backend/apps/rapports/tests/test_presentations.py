"""0.5.3 : RPT-004, produits présentés dans l'ordre avec le retour du prescripteur ; RPT-005,
échantillons et cadeaux remis, sans stock.

RPT-004 CA1 : l'ordre saisi est conservé. CA2 : seuls les produits du portefeuille du réseau
sont proposés, plus « autre » libre si le pays l'autorise. RPT-005 CA1 : aucune notion de solde
ni de dotation."""

import pytest
from freezegun import freeze_time

from apps.perimetre.tests.conftest import client_de
from apps.referentiel.models import Valeur
from apps.socle.services import definir_parametre

from .test_rapport import complet, effectuee, portefeuille, url  # noqa: F401

pytestmark = pytest.mark.django_db


def presente(*paires):
    return [{"produit": str(p.pk), "retour": r} for p, r in paires]


@freeze_time("2026-10-13 10:00")
def test_rpt004_ca1_ordre_et_retour_par_produit(monde, effectuee, portefeuille):  # noqa: F811
    cardiol, tensio, _ = portefeuille
    c = client_de(monde["deleg.sn"])
    saisie = {"presentations": [{"produit": str(tensio.pk), "retour": "tres_bien"},
                                {"produit": str(cardiol.pk)}]}  # fmt: skip
    r = c.put(url(effectuee), saisie, format="json").json()
    assert [(p["libelle"], p["retour"]) for p in r["presentations"]] == [
        ("Tensio", "tres_bien"), ("Cardiol", None)]  # fmt: skip
    # Sans retour sur chaque produit présenté, le rapport ne se soumet pas.
    assert "retours" in r["manquants"]
    saisie = complet(monde, [], presentations=presente((tensio, "tres_bien"), (cardiol, "peu")))
    r = c.put(url(effectuee), saisie, format="json").json()
    assert r["manquants"] == []
    r = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    assert [p["libelle"] for p in r.json()["presentations"]] == ["Tensio", "Cardiol"]


@freeze_time("2026-10-13 10:00")
def test_rpt004_un_produit_ne_se_presente_qu_une_fois(monde, effectuee, portefeuille):  # noqa: F811
    cardiol = portefeuille[0]
    r = client_de(monde["deleg.sn"]).put(
        url(effectuee), {"presentations": presente((cardiol, "peu"), (cardiol, "prescrit"))},
        format="json")  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (400, "produit_en_double")


@freeze_time("2026-10-13 10:00")
def test_rpt004_ca2_autre_produit_si_le_pays_l_autorise(monde, effectuee, portefeuille):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    autre = {"presentations": [{"libelle": "Produit concurrent", "retour": "prescrit"}]}
    r = c.put(url(effectuee), autre, format="json")
    assert (r.status_code, r.json()["code"]) == (400, "produit_hors_portefeuille")
    assert c.get(url(effectuee)).json()["produit_autre_autorise"] is False
    definir_parametre(monde["sn"], "produit_autre_autorise", True)
    r = c.put(url(effectuee), autre, format="json")
    assert r.status_code == 200, r.content
    assert r.json()["presentations"] == [
        {"produit": None, "libelle": "Produit concurrent", "retour": "prescrit"}]  # fmt: skip


@freeze_time("2026-10-13 10:00")
def test_rpt005_echantillons_et_cadeaux_remis(monde, effectuee, portefeuille):  # noqa: F811
    cardiol, _, lipido = portefeuille
    stylo = Valeur.objects.get(pays=monde["sn"], liste="article_promotionnel", code="stylo")
    c = client_de(monde["deleg.sn"])
    assert "Stylo" in [a["libelle"] for a in c.get(url(effectuee)).json()["articles_proposes"]]
    remises = [{"type": "echantillon", "produit": str(cardiol.pk), "quantite": 3},
               {"type": "cadeau", "article": str(stylo.pk), "quantite": 1}]  # fmt: skip
    r = c.put(url(effectuee), {"remises": remises}, format="json").json()
    assert [(x["type"], x["libelle"], x["quantite"]) for x in r["remises"]] == [
        ("echantillon", "Cardiol", 3), ("cadeau", "Stylo", 1)]  # fmt: skip
    # Un échantillon hors portefeuille, ou une quantité nulle, sont refusés.
    r = c.put(url(effectuee), {"remises": [{"type": "echantillon", "produit": str(lipido.pk),
                                            "quantite": 1}]}, format="json")  # fmt: skip
    assert r.json()["code"] == "produit_hors_portefeuille"
    r = c.put(url(effectuee), {"remises": [{"type": "cadeau", "article": str(stylo.pk),
                                            "quantite": 0}]}, format="json")  # fmt: skip
    assert r.status_code == 400
    # CA1 : les remises ne sont pas obligatoires et ne touchent à aucun stock.
    r = c.put(url(effectuee), complet(monde, [cardiol], remises=[]), format="json").json()
    assert (r["remises"], r["manquants"]) == ([], [])


def test_rg033_le_portefeuille_est_celui_du_jour_de_la_visite(
    monde,
    terrain,
    effectuee,
    portefeuille,  # noqa: F811
):
    from apps.referentiel import services as ref

    cardiol, tensio, _ = portefeuille
    with freeze_time("2026-10-14 08:00"):
        # Cardiol quitte le portefeuille le lendemain de la visite.
        ref.definir_portefeuille(terrain["cardio"], [tensio])
        c = client_de(monde["deleg.sn"])
        r = c.get(url(effectuee)).json()
        assert [p["libelle"] for p in r["produits_proposes"]] == ["Cardiol", "Tensio"]
        r = c.put(url(effectuee), complet(monde, [cardiol]), format="json")
        assert r.status_code == 200, r.content

"""1.1.0 : le modèle sénégalais appliqué aux autres pays (décision du 12 octobre 2026).

Données fictives : gammes, réseaux et produits inventés."""

import pytest
from django.core.management import call_command

from apps.organisation import services as org
from apps.organisation.models import Division, Reseau, Secteur, Zone
from apps.referentiel import services as ref
from apps.referentiel.models import Produit
from apps.socle.models import Pays
from apps.socle.services import aujourdhui, definir_parametre, valeur_parametre

pytestmark = pytest.mark.django_db


@pytest.fixture
def modele():
    sn = Pays.objects.get(code="SN") if Pays.objects.filter(code="SN").exists() else None
    if sn is None:
        from apps.socle.services import creer_pays

        sn = creer_pays("SN")
    gamme = org.creer_division(sn, "GAMFIC", "Gamme fictive")
    alpha = org.creer_reseau(sn, gamme, "ALPHA", "Réseau Alpha")
    org.creer_reseau(sn, gamme, "BETA", "Réseau Beta")
    produits = [ref.creer_produit(sn, "Fictivol 10 mg"), ref.creer_produit(sn, "Imaginex")]
    ref.definir_portefeuille(alpha, produits)
    org.creer_secteur(sn, org.creer_zone(sn, "Dakar"), "Plateau")
    definir_parametre(sn, "jours_ouvres", [1, 2, 3, 4, 5, 6])
    return sn


def test_la_structure_commerciale_est_copiee_sans_le_terrain(modele):
    call_command("appliquer_modele_pays", depuis="SN", vers=["CI"])
    ci = Pays.objects.get(code="CI")
    assert Division.objects.get(pays=ci).libelle == "Gamme fictive"
    assert set(Reseau.objects.filter(pays=ci).values_list("code", flat=True)) == {"ALPHA", "BETA"}
    assert set(Produit.objects.filter(pays=ci).values_list("libelle", flat=True)) == {
        "Fictivol 10 mg", "Imaginex"}  # fmt: skip
    alpha = Reseau.objects.get(pays=ci, code="ALPHA")
    assert {p.produit.libelle for p in ref.portefeuille_actif([alpha], aujourdhui(ci))} == {
        "Fictivol 10 mg", "Imaginex"}  # fmt: skip
    assert valeur_parametre(ci, "jours_ouvres") == [1, 2, 3, 4, 5, 6]
    # Le terrain reste propre à chaque pays.
    assert not Zone.objects.filter(pays=ci).exists()
    assert not Secteur.objects.filter(pays=ci).exists()


def test_relancer_ne_cree_rien_et_garde_les_choix_du_pays(modele, capsys):
    call_command("appliquer_modele_pays", depuis="SN", vers=["CI"])
    ci = Pays.objects.get(code="CI")
    beta = Reseau.objects.get(pays=ci, code="BETA")
    ref.definir_portefeuille(beta, [Produit.objects.get(pays=ci, libelle="Imaginex")])
    capsys.readouterr()
    call_command("appliquer_modele_pays", depuis="SN", vers=["CI"])
    assert "rien à ajouter" in capsys.readouterr().out
    assert Reseau.objects.filter(pays=ci).count() == 2
    assert Produit.objects.filter(pays=ci).count() == 2
    assert [p.produit.libelle for p in ref.portefeuille_actif([beta], aujourdhui(ci))] == [
        "Imaginex"]  # fmt: skip

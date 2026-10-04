"""Premiers tests d'isolation systématiques (prd.md §23, 0.0.7 ; SEC-008 complet en 0.9.1).

Un administrateur du Togo essaie chaque route qui désigne un objet par son identifiant,
avec les identifiants d'objets du Sénégal, et chaque liste : il ne doit jamais obtenir
de réponse positive, ni même un 400 qui révélerait l'existence de l'objet (USR-002 CA2).
Une nouvelle route sans cas de test fait échouer la suite.
"""

import json

import pytest
from django.urls import URLPattern, URLResolver, get_resolver

from apps.identite.models import AffectationPays, Appareil, RoleUtilisateur
from apps.identite.services import accorder_affectation
from apps.organisation import services as org
from apps.organisation.models import Occupation, PerimetreReseau

from .conftest import client_de

pytestmark = pytest.mark.django_db


def _routes(motifs, prefixe=""):
    for motif in motifs:
        if isinstance(motif, URLResolver):
            yield from _routes(motif.url_patterns, prefixe + str(motif.pattern))
        elif isinstance(motif, URLPattern):
            yield prefixe + str(motif.pattern), motif


@pytest.fixture
def senegal(monde):
    """Un objet de chaque sorte au Sénégal."""
    sn = monde["sn"]
    division = org.creer_division(sn, "CARDIO", "Cardiologie")
    reseau = org.creer_reseau(sn, division, "R1", "Réseau")
    zone = org.creer_zone(sn, "Nord")
    secteur = org.creer_secteur(sn, zone, "Louga")
    poste = org.creer_poste(sn, "vm", "VM Louga", [reseau], [secteur])
    org.occuper(poste, monde["deleg.sn"])
    org.rattacher(poste, monde["sup.sn"])
    org.ajouter_reseau_au_perimetre(monde["dm.sn"], reseau)
    accorder_affectation(monde["df.sn"], monde["sn"].__class__.objects.get(code="TG"), "dm",
                         "Intérim", par=monde["ada.siege"])  # fmt: skip
    appareil = Appareil.objects.create(
        utilisateur=monde["deleg.sn"], identifiant_installation="sn-telephone-0001",
        plateforme="android",
    )  # fmt: skip
    compte = monde["resp.sn"]
    from apps.identite.models import Session

    session_sn = Session.objects.create(
        utilisateur=compte, client="portail", empreinte_rafraichissement="sn" * 32,
        expire_le=compte.date_joined.replace(year=2099),
    )  # fmt: skip
    from apps.referentiel import services as ref

    valeur = ref.creer_valeur(sn, "specialite", "Allergologie")
    produit = ref.creer_produit(sn, "Vasculor")
    ref.definir_portefeuille(reseau, [produit])
    from apps.prospects.services import creer_prospect
    from apps.referentiel.models import Valeur

    medecin = Valeur.objects.get(pays=sn, liste="type_prospect", code="pharmacien")
    prospect = creer_prospect(sn, monde["admin.sn"], actif=True, nom="Ndiaye", type=medecin,
                              potentiel="A")  # fmt: skip
    return {
        "prospect": prospect.pk, "prospect-valider": prospect.pk,
        "prospect-archiver": prospect.pk,
        "valeur": valeur.pk, "valeur-archiver": valeur.pk, "valeur-reactiver": valeur.pk,
        "produit": produit.pk, "produit-archiver": produit.pk, "produit-reactiver": produit.pk,
        "portefeuille-reseau": reseau.pk,
        "session-revoquer": session_sn.pk,
        "utilisateur": compte.pk,
        "roles": compte.pk,
        "utilisateur-action": compte.pk,
        "affectations": compte.pk,
        "transferts": compte.pk,
        "perimetres-reseaux": monde["dm.sn"].pk,
        "role-retirer": RoleUtilisateur.objects.get(utilisateur=compte).pk,
        "appareil-revoquer": appareil.pk,
        "affectation-terminer": AffectationPays.objects.first().pk,
        "division": division.pk, "division-archiver": division.pk,
        "reseau": reseau.pk, "reseau-archiver": reseau.pk,
        "zone": zone.pk, "zone-archiver": zone.pk,
        "secteur": secteur.pk, "secteur-archiver": secteur.pk,
        "poste": poste.pk, "poste-archiver": poste.pk,
        "occupations": poste.pk, "rattachements": poste.pk,
        "occupation-terminer": Occupation.objects.get(poste=poste).pk,
        "perimetre-reseau-terminer": PerimetreReseau.objects.get().pk,
    }  # fmt: skip


ROUTES_PAR_CODE = {"pays-detail", "pays-statut", "parametres", "parametre", "designations"}


def _url(chemin: str, identifiant) -> str:
    url = "/" + chemin.replace("<uuid:id>", str(identifiant)).replace("<str:code>", "SN")
    return url.replace("<str:cle>", "distance_pointage_m").replace("<str:operation>", "suspendre")


def test_aucune_route_n_ouvre_un_objet_d_un_autre_pays(monde, senegal):
    """L'affectation du DF sénégalais au Togo n'ouvre pas ses données sénégalaises."""
    togo = client_de(monde["admin.tg"])
    testees, fuites, oubliees = 0, [], []
    for chemin, motif in _routes(get_resolver().url_patterns):
        vue = getattr(motif.callback, "view_class", None)
        if vue is None or ("<uuid:id>" not in chemin and "<str:code>" not in chemin):
            continue
        actions = [
            m.upper()
            for m in vue.http_method_names
            if m not in ("options", "head") and hasattr(vue, m)
        ]
        if motif.name in ROUTES_PAR_CODE:
            identifiant = None
        elif motif.name in senegal:
            identifiant = senegal[motif.name]
        else:
            oubliees.append(motif.name)
            continue
        for methode in actions:
            reponse = getattr(togo, methode.lower())(_url(chemin, identifiant), {}, format="json")
            testees += 1
            if reponse.status_code not in (403, 404):
                fuites.append((methode, motif.name, reponse.status_code))
    assert oubliees == [], f"Routes sans cas d'isolation : {oubliees}"
    assert fuites == [], f"Réponses qui révèlent un objet du Sénégal : {fuites}"
    assert testees > 30


LISTES = ["/api/v1/utilisateurs/", "/api/v1/appareils/", "/api/v1/pays/",
          "/api/v1/organisation/divisions/", "/api/v1/organisation/reseaux/",
          "/api/v1/organisation/zones/", "/api/v1/organisation/secteurs/",
          "/api/v1/organisation/postes/", "/api/v1/referentiel/produits/",
          "/api/v1/referentiel/portefeuilles/"]  # fmt: skip
PAGINEES = ["/api/v1/prospects/"]


@pytest.mark.parametrize("liste", LISTES + PAGINEES)
def test_aucune_liste_ne_contient_un_objet_d_un_autre_pays(monde, senegal, liste):
    reponse = client_de(monde["admin.tg"]).get(liste)
    assert reponse.status_code == 200
    # Le DF sénégalais affecté au Togo y figure légitimement (ORG-009) : son compte seulement.
    corps = reponse.json()
    corps = corps["resultats"] if isinstance(corps, dict) else corps
    objets = [o for o in corps if o.get("id") != str(monde["df.sn"].pk)]
    texte = json.dumps(objets)
    identifiants_sn = {str(v) for v in senegal.values()}
    assert [i for i in identifiants_sn if i in texte] == []
    assert '"SN"' not in texte and "Sénégal" not in texte


def test_la_vue_consolidee_du_siege_voit_les_deux_pays(monde, senegal):
    """Contre-épreuve : les objets existent bien et le siège, autorisé, les voit."""
    reponse = client_de(monde["ada.siege"]).get("/api/v1/organisation/postes/")
    assert "VM Louga" in json.dumps(reponse.json(), ensure_ascii=False)

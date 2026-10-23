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

pytestmark = [pytest.mark.django_db, pytest.mark.isolation]


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

    medecin = Valeur.objects.get(pays=sn, liste="type_prospect", code="grossiste")
    prospect = creer_prospect(sn, monde["admin.sn"], actif=True, nom="Ndiaye", type=medecin,
                              potentiel="A")  # fmt: skip
    from apps.prospects.services import creer_etablissement

    cabinet = Valeur.objects.get(pays=sn, liste="type_etablissement", code="cabinet")
    etab = creer_etablissement(sn, monde["admin.sn"], actif=True, nom="Cabinet", type=cabinet,
                               secteur=secteur)  # fmt: skip
    from apps.imports.birdnotes import importer

    localite = org.creer_localite(secteur, "Louga Centre")
    lot = importer(sn, monde["admin.sn"], b'{"donnees": {}}', "vide.json", simulation=True)
    from apps.prospects.services import creer_exercice

    exercice = creer_exercice(prospect, etab, monde["admin.sn"])
    from apps.prospects.ciblage import ajouter

    cible = ajouter(poste, [prospect], monde["admin.sn"])["creees"][0]
    from apps.prospects import doublons, propositions
    from apps.prospects.models import DoublonProbable

    jumeau = creer_prospect(sn, monde["admin.sn"], actif=True, nom="Ndiay", type=medecin,
                            potentiel="B")  # fmt: skip
    doublon = DoublonProbable.objects.create(pays=sn, fiche=jumeau, candidat=prospect, score=70)
    absorbee = creer_prospect(sn, monde["admin.sn"], actif=True, nom="Ndiayee", type=medecin,
                              potentiel="B")  # fmt: skip
    fusion = doublons.fusionner(prospect, absorbee, par=monde["admin.sn"], automatique=False)
    proposition = propositions.proposer(monde["deleg.sn"], prospect, {"courriel": "x@y.invalid"})
    from datetime import date

    from apps.planning.services import creer_jour_ferie

    ferie = creer_jour_ferie(sn, date=date(2099, 4, 4), libelle="Fête nationale")
    from apps.planning.models import Activite, Passage, Planning, Visite

    planning = Planning.objects.create(pays=sn, delegue=monde["deleg.sn"], semaine=date(2099, 4, 6))
    visite = Visite.objects.create(pays=sn, planning=planning, date=date(2099, 4, 7))
    passage = Passage.objects.create(pays=sn, planning=planning, date=date(2099, 4, 7),
                                     etablissement=etab)  # fmt: skip
    from apps.notifications.services import notifier

    notification = notifier(monde["deleg.sn"], "planning_approuve", sn, semaine="2099-04-06")
    from apps.organisation.models import Remplacement

    remplacement = Remplacement.objects.create(
        pays=sn, superviseur=monde["sup.sn"], remplacant=monde["sup.sn"],
        debut=date(2099, 4, 6), fin=date(2099, 4, 10),
    )  # fmt: skip
    activite = Activite.objects.create(pays=sn, planning=planning, date=date(2099, 4, 8),
                                     type="formation")  # fmt: skip
    from apps.rapports.services import creer_champ

    champ = creer_champ(sn, libelle="Patients par semaine", type="nombre")
    from apps.pilotage.models import Objectif

    objectif = Objectif.objects.create(pays=sn, reseau=reseau, indicateur="visites",
                                       debut=date(2099, 4, 6), fin=date(2099, 6, 28), cible=100,
                                       cree_par=monde["admin.sn"])  # fmt: skip
    from apps.ventes import models as ventes_objectifs
    from apps.ventes import services as ventes

    client_vente = ventes.creer_client(sn, "Pharmacie d'essai", "pharmacie", zone)
    vente, _cree = ventes.enregistrer_ligne(
        sn, monde["admin.sn"], mois=date(2099, 4, 1), delegue=monde["deleg.sn"], produit=produit,
        client=client_vente, quantite=1, montant_ttc=1, source="saisie",
    )  # fmt: skip
    objectif_vente = ventes_objectifs.ObjectifVente.objects.create(
        pays=sn, reseau=reseau, annee=2099, cible=1000, cree_par=monde["admin.sn"]
    )
    return {
        "ventes-objectif": objectif_vente.pk, "ventes-objectif-archiver": objectif_vente.pk,
        "ventes-ligne": vente.pk, "ventes-ligne-archiver": vente.pk,
        "droits-do-compte": monde["df.sn"].pk,
        "objectif": objectif.pk, "objectif-archiver": objectif.pk,
        "prospect-historique": prospect.pk, "etablissement-historique": etab.pk,
        "prospect-rapports": prospect.pk,
        "doublon-trancher": doublon.pk, "fusion-defaire": fusion.pk,
        "proposition-trancher": proposition.pk,
        "jour-ferie": ferie.pk, "jour-ferie-retirer": ferie.pk,
        "planning-visites": planning.pk, "visite": visite.pk, "visite-retirer": visite.pk,
        "planning-ordre": planning.pk, "planning-passages": planning.pk,
        "planning-poser": planning.pk, "planning-reprendre": planning.pk,
        "planning-soumettre": planning.pk, "planning-consultation": planning.pk,
        "planning-approuver": planning.pk, "notification-lue": notification.pk,
        "planning-reviser": planning.pk, "planning-versions": planning.pk,
        "planning-version": planning.pk,
        "remplacement-terminer": remplacement.pk,
        "visite-copier": visite.pk, "visite-detail": visite.pk,
        "visite-demarrer": visite.pk, "visite-terminer": visite.pk,
        "visite-absent": visite.pk,
        "visite-annuler": visite.pk,
        "visite-reporter": visite.pk,
        "visite-rapport": visite.pk,
        "visite-rapport-soumettre": visite.pk,
        # La visite est cherchée dans le périmètre avant la pièce jointe (RPT-007 CA2).
        "visite-rapport-pieces": visite.pk, "visite-rapport-piece": visite.pk,
        "visite-rapport-pieces-annonce": visite.pk,
        "rapport-piece-lue": visite.pk, "rapport-valider": visite.pk,
        "rapport-correction": visite.pk,
        "rapport-rouvrir": visite.pk,
        "champ-rapport": champ.pk, "champ-rapport-archiver": champ.pk,
        "visite-non-realisee": visite.pk,
        "passage-dissocier": passage.pk, "planning-activites": planning.pk,
        "activite": activite.pk, "activite-retirer": activite.pk,
        "ciblage-liste": poste.pk, "ciblage-candidats": poste.pk,
        "cible": cible.pk, "cible-retirer": cible.pk,
        "prospect-exercices": prospect.pk, "etablissement-exercices": etab.pk,
        "exercice": exercice.pk, "exercice-terminer": exercice.pk,
        "localite": localite.pk, "localite-archiver": localite.pk,
        "import": lot.pk, "import-rapport": lot.pk,
        "etablissement": etab.pk, "etablissement-valider": etab.pk,
        "etablissement-archiver": etab.pk, "etablissement-position-proposee": etab.pk,
        "etablissement-valider-position": etab.pk,
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
    url = url.replace("<str:cle>", "distance_pointage_m").replace("<str:operation>", "suspendre")
    url = url.replace("<uuid:piece>", "00000000-0000-0000-0000-000000000001")
    return url.replace("<int:numero>", "1")


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
          "/api/v1/organisation/postes/", "/api/v1/organisation/localites/",
          "/api/v1/imports/", "/api/v1/ciblage/postes/", "/api/v1/ciblage/moi/",
          "/api/v1/referentiel/produits/",
          "/api/v1/referentiel/portefeuilles/", "/api/v1/doublons/", "/api/v1/fusions/",
          "/api/v1/propositions/", "/api/v1/jours-feries/", "/api/v1/ventes/clients/"]  # fmt: skip
PAGINEES = ["/api/v1/prospects/", "/api/v1/etablissements/", "/api/v1/ventes/lignes/"]


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

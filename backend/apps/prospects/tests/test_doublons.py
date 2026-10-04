"""Doublons, fusions, défusions, historique et propositions (PRP-007 à PRP-010, PRP-012,
PRP-014)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.prospects import ciblage, doublons, services
from apps.prospects.models import (
    Changement,
    DoublonProbable,
    Fusion,
    Prospect,
    StatutDoublon,
    StatutFiche,
)
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/prospects/"


def valeur(monde, liste, code):
    return Valeur.objects.get(pays=monde["sn"], liste=liste, code=code)


def saisie(monde, **champs):
    return {
        "civilite": "dr",
        "nom": "Ndiaye",
        "prenom": "Aïssatou",
        "type": str(valeur(monde, "type_prospect", "medecin").pk),
        "specialite": str(valeur(monde, "specialite", "cardiologie").pk),
        "potentiel": "A",
        **champs,
    }


def commune(monde, **champs):
    """Fiche commune créée par l'administration, sans passer par le détecteur."""
    v = {
        "nom": "Ndiaye",
        "prenom": "Aïssatou",
        "type": valeur(monde, "type_prospect", "medecin"),
        "specialite": valeur(monde, "specialite", "cardiologie"),
        "potentiel": "A",
        **champs,
    }
    return services.creer_prospect(monde["sn"], monde["admin.sn"], actif=True, **v)


def test_suggestions_pendant_la_saisie(monde):
    """PRP-007 CA1 : faute de frappe, accent, titre « Dr » ; les plus proches d'abord."""
    existante = commune(monde)
    commune(monde, nom="Diop", prenom="Moussa")
    deleg = client_de(monde["deleg.sn"])
    for nom, prenom in [("NDIAYE", "Aissatou"), ("Dr Ndiay", "Aïsatou"), ("ndiaye", "")]:
        r = deleg.get(f"{URL}ressemblants/", {"nom": nom, "prenom": prenom})
        assert r.status_code == 200, r.content
        assert [x["prospect"]["id"] for x in r.json()][:1] == [str(existante.pk)], (nom, prenom)
    # Un identifiant fort suffit, même sans nom.
    commune(monde, nom="Fall", prenom="Ibou", numero_ordre="SN-123")
    r = deleg.get(f"{URL}ressemblants/", {"numero_ordre": "sn-123"})
    assert r.json()[0]["criteres"] == ["meme_numero_ordre"]
    assert deleg.get(f"{URL}ressemblants/", {"nom": "Zz"}).json() == []


def test_meme_numero_d_ordre_fusion_automatique(monde):
    """PRP-008 CA1 et CA3 : même numéro d'ordre dans le même pays → fusion automatique,
    auditée avec score et critères ; la saisie renvoie la fiche conservée."""
    existante = commune(monde, numero_ordre="SN-0042")
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(URL, saisie(monde, nom="Ndiaye", prenom="A.", numero_ordre="sn-0042",
                               telephone_mobile="77 555 44 33"), format="json")  # fmt: skip
    assert r.status_code == 201, r.content
    assert r.json()["doublon"] == "certain" and r.json()["id"] == str(existante.pk)
    absorbee = Prospect.objects.get(statut=StatutFiche.FUSIONNE)
    assert absorbee.fusionne_dans == existante
    fusion = Fusion.objects.get()
    assert fusion.automatique and "meme_numero_ordre" in fusion.criteres
    # Le mobile saisi complète la fiche conservée, et l'historique le dit (PRP-012).
    existante.refresh_from_db()
    assert existante.telephone_mobile == "+221775554433"
    assert Changement.objects.filter(objet_id=existante.pk, champ="telephone_mobile",
                                     origine="fusion").exists()  # fmt: skip
    detection = EvenementAudit.objects.get(action="prospect.detection_doublons")
    assert detection.details["niveau"] == "certain" and detection.details["score"] >= 80
    assert "meme_numero_ordre" in detection.details["criteres"]


def test_meme_mobile_et_nom_similaire_fusionnent(monde):
    """§14.6 : même mobile personnel avec un nom similaire → certain."""
    existante = commune(monde, telephone_mobile="+221771112233")
    fiche, d = services.saisir_prospect(
        monde["sn"], monde["deleg.sn"], actif=False, nom="NDIAYE", prenom="Aissatu",
        type=existante.type, specialite=existante.specialite, potentiel="B",
        telephone_mobile="77 111 22 33",
    )  # fmt: skip
    assert d.niveau == "certain" and fiche == existante


def test_meme_telephone_fixe_noms_differents_ne_fusionnent_pas(monde):
    """PRP-008 CA2 : le standard d'une clinique ne fait pas deux médecins identiques."""
    commune(monde, telephone_pro="+221338001122")
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(URL, saisie(monde, nom="Faye", prenom="Ousmane",
                               telephone_pro="33 800 11 22"), format="json")  # fmt: skip
    assert r.json()["doublon"] == "aucun" and r.json()["statut"] == "actif"
    assert not Fusion.objects.exists() and not DoublonProbable.objects.exists()
    aucun = EvenementAudit.objects.filter(action="prospect.detection_doublons").last()
    assert aucun.details["niveau"] == "aucun"


def test_homonyme_sans_identifiant_fort_entre_dans_la_file(monde):
    """PRP-008 : probable → file ; PRP-009 CA1 : comparaison côte à côte."""
    existante = commune(monde)
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post(URL, saisie(monde, prenom="Aissatou"), format="json")
    assert r.json()["doublon"] == "probable" and r.json()["statut"] == "a_valider"
    admin = client_de(monde["admin.sn"])
    file = admin.get("/api/v1/doublons/").json()
    assert len(file) == 1
    paire = file[0]
    assert paire["candidat"]["id"] == str(existante.pk)
    assert paire["fiche"]["nom"] == paire["candidat"]["nom"] == "NDIAYE"
    assert "nom_similaire" in paire["criteres"] and paire["score"] >= 50
    # Seul l'administrateur pays tranche (§6.3).
    assert deleg.get("/api/v1/doublons/").status_code == 403


def test_garder_separees_ne_revient_plus(monde):
    """PRP-009 CA2."""
    commune(monde)
    deleg = client_de(monde["deleg.sn"])
    nouvelle = deleg.post(URL, saisie(monde, prenom="Aissatou"), format="json").json()
    admin = client_de(monde["admin.sn"])
    paire = admin.get("/api/v1/doublons/").json()[0]
    r = admin.post(f"/api/v1/doublons/{paire['id']}/trancher/", {"decision": "separer"},
                   format="json")  # fmt: skip
    assert r.status_code == 200 and r.json()["statut"] == "separes"
    assert Prospect.objects.get(pk=nouvelle["id"]).statut == StatutFiche.ACTIF
    # La même paire n'est plus proposée par le détecteur.
    assert doublons.detecter(Prospect.objects.get(pk=nouvelle["id"])).niveau == "aucun"
    assert admin.get("/api/v1/doublons/").json() == []


def test_fusionner_puis_defusionner(monde):
    """PRP-009 (fusionner), PRP-010 CA1 et CA2 : après défusion, chaque fiche retrouve ses
    exercices et listes cibles ; la défusion est auditée."""
    sn, admin_u = monde["sn"], monde["admin.sn"]
    existante = commune(monde)
    dakar = org.creer_zone(sn, "Dakar")
    secteur = org.creer_secteur(sn, dakar, "Plateau")
    clinique = services.creer_etablissement(
        sn, admin_u, actif=True, nom="Clinique A", secteur=secteur,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    cabinet = services.creer_etablissement(
        sn, admin_u, actif=True, nom="Cabinet B", secteur=secteur,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    poste = org.creer_poste(sn, "vm", "VM Plateau", [], [secteur])
    services.creer_exercice(existante, clinique, admin_u)
    # Deux fiches communes déjà en service (reprises d'un import), que le détecteur rapproche.
    nouvelle = commune(monde, prenom="Aissatou")
    decision = doublons.detecter(nouvelle)
    assert decision.niveau == "probable" and decision.candidat == existante
    DoublonProbable.objects.create(pays=sn, fiche=nouvelle, candidat=existante,
                                   score=decision.score, criteres=decision.criteres)  # fmt: skip
    services.creer_exercice(nouvelle, cabinet, admin_u)
    ciblage.ajouter(poste, [nouvelle], admin_u)

    admin = client_de(admin_u)
    paire = admin.get("/api/v1/doublons/").json()[0]
    assert paire["fiche"]["lieux"] == ["Cabinet B"] and paire["fiche"]["cibles"] == 1
    r = admin.post(f"/api/v1/doublons/{paire['id']}/trancher/", {"decision": "fusionner"},
                   format="json")  # fmt: skip
    assert r.json()["statut"] == "fusionnes"
    # Exercices et liste cible suivent la fiche conservée.
    assert set(existante.exercices.filter(fin__isnull=True).values_list(
        "etablissement__nom", flat=True)) == {"Clinique A", "Cabinet B"}  # fmt: skip
    assert existante.cibles.filter(fin__isnull=True, poste=poste).exists()

    fusion = admin.get("/api/v1/fusions/").json()[0]
    assert fusion["absorbee"]["id"] == str(nouvelle.pk) and not fusion["automatique"]
    r = admin.post(f"/api/v1/fusions/{fusion['id']}/defaire/")
    assert r.status_code == 200 and r.json()["defaite_le"]
    nouvelle.refresh_from_db()
    assert nouvelle.statut == StatutFiche.ACTIF and nouvelle.fusionne_dans is None
    assert list(nouvelle.exercices.filter(fin__isnull=True).values_list(
        "etablissement__nom", flat=True)) == ["Cabinet B"]  # fmt: skip
    assert list(existante.exercices.filter(fin__isnull=True).values_list(
        "etablissement__nom", flat=True)) == ["Clinique A"]  # fmt: skip
    assert nouvelle.cibles.filter(fin__isnull=True, poste=poste).exists()
    assert not existante.cibles.filter(fin__isnull=True).exists()
    assert EvenementAudit.objects.filter(action="prospect.defusion").count() == 1
    # Défaite, la paire ne refusionne plus automatiquement.
    assert DoublonProbable.objects.filter(statut=StatutDoublon.SEPARES).exists()
    assert admin.post(f"/api/v1/fusions/{fusion['id']}/defaire/").status_code == 400


def test_defusion_d_une_fusion_automatique_par_numero(monde):
    """PRP-010 sur une fusion automatique : la fiche rendue perd le numéro d'ordre partagé."""
    existante = commune(monde, numero_ordre="SN-7")
    _fiche, d = services.saisir_prospect(
        monde["sn"], monde["deleg.sn"], actif=False, nom="Ndiaye", prenom="Awa",
        type=existante.type, specialite=existante.specialite, potentiel="A", numero_ordre="SN-7",
    )  # fmt: skip
    assert d.niveau == "certain"
    rendue = doublons.defusionner(Fusion.objects.get(), monde["admin.sn"])
    assert rendue.numero_ordre == "" and rendue.statut == StatutFiche.A_VALIDER
    assert Changement.objects.filter(objet_id=rendue.pk, champ="numero_ordre",
                                     ancienne="SN-7").exists()  # fmt: skip


def test_refuser_un_doublon_archive_la_fiche(monde):
    commune(monde)
    deleg = client_de(monde["deleg.sn"])
    nouvelle = deleg.post(URL, saisie(monde, prenom="Aissatou"), format="json").json()
    admin = client_de(monde["admin.sn"])
    paire = admin.get("/api/v1/doublons/").json()[0]
    admin.post(f"/api/v1/doublons/{paire['id']}/trancher/", {"decision": "refuser"},
               format="json")  # fmt: skip
    assert Prospect.objects.get(pk=nouvelle["id"]).statut == StatutFiche.ARCHIVE


def test_historique_champ_par_champ_sans_suppression(monde):
    """PRP-012 CA1 : champ, ancienne et nouvelle valeur, auteur, date ; CA2 : rien ne se
    supprime (archivage logique)."""
    fiche = commune(monde)
    admin = client_de(monde["admin.sn"])
    admin.patch(f"{URL}{fiche.pk}/", {"potentiel": "B", "courriel": "a@exemple.invalid"},
                format="json")  # fmt: skip
    lignes = admin.get(f"{URL}{fiche.pk}/historique/").json()
    par_champ = {x["champ"]: x for x in lignes}
    assert par_champ["potentiel"]["ancienne"] == "A" and par_champ["potentiel"]["nouvelle"] == "B"
    assert par_champ["courriel"]["auteur"]["identifiant"] == monde["admin.sn"].username
    assert par_champ["potentiel"]["le"]
    admin.post(f"{URL}{fiche.pk}/archiver/", {"motif": "Retraite"}, format="json")
    assert Prospect.objects.filter(pk=fiche.pk, statut=StatutFiche.ARCHIVE).exists()
    statut = admin.get(f"{URL}{fiche.pk}/historique/").json()[0]
    assert (statut["champ"], statut["nouvelle"]) == ("statut", "archive")
    with pytest.raises(TypeError):
        Prospect.objects.get(pk=fiche.pk).delete()


def _poste_du_delegue(monde):
    sn = monde["sn"]
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Thiès"), "Thiès Ville")
    poste = org.creer_poste(sn, "vm", "VM Thiès", [], [secteur])
    org.occuper(poste, monde["deleg.sn"])
    org.rattacher(poste, monde["sup.sn"])
    return poste


def test_proposition_ne_change_rien_avant_acceptation(monde):
    """PRP-014 CA1 : la fiche reste inchangée ; CA2 : le délégué voit la décision."""
    _poste_du_delegue(monde)
    fiche = commune(monde)
    deleg = client_de(monde["deleg.sn"])
    r = deleg.post("/api/v1/propositions/", {
        "prospect": str(fiche.pk),
        "changements": {"telephone_mobile": "77 999 88 77", "courriel": "nd@exemple.invalid"},
        "commentaire": "Nouveau numéro donné en visite",
    }, format="json")  # fmt: skip
    assert r.status_code == 201, r.content
    proposition = r.json()
    assert proposition["changements"]["telephone_mobile"] == "+221779998877"
    fiche.refresh_from_db()
    assert fiche.telephone_mobile == "" and fiche.courriel == ""
    assert not proposition["decidable"]
    # Le superviseur des postes de l'auteur la voit et l'accepte.
    sup = client_de(monde["sup.sn"])
    a_trancher = sup.get("/api/v1/propositions/?statut=en_attente").json()
    assert [p["id"] for p in a_trancher] == [proposition["id"]] and a_trancher[0]["decidable"]
    assert a_trancher[0]["actuels"] == {"telephone_mobile": "", "courriel": ""}
    r = sup.post(f"/api/v1/propositions/{proposition['id']}/trancher/",
                 {"decision": "accepter"}, format="json")  # fmt: skip
    assert r.status_code == 200 and r.json()["statut"] == "acceptee"
    fiche.refresh_from_db()
    assert fiche.telephone_mobile == "+221779998877"
    assert Changement.objects.filter(objet_id=fiche.pk, origine="proposition").count() == 2
    # Le délégué est notifié : sa proposition porte la décision, non lue jusqu'à lecture.
    miennes = deleg.get("/api/v1/propositions/").json()
    assert miennes[0]["statut"] == "acceptee" and miennes[0]["vue_le"] is None
    assert deleg.post("/api/v1/propositions/vues/").status_code == 204
    assert deleg.get("/api/v1/propositions/").json()[0]["vue_le"] is not None


def test_proposition_refusee_et_nouvel_exercice(monde):
    """PRP-014 : nouvel exercice proposé ; refus motivé par l'administrateur pays."""
    sn = monde["sn"]
    fiche = commune(monde)
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Kaolack"), "Kaolack")
    lieu = services.creer_etablissement(
        sn, monde["admin.sn"], actif=True, nom="Clinique K", secteur=secteur,
        type=valeur(monde, "type_etablissement", "clinique"),
    )  # fmt: skip
    deleg = client_de(monde["deleg.sn"])
    p1 = deleg.post("/api/v1/propositions/", {"prospect": str(fiche.pk),
                    "nouvel_exercice": str(lieu.pk)}, format="json").json()  # fmt: skip
    courriel = {"prospect": str(fiche.pk), "changements": {"courriel": "x@exemple.invalid"}}
    p2 = deleg.post("/api/v1/propositions/", courriel, format="json").json()
    admin = client_de(monde["admin.sn"])
    admin.post(f"/api/v1/propositions/{p1['id']}/trancher/", {"decision": "accepter"},
               format="json")  # fmt: skip
    assert fiche.exercices.filter(etablissement=lieu, fin__isnull=True).exists()
    r = admin.post(f"/api/v1/propositions/{p2['id']}/trancher/",
                   {"decision": "refuser", "motif": "Courriel inconnu"}, format="json")  # fmt: skip
    assert r.json()["statut"] == "refusee" and r.json()["motif"] == "Courriel inconnu"
    fiche.refresh_from_db()
    assert fiche.courriel == ""
    # Une proposition vide ou sur un champ non proposable est refusée.
    vide = deleg.post("/api/v1/propositions/", {"prospect": str(fiche.pk)}, format="json")
    assert vide.json()["code"] == "proposition_vide"
    interdit = deleg.post("/api/v1/propositions/", {"prospect": str(fiche.pk),
                          "changements": {"potentiel": "C"}}, format="json")  # fmt: skip
    assert interdit.json()["code"] == "champ_non_proposable"
    # Un superviseur sans lien avec l'auteur ne tranche pas.
    sup = client_de(monde["sup.sn"])
    assert sup.get("/api/v1/propositions/").json() == []
    assert EvenementAudit.objects.filter(action="proposition.refus").count() == 1

"""Fiches prospects (PRP-002) et création par le délégué au statut `a_valider` (PRP-006)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.prospects import services
from apps.prospects.models import Prospect
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

URL = "/api/v1/prospects/"


def valeur(monde, liste, code, pays="sn"):
    return str(Valeur.objects.get(pays=monde[pays], liste=liste, code=code).pk)


def fiche(monde, **champs):
    return {
        "civilite": "dr",
        "nom": "Ndiaye",
        "prenom": "Aïssatou",
        "type": valeur(monde, "type_prospect", "medecin"),
        "specialite": valeur(monde, "specialite", "cardiologie"),
        "potentiel": "A",
        **champs,
    }


def noms(reponse):
    return [p["nom"] for p in reponse.json()["resultats"]]


def test_normalisation_des_noms_et_telephones(monde):
    assert services.normaliser_nom("Dr", "Aïssatou", "N'Diaye") == "aissatou ndiaye"
    assert services.normaliser_nom("Pr. Jean-Marc Dossou") == "jeanmarc dossou"
    sn = monde["sn"]
    assert services.normaliser_telephone("77 123 45 67", sn, "t") == "+221771234567"
    assert services.normaliser_telephone("+228 90 12 34 56", sn, "t") == "+22890123456"
    with pytest.raises(services.ErreurMetier):
        services.normaliser_telephone("12", sn, "t")


def test_un_prospect_sans_nom_ni_type_est_refuse(monde):
    """PRP-002 CA1."""
    admin = client_de(monde["admin.sn"])
    sans_nom = admin.post(URL, fiche(monde, nom=""), format="json")
    assert sans_nom.status_code == 400 and sans_nom.json()["details"]["champ"] == "nom"
    sans_type = admin.post(URL, fiche(monde, type=None, specialite=None), format="json")
    assert sans_type.status_code == 400 and sans_type.json()["details"]["champ"] == "type"
    # La spécialité suit le type : obligatoire pour un médecin, refusée si elle ne s'y applique pas.
    sans_specialite = admin.post(URL, fiche(monde, specialite=None), format="json")
    assert sans_specialite.json()["details"]["champ"] == "specialite"
    paramedical = valeur(monde, "type_prospect", "paramedical")
    incoherente = admin.post(URL, fiche(monde, type=paramedical), format="json")
    assert incoherente.json()["code"] == "specialite_incompatible"
    autre = valeur(monde, "type_prospect", "autre")
    ok = admin.post(URL, fiche(monde, type=autre, specialite=None), format="json")
    assert ok.status_code == 201, ok.content


def test_la_fiche_creee_par_l_administrateur_est_commune(monde):
    """PRP-002 : création et consultation ; la fiche affiche son potentiel (CA2)."""
    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde, telephone_mobile="77 123 45 67"), format="json").json()
    assert cree["statut"] == "actif" and cree["potentiel"] == "A"
    assert cree["telephone_mobile"] == "+221771234567"
    assert cree["type_libelle"] == "Médecin" and cree["specialite_libelle"] == "Cardiologie"
    deleg = client_de(monde["deleg.sn"])
    assert deleg.get(f"{URL}{cree['id']}/").json()["potentiel"] == "A"
    assert noms(deleg.get(URL)) == ["Ndiaye"]
    assert EvenementAudit.objects.filter(action="prospect.creation").count() == 1


def test_la_fiche_du_delegue_est_a_valider_et_visible_par_lui_seul(monde):
    """PRP-006 CA1 (RG-041) : invisible des autres délégués jusqu'à `actif`."""
    deleg = client_de(monde["deleg.sn"])
    cree = deleg.post(URL, fiche(monde, nom="Sarr"), format="json")
    assert cree.status_code == 201 and cree.json()["statut"] == "a_valider"
    identifiant = cree.json()["id"]
    # CA2 : utilisable aussitôt par son auteur (la planification arrive en 0.2) ; il la corrige.
    assert noms(deleg.get(URL)) == ["Sarr"]
    corrige = deleg.patch(f"{URL}{identifiant}/", {"potentiel": "B"}, format="json")
    assert corrige.status_code == 200 and corrige.json()["modifiable"] is True
    # Un autre délégué du pays ne la voit pas, ni en liste ni par son identifiant.
    from apps.identite.models import Role
    from apps.identite.services import attribuer_role, creer_utilisateur

    collegue = creer_utilisateur("fatou.sn", prenom="Fatou", nom="Sn", pays=monde["sn"])
    attribuer_role(collegue, Role.DELEGUE, monde["sn"], par=None)
    autre = client_de(collegue)
    assert noms(autre.get(URL)) == []
    assert autre.get(f"{URL}{identifiant}/").status_code == 404
    # L'administration du pays la voit et la valide : elle devient commune.
    admin = client_de(monde["admin.sn"])
    assert admin.get(f"{URL}synthese/").json()["a_valider"] == 1
    valide = admin.post(f"{URL}{identifiant}/valider/").json()
    assert valide["statut"] == "actif"
    assert noms(autre.get(URL)) == ["Sarr"]
    # Devenue commune, le délégué ne la modifie plus directement (propositions en 0.1.8).
    refus = deleg.patch(f"{URL}{identifiant}/", {"potentiel": "C"}, format="json")
    assert refus.status_code == 403 and refus.json()["code"] == "modification_interdite"


def test_seuls_l_administrateur_pays_et_le_delegue_creent(monde):
    for alias in ("sup.sn", "dm.sn", "df.sn", "resp.sn"):
        assert client_de(monde[alias]).post(URL, fiche(monde), format="json").status_code == 403
    siege = client_de(monde["ada.siege"], "SN").post(URL, fiche(monde), format="json")
    assert siege.status_code == 403  # RG-002 : le siège n'a pas de prospects


def test_recherche_tolerante_et_filtres(monde):
    admin = client_de(monde["admin.sn"])
    for nom, prenom, potentiel, telephone in [
        ("Ndiaye", "Aïssatou", "A", "77 111 22 33"),
        ("Diop", "Moussa", "B", ""),
        ("N'Diaye", "Cheikh", "C", ""),
    ]:
        admin.post(
            URL,
            fiche(monde, nom=nom, prenom=prenom, potentiel=potentiel, telephone_mobile=telephone),
            format="json",
        )
    assert sorted(noms(admin.get(f"{URL}?q=dr ndiaye"))) == ["N'Diaye", "Ndiaye"]
    assert noms(admin.get(f"{URL}?q=AISSATOU")) == ["Ndiaye"]
    assert noms(admin.get(f"{URL}?q=771112233")) == ["Ndiaye"]
    assert noms(admin.get(f"{URL}?potentiel=B")) == ["Diop"]
    synthese = admin.get(f"{URL}synthese/").json()
    assert synthese["potentiels"] == {"A": 1, "B": 1, "C": 1} and synthese["actifs"] == 3


def test_numero_d_ordre_unique_dans_le_pays(monde):
    admin = client_de(monde["admin.sn"])
    admin.post(URL, fiche(monde, numero_ordre="SN 1234"), format="json")
    doublon = admin.post(URL, fiche(monde, nom="Autre", numero_ordre="sn1234"), format="json")
    assert doublon.status_code == 400 and doublon.json()["code"] == "numero_ordre_deja_utilise"


def test_archivage_sans_suppression_et_audit_des_modifications(monde):
    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde), format="json").json()
    admin.patch(f"{URL}{cree['id']}/", {"potentiel": "C"}, format="json")
    e = EvenementAudit.objects.get(action="prospect.modification")
    assert e.details["potentiel"] == {"ancien": "A", "nouveau": "C"}
    archive = admin.post(f"{URL}{cree['id']}/archiver/", {"motif": "Parti à l'étranger"},
                         format="json").json()  # fmt: skip
    assert archive["statut"] == "archive"
    assert noms(admin.get(URL)) == [] and noms(admin.get(f"{URL}?statut=archive")) == ["Ndiaye"]
    assert Prospect.objects.filter(pk=cree["id"]).exists()
    deleg = client_de(monde["deleg.sn"])
    assert deleg.post(f"{URL}{cree['id']}/archiver/").status_code == 403


def test_le_type_utilise_par_une_fiche_compte_comme_utilise(monde):
    """PRP-001 CA2 : une valeur portée par une fiche ne se supprime pas, elle s'archive."""
    admin = client_de(monde["admin.sn"])
    admin.post(URL, fiche(monde), format="json")
    valeurs = {v["code"]: v for v in admin.get("/api/v1/referentiel/valeurs/?liste=specialite")
               .json()}  # fmt: skip
    assert valeurs["cardiologie"]["utilisations"] == 1


def test_isolation_et_consultation_du_siege_auditee(monde):
    admin = client_de(monde["admin.sn"])
    cree = admin.post(URL, fiche(monde), format="json").json()
    assert noms(client_de(monde["admin.tg"]).get(URL)) == []
    siege = client_de(monde["ada.siege"])
    assert siege.get(f"{URL}{cree['id']}/").status_code == 200
    e = EvenementAudit.objects.get(action="prospect.consultation")
    assert e.acteur == monde["ada.siege"] and e.objet_id == cree["id"]

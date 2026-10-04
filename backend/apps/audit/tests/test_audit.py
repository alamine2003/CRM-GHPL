"""AUD-001 : journal d'audit immuable, complet (CA1) et inaltérable (CA2)."""

import pytest
from django.db import DatabaseError, connection, transaction

from apps.audit.models import EvenementAudit
from apps.identite.tests.conftest import mot_de_passe_solide
from apps.perimetre.tests.conftest import client_de

pytestmark = pytest.mark.django_db

TELEPHONE = {"identifiant_installation": "aud-telephone-0001", "plateforme": "android"}


def dernier(action):
    return EvenementAudit.objects.filter(action=action).order_by("-le").first()


@pytest.fixture
def mot_de_passe(monde):
    secret = mot_de_passe_solide()
    deleg = monde["deleg.sn"]
    deleg.set_password(secret)
    deleg.save()
    return secret


def test_une_connexion_reussie_est_auditee_avec_son_contexte(api, monde, mot_de_passe):
    """CA1 : auteur, rôle, pays, action, objet, date, contexte (appareil, adresse), résultat."""
    reponse = api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "gabriel.sn", "mot_de_passe": mot_de_passe, "client": "mobile",
         "appareil": TELEPHONE},
        format="json", REMOTE_ADDR="196.207.10.20", HTTP_USER_AGENT="INNOV-mobile",
    )  # fmt: skip
    assert reponse.status_code == 200
    e = dernier("connexion")
    assert e.resultat == "succes" and e.acteur == monde["deleg.sn"]
    assert e.acteur_identifiant == "gabriel.sn" and e.pays == monde["sn"]
    assert e.objet_type == "identite.utilisateur" and e.le is not None
    assert e.contexte["adresse_ip"] == "196.207.10.20" and e.contexte["client"] == "mobile"
    assert e.contexte["appareil"] and e.contexte["reference"] == reponse["X-Request-Id"]


def test_un_echec_de_connexion_est_audite_malgre_l_erreur(api, monde, mot_de_passe):
    api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "gabriel.sn", "mot_de_passe": "faux-" + mot_de_passe, "client": "portail"},
        format="json",
    )
    e = dernier("connexion")
    assert e.resultat == "echec" and e.details["motif"] == "mot_de_passe"
    assert "mot_de_passe" not in str(e.details.keys()) or e.details == {"motif": "mot_de_passe"}
    api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "personne.inconnue", "mot_de_passe": "x", "client": "portail"},
        format="json",
    )
    inconnu = dernier("connexion")
    assert inconnu.acteur is None and inconnu.details["identifiant"] == "personne.inconnue"


def test_les_actions_d_administration_sont_auditees_avec_les_roles(monde):
    admin = client_de(monde["admin.sn"])
    compte = monde["papa.sn"] if "papa.sn" in monde else monde["sansrole.sn"]
    admin.post(f"/api/v1/utilisateurs/{compte.pk}/roles/", {"role": "delegue"}, format="json")
    e = dernier("role.attribution")
    assert e.acteur == monde["admin.sn"] and e.roles == ["admin_pays"]
    assert e.objet_id == str(compte.pk) and e.details["role"] == "delegue"
    admin.put("/api/v1/pays/SN/parametres/distance_pointage_m/", {"valeur": 300}, format="json")
    p = dernier("parametre.modification")
    assert p.details == {"cle": "distance_pointage_m", "ancienne": 200, "nouvelle": 300}
    admin.post("/api/v1/organisation/zones/", {"libelle": "Nord"}, format="json")
    assert dernier("organisation.zone.creation").pays == monde["sn"]


def test_le_changement_de_statut_d_un_pays_est_audite(monde):
    """ORG-001 CA4."""
    client_de(monde["ada.siege"], "SN").post(
        "/api/v1/pays/SN/statut/", {"statut": "suspendu"}, format="json"
    )
    e = dernier("pays.statut")
    assert e.details == {"ancien": "actif", "nouveau": "suspendu"}
    assert e.acteur == monde["ada.siege"]


def test_aucun_secret_dans_les_details():
    from apps.audit.services import enregistrer

    e = enregistrer("essai", details={"mot_de_passe": "x", "jeton": "y", "motif": "z"})
    assert e.details == {"motif": "z"}


def _executer(sql):
    with transaction.atomic(), connection.cursor() as curseur:
        curseur.execute(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE audit_evenementaudit SET action = 'falsifie'",
        "DELETE FROM audit_evenementaudit",
        "TRUNCATE audit_evenementaudit",
    ],
)
def test_aucun_role_ne_peut_modifier_ni_supprimer_un_evenement(sql):
    """CA2 : même le propriétaire de la table (ici, le rôle des tests) est refusé."""
    from apps.audit.services import enregistrer

    enregistrer("essai")
    with pytest.raises(DatabaseError, match="immuable"):
        _executer(sql)
    assert EvenementAudit.objects.filter(action="essai").count() == 1


def test_l_orm_refuse_aussi():
    from apps.audit.services import enregistrer

    e = enregistrer("essai")
    with pytest.raises(TypeError):
        e.save()
    with pytest.raises(TypeError):
        e.delete()

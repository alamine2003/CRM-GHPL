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
    """AUD-001 CA1 ; ORG-011 CA2 (ancienne et nouvelle valeur d'un paramètre)."""
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


def test_les_affectations_et_transferts_sont_audites(monde):
    """ORG-009 CA3 (octroi et retrait) et ORG-010 (transfert)."""
    siege = client_de(monde["ada.siege"])
    df = monde["df.sn"]
    affectation = siege.post(
        f"/api/v1/utilisateurs/{df.pk}/affectations/",
        {"pays": "TG", "role": "df", "motif": "Intérim du DF Togo"}, format="json",
    ).json()  # fmt: skip
    octroi = dernier("affectation.octroi")
    assert octroi.acteur == monde["ada.siege"] and octroi.objet_id == str(df.pk)
    assert octroi.pays == monde["tg"] and octroi.resultat == "succes"
    siege.post(f"/api/v1/affectations/{affectation['id']}/terminer/", {}, format="json")
    fin = dernier("affectation.fin")
    assert fin.acteur == monde["ada.siege"] and fin.objet_id == str(df.pk) and fin.details["fin"]
    deleg = monde["deleg.sn"]
    siege.post(
        f"/api/v1/utilisateurs/{deleg.pk}/transferts/",
        {"pays": "TG", "motif": "Mutation à Lomé", "role": "delegue"}, format="json",
    )  # fmt: skip
    transfert = dernier("transfert")
    assert transfert.objet_id == str(deleg.pk) and transfert.pays == monde["tg"]


def test_la_reinitialisation_par_l_administrateur_est_auditee(api, monde, mailoutbox):
    """USR-005 CA2 : lien envoyé par l'administrateur, puis mot de passe réinitialisé."""
    import re

    deleg = monde["deleg.sn"]
    deleg.email = "gabriel@demo.invalid"
    deleg.save()
    client_de(monde["admin.sn"]).post(f"/api/v1/utilisateurs/{deleg.pk}/reinitialiser/")
    lien = dernier("mot_de_passe.lien_envoye")
    assert lien.acteur == monde["admin.sn"] and lien.objet_id == str(deleg.pk)
    assert lien.details.get("par_administrateur") is True
    jeton = re.search(r"jeton=([\w-]+)", mailoutbox[-1].body).group(1)
    reponse = api.post(
        "/api/v1/auth/mot-de-passe/reinitialisation/",
        {"jeton": jeton, "mot_de_passe": mot_de_passe_solide()}, format="json",
    )  # fmt: skip
    assert reponse.status_code == 204, reponse.content
    e = dernier("mot_de_passe.reinitialisation")
    assert e.objet_id == str(deleg.pk) and e.resultat == "succes"
    assert jeton not in str(e.details) and jeton not in str(lien.details)


def test_comptes_appareils_sessions_et_verrouillage_sont_audites(api, monde, mot_de_passe):
    """AUD-001 CA1 : les autres événements de sécurité du cycle 0.0."""
    from apps.identite.models import Appareil

    admin = client_de(monde["admin.sn"])
    cree = admin.post(
        "/api/v1/utilisateurs/",
        {"identifiant": "nouveau.compte", "prenom": "N", "nom": "C"}, format="json",
    ).json()  # fmt: skip
    assert dernier("compte.creation").objet_id == cree["id"]
    deleg = monde["deleg.sn"]
    admin.post(f"/api/v1/utilisateurs/{deleg.pk}/suspendre/")
    assert dernier("compte.suspension").objet_id == str(deleg.pk)
    admin.post(f"/api/v1/utilisateurs/{deleg.pk}/reactiver/")
    assert dernier("compte.reactivation").acteur == monde["admin.sn"]
    appareil = Appareil.objects.create(
        utilisateur=deleg, identifiant_installation="aud-telephone-0002", plateforme="android"
    )
    admin.post(f"/api/v1/appareils/{appareil.pk}/revoquer/")
    assert dernier("appareil.revocation").objet_id == str(deleg.pk)
    connexion = api.post(
        "/api/v1/auth/connexion/",
        {"identifiant": "gabriel.sn", "mot_de_passe": mot_de_passe, "client": "portail"},
        format="json",
    )  # fmt: skip
    assert connexion.status_code == 200
    admin.post(f"/api/v1/utilisateurs/{deleg.pk}/fermer_sessions/")
    assert dernier("session.revocation").details["motif"]
    for _ in range(5):
        api.post(
            "/api/v1/auth/connexion/",
            {"identifiant": "gabriel.sn", "mot_de_passe": "faux-" + mot_de_passe,
             "client": "portail"}, format="json",
        )  # fmt: skip
    verrou = dernier("connexion.verrouillage")
    assert verrou.resultat == "echec" and verrou.acteur == deleg


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

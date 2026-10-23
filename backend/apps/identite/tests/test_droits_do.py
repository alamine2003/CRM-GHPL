"""Réglage des droits du DO par le siège seul (1.6.1, prd.md §14.85)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.identite.droits_do import actions_fermees, droits_de
from apps.perimetre.perimetre import calculer_perimetre
from apps.perimetre.tests.conftest import client_de, monde  # noqa: F401

pytestmark = pytest.mark.django_db

TOUS = {"ventes": True, "pilotage": True, "rapports": True, "prospects": True}


def _regler(utilisateur, compte, corps, pays=None):
    return client_de(utilisateur, pays).patch(
        f"/api/v1/droits-do/{compte.pk}/", corps, format="json"
    )


def actions_ouvertes(df) -> set[str]:
    return set(client_de(df, "SN").get("/api/v1/auth/perimetre/").json()["actions"])


def test_par_defaut_tout_est_ouvert(monde):  # noqa: F811
    df = monde["df.sn"]
    assert droits_de(df) == TOUS
    assert actions_fermees(df) == frozenset()
    reponse = client_de(monde["ada.siege"]).get(f"/api/v1/droits-do/{df.pk}/")
    assert reponse.status_code == 200
    assert reponse.json()["droits"] == TOUS
    assert reponse.json()["pays"]["code"] == "SN"


def test_le_siege_ferme_un_droit_et_le_serveur_l_applique(monde):  # noqa: F811
    df, siege = monde["df.sn"], monde["ada.siege"]
    avant = client_de(df, "SN").get("/api/v1/ventes/synthese/", {"annee": 2025})
    assert avant.status_code == 200
    reponse = _regler(siege, df, {"ventes": False})
    assert reponse.status_code == 200
    assert reponse.json()["droits"] == {**TOUS, "ventes": False}
    # Le DO ne voit plus les ventes : la route, et l'action dans son périmètre.
    apres = client_de(df, "SN").get("/api/v1/ventes/synthese/", {"annee": 2025})
    assert apres.status_code == 403
    perimetre = client_de(df, "SN").get("/api/v1/auth/perimetre/").json()
    assert "ventes.lire" not in perimetre["actions"]
    # Ce qui n'a pas été fermé reste ouvert.
    assert "pilotage.lire" in perimetre["actions"]
    assert client_de(df, "SN").get("/api/v1/pilotage/equipe/").status_code == 200
    # Rouvrir rend l'accès.
    _regler(siege, df, {"ventes": True})
    assert client_de(df, "SN").get("/api/v1/ventes/synthese/", {"annee": 2025}).status_code == 200


def test_chaque_groupe_ferme_ses_actions(monde):  # noqa: F811
    df, siege = monde["df.sn"], monde["ada.siege"]
    _regler(siege, df, {"pilotage": False, "rapports": False, "prospects": False})
    actions = set(client_de(df, "SN").get("/api/v1/auth/perimetre/").json()["actions"])
    for fermee in ("pilotage.lire", "pilotage.exporter", "objectifs.lire", "rapports.lire",
                   "prospects.lire", "cibles.lire"):  # fmt: skip
        assert fermee not in actions
    # Le socle du rôle reste : pays, organisation, notifications, ventes.
    assert {"pays.lire", "organisation.lire", "notifications.lire", "ventes.lire"} <= actions


def test_le_groupe_ventes_ferme_aussi_l_export_et_les_objectifs(monde):  # noqa: F811
    df, siege = monde["df.sn"], monde["ada.siege"]
    assert "ventes.objectifs_lire" in actions_ouvertes(df)
    _regler(siege, df, {"ventes": False})
    ouvertes = actions_ouvertes(df)
    assert not {"ventes.lire", "ventes.exporter", "ventes.objectifs_lire"} & ouvertes
    reponse = client_de(df, "SN").get("/api/v1/ventes/objectifs/", {"annee": 2025})
    assert reponse.status_code == 403


def test_le_reglage_ne_touche_pas_les_autres_roles(monde):  # noqa: F811
    siege = monde["ada.siege"]
    _regler(siege, monde["df.sn"], {"ventes": False})
    # Le DM, le superviseur, le responsable pays voient toujours les ventes.
    for alias in ("dm.sn", "sup.sn", "resp.sn"):
        reponse = client_de(monde[alias], "SN").get("/api/v1/ventes/synthese/", {"annee": 2025})
        assert reponse.status_code == 200, alias
    # Le DF d'un autre pays garde les siens.
    assert (
        client_de(monde["df.tg"], "TG").get("/api/v1/ventes/synthese/", {"annee": 2025}).status_code
        == 200
    )


def test_le_siege_seul_regle(monde):  # noqa: F811
    df = monde["df.sn"]
    for alias, pays in (("dina.direction", None), ("admin.sn", "SN"), ("resp.sn", "SN"),
                        ("dm.sn", "SN"), ("sup.sn", "SN"), ("deleg.sn", "SN"), ("df.sn", "SN"),
                        ("theo.technique", None)):  # fmt: skip
        reponse = _regler(monde[alias], df, {"ventes": False}, pays)
        assert reponse.status_code == 403, alias
        liste = client_de(monde[alias], pays).get("/api/v1/droits-do/")
        assert liste.status_code == 403, alias
    assert droits_de(df) == TOUS


def test_l_administrateur_du_siege_dans_un_pays_regle_toujours(monde):  # noqa: F811
    # Il « entre » dans le Sénégal avec les droits de l'administrateur pays, et garde les siens.
    assert _regler(monde["ada.siege"], monde["df.sn"], {"rapports": False}, "SN").status_code == 200
    # Mais un DF d'un autre pays que celui choisi reste hors de portée (404, jamais 403).
    assert _regler(monde["ada.siege"], monde["df.tg"], {"rapports": False}, "SN").status_code == 404


def test_la_liste_des_comptes_df(monde):  # noqa: F811
    siege = monde["ada.siege"]
    _regler(siege, monde["df.tg"], {"ventes": False})
    tous = client_de(siege).get("/api/v1/droits-do/").json()
    assert {c["identifiant"] for c in tous} == {"omar.sn", "omar.tg"}
    togo = next(c for c in tous if c["identifiant"] == "omar.tg")
    assert togo["droits"]["ventes"] is False
    du_senegal = client_de(siege, "SN").get("/api/v1/droits-do/").json()
    assert [c["identifiant"] for c in du_senegal] == ["omar.sn"]


def test_un_compte_sans_role_df_ou_un_droit_inconnu_est_refuse(monde):  # noqa: F811
    siege = monde["ada.siege"]
    assert _regler(siege, monde["dm.sn"], {"ventes": False}).status_code == 404
    assert client_de(siege).get(f"/api/v1/droits-do/{monde['dm.sn'].pk}/").status_code == 404
    inconnu = _regler(siege, monde["df.sn"], {"magie": False})
    # Un droit inconnu n'est pas pris en compte : sans droit connu, rien à régler.
    assert inconnu.status_code == 400
    vide = _regler(siege, monde["df.sn"], {})
    assert vide.status_code == 400
    assert vide.json()["code"] == "droits_requis"


def test_le_reglage_est_audite(monde):  # noqa: F811
    siege, df = monde["ada.siege"], monde["df.sn"]
    _regler(siege, df, {"ventes": False})
    evenement = EvenementAudit.objects.filter(action="droits_do.modification").get()
    assert evenement.details["avant"]["ventes"] is True
    assert evenement.details["apres"]["ventes"] is False
    assert evenement.acteur_identifiant == siege.username
    # Un réglage qui ne change rien n'ajoute pas d'événement.
    _regler(siege, df, {"ventes": False})
    assert EvenementAudit.objects.filter(action="droits_do.modification").count() == 1


def test_un_compte_qui_perd_le_role_df_n_est_plus_restreint(monde):  # noqa: F811
    from apps.identite.models import RoleUtilisateur

    df = monde["df.sn"]
    _regler(monde["ada.siege"], df, {"ventes": False})
    assert "ventes.lire" not in calculer_perimetre(df, "SN").actions()
    RoleUtilisateur.objects.filter(utilisateur=df, role="df").update(fin=df.date_joined)
    assert calculer_perimetre(df).restreintes == frozenset()

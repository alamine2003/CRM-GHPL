# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.7.2 : DSH-002 et DSH-012, le tableau hebdomadaire de l'équipe du superviseur.

DSH-002 CA1 : un délégué d'un poste qui n'est pas rattaché au superviseur n'apparaît jamais.
DSH-012 CA1 : chaque taux est borné à 100 % ; CA2 : sans visite, « Aucune activité ». DC-49 :
aucun classement, les délégués par ordre alphabétique, le total tiré des sommes."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.perimetre.tests.conftest import DEBUT_ROLES, client_de

from .test_mes_chiffres import semaine  # noqa: F401

pytestmark = pytest.mark.django_db

URL = "/api/v1/pilotage/equipe/"


def delegue(monde, terrain, identifiant, poste_libelle, rattache=True):
    prenom, nom = identifiant.split(".")
    u = creer_utilisateur(identifiant, prenom=prenom.title(), nom=nom.title(), pays=monde["sn"])
    attribuer_role(u, Role.DELEGUE, monde["sn"], par=None, debut=DEBUT_ROLES)
    poste = org.creer_poste(monde["sn"], "vm", poste_libelle, [terrain["cardio"]],
                            [terrain["secteur"]])  # fmt: skip
    org.occuper(poste, u, date(2026, 1, 1))
    if rattache:
        org.rattacher(poste, monde["sup.sn"], date(2026, 1, 1))
    return u


def lire(monde, qui="sup.sn", **params):
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde[qui]).get(URL, params)
    assert r.status_code == 200, r.content
    return r.json()


def test_dsh012_les_delegues_cote_a_cote_et_le_total(monde, terrain, semaine):
    delegue(monde, terrain, "aminata.ba", "VM Médina")  # rattachée, sans visite
    d = lire(monde)
    assert (d["debut"], d["fin"], d["cycle"]["debut"]) == ("2026-10-12", "2026-10-18",
                                                           "2026-09-21")  # fmt: skip
    # DC-49 : par ordre alphabétique, sans rang ni note.
    noms = [x["delegue"]["nom"] for x in d["delegues"]]
    assert noms == sorted(noms) and len(noms) == 2
    ba = next(x for x in d["delegues"] if x["delegue"]["nom"] == "Ba")
    assert ba["poste"]["libelle"] == "VM Médina"
    # CA2 : sans visite, « Aucune activité » et des taux vides.
    assert ba["semaine"]["activite"] is False
    assert set(ba["semaine"]["taux"].values()) == {None}
    gabriel = next(x for x in d["delegues"] if x["delegue"]["id"] == str(monde["deleg.sn"].pk))
    assert gabriel["semaine"]["taux"]["realisation"] == 0.333
    assert "rang" not in gabriel and "score" not in gabriel
    # Le total vient des sommes : 1 visite faite sur 3 échues, pas une moyenne de taux.
    total = d["total"]["semaine"]
    assert (total["visites"]["echues"], total["visites"]["effectuees_prevues"]) == (3, 1)
    assert total["taux"]["realisation"] == 0.333
    # CA1 : chaque taux borné à 100 %.
    for ligne in [*d["delegues"], d["total"]]:
        for periode in ("semaine", "cycle"):
            assert all(t is None or 0 <= t <= 1 for t in ligne[periode]["taux"].values())


def test_dsh002_ca1_un_delegue_non_rattache_n_apparait_jamais(monde, terrain, semaine):
    autre = delegue(monde, terrain, "moussa.fall", "VM Rufisque", rattache=False)
    d = lire(monde)
    assert str(autre.pk) not in [x["delegue"]["id"] for x in d["delegues"]]
    # Un rattachement terminé avant la semaine ne compte plus.
    from apps.organisation.models import Rattachement

    Rattachement.objects.filter(poste=terrain["poste"]).update(fin=date(2026, 10, 1))
    assert lire(monde)["delegues"] == []
    assert lire(monde)["total"]["semaine"]["activite"] is False


def test_pilotage_reserve_au_superviseur(monde, semaine):
    with freeze_time("2026-10-15 12:00"):
        assert client_de(monde["deleg.sn"]).get(URL).status_code == 403
        # Un superviseur d'un autre pays ne voit pas l'équipe du Sénégal.
        r = client_de(monde["sup.tg"]).get(URL)
    assert r.status_code == 200 and r.json()["delegues"] == []


def test_une_semaine_passee(monde, semaine):
    d = lire(monde, semaine="2026-10-07")
    (ligne,) = d["delegues"]
    assert (d["debut"], ligne["semaine"]["activite"]) == ("2026-10-05", False)


# --- 0.7.3 : DSH-003, vues DM, DF et pays, regroupements ------------------------------------


def test_dsh003_le_dm_et_le_df_voient_leurs_reseaux(monde, terrain, semaine):
    hors = delegue(monde, terrain, "moussa.fall", "VM Rufisque", rattache=False)
    # Un poste d'un autre réseau, que ni le DM ni le DF n'ont dans leur périmètre.
    gastro = org.creer_reseau(monde["sn"], terrain["division"], "GAS1", "Gastro")
    from apps.organisation.models import Poste

    Poste.objects.get(libelle="VM Rufisque").reseaux.set([gastro])
    for qui in ("dm.sn", "df.sn"):
        org.ajouter_reseau_au_perimetre(monde[qui], terrain["cardio"], date(2026, 1, 1))
        ids = [x["delegue"]["id"] for x in lire(monde, qui)["delegues"]]
        assert ids == [str(monde["deleg.sn"].pk)], qui
        assert str(hors.pk) not in ids
    # Le responsable pays voit tout le pays.
    ids = {x["delegue"]["id"] for x in lire(monde, "resp.sn")["delegues"]}
    assert ids == {str(monde["deleg.sn"].pk), str(hors.pk)}


def test_dsh003_ca1_le_total_d_un_reseau_est_la_somme_de_ses_delegues(monde, terrain, semaine):
    delegue(monde, terrain, "aminata.ba", "VM Médina")
    d = lire(monde, "resp.sn", par="reseau")
    assert d["par"] == "reseau"
    lignes = {x["delegue"]["id"]: x for x in d["delegues"]}
    (cardio,) = d["groupes"]
    assert cardio["libelle"] == "Cardio" and len(cardio["delegues"]) == 2
    for periode in ("semaine", "cycle"):
        for bloc in ("visites", "rapports", "couverture"):
            for cle, valeur in cardio["total"][periode][bloc].items():
                attendu = sum(lignes[i][periode][bloc][cle] for i in cardio["delegues"])
                assert valeur == attendu, (periode, bloc, cle)
    # Par zone et par secteur : la zone de Dakar, le secteur du Plateau.
    assert [g["libelle"] for g in lire(monde, "resp.sn", par="zone")["groupes"]] == ["Dakar"]
    assert [g["libelle"] for g in lire(monde, "resp.sn", par="secteur")["groupes"]] == [
        "Plateau"]  # fmt: skip


def test_dsh003_un_poste_de_deux_reseaux_compte_dans_chacun_une_fois_au_total(
    monde, terrain, semaine
):
    second = org.creer_reseau(monde["sn"], terrain["division"], "CAR2", "Cardio bis")
    terrain["poste"].reseaux.add(second)
    d = lire(monde, "resp.sn", par="reseau")
    assert [g["libelle"] for g in d["groupes"]] == ["Cardio", "Cardio bis"]
    effectuees = [g["total"]["semaine"]["visites"]["effectuees"] for g in d["groupes"]]
    assert effectuees == [1, 1]
    assert d["total"]["semaine"]["visites"]["effectuees"] == 1


def test_un_regroupement_inconnu_est_refuse(monde, semaine):
    with freeze_time("2026-10-15 12:00"):
        r = client_de(monde["resp.sn"]).get(URL, {"par": "classement"})
    assert r.status_code == 400

"""Organisation d'un pays : ORG-003 à ORG-008 (critères d'acceptation du PRD §15.1)."""

from datetime import timedelta

import pytest

from apps.organisation import services
from apps.organisation.models import Occupation, Rattachement
from apps.perimetre.tests.conftest import client_de
from apps.socle.services import aujourdhui

pytestmark = pytest.mark.django_db

API = "/api/v1/organisation"


@pytest.fixture
def org(monde):
    """Organisation fictive du Sénégal : 2 réseaux, 2 zones, 3 secteurs, 3 postes vacants."""
    sn = monde["sn"]
    div = services.creer_division(sn, "CARDIO", "Cardiologie")
    r1 = services.creer_reseau(sn, div, "R1", "Réseau un")
    r2 = services.creer_reseau(sn, div, "R2", "Réseau deux")
    nord = services.creer_zone(sn, "Nord")
    sud = services.creer_zone(sn, "Sud")
    s1 = services.creer_secteur(sn, nord, "Saint-Louis")
    s2 = services.creer_secteur(sn, nord, "Louga")
    s3 = services.creer_secteur(sn, sud, "Ziguinchor")
    p1 = services.creer_poste(sn, "vm", "VM Saint-Louis R1", [r1], [s1, s2])
    p2 = services.creer_poste(sn, "vm", "VM Ziguinchor R2", [r2], [s3])
    p3 = services.creer_poste(sn, "kam", "KAM Nord R2", [r2], [s1])
    return {"r1": r1, "r2": r2, "nord": nord, "sud": sud, "s1": s1, "s2": s2, "s3": s3,
            "p1": p1, "p2": p2, "p3": p3, **monde}  # fmt: skip


def admin(monde):
    return client_de(monde["admin.sn"])


# --- ORG-003 : zones et secteurs ---------------------------------------------------------------


def test_l_administrateur_pays_cree_renomme_et_archive_zones_et_secteurs(monde):
    c = admin(monde)
    zone = c.post(f"{API}/zones/", {"libelle": "Centre"}, format="json")
    assert zone.status_code == 201, zone.content
    secteur = c.post(
        f"{API}/secteurs/", {"libelle": "Kaolack", "zone": zone.json()["id"]}, format="json"
    )
    assert secteur.status_code == 201
    assert secteur.json()["zone_libelle"] == "Centre"
    renomme = c.patch(f"{API}/secteurs/{secteur.json()['id']}/", {"libelle": "Kaffrine"})
    assert renomme.json()["libelle"] == "Kaffrine"
    # Une zone qui a encore des secteurs actifs ne s'archive pas.
    refus = c.post(f"{API}/zones/{zone.json()['id']}/archiver/")
    assert refus.status_code == 400 and refus.json()["code"] == "elements_actifs"
    assert c.post(f"{API}/secteurs/{secteur.json()['id']}/archiver/").json()["archive"] is True


def test_un_secteur_appartient_a_une_seule_zone_du_meme_pays(monde):
    """ORG-003 CA1 : la zone est unique et du pays actif."""
    zone_togo = services.creer_zone(monde["tg"], "Plateaux")
    reponse = admin(monde).post(
        f"{API}/secteurs/", {"libelle": "Atakpamé", "zone": str(zone_togo.pk)}, format="json"
    )
    assert reponse.status_code == 400 and reponse.json()["code"] == "zone_invalide"


def test_un_secteur_archive_reste_visible_mais_n_est_plus_propose(org):
    """ORG-003 CA2."""
    c = admin(org)
    c.post(f"{API}/secteurs/{org['s2'].pk}/archiver/")
    tous = {s["libelle"]: s["archive"] for s in c.get(f"{API}/secteurs/").json()}
    assert tous["Louga"] is True
    actifs = [s["libelle"] for s in c.get(f"{API}/secteurs/?actifs=1").json()]
    assert "Louga" not in actifs
    refus = c.post(
        f"{API}/postes/",
        {"libelle": "VM Louga", "type_poste": "vm", "secteurs": [str(org["s2"].pk)]},
        format="json",
    )
    assert refus.status_code == 400 and refus.json()["code"] == "secteur_invalide"


def test_libelle_unique_dans_le_pays(monde):
    c = admin(monde)
    assert c.post(f"{API}/zones/", {"libelle": "Est"}).status_code == 201
    doublon = c.post(f"{API}/zones/", {"libelle": "Est"})
    assert doublon.status_code == 400 and doublon.json()["code"] == "libelle_deja_utilise"
    # Le même libellé dans un autre pays est permis.
    assert client_de(monde["admin.tg"]).post(f"{API}/zones/", {"libelle": "Est"}).status_code == 201


# --- ORG-005 : postes ----------------------------------------------------------------------------


def test_un_poste_sans_occupant_est_vacant_et_peut_couvrir_plusieurs_secteurs(org):
    """ORG-005 CA1 et CA2."""
    poste = admin(org).get(f"{API}/postes/{org['p1'].pk}/").json()
    assert poste["vacant"] is True and poste["occupant"] is None
    assert {s["libelle"] for s in poste["secteurs"]} == {"Saint-Louis", "Louga"}
    assert [r["libelle"] for r in poste["reseaux"]] == ["Réseau un"]


def test_creation_et_modification_d_un_poste_par_l_api(org):
    c = admin(org)
    cree = c.post(
        f"{API}/postes/",
        {"libelle": "Dermo Dakar", "type_poste": "dermo", "reseaux": [str(org["r1"].pk)],
         "secteurs": [str(org["s3"].pk)]},
        format="json",
    )  # fmt: skip
    assert cree.status_code == 201, cree.content
    assert cree.json()["type_libelle"] == "Dermo-conseillère"
    modifie = c.patch(
        f"{API}/postes/{cree.json()['id']}/",
        {"reseaux": [str(org["r1"].pk), str(org["r2"].pk)]},
        format="json",
    )
    assert len(modifie.json()["reseaux"]) == 2


def test_un_poste_occupe_ne_s_archive_pas(org):
    services.occuper(org["p1"], org["deleg.sn"])
    refus = admin(org).post(f"{API}/postes/{org['p1'].pk}/archiver/")
    assert refus.status_code == 400 and refus.json()["code"] == "poste_occupe"


# --- ORG-006 : occupations datées ------------------------------------------------------------


def test_occupation_datee_avec_fin_facultative(org):
    """ORG-006 CA1."""
    c = admin(org)
    reponse = c.post(
        f"{API}/postes/{org['p1'].pk}/occupations/",
        {"utilisateur": str(org["deleg.sn"].pk)},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    occupation = reponse.json()
    assert occupation["fin"] is None and occupation["actif"] is True
    assert occupation["principal"] is True
    poste = c.get(f"{API}/postes/{org['p1'].pk}/").json()
    assert poste["vacant"] is False and poste["occupant"]["identifiant"] == "gabriel.sn"
    fin = c.post(f"{API}/occupations/{occupation['id']}/terminer/", {}, format="json")
    assert fin.json()["actif"] is False
    assert c.get(f"{API}/postes/{org['p1'].pk}/").json()["vacant"] is True


def test_un_poste_n_a_qu_un_occupant_a_la_fois(org):
    services.occuper(org["p1"], org["deleg.sn"])
    with pytest.raises(Exception) as erreur:
        services.occuper(org["p1"], org["sup.sn"])
    assert erreur.value.code == "poste_deja_occupe"


def test_seul_un_delegue_ou_un_superviseur_du_pays_occupe_un_poste(org):
    for personne in ("df.sn", "sansrole.sn"):
        reponse = admin(org).post(
            f"{API}/postes/{org['p1'].pk}/occupations/",
            {"utilisateur": str(org[personne].pk)},
            format="json",
        )
        assert reponse.status_code == 400 and reponse.json()["code"] == "occupant_invalide"
    # Un délégué d'un autre pays n'est pas visible depuis le Sénégal.
    reponse = admin(org).post(
        f"{API}/postes/{org['p1'].pk}/occupations/",
        {"utilisateur": str(org["deleg.tg"].pk)},
        format="json",
    )
    assert reponse.json()["code"] == "personne_inconnue"


def test_une_personne_sur_deux_reseaux_a_deux_occupations_actives(org):
    """ORG-006 CA2 : deux postes, deux réseaux ; la première occupation est principale."""
    services.occuper(org["p1"], org["deleg.sn"])
    services.occuper(org["p3"], org["deleg.sn"])
    moi = client_de(org["deleg.sn"]).get(f"{API}/moi/").json()
    assert [p["occupation"]["principal"] for p in moi["postes"]] == [True, False]
    reseaux = {r["libelle"] for p in moi["postes"] for r in p["reseaux"]}
    assert reseaux == {"Réseau un", "Réseau deux"}


# --- ORG-007 : rattachements -------------------------------------------------------------------


def test_un_delegue_sans_superviseur_est_signale(org):
    """ORG-007 CA1 : le planning (0.2) s'appuiera sur ce signal ; le portail l'affiche."""
    services.occuper(org["p1"], org["deleg.sn"])
    c = client_de(org["deleg.sn"])
    assert c.get(f"{API}/moi/").json()["superviseur_manquant"] is True
    admin(org).post(
        f"{API}/postes/{org['p1'].pk}/rattachements/",
        {"superviseur": str(org["sup.sn"].pk)},
        format="json",
    )
    moi = c.get(f"{API}/moi/").json()
    assert moi["superviseur_manquant"] is False
    assert moi["postes"][0]["superviseur"]["identifiant"] == "nicolas.sn"


def test_le_changement_de_superviseur_prend_effet_a_la_date_indiquee(org):
    """ORG-007 CA2 : le passé ne change pas, l'ancien rattachement se termine ce jour-là."""
    sn = org["sn"]
    jour = aujourdhui(sn)
    services.rattacher(org["p1"], org["sup.sn"], jour)
    demain = jour + timedelta(days=1)
    services.rattacher(org["p1"], org["dm.sn"], demain)
    ancien, nouveau = (
        Rattachement.objects.filter(poste=org["p1"]).order_by("debut").select_related("superviseur")
    )
    assert ancien.fin == demain and ancien.superviseur == org["sup.sn"]
    assert nouveau.debut == demain and nouveau.fin is None
    assert services.superviseur_du_poste(org["p1"], jour) == org["sup.sn"]
    assert services.superviseur_du_poste(org["p1"], demain) == org["dm.sn"]


def test_seul_un_superviseur_ou_un_dm_est_rattachable(org):
    with pytest.raises(Exception) as erreur:
        services.rattacher(org["p1"], org["deleg.sn"])
    assert erreur.value.code == "superviseur_invalide"


# --- ORG-008 et périmètres : qui voit quels postes ----------------------------------------------


def libelles_postes(client):
    return sorted(p["libelle"] for p in client.get(f"{API}/postes/").json())


def test_un_dm_ne_voit_que_les_postes_de_ses_reseaux(org):
    """ORG-008 CA1 et CA2."""
    c = admin(org)
    ajout = c.post(
        f"{API}/personnes/{org['dm.sn'].pk}/reseaux/", {"reseau": str(org["r1"].pk)}, format="json"
    )
    assert ajout.status_code == 201, ajout.content
    dm = client_de(org["dm.sn"])
    assert libelles_postes(dm) == ["VM Saint-Louis R1"]
    assert dm.get(f"{API}/postes/{org['p2'].pk}/").status_code == 404
    # Retirer le réseau retire l'accès à la date de fin (aujourd'hui).
    c.post(f"{API}/perimetres-reseaux/{ajout.json()['id']}/terminer/", {}, format="json")
    assert libelles_postes(dm) == []


def test_seul_un_df_ou_un_dm_a_un_perimetre_de_reseaux(org):
    reponse = admin(org).post(
        f"{API}/personnes/{org['sup.sn'].pk}/reseaux/",
        {"reseau": str(org["r1"].pk)},
        format="json",
    )
    assert reponse.json()["code"] == "role_df_dm_requis"


def test_un_superviseur_ne_voit_que_les_postes_rattaches(org):
    services.rattacher(org["p2"], org["sup.sn"])
    assert libelles_postes(client_de(org["sup.sn"])) == ["VM Ziguinchor R2"]


def test_le_pays_voit_toute_son_organisation_et_rien_d_un_autre_pays(org):
    assert len(libelles_postes(client_de(org["resp.sn"]))) == 3
    tg = client_de(org["admin.tg"])
    assert libelles_postes(tg) == []
    assert tg.get(f"{API}/postes/{org['p1'].pk}/").status_code == 404
    assert tg.post(f"{API}/postes/{org['p1'].pk}/archiver/").status_code == 404


def test_le_delegue_ne_liste_pas_l_organisation(org):
    reponse = client_de(org["deleg.sn"]).get(f"{API}/postes/")
    assert reponse.status_code == 403 and reponse.json()["code"] == "interdit"


def test_le_siege_ecrit_seulement_avec_un_pays_choisi(org):
    consolide = client_de(org["ada.siege"])
    assert consolide.post(f"{API}/zones/", {"libelle": "Ouest"}).json()["code"] == "pays_requis"
    assert len(libelles_postes(consolide)) == 3
    assert (
        client_de(org["ada.siege"], "SN").post(f"{API}/zones/", {"libelle": "Ouest"}).status_code
        == 201
    )


def test_la_synthese_compte_postes_vacants_et_sans_superviseur(org):
    services.occuper(org["p1"], org["deleg.sn"])
    services.rattacher(org["p1"], org["sup.sn"])
    services.rattacher(org["p2"], org["sup.sn"])
    synthese = admin(org).get(f"{API}/synthese/").json()
    assert synthese == {
        "divisions": 1, "reseaux": 2, "zones": 2, "secteurs": 3, "postes": 3,
        "postes_vacants": 2, "postes_sans_superviseur": 1,
    }  # fmt: skip


def test_chaque_ecriture_alimente_le_journal_des_changements(org):
    from apps.socle.models import JournalChangement

    occupation = services.occuper(org["p1"], org["deleg.sn"])
    assert JournalChangement.objects.filter(entite_id=occupation.pk).count() == 1
    assert Occupation.objects.get(pk=occupation.pk).version == 1

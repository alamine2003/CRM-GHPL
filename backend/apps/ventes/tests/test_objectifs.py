"""Objectifs de ventes par réseau (1.7.0, prd.md §14.88) : droits, répartition, suivi, audit."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from apps.audit.models import EvenementAudit
from apps.notifications.models import Notification
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.socle.services import aujourdhui
from apps.ventes import alertes, services
from apps.ventes.models import ObjectifVente, SourceVente

pytestmark = pytest.mark.django_db

URL = "/api/v1/ventes/objectifs/"


def _creer(utilisateur, corps, pays="SN"):
    return client_de(utilisateur, pays).post(URL, corps, format="json")


def _lire(utilisateur, pays="SN", **params):
    return client_de(utilisateur, pays).get(URL, params)


def test_l_administrateur_pays_fixe_une_cible_repartie_a_parts_egales(monde, ventes):
    reponse = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "12000"}
    )
    assert reponse.status_code == 201, reponse.json()
    objectif = reponse.json()
    assert objectif["cible"] == "12000.00" and objectif["repartition_libre"] is False
    assert objectif["mois"] == ["1000.00"] * 12
    # Janvier et février : 1 000 + 2 000 de ventes pour 2 000 attendus.
    donnees = _lire(monde["admin.sn"], annee=2025, mois_fin=2).json()
    ligne = donnees["objectifs"][0]
    assert (ligne["attendu"], ligne["realise"], ligne["ecart"]) == (
        "2000.00",
        "3000.00",
        "1000.00",
    )
    assert (ligne["taux_cible"], ligne["taux_attendu"]) == (25.0, 150.0)
    assert donnees["total"]["cible"] == "12000.00"
    assert donnees["devise"] == monde["sn"].devise


def test_une_cible_qui_ne_se_divise_pas_garde_sa_somme(monde, ventes):
    objectif = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "1000"}
    ).json()
    assert sum(Decimal(m) for m in objectif["mois"]) == Decimal("1000.00")
    assert objectif["mois"][0] == "83.33" and objectif["mois"][11] == "83.37"


def test_la_repartition_libre_se_cumule_mois_par_mois(monde, ventes):
    mois = ["100", "200", "300", "400", "0", "0", "0", "0", "0", "0", "0", "0"]
    reponse = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "mois": mois}
    )
    assert reponse.status_code == 201
    assert reponse.json()["cible"] == "1000.00" and reponse.json()["repartition_libre"] is True
    ligne = _lire(monde["admin.sn"], annee=2025, mois_fin=3).json()["objectifs"][0]
    assert ligne["attendu"] == "600.00" and ligne["taux_attendu"] == 500.0


def test_etat_en_avance_ou_en_retard_dans_l_annee_en_cours(monde, ventes):
    sn, annee = monde["sn"], aujourdhui(monde["sn"]).year
    services.enregistrer_ligne(
        sn, monde["admin.sn"], mois=date(annee, 1, 1), delegue=ventes["gabriel"],
        produit=ventes["cardiol"], client=ventes["pharmacie"], quantite=1, montant_ttc=1000,
        source=SourceVente.SAISIE,
    )  # fmt: skip
    cardio = str(ventes["cardio"].pk)
    _creer(monde["admin.sn"], {"reseau": cardio, "annee": annee, "cible": "12000"})
    gyneco = str(ventes["gyneco"].pk)
    _creer(monde["admin.sn"], {"reseau": gyneco, "annee": annee, "cible": "12000"})
    etats = {
        o["reseau"]["libelle"]: o["etat"]
        for o in _lire(monde["admin.sn"], annee=annee, mois_fin=1).json()["objectifs"]
    }
    assert etats == {"Cardio": "en_avance", "Gynéco": "en_retard"}


def test_un_objectif_de_produit_est_le_detail_et_n_entre_pas_dans_le_total(monde, ventes):
    admin, cardio = monde["admin.sn"], str(ventes["cardio"].pk)
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "12000"})
    reponse = _creer(
        admin,
        {"reseau": cardio, "annee": 2025, "cible": "6000", "produit": str(ventes["cardiol"].pk)},
    )
    assert reponse.status_code == 201
    donnees = _lire(admin, annee=2025, mois_fin=12).json()
    assert len(donnees["objectifs"]) == 2
    assert donnees["total"]["cible"] == "12000.00"
    produit = next(o for o in donnees["objectifs"] if o["produit"])
    assert produit["realise"] == "3000.00" and produit["produit"]["libelle"] == "Cardiol 10 mg"
    # Un produit qui n'est pas du portefeuille du réseau est refusé.
    hors = _creer(
        admin,
        {"reseau": cardio, "annee": 2025, "cible": "10", "produit": str(ventes["gynopril"].pk)},
    )
    assert hors.status_code == 400 and hors.json()["code"] == "produit_hors_portefeuille"


@pytest.mark.parametrize(
    ("corps", "code"),
    [
        ({"annee": 2025}, "cible_invalide"),
        ({"annee": 2025, "cible": "-5"}, "cible_invalide"),
        ({"annee": 2025, "cible": "abc"}, "nombre_invalide"),
        ({"annee": 2025, "mois": ["1"] * 11}, "repartition_invalide"),
        ({"annee": 2025, "mois": ["-1"] + ["1"] * 11}, "repartition_invalide"),
        ({"annee": 2025, "cible": "50", "mois": ["1"] * 12}, "repartition_invalide"),
    ],
)
def test_les_saisies_invalides_sont_refusees(monde, ventes, corps, code):
    corps = {"reseau": str(ventes["cardio"].pk), **corps}
    reponse = _creer(monde["admin.sn"], corps)
    assert reponse.status_code == 400 and reponse.json()["code"] == code
    assert not ObjectifVente.objects.exists()


def test_un_seul_objectif_par_reseau_produit_et_annee(monde, ventes):
    corps = {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "100"}
    assert _creer(monde["admin.sn"], corps).status_code == 201
    doublon = _creer(monde["admin.sn"], corps)
    assert doublon.status_code == 400 and doublon.json()["code"] == "objectif_existant"
    assert _creer(monde["admin.sn"], {**corps, "annee": 2026}).status_code == 201


def test_corriger_et_archiver_sont_audites(monde, ventes):
    admin = client_de(monde["admin.sn"])
    cree = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "1200"}
    ).json()
    corrige = admin.patch(f"{URL}{cree['id']}/", {"cible": "2400"}, format="json")
    assert corrige.status_code == 200 and corrige.json()["cible"] == "2400.00"
    libre = admin.patch(f"{URL}{cree['id']}/", {"mois": ["200"] * 12}, format="json").json()
    assert libre["cible"] == "2400.00" and libre["repartition_libre"] is True
    retour = admin.patch(f"{URL}{cree['id']}/", {"mois": None}, format="json").json()
    assert retour["repartition_libre"] is False
    assert admin.post(f"{URL}{cree['id']}/archiver/").status_code == 204
    assert _lire(monde["admin.sn"], annee=2025).json()["objectifs"] == []
    assert ObjectifVente.objects.filter(pk=cree["id"], archive_le__isnull=False).exists()
    actions = set(
        EvenementAudit.objects.filter(action__startswith="ventes.objectif_").values_list(
            "action", flat=True
        )
    )
    assert actions == {
        "ventes.objectif_creation",
        "ventes.objectif_modification",
        "ventes.objectif_archivage",
    }


def test_qui_lit_et_qui_fixe(monde, ventes):
    _creer(monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "100"})
    _creer(monde["admin.sn"], {"reseau": str(ventes["gyneco"].pk), "annee": 2025, "cible": "100"})

    def reseaux(compte):
        reponse = _lire(compte, annee=2025)
        assert reponse.status_code == 200, compte
        return sorted(o["reseau"]["libelle"] for o in reponse.json()["objectifs"])

    assert reseaux(monde["admin.sn"]) == ["Cardio", "Gynéco"]
    assert reseaux(monde["resp.sn"]) == ["Cardio", "Gynéco"]
    assert reseaux(monde["df.sn"]) == ["Cardio"]  # son périmètre de réseaux
    assert reseaux(monde["dm.sn"]) == []  # aucun réseau dans son périmètre
    # 1.8.0 : le superviseur ne voit que les objectifs de ses délégués ; ici, aucun.
    assert reseaux(monde["sup.sn"]) == []
    for compte in (monde["deleg.sn"], monde["sansrole.sn"]):
        assert _lire(compte, annee=2025).status_code == 403
    # Ni le responsable, ni le DF, ni le superviseur ne fixent ; le DM, seulement ses réseaux.
    corps = {"reseau": str(ventes["cardio"].pk), "annee": 2030, "cible": "100"}
    for compte in (monde["resp.sn"], monde["dm.sn"], monde["df.sn"], monde["sup.sn"]):
        assert _creer(compte, corps).status_code == 403


def test_un_autre_pays_ne_voit_ni_ne_touche_les_objectifs(monde, ventes):
    cree = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "100"}
    ).json()
    assert _lire(monde["admin.tg"], pays="TG", annee=2025).json()["objectifs"] == []
    togo = client_de(monde["admin.tg"], "TG")
    assert togo.patch(f"{URL}{cree['id']}/", {"cible": "1"}, format="json").status_code == 404
    assert togo.post(f"{URL}{cree['id']}/archiver/").status_code == 404
    # Le réseau d'un autre pays n'est pas un réseau du pays actif.
    refus = _creer(
        monde["admin.tg"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "1"}, "TG"
    )
    assert refus.status_code == 404


def test_l_administrateur_pays_recoit_ce_qu_il_peut_viser(monde, ventes):
    donnees = _lire(monde["admin.sn"], annee=2025).json()
    cardio = next(r for r in donnees["reseaux_gerables"] if r["libelle"] == "Cardio")
    assert [p["libelle"] for p in cardio["produits"]] == ["Cardiol 10 mg"]
    assert _lire(monde["resp.sn"], annee=2025).json()["reseaux_gerables"] == []


# --- 1.8.0 (prd.md §14.89) -------------------------------------------------------------------


def test_le_dm_fixe_les_objectifs_des_reseaux_de_son_perimetre(monde, ventes):
    dm = monde["dm.sn"]
    org.ajouter_reseau_au_perimetre(dm, ventes["cardio"])
    corps = {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "1200"}
    cree = _creer(dm, corps)
    assert cree.status_code == 201 and cree.json()["modifiable"] is True
    hors = _creer(dm, {**corps, "reseau": str(ventes["gyneco"].pk)})
    assert hors.status_code == 403 and hors.json()["code"] == "objectif_hors_perimetre"
    donnees = _lire(dm, annee=2025).json()
    assert [r["libelle"] for r in donnees["reseaux_gerables"]] == ["Cardio"]
    # Le DF lit le même objectif, sans pouvoir le corriger.
    assert _lire(monde["df.sn"], annee=2025).json()["objectifs"][0]["modifiable"] is False


def test_l_objectif_d_un_delegue_compte_ses_seules_ventes_du_reseau(monde, ventes):
    admin, cardio = monde["admin.sn"], str(ventes["cardio"].pk)
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "12000"})
    gabriel = str(ventes["gabriel"].pk)
    cree = _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "6000", "delegue": gabriel})
    assert cree.status_code == 201, cree.json()
    assert cree.json()["delegue"]["nom"] == "Gabriel Sn"
    donnees = _lire(admin, annee=2025, mois_fin=12).json()
    reseau, delegue = donnees["objectifs"]
    assert reseau["delegue"] is None and reseau["cible_deleguee"] == "6000.00"
    assert delegue["realise"] == "3000.00" and delegue["cible_deleguee"] is None
    # Le total ne compte que l'objectif du réseau.
    assert donnees["total"]["cible"] == "12000.00"
    # Moussa n'occupe aucun poste du réseau Cardio ; produit et délégué ne vont pas ensemble.
    hors = _creer(
        admin,
        {"reseau": cardio, "annee": 2025, "cible": "1", "delegue": str(ventes["moussa"].pk)},
    )
    assert hors.status_code == 400 and hors.json()["code"] == "delegue_hors_reseau"
    double = _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "1", "delegue": gabriel,
                            "produit": str(ventes["cardiol"].pk)})  # fmt: skip
    assert double.status_code == 400 and double.json()["code"] == "portee_invalide"
    encore = _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "1", "delegue": gabriel})
    assert encore.status_code == 400 and encore.json()["code"] == "objectif_existant"
    gerables = next(r for r in donnees["reseaux_gerables"] if r["libelle"] == "Cardio")
    assert [d["nom"] for d in gerables["delegues"]] == ["Gabriel Sn"]


def test_le_superviseur_lit_les_objectifs_de_ses_delegues(monde, ventes):
    admin, cardio, gyneco = monde["admin.sn"], str(ventes["cardio"].pk), str(ventes["gyneco"].pk)
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "12000"})
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "600",
                   "delegue": str(ventes["gabriel"].pk)})  # fmt: skip
    _creer(admin, {"reseau": gyneco, "annee": 2025, "cible": "600",
                   "delegue": str(ventes["moussa"].pk)})  # fmt: skip
    vus = _lire(monde["sup.sn"], annee=2025).json()["objectifs"]
    assert [(o["reseau"]["libelle"], o["delegue"]["nom"]) for o in vus] == [
        ("Cardio", "Gabriel Sn")
    ]
    assert vus[0]["modifiable"] is False


def test_le_realise_de_chaque_mois(monde, ventes):
    cree = _creer(
        monde["admin.sn"], {"reseau": str(ventes["cardio"].pk), "annee": 2025, "cible": "12000"}
    ).json()
    assert cree["realise_mois"][:3] == ["1000.00", "2000.00", "0.00"]
    assert len(cree["realise_mois"]) == 12


def test_l_export_des_objectifs_est_audite_et_reserve_a_l_encadrement(monde, ventes):
    from apps.audit.models import EvenementAudit

    admin, cardio = monde["admin.sn"], str(ventes["cardio"].pk)
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "12000"})
    _creer(admin, {"reseau": cardio, "annee": 2025, "cible": "600",
                   "delegue": str(ventes["gabriel"].pk)})  # fmt: skip
    url = f"{URL}export/"
    reponse = client_de(monde["df.sn"]).get(url, {"annee": 2025, "mois_fin": 2, "fichier": "csv"})
    assert reponse.status_code == 200
    texte = reponse.content.decode("utf-8-sig")
    assert "Cardio;Tout le réseau;12000,00;2000,00;3000,00" in texte
    assert "Délégué : Gabriel Sn" in texte
    evenement = EvenementAudit.objects.get(action="export.objectifs_ventes")
    assert evenement.details["lignes"] == 2
    classeur = client_de(monde["df.sn"]).get(url, {"annee": 2025, "fichier": "xlsx"})
    assert classeur.status_code == 200 and classeur.content[:2] == b"PK"
    # L'administrateur pays n'exporte pas (comme les autres exports, §14.58).
    assert client_de(admin).get(url, {"annee": 2025}).status_code == 403


def _mois_ecoule(pays):
    jour = aujourdhui(pays)
    return (jour.replace(day=1) - timedelta(days=1)).replace(day=1)


def test_un_reseau_sous_son_objectif_alerte_le_dm_et_l_administrateur(monde, ventes):
    sn, admin, dm = monde["sn"], monde["admin.sn"], monde["dm.sn"]
    org.ajouter_reseau_au_perimetre(dm, ventes["cardio"])
    mois = _mois_ecoule(sn)
    _creer(admin, {"reseau": str(ventes["cardio"].pk), "annee": mois.year, "cible": "1200000"})
    _creer(admin, {"reseau": str(ventes["gyneco"].pk), "annee": mois.year, "cible": "12"})
    # Sans vente du mois écoulé dans le pays, rien ne part encore.
    assert alertes.objectifs_en_retard(sn) == 0
    services.enregistrer_ligne(
        sn, admin, mois=mois, delegue=ventes["gabriel"], produit=ventes["cardiol"],
        client=ventes["pharmacie"], quantite=1, montant_ttc=10, source=SourceVente.SAISIE,
    )  # fmt: skip
    services.enregistrer_ligne(
        sn, admin, mois=mois, delegue=ventes["moussa"], produit=ventes["gynopril"],
        client=ventes["grossiste"], quantite=1, montant_ttc=1000, source=SourceVente.SAISIE,
    )  # fmt: skip
    assert alertes.objectifs_en_retard(sn) == 2  # le DM du réseau et l'administrateur pays
    recus = Notification.objects.filter(type="objectif_ventes_retard")
    assert {n.destinataire for n in recus} == {dm, admin}
    assert recus.first().donnees["reseau"] == "Cardio"
    assert recus.first().donnees["mois"] == f"{mois:%Y-%m}"
    # Une seule fois par objectif et par mois ; Gynéco, au-dessus de l'attendu, ne sonne pas.
    assert alertes.objectifs_en_retard(sn) == 0

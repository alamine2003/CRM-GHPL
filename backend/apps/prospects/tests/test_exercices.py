"""Exercices datés prospect ↔ établissement (PRP-004, prd.md §14.3)."""

from datetime import timedelta

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.prospects import services
from apps.prospects.models import Exercice
from apps.referentiel.models import Valeur
from apps.socle.services import aujourdhui

pytestmark = pytest.mark.django_db


@pytest.fixture
def fiches(monde):
    """Un médecin, deux établissements de Dakar, un établissement au Togo."""
    sn, tg, admin = monde["sn"], monde["tg"], monde["admin.sn"]
    plateau = org.creer_secteur(sn, org.creer_zone(sn, "Dakar"), "Plateau")
    lome = org.creer_secteur(tg, org.creer_zone(tg, "Lomé"), "Bè")

    def valeur(pays, liste, code):
        return Valeur.objects.get(pays=pays, liste=liste, code=code)

    def etablissement(pays, nom, secteur, type_="clinique"):
        return services.creer_etablissement(
            pays, admin if pays == sn else monde["admin.tg"], actif=True, nom=nom,
            type=valeur(pays, "type_etablissement", type_), secteur=secteur,
        )  # fmt: skip

    medecin = services.creer_prospect(
        sn, admin, actif=True, nom="Ndiaye", prenom="Awa",
        type=valeur(sn, "type_prospect", "medecin"),
        specialite=valeur(sn, "specialite", "cardiologie"), potentiel="A",
    )  # fmt: skip
    return {
        "medecin": medecin,
        "clinique": etablissement(sn, "Clinique du Cap", plateau),
        "hopital": etablissement(sn, "Hôpital Principal", plateau, "hopital"),
        "lome": etablissement(tg, "Clinique de Bè", lome),
        **monde,
    }


def url(prospect):
    return f"/api/v1/prospects/{prospect.pk}/exercices/"


def test_un_prospect_exerce_dans_plusieurs_etablissements(fiches):
    """PRP-004 CA1 : plusieurs exercices actifs ; le premier est principal."""
    admin = client_de(fiches["admin.sn"])
    m = fiches["medecin"]
    premier = admin.post(url(m), {"etablissement": str(fiches["clinique"].pk)}, format="json")
    assert premier.status_code == 201, premier.content
    assert premier.json()["principal"] is True and premier.json()["actif"] is True
    corps = {"etablissement": str(fiches["hopital"].pk), "presence": "Lundi et jeudi matin"}
    second = admin.post(url(m), corps, format="json").json()
    assert second["principal"] is False and second["presence"] == "Lundi et jeudi matin"
    liste = admin.get(url(m)).json()
    assert [e["etablissement"]["nom"] for e in liste] == ["Clinique du Cap", "Hôpital Principal"]
    assert all(e["actif"] for e in liste)
    # La fiche affiche son lieu principal ; en désigner un autre retire ce rôle au premier.
    assert admin.get(f"/api/v1/prospects/{m.pk}/").json()["lieu_principal"]["libelle"] == (
        "Clinique du Cap"
    )
    admin.patch(f"/api/v1/exercices/{second['id']}/", {"principal": True}, format="json")
    principaux = Exercice.objects.filter(prospect=m, principal=True)
    assert [e.etablissement.nom for e in principaux] == ["Hôpital Principal"]
    # Un seul exercice en cours par couple prospect / établissement.
    doublon = admin.post(url(m), {"etablissement": str(fiches["clinique"].pk)}, format="json")
    assert doublon.status_code == 400 and doublon.json()["code"] == "exercice_existant"
    assert EvenementAudit.objects.filter(action="exercice.creation").count() == 2
    # La synthèse compte les fiches actives sans lieu d'exercice (qualité des données).
    assert admin.get("/api/v1/prospects/synthese/").json()["sans_lieu"] == 0


def test_un_exercice_actif_a_la_date_de_la_visite(fiches):
    """PRP-004 CA2 (RG-015) : seul un couple lié par un exercice actif à la date compte."""
    m, clinique, hopital = fiches["medecin"], fiches["clinique"], fiches["hopital"]
    jour = aujourdhui(m.pays)
    exercice = services.creer_exercice(
        m, clinique, fiches["admin.sn"], debut=jour - timedelta(days=30)
    )
    assert services.exercice_actif(m, clinique, jour)
    assert not services.exercice_actif(m, clinique, jour - timedelta(days=31))
    assert not services.exercice_actif(m, hopital, jour)  # aucun lien
    # Il quitte la clinique : actif jusqu'à la veille de la fin (fin exclue).
    services.terminer_exercice(exercice, jour)
    assert services.exercice_actif(m, clinique, jour - timedelta(days=1))
    assert not services.exercice_actif(m, clinique, jour)


def test_fin_d_un_exercice_et_historique(fiches):
    admin = client_de(fiches["admin.sn"])
    m = fiches["medecin"]
    cree = admin.post(url(m), {"etablissement": str(fiches["clinique"].pk)}, format="json").json()
    debut = aujourdhui(m.pays)
    avant = admin.post(f"/api/v1/exercices/{cree['id']}/terminer/",
                       {"fin": str(debut - timedelta(days=1))}, format="json")  # fmt: skip
    assert avant.status_code == 400 and avant.json()["code"] == "date_invalide"
    fini = admin.post(f"/api/v1/exercices/{cree['id']}/terminer/", {}, format="json").json()
    assert fini["fin"] == str(debut) and fini["actif"] is False and fini["principal"] is False
    # L'exercice reste dans l'historique ; on peut y revenir par un nouvel exercice.
    assert len(admin.get(url(m)).json()) == 1
    retour = admin.post(url(m), {"etablissement": str(fiches["clinique"].pk)}, format="json")
    assert retour.status_code == 201
    assert EvenementAudit.objects.filter(action="exercice.fin").count() == 1


def test_l_auteur_pose_le_premier_lieu_d_une_fiche_devenue_commune(fiches):
    """Sans doublon, le détecteur rend la fiche commune aussitôt (PRP-008) : le lieu choisi à la
    création (mobile, « Nouveau prospect ») doit pouvoir s'y poser, une seule fois."""
    m, deleg = fiches["medecin"], fiches["deleg.sn"]
    fiche, decision = services.saisir_prospect(
        m.pays, deleg, actif=False, nom="Gueye", prenom="Moussa", type=m.type,
        specialite=m.specialite, potentiel="B",
    )  # fmt: skip
    assert decision.niveau == "aucun" and fiche.statut == "actif"
    client = client_de(deleg)
    corps = {"etablissement": str(fiches["clinique"].pk), "principal": True}
    premier = client.post(url(fiche), corps, format="json")
    assert premier.status_code == 201
    # Le second lieu d'une fiche commune passe par une proposition.
    second = client.post(url(fiche), {"etablissement": str(fiches["hopital"].pk)}, format="json")
    assert second.status_code == 403 and second.json()["code"] == "modification_interdite"
    # Un autre délégué n'y pose rien, pas même un premier lieu.
    autre = services.creer_prospect(
        m.pays, fiches["admin.sn"], actif=True, nom="Fall", type=m.type,
        specialite=m.specialite, potentiel="C",
    )  # fmt: skip
    refus = client.post(url(autre), {"etablissement": str(fiches["clinique"].pk)}, format="json")
    assert refus.status_code == 403


def test_l_archivage_d_une_fiche_termine_ses_exercices(fiches):
    m = fiches["medecin"]
    admin = client_de(fiches["admin.sn"])
    assert admin.get("/api/v1/prospects/synthese/").json()["sans_lieu"] == 1
    exercice = services.creer_exercice(m, fiches["clinique"], fiches["admin.sn"])
    services.archiver(fiches["clinique"], "Fermée")
    assert admin.get("/api/v1/prospects/synthese/").json()["sans_lieu"] == 1
    exercice.refresh_from_db()
    assert exercice.fin == aujourdhui(m.pays)
    # Un établissement archivé n'accueille plus de nouvel exercice.
    with pytest.raises(services.ErreurMetier):
        services.creer_exercice(m, fiches["clinique"], fiches["admin.sn"])


def test_qui_gere_les_exercices(fiches):
    """Comme la fiche : l'administrateur pays toujours, le délégué sur sa fiche à valider.
    Sur une fiche commune, il proposera un nouvel exercice (PRP-014, 0.1.8)."""
    m, corps = fiches["medecin"], {"etablissement": str(fiches["clinique"].pk)}
    deleg = client_de(fiches["deleg.sn"])
    refus = deleg.post(url(m), corps, format="json")
    assert refus.status_code == 403 and refus.json()["code"] == "modification_interdite"
    assert deleg.get(url(m)).status_code == 200  # il lit les lieux d'exercice
    sienne = services.creer_prospect(
        m.pays, fiches["deleg.sn"], actif=False, nom="Sarr", type=m.type,
        specialite=m.specialite, potentiel="B",
    )  # fmt: skip
    assert deleg.post(url(sienne), corps, format="json").status_code == 201
    # Un établissement d'un autre pays n'est pas proposé.
    ailleurs = client_de(fiches["admin.sn"]).post(
        url(m), {"etablissement": str(fiches["lome"].pk)}, format="json"
    )
    assert ailleurs.status_code == 400 and ailleurs.json()["code"] == "etablissement_invalide"


def test_les_prospects_qui_exercent_dans_un_etablissement(fiches):
    m, clinique = fiches["medecin"], fiches["clinique"]
    services.creer_exercice(m, clinique, fiches["admin.sn"])
    liste = client_de(fiches["deleg.sn"]).get(f"/api/v1/etablissements/{clinique.pk}/exercices/")
    assert [e["prospect"]["nom"] for e in liste.json()] == ["NDIAYE"]
    # Isolation : le Togo ne voit ni l'établissement ni ses exercices.
    togo = client_de(fiches["admin.tg"])
    assert togo.get(f"/api/v1/etablissements/{clinique.pk}/exercices/").status_code == 404
    assert togo.get(url(m)).status_code == 404


def test_qui_exerce_ici_dit_ma_derniere_visite(fiches):
    """1.4.5 (maquette) : « Dernière visite : 12 oct. » — la dernière visite effectuée par le
    lecteur chez chacun ; une visite prévue ou d'un autre délégué ne compte pas."""
    from datetime import date

    from apps.planning.models import Planning, Visite

    m, clinique, sn = fiches["medecin"], fiches["clinique"], fiches["sn"]
    services.creer_exercice(m, clinique, fiches["admin.sn"])
    sien = Planning.objects.create(pays=sn, delegue=fiches["deleg.sn"], semaine=date(2026, 9, 28))
    autre = Planning.objects.create(
        pays=sn, delegue=fiches["sansrole.sn"], semaine=date(2026, 10, 5)
    )
    Visite.objects.create(pays=sn, planning=sien, prospect=m, date=date(2026, 9, 29),
                          statut="effectuee")  # fmt: skip
    Visite.objects.create(pays=sn, planning=sien, prospect=m, date=date(2026, 9, 30),
                          statut="prevue")  # fmt: skip
    Visite.objects.create(pays=sn, planning=autre, prospect=m, date=date(2026, 10, 6),
                          statut="effectuee")  # fmt: skip
    url_lieu = f"/api/v1/etablissements/{clinique.pk}/exercices/"
    lue = client_de(fiches["deleg.sn"]).get(url_lieu).json()
    assert [e["derniere_visite"] for e in lue] == ["2026-09-29"]
    assert [e["derniere_visite"] for e in client_de(fiches["admin.sn"]).get(url_lieu).json()] == [
        None
    ]

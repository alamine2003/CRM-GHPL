"""Listes cibles par poste et fréquences cibles (PRP-011, RG-043, RG-024)."""

import pytest

from apps.audit.models import EvenementAudit
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.prospects import services
from apps.prospects.models import Cible
from apps.referentiel.models import Valeur

pytestmark = pytest.mark.django_db

API = "/api/v1/ciblage"


@pytest.fixture
def terrain(monde):
    """Un poste VM sur le Plateau, occupé par le délégué et rattaché au superviseur ; un autre
    poste sans superviseur. Trois prospects : un sur le Plateau, un qui y exerce, un à Fann."""
    sn, admin = monde["sn"], monde["admin.sn"]
    division = org.creer_division(sn, "CARDIO", "Cardiologie")
    reseau = org.creer_reseau(sn, division, "R1", "Réseau un")
    dakar = org.creer_zone(sn, "Dakar")
    plateau = org.creer_secteur(sn, dakar, "Plateau")
    fann = org.creer_secteur(sn, dakar, "Fann")
    poste = org.creer_poste(sn, "vm", "VM Plateau", [reseau], [plateau])
    org.occuper(poste, monde["deleg.sn"])
    org.rattacher(poste, monde["sup.sn"])
    autre = org.creer_poste(sn, "vm", "VM Fann", [reseau], [fann])

    def valeur(liste, code):
        return Valeur.objects.get(pays=sn, liste=liste, code=code)

    def prospect(nom, potentiel, **champs):
        return services.creer_prospect(
            sn, admin, actif=True, nom=nom, type=valeur("type_prospect", "medecin"),
            specialite=valeur("specialite", "cardiologie"), potentiel=potentiel, **champs,
        )  # fmt: skip

    clinique = services.creer_etablissement(
        sn, admin, actif=True, nom="Clinique du Cap", secteur=plateau,
        type=valeur("type_etablissement", "clinique"),
    )  # fmt: skip
    exerce = prospect("Diop", "B")
    services.creer_exercice(exerce, clinique, admin)
    return {
        "poste": poste, "autre": autre,
        "plateau": prospect("Ndiaye", "A", secteur=plateau),
        "exerce": exerce,
        "fann": prospect("Fall", "C", secteur=fann),
        **monde,
    }  # fmt: skip


def liste(client, poste):
    return client.get(f"{API}/postes/{poste.pk}/").json()


def test_le_superviseur_tient_la_liste_et_chaque_changement_est_audite(terrain):
    """PRP-011 CA1 : ajouter ou retirer un prospect est audité ; la fréquence par défaut suit
    le potentiel (A : 2, B : 1 par cycle)."""
    sup, poste = client_de(terrain["sup.sn"]), terrain["poste"]
    ids = [str(terrain["plateau"].pk), str(terrain["exerce"].pk)]
    ajout = sup.post(f"{API}/postes/{poste.pk}/", {"prospects": ids}, format="json")
    assert ajout.status_code == 201, ajout.content
    assert ajout.json() == {"ajoutes": 2, "deja_presents": 0}
    encore = sup.post(f"{API}/postes/{poste.pk}/", {"prospects": ids[:1]}, format="json")
    assert encore.json() == {"ajoutes": 0, "deja_presents": 1}
    cibles = {c["prospect"]["nom"]: c for c in liste(sup, poste)["cibles"]}
    assert cibles["NDIAYE"]["frequence"] == 2 and cibles["DIOP"]["frequence"] == 1
    assert EvenementAudit.objects.filter(action="cible.ajout").count() == 2

    change = sup.patch(f"{API}/cibles/{cibles['DIOP']['id']}/", {"frequence": 3}, format="json")
    assert change.json()["frequence"] == 3
    e = EvenementAudit.objects.get(action="cible.frequence")
    assert e.details["ancienne"] == 1 and e.details["nouvelle"] == 3
    hors_bornes = sup.patch(f"{API}/cibles/{cibles['DIOP']['id']}/", {"frequence": 0},
                            format="json")  # fmt: skip
    assert hors_bornes.status_code == 400

    retrait = sup.post(f"{API}/cibles/{cibles['NDIAYE']['id']}/retirer/",
                       {"motif": "Parti à Thiès"}, format="json")  # fmt: skip
    assert retrait.json()["en_cours"] is False
    assert EvenementAudit.objects.get(action="cible.retrait").details["motif"] == "Parti à Thiès"
    assert [c["prospect"]["nom"] for c in liste(sup, poste)["cibles"]] == ["DIOP"]
    # Le retrait reste dans l'historique du poste.
    historique = sup.get(f"{API}/postes/{poste.pk}/?historique=1").json()["cibles"]
    assert len(historique) == 2


def test_qui_tient_quelle_liste(terrain):
    """RG-043 : l'administrateur pays et le superviseur du poste ; personne d'autre."""
    corps = {"prospects": [str(terrain["plateau"].pk)]}
    sup = client_de(terrain["sup.sn"])
    # Le poste de Fann n'est pas rattaché au superviseur : il ne le voit pas.
    assert sup.post(f"{API}/postes/{terrain['autre'].pk}/", corps, format="json").status_code in (
        403, 404,
    )  # fmt: skip
    for alias in ("deleg.sn", "dm.sn", "df.sn", "resp.sn"):
        refus = client_de(terrain[alias]).post(
            f"{API}/postes/{terrain['poste'].pk}/", corps, format="json"
        )
        assert refus.status_code in (403, 404), alias
    admin = client_de(terrain["admin.sn"])
    assert admin.post(f"{API}/postes/{terrain['autre'].pk}/", corps, format="json").status_code == (
        201
    )
    postes = {p["libelle"]: p for p in sup.get(f"{API}/postes/").json()}
    assert postes["VM Plateau"]["gerable"] is True and "VM Fann" not in postes


def test_affectation_territoriale(terrain):
    """Candidats : les prospects actifs des secteurs du poste, par leur fiche ou par un lieu
    d'exercice. Hors secteur, un prospect reste ciblable mais il est signalé (RG-024)."""
    sup, poste = client_de(terrain["sup.sn"]), terrain["poste"]
    candidats = sup.get(f"{API}/postes/{poste.pk}/candidats/").json()
    assert [p["nom"] for p in candidats] == ["NDIAYE", "DIOP"]  # potentiel A d'abord
    assert candidats[1]["lieu_principal"]["libelle"] == "Clinique du Cap"
    trouve = sup.get(f"{API}/postes/{poste.pk}/candidats/?q=fall").json()
    assert [p["nom"] for p in trouve] == ["FALL"]
    sup.post(f"{API}/postes/{poste.pk}/", {"prospects": [str(terrain["fann"].pk),
             str(terrain["plateau"].pk)]}, format="json")  # fmt: skip
    signal = {c["prospect"]["nom"]: c["hors_secteur"] for c in liste(sup, poste)["cibles"]}
    assert signal == {"NDIAYE": False, "FALL": True}
    # Un prospect déjà ciblé ne revient pas parmi les candidats.
    candidats = sup.get(f"{API}/postes/{poste.pk}/candidats/").json()
    assert [p["nom"] for p in candidats] == ["DIOP"]


def test_charge_de_la_liste(terrain):
    """Synthèse : taille, répartition A/B/C, visites par cycle et par jour ouvré du cycle."""
    admin, poste = client_de(terrain["admin.sn"]), terrain["poste"]
    admin.post(f"{API}/postes/{poste.pk}/", {"prospects": [str(terrain["plateau"].pk),
               str(terrain["exerce"].pk)]}, format="json")  # fmt: skip
    synthese = liste(admin, poste)["poste"]["synthese"]
    assert synthese["total"] == 2 and synthese["potentiels"] == {"A": 1, "B": 1, "C": 0}
    # 3 visites par cycle de 4 semaines de 5 jours ouvrés.
    assert synthese["visites_par_cycle"] == 3 and synthese["visites_par_jour"] == 0.1
    assert synthese["cycle_semaines"] == 4
    assert (synthese["seuil_min"], synthese["seuil_max"]) == (6, 10)  # seuils d'un VM


def test_le_delegue_emporte_sa_liste(terrain):
    """PRP-011 CA2 : le délégué obtient la liste de son poste, à garder sur son téléphone ; il
    ne voit pas celle d'un autre poste."""
    Cible.objects.create(
        pays=terrain["sn"], poste=terrain["poste"], prospect=terrain["plateau"], frequence=2,
        debut="2026-01-01", ajoute_par=terrain["admin.sn"],
    )  # fmt: skip
    deleg = client_de(terrain["deleg.sn"])
    mes = deleg.get(f"{API}/moi/").json()
    assert [m["poste"]["libelle"] for m in mes] == ["VM Plateau"]
    assert [c["prospect"]["nom"] for c in mes[0]["cibles"]] == ["NDIAYE"]
    assert mes[0]["poste"]["gerable"] is False
    assert deleg.get(f"{API}/postes/{terrain['autre'].pk}/").status_code == 404


def test_la_liste_du_delegue_dit_ses_visites_du_cycle_et_son_reseau(terrain):
    """1.4.4 (maquette) : « 2 / 3 » — les visites effectuées chez chaque prospect sur le cycle
    qui finit aujourd'hui, et le réseau du poste. Une visite prévue ou d'avant le cycle ne
    compte pas ; la liste lue par le superviseur ne les porte pas."""
    from datetime import date

    from apps.planning.models import Planning, Visite

    sn, plateau = terrain["sn"], terrain["plateau"]
    Cible.objects.create(
        pays=sn, poste=terrain["poste"], prospect=plateau, frequence=3, debut="2026-01-01",
        ajoute_par=terrain["admin.sn"],
    )  # fmt: skip
    planning = Planning.objects.create(pays=sn, delegue=terrain["deleg.sn"],
                                       semaine=date(2026, 10, 5))  # fmt: skip
    for jour, statut in [(date(2026, 10, 6), "effectuee"), (date(2026, 9, 29), "effectuee"),
                         (date(2026, 10, 7), "prevue"), (date(2026, 8, 25), "effectuee")]:
        Visite.objects.create(pays=sn, planning=planning, prospect=plateau, date=jour,
                              statut=statut)  # fmt: skip
    mes = client_de(terrain["deleg.sn"]).get(f"{API}/moi/").json()
    assert mes[0]["poste"]["reseaux"] == ["Réseau un"]
    assert [c["visites_cycle"] for c in mes[0]["cibles"]] == [2]
    lue = liste(client_de(terrain["sup.sn"]), terrain["poste"])
    assert [c["visites_cycle"] for c in lue["cibles"]] == [None]


def test_un_prospect_archive_sort_des_listes(terrain):
    poste, prospect = terrain["poste"], terrain["plateau"]
    from apps.prospects import ciblage

    ciblage.ajouter(poste, [prospect], terrain["admin.sn"])
    services.archiver(prospect, "Retraite")
    assert not Cible.objects.filter(prospect=prospect, fin__isnull=True).exists()
    # Une fiche archivée n'entre pas dans une liste cible.
    with pytest.raises(services.ErreurMetier):
        ciblage.ajouter(poste, [prospect], terrain["admin.sn"])


def test_isolation_des_listes(terrain):
    togo = client_de(terrain["admin.tg"])
    assert togo.get(f"{API}/postes/{terrain['poste'].pk}/").status_code == 404
    assert togo.get(f"{API}/postes/").json() == []

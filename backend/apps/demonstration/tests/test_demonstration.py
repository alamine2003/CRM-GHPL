"""Données fictives des tests automatiques (DEM-001).

1.0.8 : elles ne servent plus qu'aux tests ; aucune commande ne les met dans une instance."""

from datetime import timedelta

import pytest

from apps.demonstration.generateur import NOMS, PRENOMS, Generateur, Volumes, vider
from apps.identite.models import Utilisateur
from apps.organisation.models import Occupation, Poste, Rattachement, Secteur
from apps.socle.models import Pays

pytestmark = pytest.mark.django_db


MOT_DE_PASSE = "Demo-" + "x9Y" * 6


def lancer(monkeypatch, **options):
    """Base fictive des tests (1.0.8 : plus de commande, le générateur ne sert qu'aux tests)."""
    vider()
    return Generateur(MOT_DE_PASSE, 2026).tout(Volumes().reduits(0.1))


def test_le_generateur_redonne_la_meme_base(monkeypatch):
    """CA1 : deux lancements donnent la même base, sans doublon."""
    lancer(monkeypatch)
    premier = (Utilisateur.objects.count(), Poste.objects.count(), Secteur.objects.count())
    lancer(monkeypatch)
    assert (Utilisateur.objects.count(), Poste.objects.count(), Secteur.objects.count()) == premier
    assert set(Pays.objects.values_list("code", flat=True)) == {"SN", "TG"}
    # Des postes vacants et sans superviseur, pour montrer les alertes.
    assert Poste.objects.count() > Occupation.objects.count()
    assert Poste.objects.count() > Rattachement.objects.count()
    # Prospects reliés à leurs lieux d'exercice (PRP-004), quelques-uns à plusieurs.
    from apps.prospects.models import Exercice, Prospect

    exercices = Exercice.objects.filter(fin__isnull=True)
    assert exercices.values("prospect").distinct().count() > Prospect.objects.count() // 2
    assert exercices.count() > exercices.values("prospect").distinct().count()
    # Chaque poste occupé a sa liste cible (PRP-011) ; les postes vacants n'en ont pas.
    from apps.prospects.models import Cible

    cibles = Cible.objects.filter(fin__isnull=True)
    assert cibles.exists()
    assert not cibles.filter(poste__occupations__isnull=True).exists()
    # De quoi trancher (0.1.9) : paires probables (PRP-009) et une proposition (PRP-014).
    from apps.prospects.models import DoublonProbable, Proposition

    assert DoublonProbable.objects.filter(pays__code="SN", statut="en_attente").count() >= 2
    assert Proposition.objects.filter(pays__code="SN", statut="en_attente").count() == 1
    # Calendrier des jours fériés à date certaine (ORG-012), deux années.
    from apps.planning.models import JourFerie

    assert JourFerie.objects.filter(pays__code="SN", libelle="Toussaint").count() == 2
    # Le cycle du planning (0.3.9). Premier délégué : la semaine en cours validée avant la
    # fermeture du lundi 0 h (PLN-012), la suivante en préparation, dont une visite à compléter
    # (PLN-001, PLN-002). Second délégué : la semaine suivante soumise, à décider (PLN-011), et
    # la semaine en cours fermée, dont il a demandé la réouverture.
    from apps.notifications.models import Notification
    from apps.planning import controles
    from apps.planning import services as pln
    from apps.planning.models import Activite, Passage, Planning

    prepare, approuve, soumis, *terminees = Planning.objects.filter(pays__code="SN").order_by(
        "statut", "semaine")  # fmt: skip
    # Les deux semaines précédentes du premier délégué, terminées : son historique (VIS-002) ;
    # celle du second ne porte que son pointage d'un cabinet sans position (DC-52, 0.8.8).
    du_second = [p for p in terminees if p.delegue != approuve.delegue]
    terminees = [p for p in terminees if p.delegue == approuve.delegue]
    assert [p.statut for p in terminees] == ["termine", "termine"]
    assert all(p.visites.exists() for p in terminees)
    assert [p.visites.count() for p in du_second] == [1]
    # Approuvée, la semaine en cours a commencé : elle est « en cours » (cycle 0.4).
    assert (approuve.statut, prepare.statut, soumis.statut) == ("en_cours", "brouillon", "soumis")
    assert approuve.reouvert_le is None and not approuve.en_retard
    version = approuve.versions.get()
    assert (version.decision, version.mode) == ("approuve", "direct")
    assert version.soumis_le < pln.echeance(approuve) and version.decide_par is not None
    assert (
        approuve.visites.count() == 7 and not approuve.visites.filter(heure__isnull=True).exists()
    )
    assert prepare.semaine == soumis.semaine == approuve.semaine + timedelta(days=7)
    assert prepare.delegue == approuve.delegue != soumis.delegue
    assert prepare.visites.count() == 6 and prepare.visites.filter(heure__isnull=True).count() == 1
    assert soumis.versions.get().numero == 1 and not prepare.versions.exists()
    assert not soumis.en_retard and soumis.soumis_le < pln.echeance(soumis)
    # Chaque semaine a son passage de deux confrères ; la formation est à préparer (PLN-003,
    # PLN-009).
    assert [p.visites.count() for p in Passage.objects.filter(pays__code="SN")] == [2] * 5
    # Les semaines complètes montrent une matinée d'accompagnement du superviseur (PLN-018) et
    # une visite hors liste cible, à trouver en consultant la semaine (0.3.2).
    assert approuve.activites.get().type == soumis.activites.get().type == "accompagnement"
    assert "hors_cible" in {a.code for a in controles.signalements(soumis)}
    assert Activite.objects.filter(pays__code="SN", periode="apres_midi").count() == 1
    # DC-52 : un cabinet sans position attend sa position proposée, de deux personnes.
    from apps.prospects import positions
    from apps.prospects.models import Etablissement

    (lieu,) = positions.a_valider(Etablissement.objects.filter(pays__code="SN"),
                                  Pays.objects.get(code="SN"))  # fmt: skip
    assert positions.proposition(lieu)["personnes"] == 2
    # La semaine fermée du second délégué : pas de planning, une demande de réouverture.
    assert not Planning.objects.filter(delegue=soumis.delegue, semaine=approuve.semaine).exists()
    assert pln.reouverture_demandee(soumis.delegue, approuve.semaine)
    assert Notification.objects.filter(type="reouverture_demandee").exists()


def test_aucune_donnee_reelle(monkeypatch):
    """CA2 : noms tirés des listes, courriels sur un domaine qui n'existe pas."""
    lancer(monkeypatch)
    for compte in Utilisateur.objects.all():
        assert compte.first_name in PRENOMS and compte.last_name in NOMS
        assert compte.email.endswith("@demo.invalid")


def test_les_comptes_de_demonstration_se_connectent(monkeypatch):
    from apps.identite.services import connecter

    lancer(monkeypatch)
    compte = Utilisateur.objects.filter(pays_principal__code="SN", roles__role="admin_pays").first()
    assert connecter(compte.username, MOT_DE_PASSE, "portail").acces

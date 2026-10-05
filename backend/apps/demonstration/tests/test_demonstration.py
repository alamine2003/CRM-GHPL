"""DEM-001 : instance de démonstration réinitialisable, aux données fictives."""

import pytest
from django.core.management import CommandError, call_command

from apps.demonstration.generateur import NOMS, PRENOMS
from apps.identite.models import Utilisateur
from apps.organisation.models import Occupation, Poste, Rattachement, Secteur
from apps.socle.models import Pays

pytestmark = pytest.mark.django_db


def lancer(monkeypatch, **options):
    monkeypatch.setenv("INNOV_DEMO_MOT_DE_PASSE", "Demo-" + "x9Y" * 6)
    call_command("reinitialiser_demo", oui=True, echelle=0.1, **options)


def test_la_demonstration_se_reinitialise_par_une_commande(monkeypatch):
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
    # Une semaine en préparation avec ses visites, dont une à compléter (PLN-001, PLN-002).
    from apps.planning.models import Visite

    visites = Visite.objects.filter(pays__code="SN")
    assert visites.count() == 6 and visites.filter(heure__isnull=True).count() == 1
    # Un passage de deux confrères et une demi-journée de formation (PLN-003, PLN-009).
    from apps.planning.models import Absence, Passage

    assert Passage.objects.filter(pays__code="SN").get().visites.count() == 2
    assert Absence.objects.filter(pays__code="SN", periode="apres_midi").count() == 1


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
    assert connecter(compte.username, "Demo-" + "x9Y" * 6, "portail").acces


def test_refus_hors_developpement_et_sans_confirmation(monkeypatch, settings):
    with pytest.raises(CommandError, match="--oui"):
        call_command("reinitialiser_demo")
    settings.ENVIRONNEMENT = "production"
    with pytest.raises(CommandError, match="production"):
        call_command("reinitialiser_demo", oui=True)

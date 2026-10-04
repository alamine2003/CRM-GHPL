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

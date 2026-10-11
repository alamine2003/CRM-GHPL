import pytest
from django.core.management import CommandError, call_command

from apps.socle.models import Pays

pytestmark = pytest.mark.django_db


def test_commande_creer_pays(capsys):
    call_command("creer_pays", "SN", "TG")
    assert set(Pays.objects.values_list("code", flat=True)) == {"SN", "TG"}
    assert "Sénégal" in capsys.readouterr().out


def test_commande_liste_le_catalogue(capsys):
    call_command("creer_pays", "--liste")
    sortie = capsys.readouterr().out
    assert "SN  Sénégal" in sortie and "GM  Gambie" in sortie
    assert not Pays.objects.exists()


def test_commande_refuse_un_pays_inconnu():
    with pytest.raises(CommandError, match="catalogue"):
        call_command("creer_pays", "FR")

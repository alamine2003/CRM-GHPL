"""1.0.8 : une instance vide reçoit son premier compte de la configuration, sans donnée fictive."""

import pytest
from django.core.management import CommandError, call_command

from apps.identite.models import Role, Utilisateur
from apps.identite.services import connecter
from apps.socle.models import Pays

pytestmark = pytest.mark.django_db

MOT_DE_PASSE = "Essai-" + "q7Z" * 5


def test_le_premier_administrateur_est_cree_une_seule_fois(monkeypatch):
    monkeypatch.setenv("INNOV_ADMIN_IDENTIFIANT", "Awa.Diallo")
    monkeypatch.setenv("INNOV_ADMIN_MOT_DE_PASSE", MOT_DE_PASSE)
    call_command("preparer_instance")
    compte = Utilisateur.objects.get()
    assert (compte.username, compte.first_name, compte.last_name) == ("awa.diallo", "Awa", "Diallo")
    assert compte.est_siege and compte.roles.filter(role=Role.ADMIN_SIEGE).exists()
    assert connecter("awa.diallo", MOT_DE_PASSE, "portail").acces
    # Ni pays, ni autre compte : l'instance part vide.
    assert not Pays.objects.exists()
    # Redémarrage : rien n'est recréé, même avec d'autres valeurs.
    monkeypatch.setenv("INNOV_ADMIN_IDENTIFIANT", "autre.compte")
    call_command("preparer_instance")
    assert Utilisateur.objects.count() == 1


def test_sans_configuration_rien_n_est_cree(monkeypatch, capsys):
    monkeypatch.delenv("INNOV_ADMIN_IDENTIFIANT", raising=False)
    monkeypatch.delenv("INNOV_ADMIN_MOT_DE_PASSE", raising=False)
    call_command("preparer_instance")
    assert not Utilisateur.objects.exists()
    assert "INNOV_ADMIN_IDENTIFIANT" in capsys.readouterr().out


def test_un_mot_de_passe_trop_faible_est_refuse(monkeypatch):
    monkeypatch.setenv("INNOV_ADMIN_IDENTIFIANT", "awa.diallo")
    monkeypatch.setenv("INNOV_ADMIN_MOT_DE_PASSE", "court")
    with pytest.raises(CommandError):
        call_command("preparer_instance")
    assert not Utilisateur.objects.exists()


def test_les_tables_sont_creees_avant_le_compte(monkeypatch):
    """1.1.1 : la commande applique les migrations avant de chercher un compte."""
    from apps.identite.management.commands import preparer_instance

    appels = []
    monkeypatch.setattr(preparer_instance, "call_command", lambda nom, **o: appels.append(nom))
    monkeypatch.delenv("INNOV_ADMIN_IDENTIFIANT", raising=False)
    call_command("preparer_instance")
    assert appels == ["migrate"]

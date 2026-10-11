import pytest
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


def test_modele_utilisateur_personnalise_avec_uuid7():
    Utilisateur = get_user_model()
    assert Utilisateur._meta.label == "identite.Utilisateur"
    utilisateur = Utilisateur.objects.create_user("delegue.test")
    assert utilisateur.id.version == 7
    assert utilisateur.pays_principal is None
    assert utilisateur.langue == "fr"


def test_un_utilisateur_n_est_jamais_supprime():
    utilisateur = get_user_model().objects.create_user("delegue.test")
    with pytest.raises(TypeError, match="RG-007"):
        utilisateur.delete()

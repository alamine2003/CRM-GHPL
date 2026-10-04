"""ORG-011 : paramètres configurables par pays."""

from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.socle.parametres import CATALOGUE
from apps.socle.services import (
    archiver_pays,
    creer_pays,
    definir_parametre,
    parametres_en_vigueur,
    valeur_parametre,
)

pytestmark = pytest.mark.django_db


def test_chaque_parametre_a_un_defaut_valide():
    """CA1 : chaque paramètre a une valeur par défaut, conforme à son propre validateur."""
    for definition in CATALOGUE.values():
        definition.valider(definition.defaut)


def test_valeurs_par_defaut_du_cadrage():
    pays = creer_pays("SN")
    valeurs = parametres_en_vigueur(pays)
    assert valeurs["jours_ouvres"] == [1, 2, 3, 4, 5]
    assert valeurs["echeance_soumission_planning"] == {"jour": 4, "heure": "18:00"}
    assert valeurs["echeance_approbation_planning"] == {"jour": 5, "heure": "18:00"}
    assert valeurs["heure_limite_rapport"] == "23:59"
    assert valeurs["distance_pointage_m"] == 100
    assert valeurs["delai_escalade_heures_ouvrees"] == 24
    assert valeurs["conservation"] == {
        "activite_annees": 5,
        "gps_mois": 12,
        "pieces_jointes_annees": 3,
    }


def test_un_pays_ne_voit_pas_les_parametres_d_un_autre():
    sn, tg = creer_pays("SN"), creer_pays("TG")
    definir_parametre(tg, "distance_pointage_m", 500)
    assert valeur_parametre(tg, "distance_pointage_m") == 500
    assert valeur_parametre(sn, "distance_pointage_m") == 100


def test_modification_datee_sans_effet_retroactif():
    """CA3 : la nouvelle valeur s'applique ensuite ; le passé garde l'ancienne règle."""
    pays = creer_pays("SN")
    avant = timezone.now()
    definir_parametre(pays, "heure_limite_rapport", "22:00", debut=avant + timedelta(days=1))
    assert valeur_parametre(pays, "heure_limite_rapport", a=avant) == "23:59"
    assert valeur_parametre(pays, "heure_limite_rapport", a=avant + timedelta(days=2)) == "22:00"


def test_les_valeurs_successives_sont_conservees():
    pays = creer_pays("SN")
    maintenant = timezone.now()
    definir_parametre(pays, "distance_pointage_m", 300, debut=maintenant - timedelta(days=10))
    definir_parametre(pays, "distance_pointage_m", 150, debut=maintenant - timedelta(days=1))
    assert valeur_parametre(pays, "distance_pointage_m", a=maintenant - timedelta(days=5)) == 300
    assert valeur_parametre(pays, "distance_pointage_m") == 150


@pytest.mark.parametrize(
    ("cle", "valeur"),
    [
        ("inconnu", 1),
        ("jours_ouvres", []),
        ("jours_ouvres", [1, 1]),
        ("jours_ouvres", [0, 8]),
        ("heure_limite_rapport", "24:00"),
        ("echeance_soumission_planning", {"jour": 8, "heure": "18:00"}),
        ("plage_horaire_visites", {"debut": "20:00", "fin": "08:00"}),
        ("seuils_visites_jour", {"vm": {"min": 6, "max": 10}}),
        (
            "seuils_visites_jour",
            {t: {"min": 9, "max": 3} for t in ("vm", "vm_otc", "kam", "dermo")},
        ),
        ("distance_pointage_m", True),
        ("geolocalisation_active", "oui"),
        ("conservation", {"activite_annees": 5}),
    ],
)
def test_valeurs_invalides_refusees(cle, valeur):
    pays = creer_pays("SN")
    with pytest.raises(ValidationError):
        definir_parametre(pays, cle, valeur)


def test_un_pays_archive_est_en_lecture_seule():
    pays = archiver_pays(creer_pays("SN"))
    with pytest.raises(ValidationError, match="lecture seule"):
        definir_parametre(pays, "distance_pointage_m", 300)
    assert valeur_parametre(pays, "distance_pointage_m") == 100

"""0.3.5 : nouvelle version et resoumission après révision (PLN-014).

Décision du 5 octobre 2026 : une nouvelle soumission après révision n'est pas un retard ;
seul compte le retard de la première soumission. Chaque soumission notifie les responsables
du poste et leurs remplaçants (prd.md §18 « Planning soumis »)."""

from datetime import date, time

import pytest
from freezegun import freeze_time

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.notifications.models import Notification
from apps.organisation import services as org
from apps.perimetre.tests.conftest import client_de
from apps.planning import controles, services

from .conftest import SEMAINE

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 13)


@pytest.fixture
def revise(monde, terrain):
    """Soumis à temps le mercredi 7, révision demandée le vendredi 9 après l'échéance."""
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-07 09:00"):
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=terrain["medecin"], etablissement=terrain["clinique"],
                                objectif="Vasculor")  # fmt: skip
        services.soumettre(planning)
    with freeze_time("2026-10-09 10:00"):
        services.demander_revision(planning, monde["sup.sn"], "Ajoutez des visites.")
    return planning


def test_une_resoumission_apres_revision_n_est_pas_en_retard(monde, revise):
    with freeze_time("2026-10-09 17:00"):
        # Pendant la révision, l'échéance passée n'est plus signalée.
        assert "echeance_depassee" not in {a.code for a in controles.signalements(revise)}
        semaine = client_de(monde["deleg.sn"]).get(SEMAINE, {"semaine": "2026-10-12"}).json()
        assert semaine["planning"]["numero_version"] == 1
        services.soumettre(revise)
    revise.refresh_from_db()
    assert (revise.statut, revise.en_retard) == ("soumis", False)
    assert [(v.numero, v.en_retard) for v in revise.versions.all()] == [(2, False), (1, False)]
    assert "soumis_en_retard" not in {a.code for a in controles.signalements(revise)}


def test_un_premier_retard_reste_apres_la_revision(monde, terrain):
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    planning = terrain["planning"]
    with freeze_time("2026-10-12 08:00"):
        # Fermé le lundi 0 h, rouvert par le superviseur : la soumission est en retard.
        services.rouvrir(monde["sn"], monde["deleg.sn"], planning.semaine, monde["sup.sn"])
        planning.refresh_from_db()
        services.ajouter_visite(planning, date=MARDI, heure=time(9, 0),
                                prospect=terrain["medecin"], etablissement=terrain["clinique"],
                                objectif="Vasculor")  # fmt: skip
        services.soumettre(planning)
        assert planning.en_retard is True
        services.demander_revision(planning, monde["sup.sn"], "Ajoutez des visites.")
        services.soumettre(planning)
    planning.refresh_from_db()
    assert planning.en_retard is True


def test_la_soumission_notifie_le_superviseur_et_son_remplacant(monde, terrain):
    remplacant = creer_utilisateur("ousmane.fictif", prenom="Ousmane", nom="FICTIF",
                                   pays=monde["sn"])  # fmt: skip
    org.rattacher(terrain["poste"], monde["sup.sn"], date(2026, 1, 1))
    with freeze_time("2026-10-07 09:00"):
        attribuer_role(remplacant, Role.SUPERVISEUR, monde["sn"], par=None)
        org.designer_remplacant(monde["sn"], monde["sup.sn"], remplacant, date(2026, 10, 7),
                                date(2026, 10, 9), monde["sup.sn"])  # fmt: skip
        services.ajouter_visite(terrain["planning"], date=MARDI, heure=time(9, 0),
                                prospect=terrain["medecin"], etablissement=terrain["clinique"],
                                objectif="Vasculor")  # fmt: skip
        services.soumettre(terrain["planning"])
    soumis = Notification.objects.filter(type="planning_soumis")
    assert {n.destinataire for n in soumis} == {monde["sup.sn"], remplacant}
    donnees = soumis.first().donnees
    assert (donnees["version"], donnees["semaine"]) == (1, "2026-10-12")
    deleg = monde["deleg.sn"]
    assert donnees["nom"] == f"{deleg.first_name} {deleg.last_name}"

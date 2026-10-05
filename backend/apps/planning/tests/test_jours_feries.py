"""ORG-012 : l'administrateur pays tient le calendrier des jours fériés."""

from datetime import date

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.planning.calendrier import jours_planifiables
from apps.planning.services import creer_jour_ferie

pytestmark = pytest.mark.django_db

URL = "/api/v1/jours-feries/"


@freeze_time("2026-10-05 09:00")
def test_l_administrateur_pays_tient_le_calendrier(monde):
    admin = client_de(monde["admin.sn"])
    r = admin.post(URL, {"date": "2026-11-01", "libelle": "Toussaint"}, format="json")
    assert r.status_code == 201, r.content
    assert r.json() | {"id": None} == {"id": None, "date": "2026-11-01", "libelle": "Toussaint",
                                       "variable": False, "modifiable": True}  # fmt: skip
    # Un même jour ne peut pas être férié deux fois.
    double = admin.post(URL, {"date": "2026-11-01", "libelle": "Autre"}, format="json")
    assert double.status_code == 409 and double.json()["code"] == "jour_ferie_existant"
    assert [j["date"] for j in admin.get(URL, {"annee": 2026}).json()] == ["2026-11-01"]
    assert admin.get(URL, {"annee": 2027}).json() == []
    # Chaque changement du calendrier est audité.
    assert EvenementAudit.objects.filter(action="jour_ferie.creation").count() == 1


@freeze_time("2026-10-05 09:00")
def test_une_date_variable_se_modifie_jusqu_a_la_veille(monde):
    """CA2 : la Tabaski se déplace tant qu'elle n'est pas arrivée ; le jour même, c'est acquis."""
    admin = client_de(monde["admin.sn"])
    jour = creer_jour_ferie(monde["sn"], date=date(2026, 10, 6), libelle="Tabaski", variable=True)
    r = admin.patch(f"{URL}{jour.pk}/", {"date": "2026-10-07"}, format="json")
    assert r.status_code == 200 and r.json()["date"] == "2026-10-07"
    # Une date passée ou du jour n'est pas acceptée.
    r = admin.patch(f"{URL}{jour.pk}/", {"date": "2026-10-05"}, format="json")
    assert r.status_code == 409 and r.json()["code"] == "jour_ferie_passe"
    with freeze_time("2026-10-07 08:00"):
        admin = client_de(monde["admin.sn"])  # nouvelle session : le jeton a expiré
        r = admin.patch(f"{URL}{jour.pk}/", {"libelle": "Tabaski (Aïd el-Kébir)"}, format="json")
        assert r.status_code == 409
        assert admin.get(URL).json()[0]["modifiable"] is False
        assert admin.post(f"{URL}{jour.pk}/retirer/").status_code == 409
    modification = EvenementAudit.objects.get(action="jour_ferie.modification")
    assert modification.details["avant"] == {"date": "2026-10-06"}


@freeze_time("2026-10-05 09:00")
def test_un_jour_ferie_retire_redevient_ouvre(monde):
    admin = client_de(monde["admin.sn"])
    jour = creer_jour_ferie(monde["sn"], date=date(2026, 12, 25), libelle="Noël")
    assert date(2026, 12, 25) not in jours_planifiables(monde["sn"], date(2026, 12, 21))
    assert admin.post(f"{URL}{jour.pk}/retirer/").status_code == 200
    assert admin.get(URL).json() == []
    assert date(2026, 12, 25) in jours_planifiables(monde["sn"], date(2026, 12, 21))


def test_un_jour_ferie_sort_des_jours_comptes_de_la_semaine(monde):
    """CA1 : le jour férié est exclu des contrôles « semaine complète » et des seuils."""
    creer_jour_ferie(monde["sn"], date=date(2026, 11, 2), libelle="Lendemain de Toussaint")
    assert jours_planifiables(monde["sn"], date(2026, 11, 4)) == [
        date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5), date(2026, 11, 6),
    ]  # fmt: skip
    # Le calendrier est celui du pays : le Togo n'est pas concerné.
    assert len(jours_planifiables(monde["tg"], date(2026, 11, 4))) == 5


def test_seul_l_administrateur_pays_tient_le_calendrier(monde):
    for alias in ("deleg.sn", "sup.sn", "resp.sn"):
        assert (
            client_de(monde[alias])
            .post(URL, {"date": "2026-11-01", "libelle": "Toussaint"}, format="json")
            .status_code
            == 403
        )

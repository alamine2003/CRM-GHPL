# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.8.8 : DC-52, position de référence proposée d'un établissement. Le point médian des trois
premiers pointages, d'au moins deux personnes différentes ; validé (ou déplacé) sur la carte
par l'administrateur pays, audité et inscrit à l'historique."""

from datetime import UTC, date, datetime, timedelta

import pytest

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.planning.models import Planning, Visite
from apps.planning.tests.conftest import terrain  # noqa: F401
from apps.prospects.models import Changement

pytestmark = pytest.mark.django_db

DEBUT = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)


def pointer(planning, lieu, n, lat, lon, precision=15):
    return Visite.objects.create(
        pays=planning.pays, planning=planning, etablissement=lieu, date=DEBUT.date(),
        statut="effectuee", debut_le=DEBUT + timedelta(days=n), debut_latitude=lat,
        debut_longitude=lon, debut_precision_m=precision,
    )  # fmt: skip


@pytest.fixture
def lieu(monde, terrain):
    """La clinique, sans position ; un second délégué a lui aussi son planning."""
    autre = Planning.objects.create(pays=monde["sn"], delegue=monde["sansrole.sn"],
                                    semaine=date(2026, 10, 12))  # fmt: skip
    return terrain["clinique"], terrain["planning"], autre


def url(lieu, suite=""):
    return f"/api/v1/etablissements/{lieu.pk}/position-proposee/{suite}"


def test_dc52_un_seul_delegue_ne_fixe_pas_la_reference(monde, lieu):
    clinique, moi, _ = lieu
    for n in range(4):
        pointer(moi, clinique, n, 14.7001, -17.4001)
    admin = client_de(monde["admin.sn"])
    r = admin.get(url(clinique)).json()
    assert (r["latitude"], r["utilisables"], r["personnes"]) == (None, 4, 1)
    assert len(r["pointages"]) == 3
    refus = admin.post(url(clinique, "valider/"), {}, format="json")
    assert (refus.status_code, refus.json()["code"]) == (409, "position_non_proposee")
    assert admin.get("/api/v1/etablissements/synthese/").json()["positions_proposees"] == 0


def test_dc52_point_median_de_deux_personnes_valide_et_audite(monde, lieu):
    clinique, moi, autre = lieu
    pointer(moi, clinique, 0, 14.7000, -17.4000)
    pointer(moi, clinique, 1, 14.7004, -17.4002)
    pointer(moi, clinique, 2, 14.7100, -17.4100)  # même personne : cède sa place
    pointer(moi, clinique, 3, 14.7002, -17.4001, precision=500)  # trop imprécis : ignoré
    pointer(autre, clinique, 4, 14.7002, -17.4003)
    admin = client_de(monde["admin.sn"])
    r = admin.get(url(clinique)).json()
    assert (r["latitude"], r["longitude"]) == (14.7002, -17.4002)
    assert r["personnes"] == 2 and r["ecart_max_m"] < 50 and r["seuil_m"] == 100
    assert admin.get("/api/v1/etablissements/synthese/").json()["positions_proposees"] == 1
    liste = admin.get("/api/v1/etablissements/?position_proposee=1").json()
    assert [e["id"] for e in liste["resultats"]] == [str(clinique.pk)]
    # Le délégué ne la voit pas : seule l'administration valide.
    assert client_de(monde["deleg.sn"]).get(url(clinique)).status_code == 403
    ok = admin.post(url(clinique, "valider/"), {}, format="json")
    assert ok.status_code == 200, ok.content
    assert (ok.json()["latitude"], ok.json()["longitude"]) == (14.7002, -17.4002)
    (audit,) = EvenementAudit.objects.filter(action="etablissement.position_validee")
    assert audit.details == {"pointages": 3, "personnes": 2, "deplacee_m": 0}
    assert set(Changement.objects.filter(origine="position_proposee")
               .values_list("champ", flat=True)) == {"latitude", "longitude"}  # fmt: skip
    # Une fois fixée, plus rien n'est proposé.
    assert admin.get(url(clinique)).json()["latitude"] is None
    deja = admin.post(url(clinique, "valider/"), {}, format="json")
    assert deja.json()["code"] == "position_deja_fixee"


def test_dc52_l_administrateur_deplace_le_point_sur_la_carte(monde, lieu):
    clinique, moi, autre = lieu
    for n, planning in enumerate((moi, autre, moi)):
        pointer(planning, clinique, n, 14.7, -17.4)
    admin = client_de(monde["admin.sn"])
    r = admin.post(url(clinique, "valider/"), {"latitude": 14.7009, "longitude": -17.4},
                   format="json")  # fmt: skip
    assert r.status_code == 200 and r.json()["latitude"] == 14.7009
    audit = EvenementAudit.objects.get(action="etablissement.position_validee")
    assert 95 <= audit.details["deplacee_m"] <= 105


def test_dc52_rayon_propre_et_isolation(monde, lieu):
    """Un grand établissement (DC-55) accepte des pointages moins précis ; l'autre pays ne voit
    rien."""
    clinique, moi, autre = lieu
    clinique.rayon_pointage_m = 600
    clinique.save(update_fields=["rayon_pointage_m"])
    for n, planning in enumerate((moi, autre, moi)):
        pointer(planning, clinique, n, 14.7, -17.4, precision=400)
    assert client_de(monde["admin.sn"]).get(url(clinique)).json()["latitude"] == 14.7
    assert client_de(monde["admin.tg"]).get(url(clinique)).status_code == 404

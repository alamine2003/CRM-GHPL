"""ADR-003, couche 2 : PostgreSQL refuse les lignes d'un autre pays, même si le filtre
applicatif manque. Les tests se placent sous un rôle ordinaire : un super-utilisateur
PostgreSQL ignore toujours la sécurité au niveau des lignes."""

import pytest
from django.apps import apps
from django.db import DatabaseError, connection, transaction

from apps.organisation import services as org
from apps.organisation.models import Zone
from apps.organisation.vues import ZonesVue
from apps.socle.modeles_base import ModeleDePays
from apps.socle.models import JournalChangement, ParametrePays

from .conftest import client_de

pytestmark = pytest.mark.django_db


def executer(sql, parametres=None):
    with connection.cursor() as curseur:
        curseur.execute(sql, parametres)
        return curseur.fetchall() if curseur.description else None


@pytest.fixture
def role_ordinaire(db):
    """Rôle sans privilège ni BYPASSRLS, comme celui de l'application en production.
    Tout est annulé à la fin du test (transaction)."""
    executer(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'innov_test_rls') THEN
            CREATE ROLE innov_test_rls NOLOGIN NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO innov_test_rls;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO innov_test_rls;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO innov_test_rls;
        """
    )

    def devenir(pays: str | None):
        executer("SET LOCAL ROLE innov_test_rls")
        if pays is not None:
            executer("SELECT set_config('innov.pays', %s, true)", [pays])

    return devenir


@pytest.fixture
def zones(monde):
    org.creer_zone(monde["sn"], "Dakar")
    org.creer_zone(monde["sn"], "Thiès")
    org.creer_zone(monde["tg"], "Maritime")
    return monde


def libelles():
    return sorted(r[0] for r in executer("SELECT libelle FROM organisation_zone"))


def test_un_pays_ne_lit_que_ses_lignes(zones, role_ordinaire):
    role_ordinaire(str(zones["sn"].pk))
    assert libelles() == ["Dakar", "Thiès"]


def test_un_pays_ne_peut_pas_ecrire_chez_un_autre(zones, role_ordinaire):
    role_ordinaire(str(zones["sn"].pk))
    with pytest.raises(DatabaseError, match="row-level security"), transaction.atomic():
        Zone.objects.create(pays=zones["tg"], libelle="Plateaux")
    # Et une ligne togolaise ne peut pas être modifiée : elle est invisible.
    with connection.cursor() as curseur:
        curseur.execute("UPDATE organisation_zone SET libelle = 'X' WHERE libelle = 'Maritime'")
        assert curseur.rowcount == 0
    role_ordinaire("*")
    assert "Maritime" in libelles()


def test_le_siege_voit_tout_et_sans_role_on_ne_voit_rien(zones, role_ordinaire):
    role_ordinaire("*")
    assert libelles() == ["Dakar", "Maritime", "Thiès"]
    executer("SELECT set_config('innov.pays', 'aucun', true)")
    assert libelles() == []


def test_la_base_protege_meme_si_le_filtre_applicatif_manque(zones, role_ordinaire, monkeypatch):
    """Un sélecteur bogué (sans filtre de pays) ne laisse rien passer d'un autre pays."""
    monkeypatch.setattr(ZonesVue, "selection", lambda self, perimetre: Zone.objects.all())
    client = client_de(zones["admin.sn"])
    role_ordinaire(None)
    reponse = client.get("/api/v1/organisation/zones/")
    assert reponse.status_code == 200
    assert sorted(z["libelle"] for z in reponse.json()) == ["Dakar", "Thiès"]


def test_toute_table_rattachee_a_un_pays_est_protegee():
    """Une nouvelle table métier sans politique RLS fait échouer ce test."""
    tables = {ParametrePays._meta.db_table, JournalChangement._meta.db_table}
    for modele in apps.get_models():
        if issubclass(modele, ModeleDePays) and not modele._meta.abstract:
            tables.add(modele._meta.db_table)
    lignes = executer(
        "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class "
        "WHERE relname = ANY(%s) AND relkind IN ('r', 'p')",
        [sorted(tables)],
    )
    etat = {nom: (actif and force) for nom, actif, force in lignes}
    assert set(etat) == tables
    assert [t for t, protege in etat.items() if not protege] == []

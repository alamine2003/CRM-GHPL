"""ORG-001 : cycle de vie des pays, et règles communes des modèles métier."""

from zoneinfo import available_timezones

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from apps.socle.catalogue_pays import CATALOGUE
from apps.socle.models import JournalChangement, ParametrePays, Pays
from apps.socle.services import (
    activer_pays,
    archiver_pays,
    creer_pays,
    definir_parametre,
    suspendre_pays,
)

pytestmark = pytest.mark.django_db


def test_catalogue_coherent():
    fuseaux = available_timezones()
    assert len(CATALOGUE) == 17
    for code, modele in CATALOGUE.items():
        assert code == modele.code and len(code) == 2
        assert modele.fuseau in fuseaux
        assert modele.langue in {"fr", "en"}
        assert len(modele.devise) == 3


def test_creer_pays_depuis_le_catalogue_au_statut_actif():
    pays = creer_pays("sn")
    assert pays.code == "SN"
    assert pays.nom == "Sénégal"
    assert pays.fuseau == "Africa/Dakar"
    assert pays.devise == "XOF"
    assert pays.statut == Pays.Statut.ACTIF
    assert pays.id.version == 7


def test_creer_pays_refuse_doublon_et_code_hors_catalogue():
    creer_pays("SN")
    with pytest.raises(ValidationError, match="existe déjà"):
        creer_pays("SN")
    with pytest.raises(ValidationError, match="catalogue"):
        creer_pays("FR")


def test_creer_pays_refuse_un_fuseau_invalide():
    with pytest.raises(ValidationError):
        creer_pays("TG", fuseau="Afrique/Lome")


@pytest.mark.parametrize(
    ("chemin", "final"),
    [
        ([suspendre_pays], Pays.Statut.SUSPENDU),
        ([suspendre_pays, activer_pays], Pays.Statut.ACTIF),
        ([archiver_pays], Pays.Statut.ARCHIVE),
        ([suspendre_pays, archiver_pays], Pays.Statut.ARCHIVE),
    ],
)
def test_transitions_autorisees(chemin, final):
    pays = creer_pays("SN")
    for etape in chemin:
        pays = etape(pays)
    assert pays.statut == final


def test_un_pays_archive_ne_change_plus_de_statut_et_reste_lisible():
    pays = archiver_pays(creer_pays("SN"))
    assert pays.archive_le is not None
    for etape in (activer_pays, suspendre_pays, archiver_pays):
        with pytest.raises(ValidationError, match="Transition interdite"):
            etape(pays)
    assert Pays.objects.get(code="SN").statut == Pays.Statut.ARCHIVE


def test_activer_un_pays_deja_actif_est_refuse():
    with pytest.raises(ValidationError):
        activer_pays(creer_pays("SN"))


def test_suppression_physique_interdite():
    pays = creer_pays("SN")
    with pytest.raises(TypeError, match="RG-005"):
        pays.delete()


def test_version_et_journal_des_changements():
    pays = creer_pays("SN")
    suspendre_pays(pays)
    pays.refresh_from_db()
    assert pays.version == 2
    lignes = list(
        JournalChangement.objects.filter(entite_id=pays.id).values_list(
            "pays_id", "entite", "version", "operation"
        )
    )
    assert lignes == [
        (pays.id, "socle.pays", 1, "creation"),
        (pays.id, "socle.pays", 2, "modification"),
    ]


def test_journal_croissant_et_rattache_au_pays_de_l_objet():
    sn, tg = creer_pays("SN"), creer_pays("TG")
    parametre = definir_parametre(tg, "distance_pointage_m", 300)
    derniere = JournalChangement.objects.order_by("-sequence").first()
    assert derniere.entite == "socle.parametrepays"
    assert derniere.entite_id == parametre.id
    assert derniere.pays_id == tg.id != sn.id
    sequences = list(JournalChangement.objects.values_list("sequence", flat=True))
    assert sequences == sorted(sequences)


def test_le_pays_d_un_objet_ne_change_jamais():
    sn, tg = creer_pays("SN"), creer_pays("TG")
    parametre = definir_parametre(sn, "distance_pointage_m", 300)
    parametre.pays = tg
    with pytest.raises(ValueError, match="RG-001"):
        parametre.save()
    assert ParametrePays.objects.get(pk=parametre.pk).pays_id == sn.id


def test_journal_partitionne_et_extensions_installees():
    with connection.cursor() as curseur:
        curseur.execute(
            "SELECT count(*) FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid "
            "WHERE c.relname = 'socle_journalchangement'"
        )
        assert curseur.fetchone()[0] == 1
        curseur.execute("SELECT extname FROM pg_extension")
        extensions = {ligne[0] for ligne in curseur.fetchall()}
    assert {"pg_trgm", "unaccent", "fuzzystrmatch"} <= extensions

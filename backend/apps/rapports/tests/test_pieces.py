"""0.5.5 : RPT-007, pièces jointes du rapport ; PDF seul depuis 0.5.7 (DC-48).

CA1 : 10 Mo au plus par fichier, 3 par rapport [H]. CA2 : une pièce jointe n'est accessible
qu'aux personnes qui voient le rapport. Téléversement différé : une pièce prise avant la
soumission peut arriver après, faute de réseau."""

import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.rapports.models import PieceJointe

from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"0" * 64


@pytest.fixture(autouse=True)
def fichiers(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def envoi(contenu=PDF, nom="fiche.pdf", prise_le="2026-10-13T09:45:00Z", ident=None):
    return {"id": str(ident or uuid.uuid4()), "prise_le": prise_le,
            "fichier": SimpleUploadedFile(nom, contenu,
                                          content_type="application/pdf")}  # fmt: skip


@freeze_time("2026-10-13 10:00")
def test_rpt007_joindre_relire_et_rejouer_sans_doublon(monde, effectuee):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    ident = uuid.uuid4()
    r = c.post(url(effectuee, "pieces/"), envoi(ident=ident), format="multipart")
    assert r.status_code == 201, r.content
    assert (r.json()["type_mime"], r.json()["taille"]) == ("application/pdf", len(PDF))
    # Rejouée depuis la file d'attente, la même pièce ne se crée pas deux fois.
    r = c.post(url(effectuee, "pieces/"), envoi(ident=ident), format="multipart")
    assert r.status_code == 201 and PieceJointe.objects.count() == 1
    assert [p["id"] for p in c.get(url(effectuee)).json()["pieces_jointes"]] == [str(ident)]
    lu = c.get(url(effectuee, f"pieces/{ident}/"))
    assert lu.status_code == 200 and b"".join(lu.streaming_content) == PDF
    assert lu["Cache-Control"] == "private, no-store"
    # 0.9.3 : ouvert dans un navigateur, le PDF ne peut rien exécuter.
    assert lu["Content-Security-Policy"].startswith("sandbox;")
    assert EvenementAudit.objects.filter(action="rapport.piece_jointe_ajout").count() == 1


@freeze_time("2026-10-13 10:00")
def test_rpt007_ca1_type_taille_et_nombre(monde, effectuee):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    # Le type se lit dans le contenu, pas dans le nom : un texte nommé .pdf est refusé ;
    # une photo aussi (DC-48 : PDF seul).
    for contenu, nom in ((b"bonjour", "faux.pdf"), (JPEG, "photo.jpg")):
        r = c.post(url(effectuee, "pieces/"), envoi(contenu, nom), format="multipart")
        assert (r.status_code, r.json()["code"]) == (400, "type_de_fichier")
    lourd = PDF + b"\x00" * (10 * 1024 * 1024)
    r = c.post(url(effectuee, "pieces/"), envoi(lourd), format="multipart")
    assert r.json()["code"] == "piece_trop_lourde"
    for contenu, nom in ((PDF, "a.pdf"), (PDF, "b.pdf"), (PDF, "c.pdf")):
        assert c.post(url(effectuee, "pieces/"), envoi(contenu, nom),
                      format="multipart").status_code == 201  # fmt: skip
    r = c.post(url(effectuee, "pieces/"), envoi(), format="multipart")
    assert (r.status_code, r.json()["code"]) == (400, "pieces_trop_nombreuses")


@freeze_time("2026-10-13 10:00")
def test_rpt007_ca2_seul_qui_voit_le_rapport_lit_la_piece(monde, effectuee):  # noqa: F811
    ident = uuid.uuid4()
    client_de(monde["deleg.sn"]).post(url(effectuee, "pieces/"), envoi(ident=ident),
                                      format="multipart")  # fmt: skip
    for compte in ("sup.sn", "admin.sn", "admin.tg"):
        r = client_de(monde[compte]).get(url(effectuee, f"pieces/{ident}/"))
        assert r.status_code in (403, 404), compte


@freeze_time("2026-10-13 10:00")
def test_rpt007_retrait_et_televersement_differe(monde, effectuee, portefeuille):  # noqa: F811
    c = client_de(monde["deleg.sn"])
    premiere = uuid.uuid4()
    c.post(url(effectuee, "pieces/"), envoi(ident=premiere), format="multipart")
    assert c.delete(url(effectuee, f"pieces/{premiere}/")).status_code == 204
    # RG-005 : retirée, elle reste archivée et disparaît du rapport.
    assert PieceJointe.objects.get().archive_le is not None
    assert c.get(url(effectuee)).json()["pieces_jointes"] == []
    c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
    c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:59:00Z"}, format="json")
    # Prise à 9 h 50, avant la soumission, arrivée ensuite : elle rejoint le rapport.
    r = c.post(url(effectuee, "pieces/"), envoi(prise_le="2026-10-13T09:50:00Z"),
               format="multipart")  # fmt: skip
    assert r.status_code == 201
    # Prise après la soumission : le rapport ne se modifie plus.
    r = c.post(url(effectuee, "pieces/"), envoi(prise_le="2026-10-13T10:00:00Z"),
               format="multipart")  # fmt: skip
    assert (r.status_code, r.json()["code"]) == (409, "rapport_non_modifiable")
    piece = PieceJointe.objects.get(archive_le__isnull=True)
    r = c.delete(url(effectuee, f"pieces/{piece.pk}/"))
    assert (r.status_code, r.json()["code"]) == (409, "rapport_non_modifiable")

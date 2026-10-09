# ruff: noqa: F811 — les fixtures importées sont redéfinies en paramètres.
"""0.8.7 : OFF-005, téléversement différé des pièces jointes. Le téléphone annonce le document
(nom, taille) ; le rapport part sans attendre le fichier et montre « pièce en attente » (CA1) ;
le fichier arrive plus tard, même après la soumission ou la validation."""

import uuid

import pytest
from freezegun import freeze_time

from apps.audit.models import EvenementAudit
from apps.perimetre.tests.conftest import client_de
from apps.rapports import validation
from apps.rapports.models import PieceJointe, Rapport

from .test_pieces import PDF, envoi, fichiers  # noqa: F401
from .test_rapport import complet, effectuee, portefeuille, type_action, url  # noqa: F401

pytestmark = pytest.mark.django_db


def annonce(ident, nom="etude.pdf", taille=2_400_000, prise_le="2026-10-13T09:45:00Z"):
    return {"id": str(ident), "nom": nom, "taille": taille, "prise_le": prise_le}


@freeze_time("2026-10-13 10:00")
def test_off005_ca1_le_rapport_part_sans_sa_piece_qui_reste_en_attente(
    monde, effectuee, portefeuille
):
    c = client_de(monde["deleg.sn"])
    ident = uuid.uuid4()
    r = c.post(url(effectuee, "pieces/annonce/"), annonce(ident), format="json")
    assert r.status_code == 201, r.content
    assert r.json()["en_attente"] is True and r.json()["nom"] == "etude.pdf"
    # Rejouée, l'annonce ne crée rien de plus.
    assert c.post(url(effectuee, "pieces/annonce/"), annonce(ident),
                  format="json").status_code == 201  # fmt: skip
    assert PieceJointe.objects.count() == 1
    # Le rapport est complété et soumis sans attendre le fichier.
    c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
    soumis = c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:55:00Z"},
                    format="json")  # fmt: skip
    assert soumis.status_code == 200, soumis.content
    (piece,) = soumis.json()["pieces_jointes"]
    assert piece["en_attente"] is True
    # Le superviseur voit « pièce en attente » ; le document ne s'ouvre pas encore.
    sup = client_de(monde["sup.sn"])
    lu = sup.get(f"/api/v1/rapports/pieces/{ident}/")
    assert lu.status_code == 409 and lu.json()["code"] == "piece_en_attente"


@freeze_time("2026-10-13 10:00")
def test_off005_le_fichier_arrive_apres_la_validation(monde, effectuee, portefeuille):
    c = client_de(monde["deleg.sn"])
    ident = uuid.uuid4()
    c.post(url(effectuee, "pieces/annonce/"), annonce(ident), format="json")
    c.put(url(effectuee), complet(monde, portefeuille[:1]), format="json")
    c.post(url(effectuee, "soumettre/"), {"soumis_le": "2026-10-13T09:55:00Z"}, format="json")
    validation.valider_rapport(Rapport.objects.get(), monde["sup.sn"])
    r = c.post(url(effectuee, "pieces/"), envoi(ident=ident, nom="etude.pdf"),
               format="multipart")  # fmt: skip
    assert r.status_code == 201, r.content
    assert r.json()["en_attente"] is False and r.json()["taille"] == len(PDF)
    lu = client_de(monde["sup.sn"]).get(f"/api/v1/rapports/pieces/{ident}/")
    assert lu.status_code == 200 and b"".join(lu.streaming_content) == PDF
    assert EvenementAudit.objects.filter(action="rapport.piece_jointe_recue").count() == 1
    # Rejoué, l'envoi du fichier ne change plus rien.
    assert c.post(url(effectuee, "pieces/"), envoi(ident=ident),
                  format="multipart").status_code == 201  # fmt: skip
    assert EvenementAudit.objects.filter(action="rapport.piece_jointe_recue").count() == 1


@freeze_time("2026-10-13 10:00")
def test_off005_l_annonce_suit_les_regles_des_pieces(monde, effectuee):
    c = client_de(monde["deleg.sn"])
    trop = c.post(url(effectuee, "pieces/annonce/"),
                  annonce(uuid.uuid4(), taille=11 * 1024 * 1024), format="json")  # fmt: skip
    assert trop.json()["code"] == "piece_trop_lourde"
    photo = c.post(url(effectuee, "pieces/annonce/"), annonce(uuid.uuid4(), nom="photo.jpg"),
                   format="json")  # fmt: skip
    assert photo.json()["code"] == "type_de_fichier"
    for _ in range(3):
        c.post(url(effectuee, "pieces/annonce/"), annonce(uuid.uuid4()), format="json")
    quatrieme = c.post(url(effectuee, "pieces/annonce/"), annonce(uuid.uuid4()), format="json")
    assert quatrieme.json()["code"] == "pieces_trop_nombreuses"
    # Le contenu reste contrôlé à l'arrivée : un faux PDF annoncé est refusé.
    ident = PieceJointe.objects.first().pk
    faux = c.post(url(effectuee, "pieces/"), envoi(b"bonjour", ident=ident), format="multipart")
    assert faux.json()["code"] == "type_de_fichier"

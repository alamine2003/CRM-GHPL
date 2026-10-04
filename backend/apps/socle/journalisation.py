"""Journaux techniques structurés (architecture §16.3, NFR-013).

- Une ligne JSON par événement : horodatage, niveau, message, référence de requête,
  utilisateur **pseudonymisé**, pays, et les champs propres à l'événement.
- Aucune donnée personnelle en clair : l'utilisateur est une empreinte HMAC courte,
  stable pour suivre une session, impossible à relier à une personne sans la clé.
- La référence de requête (en-tête X-Request-Id) relie le message vu par l'utilisateur,
  le journal du serveur et le suivi des erreurs.
"""

import contextvars
import hashlib
import hmac
import json
import logging
import re
import time
import uuid
from datetime import UTC, datetime

from django.conf import settings

reference = contextvars.ContextVar("reference", default=None)
utilisateur = contextvars.ContextVar("utilisateur", default=None)
pays = contextvars.ContextVar("pays", default=None)
#: Contexte de la requête pour l'audit (AUD-001 CA1) : acteur, rôles, adresse, appareil.
audit = contextvars.ContextVar("audit", default=None)

REFERENCE_VALIDE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
journal = logging.getLogger("innov.requetes")


def pseudonyme(identifiant) -> str:
    """Empreinte courte et stable d'un utilisateur, sans donnée personnelle."""
    cle = settings.SECRET_KEY.encode()
    return hmac.new(cle, str(identifiant).encode(), hashlib.sha256).hexdigest()[:12]


class FormatJSON(logging.Formatter):
    CHAMPS_STANDARD = set(vars(logging.makeLogRecord({})))

    def format(self, enregistrement: logging.LogRecord) -> str:
        donnees = {
            "le": datetime.fromtimestamp(enregistrement.created, UTC).isoformat(),
            "niveau": enregistrement.levelname,
            "journal": enregistrement.name,
            "message": enregistrement.getMessage(),
            "reference": reference.get(),
            "utilisateur": utilisateur.get(),
            "pays": pays.get(),
        }
        for cle, valeur in vars(enregistrement).items():
            if cle not in self.CHAMPS_STANDARD and not cle.startswith("_"):
                donnees[cle] = valeur
        if enregistrement.exc_info:
            donnees["exception"] = self.formatException(enregistrement.exc_info)
        return json.dumps(
            {k: v for k, v in donnees.items() if v is not None}, ensure_ascii=False, default=str
        )


class ReferenceRequete:
    """Attribue une référence à chaque requête, la renvoie (X-Request-Id) et journalise
    la requête avec sa durée et son statut."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        recue = request.headers.get("X-Request-Id", "")
        valeur = recue if REFERENCE_VALIDE.match(recue) else uuid.uuid4().hex
        jetons = [
            reference.set(valeur),
            utilisateur.set(None),
            pays.set(None),
            audit.set(
                {
                    "adresse_ip": request.META.get("REMOTE_ADDR"),
                    "agent": request.headers.get("User-Agent", "")[:200],
                }
            ),
        ]
        request.reference = valeur
        debut = time.perf_counter()
        try:
            reponse = self.get_response(request)
            reponse["X-Request-Id"] = valeur
            if request.path.startswith("/api/") and request.path != "/api/health/":
                niveau = logging.WARNING if reponse.status_code >= 500 else logging.INFO
                journal.log(
                    niveau,
                    "requete",
                    extra={
                        "methode": request.method,
                        "chemin": request.path,
                        "statut": reponse.status_code,
                        "duree_ms": round((time.perf_counter() - debut) * 1000, 1),
                    },
                )
            return reponse
        finally:
            for variable, jeton in zip((reference, utilisateur, pays, audit), jetons, strict=True):
                variable.reset(jeton)

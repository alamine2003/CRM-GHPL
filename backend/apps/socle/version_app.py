"""Version minimale de l'application mobile (0.9.6, architecture §14.8).

Le téléphone envoie sa version dans `X-Version-App`. Quand une livraison change le protocole
(une route, un format), l'exploitation relève `INNOV_VERSION_MIN_APP` : une application plus
ancienne reçoit `426` avec la version minimale, propose la mise à jour et garde ses données
locales en lecture (docs/mise-a-jour.md). Le portail, toujours à jour, n'envoie pas l'en-tête ;
la sonde `/api/health/` n'est jamais refusée.
"""

import re

from django.conf import settings
from django.http import JsonResponse
from django.utils.translation import gettext as _

from . import journalisation


def numeros(version: str) -> tuple[int, ...] | None:
    """« 0.9.6 » → (0, 9, 6) ; None si la version n'est pas lisible."""
    if not re.fullmatch(r"\d+(\.\d+){0,3}", version or ""):
        return None
    return tuple(int(x) for x in version.split("."))


class VersionMinimaleApp:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        minimale = getattr(settings, "VERSION_MIN_APP", "") or ""
        version = request.headers.get("X-Version-App")
        if (
            minimale
            and version
            and request.path.startswith("/api/")
            and request.path != "/api/health/"
            and (numeros(version) or (0,)) < (numeros(minimale) or (0,))
        ):
            return JsonResponse(
                {
                    "code": "mise_a_jour_requise",
                    "message": _(
                        "Cette version de l'application n'est plus acceptée : mettez-la à "
                        "jour. Vos données restent sur le téléphone."
                    ),
                    "details": {"version_minimale": minimale, "version": version},
                    "reference": journalisation.reference.get(),
                },
                status=426,
            )
        return self.get_response(request)

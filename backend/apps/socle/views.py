from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils.translation import get_language
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import InformationsSerializer


def sante(_request):
    """Sonde de disponibilité et de déploiement (architecture §19)."""
    try:
        with connection.cursor() as curseur:
            curseur.execute("SELECT 1")
        base = "ok"
    except Exception:  # noqa: BLE001 — la sonde rend compte, elle ne lève pas
        base = "indisponible"
    statut = 200 if base == "ok" else 503
    return JsonResponse(
        {
            "statut": "ok" if statut == 200 else "degrade",
            "version": settings.INNOV_VERSION,
            "environnement": settings.ENVIRONNEMENT,
            "base": base,
        },
        status=statut,
    )


class InformationsView(APIView):
    """Informations publiques affichées sur le premier écran des clients."""

    permission_classes = [AllowAny]

    @extend_schema(responses=InformationsSerializer, operation_id="informations")
    def get(self, request):
        donnees = {
            "produit": "INNOV CRM",
            "version": settings.INNOV_VERSION,
            "environnement": settings.ENVIRONNEMENT,
            "langue": get_language(),
            "message": _("Bienvenue dans INNOV CRM."),
            "langues": [{"code": code, "libelle": str(nom)} for code, nom in settings.LANGUAGES],
        }
        return Response(InformationsSerializer(donnees).data)

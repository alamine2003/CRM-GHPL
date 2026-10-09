"""OFF-006 : réponses de l'API compressées (gzip) pour le réseau faible du terrain.

Seules les réponses JSON se compressent : les PDF le sont déjà. Les routes `/auth/` ne le
sont jamais : elles portent des jetons, et compresser un secret à côté d'un texte choisi par
le client ouvre la porte à l'attaque BREACH. Le reste de l'API ne renvoie aucun secret.
"""

from django.middleware.gzip import GZipMiddleware


class CompressionApi(GZipMiddleware):
    def process_response(self, request, response):
        if "/auth/" in request.path:
            return response
        if not response.get("Content-Type", "").startswith("application/json"):
            return response
        return super().process_response(request, response)

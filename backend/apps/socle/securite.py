"""En-têtes de sécurité de l'API (0.9.3, revue de sécurité, docs/revue-securite.md).

L'API ne sert que du JSON et des fichiers : aucune page, aucun script. Une politique de
contenu fermée (rien à charger, rien à encadrer) ne gêne donc rien et désarme toute réponse
qu'un navigateur prendrait pour une page. Les capteurs du navigateur (position, caméra,
micro) ne servent jamais depuis une réponse de l'API.
"""

POLITIQUE_CONTENU = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
POLITIQUE_CAPTEURS = "geolocation=(), camera=(), microphone=(), payment=(), usb=()"


class EntetesSecurite:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        reponse = self.get_response(request)
        reponse.headers.setdefault("Content-Security-Policy", POLITIQUE_CONTENU)
        reponse.headers.setdefault("Permissions-Policy", POLITIQUE_CAPTEURS)
        return reponse

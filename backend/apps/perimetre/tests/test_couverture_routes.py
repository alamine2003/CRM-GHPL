"""Architecture §12, couche 1 : toute route métier passe par le périmètre.

Le test échoue si une vue d'API n'hérite pas de VuePerimetre, sauf les points
d'accès publics ou personnels listés explicitement ci-dessous.
"""

from django.urls import URLPattern, URLResolver, get_resolver

from apps.perimetre.vues import VuePerimetre

# Points d'accès sans données métier d'un pays : connexion, profil, santé, schéma.
EXCEPTIONS = {
    "sante", "informations", "schema", "connexion", "rafraichir", "deconnexion", "moi",
    "mot-de-passe-oubli", "mot-de-passe-reinitialisation", "mot-de-passe-changement",
    "perimetre", "mon-organisation", "erreurs-clients", "connexion-code", "double-auth",
    "double-auth-initialiser", "double-auth-activer", "double-auth-codes-secours",
    "double-auth-desactiver", "sessions", "sessions-revoquer-autres", "session-revoquer",
    "mon-activite",
}  # fmt: skip


def _routes(motifs, prefixe=""):
    for motif in motifs:
        if isinstance(motif, URLResolver):
            yield from _routes(motif.url_patterns, prefixe + str(motif.pattern))
        elif isinstance(motif, URLPattern):
            yield prefixe + str(motif.pattern), motif


def test_toute_route_metier_herite_de_vue_perimetre():
    manquantes = []
    for chemin, motif in _routes(get_resolver().url_patterns):
        if not chemin.startswith("api/") or motif.name in EXCEPTIONS:
            continue
        vue = getattr(motif.callback, "view_class", None)
        if vue is None or not issubclass(vue, VuePerimetre):
            manquantes.append(chemin)
    assert manquantes == [], f"Routes métier hors périmètre : {manquantes}"


def test_chaque_vue_metier_declare_ses_actions():
    for _chemin, motif in _routes(get_resolver().url_patterns):
        vue = getattr(motif.callback, "view_class", None)
        if vue is not None and issubclass(vue, VuePerimetre):
            assert vue.actions, f"{vue.__name__} ne déclare aucune action"

"""OFF-006 CA1 : ce que pèse la synchronisation quotidienne d'un délégué.

Rejoue, côté serveur, les lectures que fait le téléphone en une passe (`mobile/src/synchro.ts`) :
programme, semaine en cours et suivante, détail de chaque visite, liste cible, historique,
rapports à écrire, visites proposées, « Mes chiffres ». Chaque réponse est compressée comme le
fait l'API (`compression.py`). Les pièces jointes n'en font pas partie : elles partent à part
(OFF-005). Tout se passe dans une transaction annulée : la session de mesure ne reste pas.
"""

import json
import secrets

from django.db import transaction
from django.urls import resolve
from django.utils import timezone
from django.utils.text import compress_string
from rest_framework.test import APIRequestFactory

#: Seuil de l'exigence OFF-006 CA1 [H] : moins de 500 Ko, hors pièces jointes.
SEUIL_OCTETS = 500 * 1024


class _Annulee(Exception):
    pass


def _lire(fabrique, entetes, chemin) -> tuple[bytes, dict | list | None]:
    vue = resolve(chemin.split("?")[0])
    requete = fabrique.get(chemin, **entetes)
    reponse = vue.func(requete, *vue.args, **vue.kwargs)
    reponse.render()
    if reponse.status_code != 200:
        return b"", None
    return reponse.content, json.loads(reponse.content)


def mesurer(utilisateur) -> dict:
    """`{"appels", "brut", "compresse", "routes": {route: [appels, brut, compressé]}}`."""
    from apps.identite.models import Session
    from apps.identite.services import _jeton_acces, duree_session

    resultat: dict = {"appels": 0, "brut": 0, "compresse": 0, "routes": {}}
    try:
        with transaction.atomic():
            session = Session.objects.create(
                utilisateur=utilisateur, client=Session.Client.MOBILE,
                empreinte_rafraichissement=secrets.token_hex(32),
                expire_le=timezone.now() + duree_session("mobile"), double_auth_validee=True,
            )  # fmt: skip
            acces, _ = _jeton_acces(session)
            entetes = {"HTTP_AUTHORIZATION": f"Bearer {acces}"}
            fabrique = APIRequestFactory()

            def lire(route: str, chemin: str):
                contenu, donnees = _lire(fabrique, entetes, chemin)
                compresse = len(compress_string(contenu)) if contenu else 0
                ligne = resultat["routes"].setdefault(route, [0, 0, 0])
                for i, n in enumerate((1, len(contenu), compresse)):
                    ligne[i] += n
                resultat["appels"] += 1
                resultat["brut"] += len(contenu)
                resultat["compresse"] += compresse
                return donnees

            programme = lire("programme", "/api/v1/programme/") or {}
            courante = lire("semaine", "/api/v1/plannings/semaine/") or {}
            suivante = (
                lire("semaine", f"/api/v1/plannings/semaine/?semaine={courante['suivante']}")
                if courante.get("suivante") else {}
            ) or {}  # fmt: skip
            visites = {v["id"] for j in programme.get("jours", []) for v in j["visites"]}
            for semaine in (courante, suivante):
                visites |= {v["id"] for v in semaine.get("visites", [])}
            for ident in sorted(visites):
                lire("detail_visite", f"/api/v1/visites/{ident}/detail/")
            lire("liste_cible", "/api/v1/ciblage/moi/")
            lire("historique", "/api/v1/synchro/historique/")
            lire("rapports", "/api/v1/synchro/rapports/")
            lire("visites_proposees", "/api/v1/rapports/visites-proposees/")
            lire("mes_chiffres", "/api/v1/pilotage/mes-chiffres/")
            raise _Annulee
    except _Annulee:
        pass
    return resultat

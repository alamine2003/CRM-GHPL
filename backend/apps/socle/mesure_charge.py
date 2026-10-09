"""NFR-002, DC-56 (0.9.4) : temps de réponse côté serveur des écrans courants.

Rejoue, dans le processus, les lectures des écrans de chaque rôle pour un échantillon de
comptes, et donne par route le 50e et le 95e centile, le pire temps et le nombre de requêtes
SQL. La cible du PRD : 500 ms au 95e centile côté serveur. Le réseau, le rendu du portail
et le téléphone s'y ajoutent ; ils se mesurent sur l'hébergement (docs/charge.md).
Tout se passe dans une transaction annulée : les sessions de mesure ne restent pas.
"""

import secrets
import statistics
import time

from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIRequestFactory

SEUIL_MS = 500
#: Un calcul d'avance (worker) doit finir bien avant le suivant, 4 minutes plus tard.
AVANCE_S = 60


class _Annulee(Exception):
    pass


def _centile(valeurs: list[float], rang: float) -> float:
    if len(valeurs) == 1:
        return valeurs[0]
    return statistics.quantiles(valeurs, n=100, method="inclusive")[int(rang) - 1]


def _routes_du_role(role: str, compte, pays) -> list[tuple[str, str]]:
    from apps.planning.models import Visite

    if role == "delegue":
        visite = (Visite.objects.filter(planning__delegue=compte, archive_le__isnull=True)
                  .order_by("-date").first())  # fmt: skip
        routes = [("programme", "/api/v1/programme/"), ("semaine", "/api/v1/plannings/semaine/"),
                  ("liste_cible", "/api/v1/ciblage/moi/"),
                  ("synchro_rapports", "/api/v1/synchro/rapports/"),
                  ("synchro_historique", "/api/v1/synchro/historique/"),
                  ("mes_chiffres", "/api/v1/pilotage/mes-chiffres/"),
                  ("notifications", "/api/v1/notifications/")]  # fmt: skip
        if visite:
            routes.append(("detail_visite", f"/api/v1/visites/{visite.pk}/detail/"))
        return routes
    if role == "superviseur":
        return [("a_traiter", "/api/v1/rapports/a-traiter/"),
                ("plannings_a_valider", "/api/v1/plannings/a-valider/"),
                ("retards", "/api/v1/rapports/retards/"),
                ("pilotage_equipe", "/api/v1/pilotage/equipe/")]  # fmt: skip
    if role == "responsable_pays":
        # Le tableau du pays et sa prescription à l'ouverture (la semaine) : calculés d'avance
        # par le worker (apps.pilotage.tableaux), comme en production.
        return [("pilotage_pays", "/api/v1/pilotage/equipe/"),
                ("prospects", "/api/v1/prospects/?portee=pays"),
                ("etablissements", "/api/v1/etablissements/?portee=pays"),
                ("prescription", "/api/v1/pilotage/prescription/")]  # fmt: skip
    if role == "direction_siege":
        return [("pilotage_siege", "/api/v1/pilotage/siege/")]
    if role == "admin_pays":
        return [("audit", "/api/v1/audit/"), ("utilisateurs", "/api/v1/utilisateurs/"),
                ("organisation", "/api/v1/organisation/postes/")]  # fmt: skip
    return []


def mesurer(pays, par_role: int = 5, repetitions: int = 3, avance: dict | None = None) -> dict:
    """`{route: {"n", "p50", "p95", "max", "requetes"}}` en millisecondes. Les tableaux du
    pays entier et du siège sont d'abord calculés d'avance, comme le fait le worker ; la durée
    de ces calculs, en secondes, va dans `avance` (DSH-011 : sous 4 minutes)."""
    from apps.identite.models import RoleUtilisateur, Session
    from apps.identite.services import _jeton_acces, duree_session
    from apps.pilotage import tableaux

    temps: dict[str, list[float]] = {}
    requetes: dict[str, int] = {}
    fabrique = APIRequestFactory()
    try:
        with transaction.atomic():
            durees = tableaux.prechauffer()
            if avance is not None:
                avance.update(durees)
            for role in ("delegue", "superviseur", "responsable_pays", "admin_pays",
                         "direction_siege"):  # fmt: skip
                du_pays = {"pays__isnull": True} if role == "direction_siege" else {"pays": pays}
                comptes = [r.utilisateur for r in RoleUtilisateur.objects.filter(
                    role=role, fin__isnull=True, **du_pays).select_related("utilisateur")
                    .order_by("utilisateur__username")[:par_role]]  # fmt: skip
                for compte in comptes:
                    session = Session.objects.create(
                        utilisateur=compte, client=Session.Client.PORTAIL,
                        empreinte_rafraichissement=secrets.token_hex(32),
                        expire_le=timezone.now() + duree_session("portail"),
                        double_auth_validee=True,
                    )  # fmt: skip
                    acces, _ = _jeton_acces(session)
                    entetes = {"HTTP_AUTHORIZATION": f"Bearer {acces}"}
                    for nom, chemin in _routes_du_role(role, compte, pays):
                        vue = resolve(chemin.split("?")[0])
                        for _ in range(repetitions):
                            requete = fabrique.get(chemin, **entetes)
                            connection.queries_log.clear()
                            with CaptureQueriesContext(connection) as capture:
                                debut = time.perf_counter()
                                reponse = vue.func(requete, *vue.args, **vue.kwargs)
                                reponse.render()
                                ecoule = (time.perf_counter() - debut) * 1000
                            if reponse.status_code != 200:
                                continue
                            temps.setdefault(nom, []).append(ecoule)
                            requetes[nom] = max(requetes.get(nom, 0), len(capture))
            raise _Annulee
    except _Annulee:
        pass
    return {
        nom: {"n": len(v), "p50": round(_centile(v, 50)), "p95": round(_centile(v, 95)),
              "max": round(max(v)), "requetes": requetes[nom]}
        for nom, v in sorted(temps.items())
    }  # fmt: skip

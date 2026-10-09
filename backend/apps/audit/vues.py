"""AUD-002 : consultation du journal d'audit (0.9.2).

Le siège lit tout le journal, ou celui du pays qu'il a choisi ; le responsable et
l'administrateur pays ne lisent que les événements de leur pays (CA1) : ni ceux d'un autre
pays, ni ceux du siège sans pays. Filtres : famille ou action exacte, personne, objet,
résultat, dates (dans le fuseau du pays). Les adresses IP sont masquées comme dans
« Activité du compte » ; les détails n'ont jamais contenu de secret (AUD-001).
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.prospects.recherche import paginer
from apps.socle.erreurs import ErreurMetier

from . import serializers as s
from .models import EvenementAudit


def _date(valeur: str | None, champ: str) -> date | None:
    if not valeur:
        return None
    try:
        return date.fromisoformat(valeur)
    except ValueError:
        raise ErreurMetier("date_invalide", _("Date invalide."), champ=champ) from None


def _masque(adresse: str | None) -> str | None:
    from apps.identite.serializers import SessionSerializer

    return SessionSerializer().get_adresse(type("S", (), {"adresse_ip": adresse}))


class JournalAuditVue(VuePerimetre):
    actions = {"GET": Action.AUDIT_LIRE}

    def selection(self, perimetre):
        qs = EvenementAudit.objects.select_related("acteur", "pays")
        if perimetre.vue_consolidee:
            return qs
        if perimetre.pays_actif is None:
            return qs.none()
        return qs.filter(pays=perimetre.pays_actif)

    @extend_schema(
        parameters=[
            OpenApiParameter("famille", str, required=False, description="rapport, planning…"),
            OpenApiParameter("action", str, required=False),
            OpenApiParameter("q", str, required=False, description="Identifiant de la personne"),
            OpenApiParameter("objet", str, required=False, description="Identifiant d'objet"),
            OpenApiParameter("resultat", enum=["succes", "echec"], required=False),
            OpenApiParameter("du", str, required=False),
            OpenApiParameter("au", str, required=False),
            OpenApiParameter("page", int, required=False),
            OpenApiParameter("taille", int, required=False),
        ],
        responses=s.JournalSerializer,
        operation_id="audit_journal",
    )
    def get(self, request):
        p = request.query_params
        portee = self.get_queryset()
        qs = portee
        if p.get("famille"):
            qs = qs.filter(action__startswith=f"{p['famille']}.")
        if p.get("action"):
            qs = qs.filter(action=p["action"])
        if p.get("q"):
            qs = qs.filter(acteur_identifiant__icontains=p["q"].strip())
        if p.get("objet"):
            qs = qs.filter(objet_id=p["objet"].strip())
        if p.get("resultat") in EvenementAudit.Resultat.values:
            qs = qs.filter(resultat=p["resultat"])
        fuseau = ZoneInfo(self.perimetre.pays_actif.fuseau if self.perimetre.pays_actif else "UTC")
        du, au = _date(p.get("du"), "du"), _date(p.get("au"), "au")
        if du and au and du > au:
            raise ErreurMetier("dates_invalides", _("La date de début suit la date de fin."),
                               champ="du")  # fmt: skip
        if du:
            qs = qs.filter(le__gte=datetime.combine(du, time.min, tzinfo=fuseau))
        if au:
            qs = qs.filter(le__lt=datetime.combine(au + timedelta(days=1), time.min,
                                                   tzinfo=fuseau))  # fmt: skip
        evenements, pagination = paginer(qs.order_by("-le"), p)
        noms = portee.order_by().values_list("action", flat=True).distinct()
        familles = sorted({a.split(".")[0] for a in noms})
        lignes = [
            {
                "id": e.id, "le": e.le, "action": e.action, "famille": e.action.split(".")[0],
                "resultat": e.resultat, "acteur": e.acteur_identifiant,
                "acteur_nom": e.acteur.get_full_name() if e.acteur else "",
                "roles": e.roles or [], "pays": e.pays.code if e.pays else None,
                "objet_type": e.objet_type, "objet_id": e.objet_id, "details": e.details or {},
                "client": e.contexte.get("client"),
                "adresse": _masque(e.contexte.get("adresse_ip")),
                "reference": e.contexte.get("reference"),
            }
            for e in evenements
        ]  # fmt: skip
        return Response(
            s.JournalSerializer({**pagination, "familles": familles, "resultats": lignes}).data
        )

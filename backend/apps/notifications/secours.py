"""NOT-004 (0.8.6) : le secours par courriel d'une décision en attente depuis plus de 48 heures.

Une demande qui attend une décision (planning, réouverture, rapports à valider, escalade) et
dont la notification n'est toujours pas lue après 48 heures déclenche un seul courriel à la
personne qui doit décider : le nombre de demandes, un lien, aucun nom ni détail. Chaque
notification n'y entre qu'une fois.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from django.db import transaction

from .models import Notification
from .models import TypeNotification as T

DELAI = timedelta(hours=48)
DECISIONS = (
    T.PLANNING_SOUMIS, T.REOUVERTURE_DEMANDEE, T.ESCALADE, T.PLANNINGS_NON_APPROUVES,
    T.RAPPORTS_SOUMIS, T.RAPPORT_CORRIGE, T.JOURNEE_ESCALADEE,
)  # fmt: skip


def courriels(pays, maintenant: datetime) -> int:
    """Rend le nombre de courriels de secours envoyés pour le pays."""
    from apps.identite import courriels as c

    attente = Notification.objects.filter(
        pays=pays, type__in=DECISIONS, lue_le__isnull=True, archive_le__isnull=True,
        secours_le__isnull=True, en_attente_depuis__lte=maintenant - DELAI,
    ).select_related("destinataire")  # fmt: skip
    par_personne: dict = defaultdict(list)
    for n in attente:
        par_personne[n.destinataire].append(n)
    for personne, liste in par_personne.items():
        nombre = sum(int(n.donnees.get("nombre", 1)) for n in liste)
        Notification.objects.filter(pk__in=[n.pk for n in liste]).update(secours_le=maintenant)
        transaction.on_commit(lambda p=personne, n=nombre: c.courriel_secours(p, n))
    return len(par_personne)

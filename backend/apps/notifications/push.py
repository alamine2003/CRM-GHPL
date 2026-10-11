"""Notifications push (NOT-002, NOT-003, 0.8.5).

Chaque notification du centre est due en push dès sa création (`push_du`). Toutes les 5 minutes,
la tâche périodique regroupe les dus par destinataire et par type :

- elle attend que le premier événement du groupe ait 10 minutes, pour qu'une rafale (20 rapports
  soumis en 10 minutes) parte en une seule notification « 20 rapports à valider » (NOT-003 CA1) ;
- elle n'envoie pas plus d'un push par type et par heure à une personne ; les suivants attendent
  et partent ensemble, une heure après le précédent.

Le texte affiché, même sur l'écran verrouillé, ne contient ni nom ni donnée de santé (NOT-002 CA2) :
une phrase par type, dans la langue de la personne. Les données jointes ne portent que des
identifiants et des dates, pour ouvrir l'objet au toucher (CA1).
"""

import json
import logging
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone, translation
from django.utils.translation import ngettext

from apps.identite.models import Appareil
from apps.socle.models import Pays

from .models import Notification
from .preferences import push_coupe

journal = logging.getLogger(__name__)

#: Une rafale se regroupe pendant ce délai avant le premier envoi.
FENETRE = timedelta(minutes=10)
#: Au plus un push par type et par personne dans cet intervalle.
INTERVALLE = timedelta(hours=1)
#: Ce que le téléphone peut recevoir pour ouvrir l'objet : jamais un nom, jamais un texte libre.
CLES_DONNEES = ("semaine", "planning", "visite", "date", "debut", "fin", "numero_semaine")
TITRE = "INNOV CRM"


def texte(type: str, n: int) -> str:
    """La phrase de l'écran verrouillé : sans nom ni donnée de santé (NOT-002 CA2)."""
    phrases = {
        "planning_soumis": ngettext(
            "Un planning attend votre décision.", "%(n)d plannings attendent votre décision.", n
        ),
        "planning_approuve": ngettext(
            "Votre planning est approuvé.", "%(n)d plannings approuvés.", n
        ),
        "revision_demandee": ngettext(
            "Une révision de votre planning est demandée.",
            "%(n)d révisions de planning sont demandées.",
            n,
        ),
        "remplacement_attribue": ngettext(
            "Un remplacement vous est attribué.", "%(n)d remplacements vous sont attribués.", n
        ),
        "rappel_planning": ngettext(
            "Pensez à soumettre votre planning.", "Pensez à soumettre vos %(n)d plannings.", n
        ),
        "escalade": ngettext(
            "Un planning en attente vous est remonté.",
            "%(n)d plannings en attente vous sont remontés.",
            n,
        ),
        "plannings_non_approuves": ngettext(
            "Des plannings ne sont pas encore approuvés.",
            "Des plannings ne sont pas encore approuvés (%(n)d alertes).",
            n,
        ),
        "reouverture_demandee": ngettext(
            "Une réouverture de semaine est demandée.",
            "%(n)d réouvertures de semaine sont demandées.",
            n,
        ),
        "redaction_rouverte": ngettext(
            "La rédaction de votre semaine est rouverte.",
            "La rédaction de %(n)d semaines est rouverte.",
            n,
        ),
        "correction_demandee": ngettext(
            "Une correction de rapport est demandée.",
            "%(n)d corrections de rapport sont demandées.",
            n,
        ),
        "rapport_corrige": ngettext(
            "Un rapport corrigé attend votre décision.",
            "%(n)d rapports corrigés attendent votre décision.",
            n,
        ),
        "rapport_rouvert": ngettext(
            "Un de vos rapports validés est rouvert.", "%(n)d de vos rapports sont rouverts.", n
        ),
        "rapport_en_retard": ngettext(
            "Un rapport est en retard.", "%(n)d rapports sont en retard.", n
        ),
        "rapports_soumis": ngettext("%(n)d rapport à valider.", "%(n)d rapports à valider.", n),
        "rapports_valides": ngettext("%(n)d rapport validé.", "%(n)d rapports validés.", n),
        "rappel_rapport": ngettext(
            "Pensez à soumettre votre rapport de visite.",
            "Pensez à soumettre vos %(n)d rapports de visite.",
            n,
        ),
        "journee_escaladee": ngettext(
            "Une journée de rapports vous est remontée.",
            "%(n)d journées de rapports vous sont remontées.",
            n,
        ),
    }
    return phrases.get(type, ngettext("Une nouvelle notification.", "%(n)d notifications.", n)) % {
        "n": n
    }


def transport(messages: list[dict]) -> list[dict]:
    """Envoie les messages au service push d'Expo ; rend ses accusés, un par message."""
    entetes = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings.PUSH_EXPO_JETON:
        entetes["Authorization"] = f"Bearer {settings.PUSH_EXPO_JETON}"
    requete = urllib.request.Request(  # noqa: S310 — adresse fixée par la configuration
        settings.PUSH_EXPO_URL, data=json.dumps(messages).encode(), headers=entetes, method="POST"
    )
    with urllib.request.urlopen(requete, timeout=15) as reponse:  # noqa: S310
        return json.loads(reponse.read()).get("data", [])


def _jetons(destinataire_id) -> list[Appareil]:
    return list(
        Appareil.objects.filter(utilisateur_id=destinataire_id, revoque_le__isnull=True).exclude(
            jeton_push=""
        )
    )


def _message(appareil: Appareil, groupe: list[Notification], langue: str) -> dict:
    recente = max(groupe, key=lambda x: x.cree_le)
    nombre = sum(int(x.donnees.get("nombre", 1)) for x in groupe)
    with translation.override(langue):
        corps = texte(recente.type, nombre)
    donnees = {cle: str(v) for cle, v in recente.donnees.items() if cle in CLES_DONNEES}
    return {
        "to": appareil.jeton_push,
        "title": TITRE,
        "body": corps,
        "sound": "default",
        "data": {"notification": str(recente.pk), "type": recente.type, **donnees},
    }


def envoyer_pays(pays: Pays, maintenant: datetime) -> int:
    """Les push dus du pays, regroupés ; rend le nombre de messages envoyés."""
    dues = Notification.objects.filter(
        pays=pays, push_du__isnull=False, lue_le__isnull=True, archive_le__isnull=True
    ).select_related("destinataire")
    groupes: dict[tuple, list[Notification]] = defaultdict(list)
    for n in dues:
        groupes[(n.destinataire_id, n.type)].append(n)
    envoyes = 0
    for (destinataire_id, type_), groupe in groupes.items():
        if min(n.push_du for n in groupe) > maintenant - FENETRE:
            continue  # la rafale se regroupe encore
        if Notification.objects.filter(destinataire_id=destinataire_id, type=type_,
                                       push_le__gt=maintenant - INTERVALLE).exists():  # fmt: skip
            continue  # NOT-003 : déjà un push de ce type dans l'heure
        destinataire = groupe[0].destinataire
        # NOT-005 : coupée par la personne (et non obligatoire), elle reste au centre seulement.
        coupe = push_coupe(destinataire, type_, pays)
        appareils = [] if coupe else _jetons(destinataire_id)
        if appareils:
            langue = destinataire.langue or settings.LANGUAGE_CODE
            messages = [_message(a, groupe, langue) for a in appareils]
            accuses = transport(messages)
            for appareil, accuse in zip(appareils, accuses, strict=False):
                if (accuse.get("details") or {}).get("error") == "DeviceNotRegistered":
                    # Application désinstallée : l'adresse ne sert plus.
                    Appareil.objects.filter(pk=appareil.pk).update(jeton_push="")
            envoyes += len(messages)
        # Sans téléphone inscrit, rien à envoyer : la notification reste au centre.
        Notification.objects.filter(pk__in=[n.pk for n in groupe]).update(
            push_du=None, push_le=maintenant if appareils else None
        )
    return envoyes


def envoyer(maintenant: datetime | None = None) -> int:
    """Une passe sur chaque pays, chacun dans sa transaction et son isolation (ADR-003)."""
    if not settings.PUSH_ACTIF:
        return 0
    maintenant = maintenant or timezone.now()
    total = 0
    for pays in Pays.objects.filter(statut=Pays.Statut.ACTIF):
        try:
            with transaction.atomic():
                with connection.cursor() as curseur:
                    curseur.execute("SELECT set_config('innov.pays', %s, true)", [str(pays.pk)])
                total += envoyer_pays(pays, maintenant)
        except OSError:
            # Service push injoignable : les dus restent dus, la passe suivante réessaiera.
            journal.warning("push_injoignable", extra={"pays": pays.code})
    return total

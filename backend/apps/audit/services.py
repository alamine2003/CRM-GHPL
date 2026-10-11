"""Écriture du journal d'audit (AUD-001).

`enregistrer` s'appelle dans la transaction de l'action : une action annulée n'est pas
auditée comme réussie, et une action réussie ne peut pas exister sans son événement.
Les échecs de sécurité (connexion refusée, code faux) sont écrits avant la levée de
l'erreur, pour survivre à celle-ci.
"""

from typing import Any

from apps.socle import journalisation

from .models import EvenementAudit

# Jamais de secret dans l'audit, même par erreur d'appel.
CLES_INTERDITES = ("mot_de_passe", "password", "jeton", "secret", "code", "token")


def contexte() -> dict:
    return journalisation.audit.get() or {}


def definir_acteur(utilisateur, **complements) -> None:
    """Retient l'auteur des actions de la requête courante (appelé à l'authentification)."""
    courant = dict(contexte())
    courant.update({"acteur": utilisateur, **complements})
    journalisation.audit.set(courant)


def definir_roles(roles, pays_actif) -> None:
    courant = dict(contexte())
    courant.update({"roles": sorted(roles), "pays_actif": pays_actif})
    journalisation.audit.set(courant)


def _propre(details: dict) -> dict:
    return {
        cle: valeur
        for cle, valeur in details.items()
        if not any(interdit in cle.lower() for interdit in CLES_INTERDITES)
    }


_INCONNU = object()


def enregistrer(
    action: str,
    *,
    objet: Any = None,
    pays: Any = _INCONNU,
    resultat: str = EvenementAudit.Resultat.SUCCES,
    details: dict | None = None,
    acteur: Any = _INCONNU,
) -> EvenementAudit:
    ctx = contexte()
    if acteur is _INCONNU:
        acteur = ctx.get("acteur")
    if pays is _INCONNU:
        pays = getattr(objet, "pays", None) or ctx.get("pays_actif")
    if pays is not None and not hasattr(pays, "pk"):
        pays = None
    return EvenementAudit.objects.create(
        action=action,
        resultat=resultat,
        acteur=acteur if getattr(acteur, "pk", None) else None,
        acteur_identifiant=getattr(acteur, "username", "") or "",
        roles=ctx.get("roles", []),
        pays=pays,
        objet_type=objet._meta.label_lower if objet is not None else "",
        objet_id=str(objet.pk) if objet is not None else "",
        details=_propre(details or {}),
        contexte={
            "adresse_ip": ctx.get("adresse_ip"),
            "agent": ctx.get("agent"),
            "client": ctx.get("client"),
            "appareil": ctx.get("appareil"),
            "reference": journalisation.reference.get(),
        },
    )

"""RPT-015 (0.6.5) : un rapport corrigé et soumis à nouveau garde ses versions précédentes
(RG-037), consultables par le superviseur : ce que disait la version d'avant, ce qui a changé,
et la demande de correction à laquelle chaque version répond."""

from apps.referentiel.models import Valeur

from .models import PieceJointe

#: Les clés du contenu figé qui forment chaque partie du rapport, dans l'ordre des parties
#: qu'une correction peut viser (`validation.PARTIES_SOCLE`, RPT-014).
CLES = {
    "presentations": ("presentations",),
    "remises": ("remises",),
    "resultat": ("resultat", "resultat_obtenu"),
    "resume": ("resume",),
    "prochaine_action": (
        "prochaine_action",
        "prochaine_action_type",
        "prochaine_action_echeance",
        "visite_proposee",
    ),  # fmt: skip
    "pieces_jointes": ("pieces_jointes",),
}


def modifies(avant: dict, apres: dict) -> list[str]:
    """Les parties du socle, puis les champs du pays, dont le contenu a changé."""
    codes = [p for p, cles in CLES.items() if any(avant.get(c) != apres.get(c) for c in cles)]
    champs_avant, champs_apres = avant.get("champs") or {}, apres.get("champs") or {}
    codes += [d["code"] for d in apres.get("definitions") or []
              if champs_avant.get(d["code"]) != champs_apres.get(d["code"])]  # fmt: skip
    return codes


def lecture(contenu: dict) -> dict:
    """Le contenu figé d'une version, prêt à lire : libellés plutôt qu'identifiants."""
    ids = [i for i in (contenu.get("resultat"), contenu.get("prochaine_action_type")) if i]
    libelles = {str(v.pk): v.libelle for v in Valeur.objects.filter(pk__in=ids)}
    pieces = contenu.get("pieces_jointes") or []
    noms = {str(pk): nom for pk, nom in
            PieceJointe.objects.filter(pk__in=pieces).values_list("pk", "nom")}  # fmt: skip
    champs = contenu.get("champs") or {}
    return {
        "objectif_prevu": contenu.get("objectif_prevu") or "",
        "resultat": libelles.get(contenu.get("resultat") or ""),
        "resultat_obtenu": contenu.get("resultat_obtenu") or "",
        "presentations": contenu.get("presentations") or [],
        "remises": contenu.get("remises") or [],
        "resume": contenu.get("resume") or "",
        "prochaine_action_type": libelles.get(contenu.get("prochaine_action_type") or ""),
        "prochaine_action": contenu.get("prochaine_action") or "",
        "prochaine_action_echeance": contenu.get("prochaine_action_echeance"),
        "visite_proposee": bool(contenu.get("visite_proposee")),
        "champs": [
            {
                "code": d["code"],
                "libelle": d["libelle"],
                "type": d["type"],
                "valeur": champs.get(d["code"]),
            }
            for d in contenu.get("definitions") or []
        ],  # fmt: skip
        "pieces_jointes": [noms[p] for p in pieces if p in noms],
    }

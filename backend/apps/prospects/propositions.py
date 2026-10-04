"""Propositions de modification des fiches communes (PRP-014).

Le délégué ne modifie pas une fiche commune : il propose (téléphone, courriel, numéro d'ordre,
adresse, nouvel exercice). La fiche ne change qu'à l'acceptation (CA1) ; le superviseur des
postes de l'auteur ou l'administrateur pays tranche ; le délégué voit la décision dans ses
propositions (CA2). Chaque étape est auditée ; l'acceptation est historisée (PRP-012).
"""

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Role, Utilisateur
from apps.organisation.models import Occupation, Rattachement, actif_le
from apps.perimetre.perimetre import Perimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from . import services
from .models import Etablissement, Proposition, Prospect, StatutFiche, StatutProposition

CHAMPS_PROSPECT = ["telephone_mobile", "telephone_pro", "courriel", "numero_ordre"]
CHAMPS_ETABLISSEMENT = ["adresse", "telephone"]


def _auditer(action: str, proposition: Proposition, **details) -> None:
    from apps.audit.services import enregistrer

    fiche = proposition.prospect or proposition.etablissement
    enregistrer(f"proposition.{action}", objet=fiche, pays=proposition.pays,
                details={"proposition": str(proposition.pk), **details})  # fmt: skip


def _normaliser(fiche, changements: dict) -> dict:
    """Mêmes règles d'écriture que la saisie (téléphones E.164…), sans rien enregistrer."""
    if isinstance(fiche, Prospect):
        autorises = CHAMPS_PROSPECT
        actuels = {c: getattr(fiche, c) for c in services.SUIVIS}
        valeurs = services._verifier(fiche.pays, {**actuels, **changements})
    else:
        autorises = CHAMPS_ETABLISSEMENT
        actuels = {c: getattr(fiche, c) for c in services.SUIVIS_ETABLISSEMENT}
        valeurs = services._verifier_etablissement(fiche.pays, {**actuels, **changements})
    inconnus = set(changements) - set(autorises)
    if inconnus:
        raise ErreurMetier(
            "champ_non_proposable",
            _("Ce champ ne se propose pas : %(champ)s.") % {"champ": ", ".join(sorted(inconnus))},
        )
    return {
        c: valeurs[c] for c in changements if str(valeurs[c] or "") != str(getattr(fiche, c) or "")
    }


@transaction.atomic
def proposer(
    auteur: Utilisateur,
    fiche: Prospect | Etablissement,
    changements: dict,
    *,
    nouvel_exercice: Etablissement | None = None,
    commentaire: str = "",
) -> Proposition:
    if fiche.statut != StatutFiche.ACTIF:
        raise ErreurMetier(
            "fiche_non_commune", _("Seule une fiche commune reçoit des propositions.")
        )
    propres = _normaliser(fiche, changements)
    if nouvel_exercice is not None:
        if not isinstance(fiche, Prospect) or nouvel_exercice.pays_id != fiche.pays_id:
            raise ErreurMetier(
                "etablissement_invalide", _("Établissement inconnu dans ce pays."),
                champ="nouvel_exercice",
            )  # fmt: skip
        if fiche.exercices.filter(etablissement=nouvel_exercice, fin__isnull=True).exists():
            nouvel_exercice = None
    if not propres and nouvel_exercice is None:
        raise ErreurMetier("proposition_vide", _("La proposition ne change rien à la fiche."))
    proposition = Proposition.objects.create(
        pays=fiche.pays,
        prospect=fiche if isinstance(fiche, Prospect) else None,
        etablissement=fiche if isinstance(fiche, Etablissement) else None,
        nouvel_exercice=nouvel_exercice,
        changements={c: str(v or "") for c, v in propres.items()},
        commentaire=commentaire.strip()[:300],
        auteur=auteur,
    )
    _auditer("creation", proposition, champs=sorted(propres))
    return proposition


def decidables(perimetre: Perimetre) -> QuerySet:
    """Propositions que l'utilisateur peut trancher : toutes celles du pays pour
    l'administrateur pays ; pour le superviseur, celles des occupants de ses postes."""
    qs = perimetre.filtrer_par_pays(Proposition.objects.all())
    if Role.ADMIN_PAYS in perimetre.roles:
        return qs
    if Role.SUPERVISEUR in perimetre.roles and perimetre.pays_actif is not None:
        jour = aujourdhui(perimetre.pays_actif)
        postes = Rattachement.objects.filter(actif_le(jour), superviseur=perimetre.utilisateur)
        occupants = Occupation.objects.filter(
            actif_le(jour), poste__in=postes.values("poste_id")
        ).values("utilisateur_id")
        return qs.filter(auteur__in=occupants)
    return qs.none()


def visibles(perimetre: Perimetre) -> QuerySet:
    """Les siennes, et celles que l'on peut trancher."""
    siennes = perimetre.filtrer_par_pays(Proposition.objects.all()).filter(
        auteur=perimetre.utilisateur
    )
    return Proposition.objects.filter(
        Q(pk__in=siennes.values("pk")) | Q(pk__in=decidables(perimetre).values("pk"))
    )


@transaction.atomic
def accepter(proposition: Proposition, par: Utilisateur) -> Proposition:
    if proposition.statut != StatutProposition.EN_ATTENTE:
        raise ErreurMetier("deja_tranchee", _("Cette proposition a déjà été tranchée."))
    fiche = proposition.prospect or proposition.etablissement
    if fiche.statut != StatutFiche.ACTIF:
        raise ErreurMetier("fiche_non_commune", _("La fiche n'est plus en service."))
    if proposition.changements:
        modifier = (
            services.modifier_prospect
            if isinstance(fiche, Prospect)
            else services.modifier_etablissement
        )
        modifier(fiche, auteur=par, origine="proposition", **proposition.changements)
    if proposition.nouvel_exercice_id:
        services.creer_exercice(fiche, proposition.nouvel_exercice, par)
    proposition.statut, proposition.decide_par = StatutProposition.ACCEPTEE, par
    proposition.decide_le = timezone.now()
    proposition.save(update_fields=["statut", "decide_par", "decide_le"])
    _auditer("acceptation", proposition)
    return proposition


@transaction.atomic
def refuser(proposition: Proposition, par: Utilisateur, motif: str = "") -> Proposition:
    if proposition.statut != StatutProposition.EN_ATTENTE:
        raise ErreurMetier("deja_tranchee", _("Cette proposition a déjà été tranchée."))
    proposition.statut, proposition.decide_par = StatutProposition.REFUSEE, par
    proposition.decide_le, proposition.motif = timezone.now(), motif.strip()[:300]
    proposition.save(update_fields=["statut", "decide_par", "decide_le", "motif"])
    _auditer("refus", proposition, motif=proposition.motif)
    return proposition


def marquer_vues(auteur: Utilisateur, pays) -> int:
    """CA2 : les décisions lues ne sont plus signalées au délégué."""
    lues = 0
    for p in Proposition.objects.filter(pays=pays, auteur=auteur, vue_le__isnull=True).exclude(
        statut=StatutProposition.EN_ATTENTE
    ):
        p.vue_le = timezone.now()
        p.save(update_fields=["vue_le"])
        lues += 1
    return lues

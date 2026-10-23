"""Réglage des droits du DO par le siège (1.6.1, prd.md §14.85).

Le DO n'a pas de rôle à lui : c'est un compte DF (1.3.1). Le siège seul ferme ou rouvre ses
droits, par groupe (`GROUPES_DROITS_DO`) ; tout est ouvert par défaut, donc rien ne change
pour un compte jamais réglé. Le serveur applique le réglage dans `Perimetre.peut`.
"""

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.perimetre.matrice import GROUPES_DROITS_DO, Action
from apps.socle.erreurs import ErreurMetier

from .models import ReglageDO, Role, RoleUtilisateur, Utilisateur


def _desactives(compte: Utilisateur) -> set[str]:
    reglage = ReglageDO.objects.filter(utilisateur=compte).first()
    return set(reglage.desactives) if reglage else set()


def droits_de(compte: Utilisateur) -> dict[str, bool]:
    """Chaque groupe de droits, ouvert (vrai) ou fermé (faux)."""
    fermes = _desactives(compte)
    return {groupe: groupe not in fermes for groupe in GROUPES_DROITS_DO}


def actions_fermees(compte: Utilisateur) -> frozenset[Action]:
    """Les actions que le rôle DF de ce compte ne donne plus."""
    fermees: set[Action] = set()
    for groupe in _desactives(compte):
        fermees |= GROUPES_DROITS_DO.get(groupe, frozenset())
    return frozenset(fermees)


def comptes_df_actifs():
    """Les comptes qui ont aujourd'hui le rôle DF."""
    from django.db.models import Q

    maintenant = timezone.now()
    actifs = RoleUtilisateur.objects.filter(role=Role.DF, debut__lte=maintenant).filter(
        Q(fin__isnull=True) | Q(fin__gt=maintenant)
    )
    return Utilisateur.objects.filter(pk__in=actifs.values("utilisateur_id"))


@transaction.atomic
def regler(compte: Utilisateur, changements: dict[str, bool], par: Utilisateur) -> dict[str, bool]:
    """Ouvre (vrai) ou ferme (faux) des groupes de droits d'un compte DF ; audité."""
    if not comptes_df_actifs().filter(pk=compte.pk).exists():
        raise ErreurMetier("compte_non_df", _("Ce compte n'a pas le rôle DF."), 404)
    inconnus = sorted(set(changements) - set(GROUPES_DROITS_DO))
    if inconnus:
        raise ErreurMetier(
            "droit_inconnu",
            _("Droit inconnu : %(droit)s.") % {"droit": inconnus[0]},
            champ="droits",
        )
    avant = droits_de(compte)
    fermes = _desactives(compte)
    for groupe, ouvert in changements.items():
        fermes.discard(groupe) if ouvert else fermes.add(groupe)
    reglage, _cree = ReglageDO.objects.get_or_create(utilisateur=compte)
    reglage.desactives = sorted(fermes)
    reglage.regle_par = par
    reglage.modifie_le = timezone.now()
    reglage.save()
    apres = droits_de(compte)
    if avant != apres:
        from apps.audit.services import enregistrer

        enregistrer(
            "droits_do.modification", objet=compte, pays=compte.pays_principal,
            details={"avant": avant, "apres": apres},
        )  # fmt: skip
    return apres

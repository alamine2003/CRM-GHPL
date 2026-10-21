"""Moteur de périmètre : ce qu'un utilisateur voit et peut faire (architecture §11.2).

Le périmètre est calculé à chaque requête pour le **pays actif** :

- en-tête `X-Pays: <code>` s'il est fourni et autorisé ;
- sinon le pays principal de l'utilisateur ;
- un compte du siège sans en-tête travaille en vue consolidée (tous les pays).

Un utilisateur sans rôle actif dans le pays actif ne voit rien (USR-001 CA2).
Hors pays principal, un rôle de pays ne compte que pendant une affectation
active dans ce pays (ORG-009 CA2) : à sa date de fin, l'accès cesse seul.
"""

from dataclasses import dataclass, field

from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status

from apps.identite.models import (
    ROLES_SANS_PAYS,
    AffectationPays,
    Role,
    RoleUtilisateur,
    Utilisateur,
)
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .matrice import MATRICE, SIEGE, Action


@dataclass(frozen=True)
class Perimetre:
    utilisateur: Utilisateur
    pays_actif: Pays | None
    roles: frozenset[str]
    pays_accessibles: tuple[Pays, ...] = field(default_factory=tuple)
    #: Actions que le siège a fermées au rôle DF de cet utilisateur (1.6.1, `droits_do`).
    restreintes: frozenset[Action] = frozenset()

    @property
    def est_siege(self) -> bool:
        return bool(self.roles & SIEGE)

    @property
    def vue_consolidee(self) -> bool:
        """Siège sans pays choisi : tous les pays, en agrégé."""
        return self.est_siege and self.pays_actif is None

    def peut(self, action: Action) -> bool:
        roles = self.roles - {Role.DF} if action in self.restreintes else self.roles
        return bool(roles & MATRICE[action])

    def actions(self) -> list[str]:
        return sorted(action.value for action in Action if self.peut(action))

    def exiger(self, action: Action) -> None:
        if not self.peut(action):
            raise ErreurMetier("interdit", _("Action non autorisée."), status.HTTP_403_FORBIDDEN)

    # --- Sélecteurs de base -----------------------------------------------------------

    def filtrer_par_pays(self, qs: QuerySet, champ: str = "pays_id") -> QuerySet:
        """Limite un jeu d'objets au pays actif, ou à tous les pays pour la vue consolidée."""
        if not self.roles:
            return qs.none()
        if self.vue_consolidee:
            return qs
        if self.pays_actif is None:
            return qs.none()
        return qs.filter(**{champ: self.pays_actif.pk})


def roles_actifs(utilisateur: Utilisateur, a=None) -> list[RoleUtilisateur]:
    a = a or timezone.now()
    return list(
        RoleUtilisateur.objects.select_related("pays")
        .filter(utilisateur=utilisateur, debut__lte=a)
        .filter(Q(fin__isnull=True) | Q(fin__gt=a))
    )


def pays_d_affectation(utilisateur: Utilisateur) -> set:
    """Identifiants des pays où l'utilisateur a une affectation active aujourd'hui."""
    affectations = AffectationPays.objects.select_related("pays").filter(utilisateur=utilisateur)
    return {a.pays_id for a in affectations if a.est_active(aujourdhui(a.pays))}


def calculer_perimetre(utilisateur: Utilisateur, code_pays: str | None = None) -> Perimetre:
    actifs = roles_actifs(utilisateur)
    pays_autorises = {utilisateur.pays_principal_id} | pays_d_affectation(utilisateur)
    actifs = [r for r in actifs if r.pays_id is None or r.pays_id in pays_autorises]
    roles_sans_pays = {r.role for r in actifs if r.role in ROLES_SANS_PAYS}
    siege = bool(roles_sans_pays & SIEGE)

    if siege:
        accessibles = tuple(Pays.objects.exclude(statut=Pays.Statut.ARCHIVE).order_by("nom"))
    else:
        par_pays = {r.pays.pk: r.pays for r in actifs if r.pays_id}
        accessibles = tuple(sorted(par_pays.values(), key=lambda p: p.nom))

    if code_pays:
        pays_actif = Pays.objects.filter(code=code_pays.strip().upper()).first()
        autorise = pays_actif is not None and (
            siege or any(p.pk == pays_actif.pk for p in accessibles)
        )
        if not autorise:
            raise ErreurMetier(
                "pays_non_autorise",
                _("Vous n'avez pas accès à ce pays."),
                status.HTTP_403_FORBIDDEN,
            )
    else:
        pays_actif = utilisateur.pays_principal

    roles = set(roles_sans_pays)
    if pays_actif is not None:
        roles |= {r.role for r in actifs if r.pays_id == pays_actif.pk}
        # 1.2.0 [D] : l'administrateur du siège « entre dans le portail » d'un pays avec tous
        # les droits de son administrateur ; il gère ainsi le Sénégal, siège sans admin pays.
        if Role.ADMIN_SIEGE in roles_sans_pays:
            roles.add(Role.ADMIN_PAYS)
    restreintes = frozenset()
    if Role.DF in roles:
        from apps.identite.droits_do import actions_fermees

        restreintes = actions_fermees(utilisateur)
    return Perimetre(utilisateur, pays_actif, frozenset(roles), accessibles, restreintes)

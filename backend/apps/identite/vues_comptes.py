"""API de gestion des comptes, des rôles et des désignations (USR-003, ORG-002).

Toutes ces vues héritent de VuePerimetre : un compte hors du périmètre répond 404.
"""

from django.core.exceptions import ValidationError
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.perimetre.matrice import Action
from apps.perimetre.perimetre import Perimetre, calculer_perimetre
from apps.perimetre.vues import ENTETE_PAYS, VuePerimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from . import services
from .models import (
    ROLES_DESIGNES_PAR_LE_SIEGE,
    ROLES_SANS_PAYS,
    AffectationPays,
    Appareil,
    Role,
    RoleUtilisateur,
    Transfert,
    Utilisateur,
)
from .serializers_comptes import (
    AffectationCreationSerializer,
    AffectationSerializer,
    AppareilSerializer,
    AttributionRoleSerializer,
    CreationUtilisateurSerializer,
    FinAffectationSerializer,
    PerimetreSerializer,
    RoleSerializer,
    TransfertCreationSerializer,
    TransfertSerializer,
    UtilisateurSerializer,
)


def _comptes_du_perimetre(perimetre: Perimetre):
    qs = Utilisateur.objects.select_related("pays_principal").prefetch_related(
        Prefetch("roles", queryset=RoleUtilisateur.objects.select_related("pays"))
    )
    if not perimetre.roles:
        return qs.none()
    if perimetre.vue_consolidee:
        return qs.order_by("last_name", "first_name")
    if perimetre.pays_actif is None:
        return qs.none()
    # Comptes du pays, et comptes d'autres pays affectés ici aujourd'hui (ORG-009).
    jour = aujourdhui(perimetre.pays_actif)
    affectes = AffectationPays.objects.filter(pays=perimetre.pays_actif, debut__lte=jour).filter(
        Q(fin__isnull=True) | Q(fin__gt=jour)
    )
    return (
        qs.filter(Q(pays_principal=perimetre.pays_actif) | Q(pk__in=affectes.values("utilisateur")))
        .distinct()
        .order_by("last_name", "first_name")
    )


def _roles_du_perimetre(perimetre: Perimetre, qs):
    """Depuis un pays actif, seuls les rôles de ce pays : un compte affecté ailleurs garde
    ses rôles d'origine hors de portée de l'administrateur du pays d'accueil (ORG-009)."""
    return qs if perimetre.pays_actif is None else qs.filter(pays=perimetre.pays_actif)


def _verifier_droit_sur_role(perimetre: Perimetre, role: str) -> None:
    """Rôles terrain : administrateur pays ou siège ; responsables pays et rôles du siège :
    administrateur du siège seulement (prd.md §6.3, ORG-002)."""
    perimetre.exiger(Action.ROLES_ATTRIBUER)
    if role in ROLES_DESIGNES_PAR_LE_SIEGE:
        perimetre.exiger(Action.DESIGNER_RESPONSABLES_PAYS)


class VueComptes(VuePerimetre):
    serializer_class = UtilisateurSerializer

    def selection(self, perimetre):
        return _comptes_du_perimetre(perimetre)

    def contexte(self) -> dict:
        return {"pays": self.perimetre.pays_actif}

    def compte_vise(self) -> Utilisateur:
        return get_object_or_404(self.get_queryset(), pk=self.kwargs["id"])


class UtilisateursVue(VueComptes):
    actions = {"GET": Action.UTILISATEURS_LIRE, "POST": Action.UTILISATEURS_GERER}

    @extend_schema(responses=UtilisateurSerializer(many=True), operation_id="utilisateurs_liste")
    def get(self, request):
        return Response(
            UtilisateurSerializer(self.get_queryset(), many=True, context=self.contexte()).data
        )

    @extend_schema(
        request=CreationUtilisateurSerializer,
        responses={201: UtilisateurSerializer},
        operation_id="utilisateurs_creer",
    )
    def post(self, request):
        """Crée un compte dans le pays actif (ou un compte du siège en vue consolidée) et
        envoie le lien de définition du mot de passe."""
        donnees = CreationUtilisateurSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        v = donnees.validated_data
        try:
            compte = services.creer_utilisateur(
                v["identifiant"],
                prenom=v["prenom"],
                nom=v["nom"],
                courriel=v.get("courriel", ""),
                pays=self.perimetre.pays_actif,
                langue=v.get("langue"),
            )
        except ValidationError as erreur:
            raise ErreurMetier(
                "donnees_invalides",
                " ".join(erreur.messages),
                champs=getattr(erreur, "message_dict", {}),
            ) from erreur
        services.demander_reinitialisation(compte, par_administrateur=True)
        return Response(
            UtilisateurSerializer(compte, context=self.contexte()).data,
            status=status.HTTP_201_CREATED,
        )


class UtilisateurVue(VueComptes):
    actions = {"GET": Action.UTILISATEURS_LIRE}

    @extend_schema(responses=UtilisateurSerializer, operation_id="utilisateur_detail")
    def get(self, request, id):
        return Response(UtilisateurSerializer(self.compte_vise(), context=self.contexte()).data)


class UtilisateurActionVue(VueComptes):
    actions = {"POST": Action.UTILISATEURS_GERER}
    OPERATIONS = ("suspendre", "reactiver", "reinitialiser")

    @extend_schema(
        request=None, responses={200: UtilisateurSerializer}, operation_id="utilisateur_action"
    )
    def post(self, request, id, operation):
        compte = self.compte_vise()
        if operation not in self.OPERATIONS:
            raise ErreurMetier("operation_inconnue", _("Opération inconnue."), 404)
        if compte.pk == request.user.pk and operation == "suspendre":
            raise ErreurMetier(
                "auto_suspension", _("Vous ne pouvez pas suspendre votre propre compte.")
            )
        if operation == "suspendre":
            services.suspendre_utilisateur(compte)
        elif operation == "reactiver":
            services.reactiver_utilisateur(compte)
        else:
            services.demander_reinitialisation(compte, par_administrateur=True)
        compte.refresh_from_db()
        return Response(UtilisateurSerializer(compte, context=self.contexte()).data)


class RolesUtilisateurVue(VueComptes):
    """Historique des rôles d'un compte et attribution d'un nouveau rôle."""

    actions = {"GET": Action.UTILISATEURS_LIRE, "POST": Action.ROLES_ATTRIBUER}

    @extend_schema(responses=RoleSerializer(many=True), operation_id="roles_liste")
    def get(self, request, id):
        compte = self.compte_vise()
        roles = _roles_du_perimetre(
            self.perimetre,
            RoleUtilisateur.objects.select_related("pays", "attribue_par", "retire_par").filter(
                utilisateur=compte
            ),
        )
        return Response(RoleSerializer(roles, many=True).data)

    @extend_schema(
        request=AttributionRoleSerializer,
        responses={201: RoleSerializer},
        operation_id="role_attribuer",
    )
    def post(self, request, id):
        compte = self.compte_vise()
        donnees = AttributionRoleSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        role = donnees.validated_data["role"]
        _verifier_droit_sur_role(self.perimetre, role)
        # Rôle de pays : dans le pays actif (pays principal ou pays d'affectation du compte).
        pays = (
            None
            if role in ROLES_SANS_PAYS
            else (self.perimetre.pays_actif or compte.pays_principal)
        )
        attribue = services.attribuer_role(compte, role, pays, par=request.user)
        return Response(RoleSerializer(attribue).data, status=status.HTTP_201_CREATED)


class RetraitRoleVue(VuePerimetre):
    serializer_class = RoleSerializer
    actions = {"POST": Action.ROLES_ATTRIBUER}

    def selection(self, perimetre):
        comptes = _comptes_du_perimetre(perimetre)
        return _roles_du_perimetre(
            perimetre,
            RoleUtilisateur.objects.select_related("pays", "utilisateur").filter(
                utilisateur__in=comptes
            ),
        )

    @extend_schema(request=None, responses=RoleSerializer, operation_id="role_retirer")
    def post(self, request, id):
        role = get_object_or_404(self.get_queryset(), pk=id)
        _verifier_droit_sur_role(self.perimetre, role.role)
        if role.utilisateur_id == request.user.pk and role.role == Role.ADMIN_SIEGE:
            raise ErreurMetier(
                "auto_retrait", _("Vous ne pouvez pas retirer votre propre rôle d'administrateur.")
            )
        return Response(RoleSerializer(services.retirer_role(role, par=request.user)).data)


class DesignationsVue(VuePerimetre):
    """Historique des responsables et administrateurs d'un pays (ORG-002 CA2)."""

    serializer_class = RoleSerializer
    actions = {"GET": Action.UTILISATEURS_LIRE}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            RoleUtilisateur.objects.select_related(
                "pays", "utilisateur", "attribue_par", "retire_par"
            ).filter(role__in=[Role.RESPONSABLE_PAYS, Role.ADMIN_PAYS])
        )

    @extend_schema(responses=RoleSerializer(many=True), operation_id="designations_liste")
    def get(self, request, code):
        # Un pays hors du périmètre répond 404, comme tout objet invisible (USR-002 CA2).
        pays = get_object_or_404(
            self.perimetre.filtrer_par_pays(Pays.objects.all(), champ="pk"), code=code.upper()
        )
        roles = self.get_queryset().filter(pays=pays)
        return Response(RoleSerializer(roles, many=True).data)


def _pays_cible(code: str) -> Pays:
    pays = Pays.objects.filter(code=code.upper()).exclude(statut=Pays.Statut.ARCHIVE).first()
    if pays is None:
        raise ErreurMetier("pays_inconnu", _("Pays inconnu ou archivé."))
    return pays


class AffectationsVue(VueComptes):
    """Affectations d'un compte dans d'autres pays (ORG-009) : le siège les accorde."""

    actions = {"GET": Action.UTILISATEURS_LIRE, "POST": Action.AFFECTATIONS_GERER}

    @extend_schema(responses=AffectationSerializer(many=True), operation_id="affectations_liste")
    def get(self, request, id):
        compte = self.compte_vise()
        affectations = AffectationPays.objects.select_related(
            "pays", "accorde_par", "retire_par"
        ).filter(utilisateur=compte)
        pays = self.perimetre.pays_actif
        if pays is not None and compte.pays_principal_id != pays.pk:
            affectations = affectations.filter(pays=pays)
        return Response(AffectationSerializer(affectations, many=True).data)

    @extend_schema(
        request=AffectationCreationSerializer,
        responses={201: AffectationSerializer},
        operation_id="affectation_accorder",
    )
    def post(self, request, id):
        compte = self.compte_vise()
        donnees = AffectationCreationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        v = donnees.validated_data
        affectation = services.accorder_affectation(
            compte, _pays_cible(v["pays"]), v["role"], v["motif"],
            par=request.user, debut=v.get("debut"), fin=v.get("fin"),
        )  # fmt: skip
        return Response(AffectationSerializer(affectation).data, status=status.HTTP_201_CREATED)


class AffectationFinVue(VuePerimetre):
    serializer_class = AffectationSerializer
    actions = {"POST": Action.AFFECTATIONS_GERER}

    def selection(self, perimetre):
        return AffectationPays.objects.select_related("pays", "utilisateur").filter(
            utilisateur__in=_comptes_du_perimetre(perimetre)
        )

    @extend_schema(
        request=FinAffectationSerializer,
        responses=AffectationSerializer,
        operation_id="affectation_terminer",
    )
    def post(self, request, id):
        affectation = get_object_or_404(self.get_queryset(), pk=id)
        donnees = FinAffectationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        terminee = services.terminer_affectation(
            affectation, par=request.user, fin=donnees.validated_data.get("fin")
        )
        return Response(AffectationSerializer(terminee).data)


class TransfertsVue(VueComptes):
    """Transferts d'un compte vers un autre pays (ORG-010) : le siège les autorise."""

    actions = {"GET": Action.UTILISATEURS_LIRE, "POST": Action.AFFECTATIONS_GERER}

    @extend_schema(responses=TransfertSerializer(many=True), operation_id="transferts_liste")
    def get(self, request, id):
        compte = self.compte_vise()
        transferts = Transfert.objects.select_related(
            "pays_origine", "pays_destination", "autorise_par"
        ).filter(utilisateur=compte)
        return Response(TransfertSerializer(transferts, many=True).data)

    @extend_schema(
        request=TransfertCreationSerializer,
        responses={201: TransfertSerializer},
        operation_id="transfert_autoriser",
    )
    def post(self, request, id):
        compte = self.compte_vise()
        donnees = TransfertCreationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        v = donnees.validated_data
        transfert = services.transferer(
            compte, _pays_cible(v["pays"]), v["motif"], par=request.user, role=v.get("role")
        )
        return Response(TransfertSerializer(transfert).data, status=status.HTTP_201_CREATED)


class VueAppareils(VuePerimetre):
    serializer_class = AppareilSerializer

    def selection(self, perimetre):
        return Appareil.objects.select_related("utilisateur").filter(
            utilisateur__in=_comptes_du_perimetre(perimetre)
        )


class AppareilsVue(VueAppareils):
    """Téléphones des comptes du pays actif (USR-006 CA1)."""

    actions = {"GET": Action.UTILISATEURS_LIRE}

    @extend_schema(responses=AppareilSerializer(many=True), operation_id="appareils_liste")
    def get(self, request):
        return Response(AppareilSerializer(self.get_queryset(), many=True).data)


class AppareilRevocationVue(VueAppareils):
    actions = {"POST": Action.APPAREILS_REVOQUER}

    @extend_schema(request=None, responses=AppareilSerializer, operation_id="appareil_revoquer")
    def post(self, request, id):
        appareil = get_object_or_404(self.get_queryset(), pk=id)
        return Response(
            AppareilSerializer(services.revoquer_appareil(appareil, par=request.user)).data
        )


class PerimetreVue(APIView):
    """Périmètre de l'utilisateur pour le pays actif : rôles, actions permises, pays
    accessibles. Les clients s'en servent pour masquer ; le serveur reste seul juge."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PerimetreSerializer, operation_id="perimetre")
    def get(self, request):
        p = calculer_perimetre(request.user, request.META.get(ENTETE_PAYS))
        return Response(
            PerimetreSerializer(
                {
                    "pays_actif": p.pays_actif,
                    "vue_consolidee": p.vue_consolidee,
                    "roles": sorted(p.roles),
                    "actions": p.actions(),
                    "pays_accessibles": p.pays_accessibles,
                }
            ).data
        )

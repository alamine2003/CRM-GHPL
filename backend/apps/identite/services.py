"""Services d'identité : comptes, connexion, sessions et récupération d'accès.

Les autres modules et les vues passent par ces fonctions (architecture §7.2).
L'audit de ces actions (AUD-001) sera ajouté en 0.0.8.
"""

import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken

from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui, debut_du_jour

from . import courriels
from .models import (
    ROLES_SANS_PAYS,
    AffectationPays,
    JetonReinitialisation,
    Role,
    RoleUtilisateur,
    Session,
    Transfert,
    Utilisateur,
    empreinte,
    nouveau_jeton,
)

# Empreinte aléatoire : vérifier un mot de passe prend le même temps, que le compte existe ou non.
_EMPREINTE_FACTICE = make_password(secrets.token_urlsafe(32))


def _reglage(cle):
    return settings.INNOV_AUTH[cle]


@dataclass
class Connexion:
    session: Session
    acces: str
    rafraichissement: str
    expire_dans: int


# --- Comptes (USR-001, USR-003) ------------------------------------------------------


@transaction.atomic
def creer_utilisateur(
    identifiant: str,
    *,
    prenom: str,
    nom: str,
    courriel: str = "",
    pays: Pays | None = None,
    langue: str | None = None,
    mot_de_passe: str | None = None,
) -> Utilisateur:
    """Crée un compte nominatif. Sans pays : compte du siège (RG-002)."""
    if not prenom.strip() or not nom.strip():
        raise ValidationError(_("Un compte nominatif a un prénom et un nom (USR-001)."))
    utilisateur = Utilisateur(
        username=identifiant.strip().lower(),
        first_name=prenom.strip(),
        last_name=nom.strip(),
        email=courriel.strip().lower(),
        pays_principal=pays,
        langue=langue or (pays.langue if pays else "fr"),
    )
    if mot_de_passe:
        password_validation.validate_password(mot_de_passe, utilisateur)
        utilisateur.set_password(mot_de_passe)
    else:
        utilisateur.set_unusable_password()
    utilisateur.full_clean()
    utilisateur.save()
    return utilisateur


@transaction.atomic
def suspendre_utilisateur(utilisateur: Utilisateur) -> Utilisateur:
    """Suspend un compte et ferme ses sessions ; ses données restent intactes (USR-003)."""
    utilisateur.is_active = False
    utilisateur.save(update_fields=["is_active"])
    revoquer_sessions(utilisateur, "compte_suspendu")
    return utilisateur


def reactiver_utilisateur(utilisateur: Utilisateur) -> Utilisateur:
    utilisateur.is_active = True
    utilisateur.save(update_fields=["is_active"])
    return utilisateur


# --- Contrôles d'accès ---------------------------------------------------------------


def verifier_acces_autorise(utilisateur: Utilisateur) -> None:
    """Compte actif, et pays principal actif sauf pour le siège (ORG-001 CA2)."""
    if not utilisateur.is_active:
        raise ErreurMetier(
            "compte_desactive",
            _("Ce compte est désactivé. Contactez votre administrateur pays."),
            status.HTTP_403_FORBIDDEN,
        )
    pays = utilisateur.pays_principal
    if pays is not None and pays.statut != Pays.Statut.ACTIF:
        message = (
            _("Le pays %(pays)s est suspendu : la connexion est momentanément impossible.")
            if pays.statut == Pays.Statut.SUSPENDU
            else _("Le pays %(pays)s est archivé : la connexion n'est plus possible.")
        ) % {"pays": pays.nom}
        raise ErreurMetier(f"pays_{pays.statut}", message, status.HTTP_403_FORBIDDEN)


# --- Connexion et sessions (SEC-002, architecture §11.1) ------------------------------


def duree_session(client: str) -> timedelta:
    if client == Session.Client.MOBILE:
        return timedelta(days=_reglage("SESSION_MOBILE_JOURS"))
    return timedelta(minutes=_reglage("SESSION_PORTAIL_MINUTES"))


def _jeton_acces(session: Session) -> tuple[str, int]:
    jeton = AccessToken.for_user(session.utilisateur)
    jeton["sid"] = str(session.id)
    duree = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    return str(jeton), duree


def _identifiants_invalides() -> ErreurMetier:
    return ErreurMetier(
        "identifiants_invalides",
        _("Identifiant ou mot de passe incorrect."),
        status.HTTP_401_UNAUTHORIZED,
    )


def _compte_verrouille(utilisateur: Utilisateur) -> ErreurMetier:
    return ErreurMetier(
        "compte_verrouille",
        _("Trop d'essais : compte verrouillé temporairement. Réessayez plus tard."),
        status.HTTP_423_LOCKED,
        deverrouillage_le=utilisateur.verrouille_jusqua.isoformat(),
    )


def connecter(
    identifiant: str,
    mot_de_passe: str,
    client: str,
    *,
    adresse_ip: str | None = None,
    agent: str = "",
) -> Connexion:
    """Vérifie les identifiants et ouvre une session.

    Après 5 échecs consécutifs, le compte est verrouillé 15 minutes, même pour le
    bon mot de passe, et l'utilisateur est prévenu par courriel (SEC-002).
    """
    with transaction.atomic():
        utilisateur = (
            Utilisateur.objects.select_for_update(of=("self",))
            .select_related("pays_principal")
            .filter(username=identifiant.strip().lower())
            .first()
        )
        if utilisateur is None:
            check_password(mot_de_passe, _EMPREINTE_FACTICE)
            raise _identifiants_invalides()
        if utilisateur.est_verrouille:
            raise _compte_verrouille(utilisateur)
        if not utilisateur.check_password(mot_de_passe):
            utilisateur.echecs_connexion += 1
            champs = ["echecs_connexion"]
            if utilisateur.echecs_connexion >= _reglage("ECHECS_AVANT_VERROUILLAGE"):
                minutes = _reglage("DUREE_VERROUILLAGE_MINUTES")
                utilisateur.verrouille_jusqua = timezone.now() + timedelta(minutes=minutes)
                utilisateur.echecs_connexion = 0
                champs.append("verrouille_jusqua")
                utilisateur.save(update_fields=champs)
                transaction.on_commit(lambda: courriels.courriel_verrouillage(utilisateur, minutes))
            else:
                utilisateur.save(update_fields=champs)
            # Les échecs comptés doivent survivre à l'erreur renvoyée.
            erreur = _identifiants_invalides()
        else:
            erreur = None
    if erreur is not None:
        raise erreur

    verifier_acces_autorise(utilisateur)
    with transaction.atomic():
        utilisateur.echecs_connexion = 0
        utilisateur.verrouille_jusqua = None
        utilisateur.last_login = timezone.now()
        utilisateur.save(update_fields=["echecs_connexion", "verrouille_jusqua", "last_login"])
        rafraichissement = nouveau_jeton()
        session = Session.objects.create(
            utilisateur=utilisateur,
            client=client,
            empreinte_rafraichissement=empreinte(rafraichissement),
            expire_le=timezone.now() + duree_session(client),
            adresse_ip=adresse_ip,
            agent=agent[:300],
        )
    acces, duree = _jeton_acces(session)
    return Connexion(session, acces, rafraichissement, duree)


def rafraichir(jeton: str) -> Connexion:
    """Échange un jeton de rafraîchissement contre un nouveau couple de jetons.

    Le jeton change à chaque usage. Un ancien jeton rejoué signale un vol : la
    session est révoquée (architecture §11.1).
    """
    trace = empreinte(jeton)
    with transaction.atomic():
        session = (
            Session.objects.select_for_update(of=("self",))
            .select_related("utilisateur__pays_principal")
            .filter(empreinte_rafraichissement=trace)
            .first()
        )
        if session is None:
            rejouee = Session.objects.filter(empreinte_precedente=trace, revoquee_le=None).first()
            if rejouee is not None:
                _revoquer(rejouee, "jeton_rejoue")
            erreur = ErreurMetier(
                "session_invalide", _("Session invalide ou expirée."), status.HTTP_401_UNAUTHORIZED
            )
        elif not session.est_active:
            erreur = ErreurMetier(
                "session_expiree",
                _("Votre session a expiré. Reconnectez-vous."),
                status.HTTP_401_UNAUTHORIZED,
            )
        else:
            erreur = None
            verifier_acces_autorise(session.utilisateur)
            nouveau = nouveau_jeton()
            session.empreinte_precedente = trace
            session.empreinte_rafraichissement = empreinte(nouveau)
            session.utilisee_le = timezone.now()
            session.expire_le = timezone.now() + duree_session(session.client)
            session.save()
    if erreur is not None:
        raise erreur
    acces, duree = _jeton_acces(session)
    return Connexion(session, acces, nouveau, duree)


def _revoquer(session: Session, motif: str) -> None:
    session.revoquee_le = timezone.now()
    session.motif_revocation = motif
    session.save(update_fields=["revoquee_le", "motif_revocation"])


def deconnecter(session: Session) -> None:
    if session.revoquee_le is None:
        _revoquer(session, "deconnexion")


def revoquer_sessions(utilisateur: Utilisateur, motif: str) -> int:
    return Session.objects.filter(utilisateur=utilisateur, revoquee_le=None).update(
        revoquee_le=timezone.now(), motif_revocation=motif
    )


# --- Mots de passe et récupération d'accès (USR-005, SEC-001) ---------------------------


@transaction.atomic
def demander_reinitialisation(utilisateur: Utilisateur, *, par_administrateur=False) -> str:
    """Crée un lien à usage unique valable 30 minutes et l'envoie par courriel.

    Renvoie le jeton (pour l'administrateur qui le transmet hors courriel).
    """
    minutes = _reglage("REINITIALISATION_MINUTES")
    JetonReinitialisation.objects.filter(utilisateur=utilisateur, utilise_le=None).update(
        utilise_le=timezone.now()
    )
    jeton = nouveau_jeton()
    JetonReinitialisation.objects.create(
        utilisateur=utilisateur,
        empreinte=empreinte(jeton),
        expire_le=timezone.now() + timedelta(minutes=minutes),
        demande_par_administrateur=par_administrateur,
    )
    transaction.on_commit(lambda: courriels.courriel_reinitialisation(utilisateur, jeton, minutes))
    return jeton


def demander_reinitialisation_par_identifiant(identifiant: str) -> None:
    """Demande publique : même réponse que le compte existe ou non (pas d'énumération)."""
    valeur = identifiant.strip().lower()
    utilisateur = (
        Utilisateur.objects.filter(is_active=True).exclude(email="").filter(username=valeur).first()
        or Utilisateur.objects.filter(is_active=True, email=valeur).exclude(email="").first()
    )
    if utilisateur is not None:
        demander_reinitialisation(utilisateur)


@transaction.atomic
def reinitialiser_mot_de_passe(jeton: str, nouveau: str) -> Utilisateur:
    ligne = (
        JetonReinitialisation.objects.select_for_update(of=("self",))
        .select_related("utilisateur")
        .filter(empreinte=empreinte(jeton))
        .first()
    )
    if ligne is None or not ligne.est_valide:
        raise ErreurMetier(
            "lien_invalide",
            _("Ce lien est invalide, déjà utilisé ou expiré. Faites une nouvelle demande."),
        )
    utilisateur = ligne.utilisateur
    _definir_mot_de_passe(utilisateur, nouveau)
    ligne.utilise_le = timezone.now()
    ligne.save(update_fields=["utilise_le"])
    return utilisateur


def changer_mot_de_passe(utilisateur: Utilisateur, actuel: str, nouveau: str) -> None:
    if not utilisateur.check_password(actuel):
        raise ErreurMetier("mot_de_passe_incorrect", _("Le mot de passe actuel est incorrect."))
    _definir_mot_de_passe(utilisateur, nouveau)


def _definir_mot_de_passe(utilisateur: Utilisateur, nouveau: str) -> None:
    try:
        password_validation.validate_password(nouveau, utilisateur)
    except ValidationError as erreur:
        raise ErreurMetier(
            "mot_de_passe_refuse", " ".join(erreur.messages), mots=list(erreur.messages)
        ) from erreur
    utilisateur.set_password(nouveau)
    utilisateur.echecs_connexion = 0
    utilisateur.verrouille_jusqua = None
    utilisateur.save()
    # Un nouveau mot de passe ferme toutes les sessions ouvertes.
    revoquer_sessions(utilisateur, "mot_de_passe_change")


# --- Rôles (USR-001, ORG-002, architecture §11.2) ------------------------------------------


def _role_deja_actif(utilisateur: Utilisateur, role: str, pays: Pays | None) -> bool:
    from django.db.models import Q

    maintenant = timezone.now()
    return (
        RoleUtilisateur.objects.filter(utilisateur=utilisateur, role=role, pays=pays)
        .filter(Q(fin__isnull=True) | Q(fin__gt=maintenant))
        .exists()
    )


@transaction.atomic
def attribuer_role(
    utilisateur: Utilisateur,
    role: str,
    pays: Pays | None,
    *,
    par: Utilisateur | None,
    debut=None,
    fin=None,
) -> RoleUtilisateur:
    """Attribue un rôle daté. Les contrôles de droit de l'acteur sont faits par les vues.

    - Un rôle du siège ou technique n'a pas de pays et suppose un compte du siège (RG-002).
    - Un rôle de pays porte sur le pays principal de l'utilisateur, ou sur un pays où il a
      une affectation en cours ou à venir (ORG-009) ; il ne vaut alors que pendant celle-ci.
    """
    if role not in Role.values:
        raise ErreurMetier("role_inconnu", _("Rôle inconnu."))
    if role in ROLES_SANS_PAYS:
        if pays is not None or not utilisateur.est_siege:
            raise ErreurMetier("role_reserve_siege", _("Ce rôle est réservé aux comptes du siège."))
    else:
        if pays is None:
            raise ErreurMetier("pays_requis", _("Ce rôle s'exerce dans un pays."))
        if utilisateur.pays_principal_id != pays.pk and not _affectation_en_cours_ou_a_venir(
            utilisateur, pays
        ):
            raise ErreurMetier(
                "pays_incoherent",
                _("Ce rôle doit porter sur le pays principal de l'utilisateur ou un pays affecté."),
            )
    if not utilisateur.is_active:
        raise ErreurMetier("compte_desactive", _("Ce compte est désactivé."))
    if _role_deja_actif(utilisateur, role, pays):
        raise ErreurMetier("role_deja_attribue", _("Ce rôle est déjà attribué."))
    return RoleUtilisateur.objects.create(
        utilisateur=utilisateur,
        role=role,
        pays=pays,
        debut=debut or timezone.now(),
        fin=fin,
        attribue_par=par,
    )


@transaction.atomic
def retirer_role(role: RoleUtilisateur, *, par: Utilisateur | None, fin=None) -> RoleUtilisateur:
    """Termine un rôle ; il reste dans l'historique (ORG-002 CA2)."""
    fin = fin or timezone.now()
    if role.fin is not None and role.fin <= timezone.now():
        raise ErreurMetier("role_deja_termine", _("Ce rôle est déjà terminé."))
    if fin <= role.debut:
        raise ErreurMetier("fin_invalide", _("La fin doit suivre le début du rôle."))
    role.fin = fin
    role.retire_par = par
    role.save(update_fields=["fin", "retire_par"])
    return role


# --- Affectations multi-pays et transferts (ORG-009, ORG-010) -------------------------------


def _affectation_en_cours_ou_a_venir(utilisateur: Utilisateur, pays: Pays) -> bool:
    from django.db.models import Q

    return (
        AffectationPays.objects.filter(utilisateur=utilisateur, pays=pays)
        .filter(Q(fin__isnull=True) | Q(fin__gt=aujourdhui(pays)))
        .exists()
    )


def _instant(pays: Pays, jour):
    """Début du jour `jour` dans le pays, ou maintenant si ce jour est aujourd'hui."""
    return timezone.now() if jour <= aujourdhui(pays) else debut_du_jour(pays, jour)


@transaction.atomic
def accorder_affectation(
    utilisateur: Utilisateur,
    pays: Pays,
    role: str,
    motif: str,
    *,
    par: Utilisateur | None,
    debut=None,
    fin=None,
) -> AffectationPays:
    """Affectation datée dans un autre pays, avec le rôle exercé là-bas (prd.md §7.3).

    Le rôle prend les mêmes dates : à la fin de l'affectation, l'accès cesse seul (ORG-009 CA2).
    """
    debut = debut or aujourdhui(pays)
    if utilisateur.est_siege:
        raise ErreurMetier("compte_siege", _("Un compte du siège voit déjà tous les pays."))
    if utilisateur.pays_principal_id == pays.pk:
        raise ErreurMetier("pays_principal", _("C'est déjà le pays principal de cet utilisateur."))
    if role in ROLES_SANS_PAYS or role not in Role.values:
        raise ErreurMetier("role_invalide", _("Ce rôle ne s'exerce pas dans un pays."))
    if not motif.strip():
        raise ErreurMetier("motif_requis", _("Le motif est obligatoire."))
    if debut < aujourdhui(pays):
        raise ErreurMetier("debut_passe", _("Une affectation ne peut pas commencer dans le passé."))
    if fin is not None and fin <= debut:
        raise ErreurMetier("fin_invalide", _("La fin doit suivre le début."))
    if _affectation_en_cours_ou_a_venir(utilisateur, pays):
        raise ErreurMetier(
            "affectation_existante", _("Une affectation dans ce pays est déjà en cours ou prévue.")
        )
    affectation = AffectationPays.objects.create(
        utilisateur=utilisateur, pays=pays, motif=motif.strip(), debut=debut, fin=fin,
        accorde_par=par,
    )  # fmt: skip
    attribuer_role(
        utilisateur, role, pays, par=par,
        debut=_instant(pays, debut), fin=debut_du_jour(pays, fin) if fin else None,
    )  # fmt: skip
    return affectation


@transaction.atomic
def terminer_affectation(
    affectation: AffectationPays, *, par: Utilisateur | None, fin=None
) -> AffectationPays:
    """Termine une affectation (aujourd'hui par défaut) et les rôles exercés dans ce pays."""
    pays = affectation.pays
    fin = fin or aujourdhui(pays)
    if affectation.fin is not None and affectation.fin <= aujourdhui(pays):
        raise ErreurMetier("affectation_terminee", _("Cette affectation est déjà terminée."))
    if fin < aujourdhui(pays):
        raise ErreurMetier("fin_passee", _("La fin ne peut pas être dans le passé."))
    fin = max(fin, affectation.debut)
    affectation.fin = fin
    affectation.retire_par = par
    affectation.save(update_fields=["fin", "retire_par"])
    _terminer_roles(affectation.utilisateur, pays, _instant(pays, fin), par)
    return affectation


def _terminer_roles(utilisateur: Utilisateur, pays: Pays, instant, par) -> None:
    from django.db.models import Q

    roles = RoleUtilisateur.objects.select_for_update().filter(utilisateur=utilisateur, pays=pays)
    for role in roles.filter(Q(fin__isnull=True) | Q(fin__gt=instant)):
        role.fin = max(instant, role.debut)
        role.retire_par = par
        role.save(update_fields=["fin", "retire_par"])


@transaction.atomic
def transferer(
    utilisateur: Utilisateur,
    destination: Pays,
    motif: str,
    *,
    par: Utilisateur | None,
    role: str | None = None,
) -> Transfert:
    """Change le pays principal (ORG-010, RG-004).

    Dans le pays d'origine, rôles, occupations, rattachements et périmètres prennent fin :
    l'utilisateur n'y voit plus rien (CA1). Ses données y restent, consultables par ce pays (CA2).
    """
    from apps.organisation.services import terminer_liens

    utilisateur = Utilisateur.objects.select_for_update().get(pk=utilisateur.pk)
    origine = utilisateur.pays_principal
    if origine is None:
        raise ErreurMetier("compte_siege", _("Un compte du siège n'a pas de pays principal."))
    if origine.pk == destination.pk:
        raise ErreurMetier("meme_pays", _("L'utilisateur est déjà dans ce pays."))
    if not motif.strip():
        raise ErreurMetier("motif_requis", _("Le motif est obligatoire."))
    if role is not None and (role in ROLES_SANS_PAYS or role not in Role.values):
        raise ErreurMetier("role_invalide", _("Ce rôle ne s'exerce pas dans un pays."))

    _terminer_roles(utilisateur, origine, timezone.now(), par)
    terminer_liens(utilisateur, origine)
    # Une affectation dans le pays de destination devient sans objet : il est désormais principal.
    for affectation in AffectationPays.objects.filter(utilisateur=utilisateur, pays=destination):
        if affectation.fin is None or affectation.fin > aujourdhui(destination):
            affectation.fin = max(aujourdhui(destination), affectation.debut)
            affectation.retire_par = par
            affectation.save(update_fields=["fin", "retire_par"])

    utilisateur.pays_principal = destination
    utilisateur.save(update_fields=["pays_principal"])
    transfert = Transfert.objects.create(
        utilisateur=utilisateur, pays_origine=origine, pays_destination=destination,
        motif=motif.strip(), autorise_par=par,
    )  # fmt: skip
    if role and not _role_deja_actif(utilisateur, role, destination):
        attribuer_role(utilisateur, role, destination, par=par)
    return transfert

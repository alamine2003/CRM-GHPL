"""Services d'identité : comptes, connexion, sessions et récupération d'accès.

Les autres modules et les vues passent par ces fonctions (architecture §7.2).
L'audit de ces actions (AUD-001) sera ajouté en 0.0.8.
"""

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

from . import courriels
from .models import JetonReinitialisation, Session, Utilisateur, empreinte, nouveau_jeton

# Empreinte factice : vérifier un mot de passe prend le même temps, que le compte existe ou non.
_EMPREINTE_FACTICE = make_password(None)


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

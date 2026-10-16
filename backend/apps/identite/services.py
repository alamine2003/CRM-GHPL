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
from django.db.models import Q
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
    Appareil,
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
    _auditer("compte.creation", utilisateur, identifiant=utilisateur.username)
    return utilisateur


@transaction.atomic
def suspendre_utilisateur(utilisateur: Utilisateur) -> Utilisateur:
    """Suspend un compte et ferme ses sessions ; ses données restent intactes (USR-003)."""
    utilisateur.is_active = False
    utilisateur.save(update_fields=["is_active"])
    revoquer_sessions(utilisateur, "compte_suspendu")
    _auditer("compte.suspension", utilisateur)
    return utilisateur


@transaction.atomic
def reactiver_utilisateur(utilisateur: Utilisateur) -> Utilisateur:
    utilisateur.is_active = True
    utilisateur.save(update_fields=["is_active"])
    _auditer("compte.reactivation", utilisateur)
    return utilisateur


# --- Contrôles d'accès ---------------------------------------------------------------


def _compte_desactive() -> ErreurMetier:
    return ErreurMetier(
        "compte_desactive",
        _("Ce compte est désactivé. Contactez votre administrateur pays."),
        status.HTTP_403_FORBIDDEN,
    )


def verifier_acces_autorise(utilisateur: Utilisateur) -> None:
    """Compte actif, et pays principal actif sauf pour le siège (ORG-001 CA2)."""
    if not utilisateur.is_active:
        raise _compte_desactive()
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


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    pays = getattr(objet, "pays", None) or getattr(objet, "pays_principal", None)
    enregistrer(action, objet=objet, pays=pays, details=details)


def _auditer_connexion(action, utilisateur, resultat, **details):
    from apps.audit.services import enregistrer

    enregistrer(
        action,
        objet=utilisateur,
        acteur=utilisateur,
        pays=getattr(utilisateur, "pays_principal", None),
        resultat=resultat,
        details=details,
    )


def _compter_echec(utilisateur: Utilisateur, motif: str) -> ErreurMetier:
    """Un échec (mot de passe ou code) compte pour le verrouillage (SEC-002) et s'audite.

    À appeler dans une transaction qui sera validée : l'échec doit survivre à l'erreur.
    """
    utilisateur.echecs_connexion += 1
    champs = ["echecs_connexion"]
    if utilisateur.echecs_connexion >= _reglage("ECHECS_AVANT_VERROUILLAGE"):
        minutes = _reglage("DUREE_VERROUILLAGE_MINUTES")
        utilisateur.verrouille_jusqua = timezone.now() + timedelta(minutes=minutes)
        utilisateur.echecs_connexion = 0
        champs.append("verrouille_jusqua")
        utilisateur.save(update_fields=champs)
        transaction.on_commit(lambda: courriels.courriel_verrouillage(utilisateur, minutes))
        _auditer_connexion("connexion.verrouillage", utilisateur, "echec", motif=motif)
    else:
        utilisateur.save(update_fields=champs)
    _auditer_connexion("connexion", utilisateur, "echec", motif=motif)
    return _identifiants_invalides() if motif == "mot_de_passe" else _code_invalide()


def _code_invalide() -> ErreurMetier:
    return ErreurMetier(
        "code_invalide", _("Code incorrect ou expiré."), status.HTTP_401_UNAUTHORIZED
    )


@dataclass
class EtapeDoubleAuth:
    """Mot de passe accepté ; le code à usage unique est encore attendu (SEC-003)."""

    jeton_etape: str
    expire_dans: int


SEL_ETAPE = "innov.connexion.double-auth"
DUREE_ETAPE = 300


def _verifier_identifiants(identifiant: str, mot_de_passe: str) -> Utilisateur:
    """1.4.0 [D] : l'identifiant (prenom.nom) ou l'adresse courriel, unique quand elle existe."""
    valeur = identifiant.strip().lower()
    with transaction.atomic():
        utilisateur = (
            Utilisateur.objects.select_for_update(of=("self",))
            .select_related("pays_principal")
            .filter(Q(username=valeur) | (Q(email__iexact=valeur) & ~Q(email="")))
            .first()
        )
        if utilisateur is None:
            check_password(mot_de_passe, _EMPREINTE_FACTICE)
            from apps.audit.services import enregistrer

            enregistrer(
                "connexion",
                acteur=None,
                pays=None,
                resultat="echec",
                details={"motif": "identifiant_inconnu", "identifiant": identifiant[:150]},
            )
            erreur = _identifiants_invalides()
        elif utilisateur.est_verrouille:
            _auditer_connexion("connexion", utilisateur, "echec", motif="compte_verrouille")
            erreur = _compte_verrouille(utilisateur)
        elif not utilisateur.check_password(mot_de_passe):
            # Les échecs comptés doivent survivre à l'erreur renvoyée.
            erreur = _compter_echec(utilisateur, "mot_de_passe")
        else:
            erreur = None
    if erreur is not None:
        raise erreur
    try:
        verifier_acces_autorise(utilisateur)
    except ErreurMetier as refus:
        with transaction.atomic():
            _auditer_connexion("connexion", utilisateur, "echec", motif=refus.code)
        raise
    return utilisateur


def _ouvrir_session(
    utilisateur, client, *, adresse_ip, agent, appareil, double_auth_validee
) -> Connexion:
    try:
        return _creer_session(
            utilisateur, client, adresse_ip=adresse_ip, agent=agent, appareil=appareil,
            double_auth_validee=double_auth_validee,
        )  # fmt: skip
    except ErreurMetier as refus:
        if refus.code == "appareil_revoque":
            with transaction.atomic():
                _auditer_connexion("connexion", utilisateur, "echec", motif=refus.code)
        raise


def _creer_session(
    utilisateur, client, *, adresse_ip, agent, appareil, double_auth_validee
) -> Connexion:
    with transaction.atomic():
        telephone = _enregistrer_appareil(utilisateur, appareil) if appareil else None
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
            appareil=telephone,
            double_auth_validee=double_auth_validee,
        )
        from apps.audit.services import definir_acteur

        definir_acteur(
            utilisateur, client=client, appareil=str(telephone.pk) if telephone else None
        )
        _auditer_connexion(
            "connexion", utilisateur, "succes", client=client, double_auth=double_auth_validee
        )
    acces, duree = _jeton_acces(session)
    return Connexion(session, acces, rafraichissement, duree)


def connecter(
    identifiant: str,
    mot_de_passe: str,
    client: str,
    *,
    adresse_ip: str | None = None,
    agent: str = "",
    appareil: dict | None = None,
) -> Connexion | EtapeDoubleAuth:
    """Vérifie les identifiants ; ouvre une session, ou demande le code (SEC-003).

    Après 5 échecs consécutifs, le compte est verrouillé 15 minutes, même pour le
    bon mot de passe, et l'utilisateur est prévenu par courriel (SEC-002). Chaque
    tentative, réussie ou non, est auditée (AUD-001).
    """
    from django.core import signing

    from . import double_auth

    utilisateur = _verifier_identifiants(identifiant, mot_de_passe)
    if client == Session.Client.MOBILE and not appareil:
        raise ErreurMetier("appareil_requis", _("L'application doit décrire le téléphone."))
    if double_auth.est_active(utilisateur):
        jeton = signing.dumps(
            {"u": str(utilisateur.pk), "c": client, "a": appareil}, salt=SEL_ETAPE
        )
        return EtapeDoubleAuth(jeton, DUREE_ETAPE)
    return _ouvrir_session(
        utilisateur, client, adresse_ip=adresse_ip, agent=agent, appareil=appareil,
        double_auth_validee=False,
    )  # fmt: skip


def connecter_avec_code(
    jeton_etape: str, code: str, *, adresse_ip: str | None = None, agent: str = ""
) -> Connexion:
    """Deuxième étape : le code de l'application (ou un code de secours) ouvre la session."""
    from django.core import signing

    from . import double_auth

    try:
        etape = signing.loads(jeton_etape, salt=SEL_ETAPE, max_age=DUREE_ETAPE)
    except signing.BadSignature as erreur:
        raise ErreurMetier(
            "etape_expiree",
            _("Le délai est dépassé : reconnectez-vous."),
            status.HTTP_401_UNAUTHORIZED,
        ) from erreur
    with transaction.atomic():
        utilisateur = (
            Utilisateur.objects.select_for_update(of=("self",))
            .select_related("pays_principal")
            .get(pk=etape["u"])
        )
        if utilisateur.est_verrouille:
            erreur = _compte_verrouille(utilisateur)
        elif not double_auth.verifier(utilisateur, code):
            erreur = _compter_echec(utilisateur, "code")
        else:
            erreur = None
    if erreur is not None:
        raise erreur
    verifier_acces_autorise(utilisateur)
    return _ouvrir_session(
        utilisateur, etape["c"], adresse_ip=adresse_ip, agent=agent, appareil=etape["a"],
        double_auth_validee=True,
    )  # fmt: skip


def rafraichir(jeton: str) -> Connexion:
    """Échange un jeton de rafraîchissement contre un nouveau couple de jetons.

    Le jeton change à chaque usage. Un ancien jeton rejoué signale un vol : la
    session est révoquée (architecture §11.1).
    """
    trace = empreinte(jeton)
    with transaction.atomic():
        session = (
            Session.objects.select_for_update(of=("self",))
            .select_related("utilisateur__pays_principal", "appareil")
            .filter(empreinte_rafraichissement=trace)
            .first()
        )
        if session is None:
            rejouee = Session.objects.filter(empreinte_precedente=trace, revoquee_le=None).first()
            if rejouee is not None:
                _revoquer(rejouee, "jeton_rejoue")
                _auditer_connexion(
                    "session.jeton_rejoue", rejouee.utilisateur, "echec", session=str(rejouee.pk)
                )
            erreur = ErreurMetier(
                "session_invalide", _("Session invalide ou expirée."), status.HTTP_401_UNAUTHORIZED
            )
        elif session.appareil_id and session.appareil.est_revoque:
            # SEC-006 : même une session déjà fermée par la révocation reçoit ce code, pour que
            # le téléphone efface ses données au lieu de croire à une simple expiration.
            if session.revoquee_le is None:
                _revoquer(session, "appareil_revoque")
            erreur = _appareil_revoque()
        elif not session.utilisateur.is_active:
            if session.revoquee_le is None:
                _revoquer(session, "compte_suspendu")
            erreur = _compte_desactive()
        elif not session.est_active:
            erreur = ErreurMetier(
                "session_expiree",
                _("Votre session a expiré. Reconnectez-vous."),
                status.HTTP_401_UNAUTHORIZED,
            )
        else:
            erreur = None
            verifier_acces_autorise(session.utilisateur)
            if session.appareil_id:
                session.appareil.dernier_contact = timezone.now()
                session.appareil.save(update_fields=["dernier_contact"])
                noter_contact(session.utilisateur)
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


def _appareil_revoque() -> ErreurMetier:
    return ErreurMetier(
        "appareil_revoque",
        _("Ce téléphone a été révoqué. Contactez votre administrateur pays."),
        status.HTTP_403_FORBIDDEN,
    )


def _enregistrer_appareil(utilisateur: Utilisateur, description: dict) -> Appareil:
    """Enregistre le téléphone à la première connexion, puis met à jour sa description
    (USR-006). Un appareil révoqué est refusé."""
    appareil, cree = Appareil.objects.select_for_update().get_or_create(
        utilisateur=utilisateur,
        identifiant_installation=description["identifiant_installation"],
        defaults={"plateforme": description["plateforme"]},
    )
    if appareil.est_revoque:
        raise _appareil_revoque()
    # NOT-004 : un téléphone de plus sur un compte qui en avait déjà un est signalé par courriel.
    nouveau = (
        cree and Appareil.objects.filter(utilisateur=utilisateur).exclude(pk=appareil.pk).exists()
    )
    appareil.plateforme = description["plateforme"]
    appareil.systeme = description.get("systeme", "")[:60]
    appareil.modele = description.get("modele", "")[:80]
    appareil.version_app = description.get("version_app", "")[:20]
    appareil.dernier_contact = timezone.now()
    appareil.save()
    noter_contact(utilisateur)
    if nouveau:
        transaction.on_commit(lambda: courriels.courriel_nouvel_appareil(utilisateur, appareil))
    return appareil


def noter_contact(utilisateur) -> None:
    """KPI-05 : ce jour, à la date du pays de la personne, son téléphone a échangé."""
    from django.core.cache import cache

    from .models import JourDeContact

    pays = utilisateur.pays_principal
    jour = aujourdhui(pays) if pays else timezone.now().date()
    cle = f"contact:{utilisateur.pk}:{jour.isoformat()}"
    if cache.get(cle):
        return  # déjà noté aujourd'hui : pas d'écriture à chaque rafraîchissement
    JourDeContact.objects.get_or_create(utilisateur=utilisateur, jour=jour)
    cache.set(cle, True, 26 * 3600)


@transaction.atomic
def revoquer_appareil(appareil: Appareil, *, par: Utilisateur | None) -> Appareil:
    """Révoque un téléphone : ses sessions sont fermées, il ne peut plus se reconnecter
    (USR-006 CA2). À sa prochaine tentative, le téléphone reçoit « appareil_revoque » et efface
    ses données locales (SEC-006)."""
    if appareil.est_revoque:
        raise ErreurMetier("appareil_deja_revoque", _("Ce téléphone est déjà révoqué."))
    appareil.revoque_le = timezone.now()
    appareil.revoque_par = par
    appareil.jeton_push = ""
    appareil.save(update_fields=["revoque_le", "revoque_par", "jeton_push"])
    for session in appareil.sessions.filter(revoquee_le=None):
        _revoquer(session, "appareil_revoque")
    _auditer(
        "appareil.revocation", appareil.utilisateur,
        appareil=str(appareil.pk), modele=appareil.modele, plateforme=appareil.plateforme,
    )  # fmt: skip
    return appareil


def changer_langue(utilisateur: Utilisateur, langue: str) -> Utilisateur:
    """Langue de l'interface choisie par l'utilisateur (USR-004)."""
    utilisateur.langue = langue
    utilisateur.save(update_fields=["langue"])
    return utilisateur


def _revoquer(session: Session, motif: str) -> None:
    session.revoquee_le = timezone.now()
    session.motif_revocation = motif
    session.save(update_fields=["revoquee_le", "motif_revocation"])


@transaction.atomic
def enregistrer_jeton_push(appareil: Appareil, jeton: str) -> None:
    """NOT-002 : l'adresse push du téléphone ; vide, il ne reçoit plus rien."""
    Appareil.objects.filter(pk=appareil.pk).update(
        jeton_push=jeton, jeton_push_le=timezone.now() if jeton else None
    )


def deconnecter(session: Session) -> None:
    if session.revoquee_le is None:
        _revoquer(session, "deconnexion")
        # Déconnecté, le téléphone ne doit plus rien recevoir (NOT-002).
        if session.appareil_id:
            Appareil.objects.filter(pk=session.appareil_id).update(jeton_push="")
        _auditer_connexion("deconnexion", session.utilisateur, "succes", session=str(session.pk))


@transaction.atomic
def revoquer_session(session: Session, *, motif: str) -> None:
    """Révocation à distance d'une session (SEC-004) : elle échoue à l'appel suivant."""
    _revoquer(session, motif)
    _auditer_connexion(
        "session.revocation", session.utilisateur, "succes", session=str(session.pk), motif=motif
    )


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
    _auditer("mot_de_passe.lien_envoye", utilisateur, par_administrateur=par_administrateur)
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
    _auditer("mot_de_passe.reinitialisation", utilisateur)
    return utilisateur


@transaction.atomic
def changer_mot_de_passe(utilisateur: Utilisateur, actuel: str, nouveau: str) -> None:
    if not utilisateur.check_password(actuel):
        raise ErreurMetier("mot_de_passe_incorrect", _("Le mot de passe actuel est incorrect."))
    _definir_mot_de_passe(utilisateur, nouveau)
    _auditer("mot_de_passe.changement", utilisateur)


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
    attribue = RoleUtilisateur.objects.create(
        utilisateur=utilisateur,
        role=role,
        pays=pays,
        debut=debut or timezone.now(),
        fin=fin,
        attribue_par=par,
    )
    from apps.audit.services import enregistrer

    enregistrer(
        "role.attribution", objet=utilisateur, pays=pays,
        details={"role": role, "debut": attribue.debut.isoformat(),
                 "fin": attribue.fin.isoformat() if attribue.fin else None},
    )  # fmt: skip
    return attribue


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
    from apps.audit.services import enregistrer

    enregistrer(
        "role.retrait", objet=role.utilisateur, pays=role.pays,
        details={"role": role.role, "fin": role.fin.isoformat()},
    )  # fmt: skip
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
    from apps.audit.services import enregistrer

    enregistrer(
        "affectation.octroi", objet=utilisateur, pays=pays,
        details={"role": role, "motif": affectation.motif, "debut": str(debut),
                 "fin": str(fin) if fin else None},
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
    from apps.audit.services import enregistrer

    enregistrer(
        "affectation.fin", objet=affectation.utilisateur, pays=pays, details={"fin": str(fin)}
    )
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
    from apps.audit.services import enregistrer

    enregistrer(
        "transfert", objet=utilisateur, pays=destination,
        details={"origine": origine.code, "destination": destination.code, "motif": motif.strip()},
    )  # fmt: skip
    return transfert

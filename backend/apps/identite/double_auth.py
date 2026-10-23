"""Double authentification par code à usage unique (TOTP, RFC 6238) — SEC-003.

- Obligatoire pour les rôles sensibles (prd.md SEC-003) : tant qu'elle n'est pas activée,
  le compte n'accède à aucune donnée (CA1) ; facultative pour les autres.
- Le secret est chiffré en base (clé dérivée de `INNOV_CLE_CHIFFREMENT`, ou à défaut de la
  clé secrète du serveur) ; un code déjà utilisé est refusé (anti-rejeu).
- Dix codes de secours à usage unique, montrés une seule fois, gardés en empreinte.
"""

import base64
import hashlib
import secrets
import time

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.socle.erreurs import ErreurMetier

from .models import DoubleAuthentification, Role, RoleUtilisateur, Utilisateur

ROLES_DOUBLE_AUTH = frozenset({Role.ADMIN_SIEGE, Role.DIRECTION_SIEGE, Role.RESPONSABLE_PAYS,
                               Role.ADMIN_PAYS, Role.DF, Role.DM})  # fmt: skip
EMETTEUR = "INNOV CRM"
NOMBRE_CODES_SECOURS = 10


def _chiffreur() -> Fernet:
    base = getattr(settings, "INNOV_CLE_CHIFFREMENT", "") or settings.SECRET_KEY
    cle = hashlib.sha256(f"{base}:double-authentification".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(cle))


def _secret(dossier: DoubleAuthentification) -> str:
    try:
        return _chiffreur().decrypt(dossier.secret_chiffre.encode()).decode()
    except InvalidToken as erreur:
        raise ErreurMetier(
            "double_auth_illisible",
            _("La double authentification doit être réinitialisée par votre administrateur."),
        ) from erreur


def _empreinte(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").strip().lower().encode()).hexdigest()


def exige_double_auth(utilisateur: Utilisateur) -> bool:
    """Un rôle sensible actif, dans n'importe quel pays, rend la double authentification
    obligatoire, si elle est imposée (INNOV_DOUBLE_AUTH_OBLIGATOIRE ; suspendue en 1.1.2)."""
    if not settings.INNOV_DOUBLE_AUTH_OBLIGATOIRE:
        return False
    maintenant = timezone.now()
    return (
        RoleUtilisateur.objects.filter(utilisateur=utilisateur, role__in=ROLES_DOUBLE_AUTH)
        .filter(debut__lte=maintenant)
        .filter(Q(fin__isnull=True) | Q(fin__gt=maintenant))
        .exists()
    )


def dossier(utilisateur: Utilisateur) -> DoubleAuthentification | None:
    return DoubleAuthentification.objects.filter(utilisateur=utilisateur).first()


def est_active(utilisateur: Utilisateur) -> bool:
    d = dossier(utilisateur)
    return d is not None and d.est_active


@transaction.atomic
def initialiser(utilisateur: Utilisateur) -> tuple[str, str]:
    """Tire un nouveau secret (non actif tant qu'un code n'a pas été confirmé)."""
    existant = (
        DoubleAuthentification.objects.select_for_update().filter(utilisateur=utilisateur).first()
    )
    if existant and existant.est_active:
        raise ErreurMetier(
            "double_auth_deja_active", _("La double authentification est déjà active.")
        )
    secret = pyotp.random_base32()
    chiffre = _chiffreur().encrypt(secret.encode()).decode()
    DoubleAuthentification.objects.update_or_create(
        utilisateur=utilisateur,
        defaults={
            "secret_chiffre": chiffre,
            "active_le": None,
            "dernier_pas": 0,
            "codes_secours": [],
        },
    )
    uri = pyotp.TOTP(secret).provisioning_uri(name=utilisateur.username, issuer_name=EMETTEUR)
    return secret, uri


def _verifier_totp(d: DoubleAuthentification, code: str) -> bool:
    code = "".join(c for c in code if c.isdigit())
    if len(code) != 6:
        return False
    totp = pyotp.TOTP(_secret(d))
    maintenant = time.time()
    for decalage in (-1, 0, 1):
        pas = int(maintenant // totp.interval) + decalage
        if pas > d.dernier_pas and secrets.compare_digest(totp.at(pas * totp.interval), code):
            d.dernier_pas = pas
            d.save(update_fields=["dernier_pas"])
            return True
    return False


def _verifier_code_secours(d: DoubleAuthentification, code: str) -> bool:
    empreinte = _empreinte(code)
    if empreinte in d.codes_secours:
        d.codes_secours = [e for e in d.codes_secours if e != empreinte]
        d.save(update_fields=["codes_secours"])
        return True
    return False


def verifier(utilisateur: Utilisateur, code: str) -> bool:
    """Code de l'application, ou code de secours (consommé)."""
    d = DoubleAuthentification.objects.select_for_update().filter(utilisateur=utilisateur).first()
    if d is None or not d.est_active:
        return False
    return _verifier_totp(d, code) or _verifier_code_secours(d, code)


def _nouveaux_codes(d: DoubleAuthentification) -> list[str]:
    codes = [f"{secrets.token_hex(2)}-{secrets.token_hex(3)}" for _ in range(NOMBRE_CODES_SECOURS)]
    d.codes_secours = [_empreinte(c) for c in codes]
    d.save(update_fields=["codes_secours"])
    return codes


@transaction.atomic
def _prevenir(utilisateur: Utilisateur, activee: bool) -> None:
    """NOT-004 : un changement de double authentification est signalé par courriel."""
    from django.db import transaction

    from . import courriels

    transaction.on_commit(lambda: courriels.courriel_double_auth(utilisateur, activee))


def activer(utilisateur: Utilisateur, code: str) -> list[str]:
    """Confirme le premier code ; renvoie les codes de secours (montrés une seule fois)."""
    from apps.audit.services import enregistrer

    d = DoubleAuthentification.objects.select_for_update().filter(utilisateur=utilisateur).first()
    if d is None:
        raise ErreurMetier("double_auth_non_initialisee", _("Commencez par afficher le QR code."))
    if d.est_active:
        raise ErreurMetier(
            "double_auth_deja_active", _("La double authentification est déjà active.")
        )
    if not _verifier_totp(d, code):
        raise ErreurMetier("code_invalide", _("Code incorrect ou expiré."))
    d.active_le = timezone.now()
    d.save(update_fields=["active_le"])
    enregistrer("double_auth.activation", objet=utilisateur, pays=utilisateur.pays_principal)
    _prevenir(utilisateur, activee=True)
    return _nouveaux_codes(d)


@transaction.atomic
def regenerer_codes(utilisateur: Utilisateur, code: str) -> list[str]:
    from apps.audit.services import enregistrer

    if not verifier(utilisateur, code):
        raise ErreurMetier("code_invalide", _("Code incorrect ou expiré."))
    enregistrer("double_auth.codes_secours", objet=utilisateur, pays=utilisateur.pays_principal)
    return _nouveaux_codes(dossier(utilisateur))


@transaction.atomic
def desactiver(utilisateur: Utilisateur, code: str) -> None:
    from apps.audit.services import enregistrer

    if exige_double_auth(utilisateur):
        raise ErreurMetier(
            "double_auth_obligatoire",
            _("Votre rôle impose la double authentification : elle ne peut pas être désactivée."),
        )
    if not verifier(utilisateur, code):
        raise ErreurMetier("code_invalide", _("Code incorrect ou expiré."))
    DoubleAuthentification.objects.filter(utilisateur=utilisateur).delete()
    enregistrer("double_auth.desactivation", objet=utilisateur, pays=utilisateur.pays_principal)
    _prevenir(utilisateur, activee=False)


@transaction.atomic
def reinitialiser(utilisateur: Utilisateur) -> None:
    """Téléphone perdu : l'administrateur efface la double authentification ; l'utilisateur
    la réactive à sa prochaine connexion. Ses sessions sont fermées."""
    from apps.audit.services import enregistrer

    from .services import revoquer_sessions

    DoubleAuthentification.objects.filter(utilisateur=utilisateur).delete()
    revoquer_sessions(utilisateur, "double_auth_reinitialisee")
    enregistrer("double_auth.reinitialisation", objet=utilisateur, pays=utilisateur.pays_principal)

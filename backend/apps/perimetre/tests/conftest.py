import secrets

import pytest
from rest_framework.test import APIClient

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.socle.services import creer_pays


@pytest.fixture(autouse=True)
def _courriels_immediats(monkeypatch):
    from django.db import transaction

    monkeypatch.setattr(transaction, "on_commit", lambda fonction, *a, **k: fonction())


@pytest.fixture
def monde(db):
    """Deux pays, un compte par rôle dans chacun, et le siège (données fictives)."""
    sn, tg = creer_pays("SN"), creer_pays("TG")
    comptes = {}

    def compte(alias, identifiant, pays, role):
        prenom, nom = identifiant.split(".")
        # Sans mot de passe : ces tests ouvrent leurs sessions directement (et vite).
        utilisateur = creer_utilisateur(
            identifiant, prenom=prenom.title(), nom=nom.title(), pays=pays
        )
        if role:
            attribuer_role(utilisateur, role, pays if pays else None, par=None)
        comptes[alias] = utilisateur
        return utilisateur

    # Alias lisibles dans les tests ; identifiants nominatifs fictifs (USR-001).
    compte("ada.siege", "awa.ndoye", None, Role.ADMIN_SIEGE)
    compte("dina.direction", "binta.sarr", None, Role.DIRECTION_SIEGE)
    compte("theo.technique", "cheikh.ba", None, Role.ADMIN_TECHNIQUE)
    prenoms = {
        "resp": ("rokhaya", Role.RESPONSABLE_PAYS),
        "admin": ("ibrahima", Role.ADMIN_PAYS),
        "df": ("omar", Role.DF),
        "dm": ("lassana", Role.DM),
        "sup": ("nicolas", Role.SUPERVISEUR),
        "deleg": ("gabriel", Role.DELEGUE),
        "sansrole": ("papa", None),
    }
    for pays in (sn, tg):
        c = pays.code.lower()
        for alias, (prenom, role) in prenoms.items():
            compte(f"{alias}.{c}", f"{prenom}.{c}", pays, role)
    return {"sn": sn, "tg": tg, **comptes}


@pytest.fixture
def api():
    return APIClient()


def client_de(utilisateur, pays=None, *, double_auth=True):
    """Client authentifié par une vraie session (jeton d'accès lié à une session).

    Par défaut, la session a validé la double authentification (SEC-003), comme celle d'un
    rôle sensible qui l'a activée ; `double_auth=False` simule un compte qui ne l'a pas fait.
    """
    from django.utils import timezone

    from apps.identite.models import Session
    from apps.identite.services import _jeton_acces, duree_session

    session = Session.objects.create(
        utilisateur=utilisateur,
        client=Session.Client.PORTAIL,
        empreinte_rafraichissement=secrets.token_hex(32),
        expire_le=timezone.now() + duree_session("portail"),
        double_auth_validee=double_auth,
    )
    acces, _ = _jeton_acces(session)
    client = APIClient()
    entetes = {"HTTP_AUTHORIZATION": f"Bearer {acces}"}
    if pays:
        entetes["HTTP_X_PAYS"] = pays
    client.credentials(**entetes)
    return client

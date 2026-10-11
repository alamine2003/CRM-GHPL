# ruff: noqa: F811 — la fixture importée est redéfinie en paramètre.
"""0.9.1 : SEC-008, isolation complète (prd.md §23).

`test_isolation_routes.py` essaie chaque route à identifiant avec un objet d'un autre pays. Ce
module complète la suite :

- chaque route de lecture, essayée par **chaque rôle** d'un autre pays, ne renvoie aucun objet du
  Sénégal (recherche, export, notifications et pilotage compris) ;
- la recherche par nom, les ressemblances et une vraie pièce jointe ;
- à l'intérieur d'un pays, un autre délégué et un superviseur non rattaché n'ouvrent ni le
  planning, ni les visites, ni les rapports d'un délégué (rôle, réseau, délégué).

Grafana a sa propre preuve avec les rôles réels de la base (`pilotage/tests/test_grafana.py`).
"""

import json
import uuid
from datetime import date

import pytest
from django.urls import get_resolver

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org

from .conftest import DEBUT_ROLES, client_de
from .test_isolation_routes import _routes, _url, senegal  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.isolation]

#: Routes de lecture sans identifiant qui ne parlent d'aucune donnée de pays.
SANS_DONNEES = {"schema"}
ROLES_TOGO = ("admin.tg", "resp.tg", "df.tg", "dm.tg", "sup.tg", "deleg.tg", "sansrole.tg")


def _lectures():
    for chemin, motif in _routes(get_resolver().url_patterns):
        vue = getattr(motif.callback, "view_class", None)
        if "<" in chemin or vue is None or not hasattr(vue, "get") or motif.name in SANS_DONNEES:
            continue
        yield "/" + chemin


@pytest.fixture
def traces(monde, senegal):
    """Ce qui trahirait le Sénégal : ses identifiants et des noms qu'il est seul à porter."""
    identifiants = {str(v) for v in senegal.values()} - {str(monde["df.sn"].pk)}
    return identifiants | {"Ndiaye", "VM Louga", "Vasculor", "Louga Centre"}


def _fuites(reponse, traces) -> list[str]:
    if reponse.status_code != 200:
        return []
    contenu = getattr(reponse, "content", b"")
    if not contenu and hasattr(reponse, "streaming_content"):
        contenu = b"".join(reponse.streaming_content)
    texte = contenu.decode("utf-8", errors="ignore")
    try:
        texte = json.dumps(json.loads(texte), ensure_ascii=False)
    except ValueError:
        pass
    # Sans tenir compte de la casse : les noms de famille s'écrivent en capitales.
    texte = texte.lower()
    return sorted(t for t in traces if t.lower() in texte)


def test_sec008_aucune_lecture_d_aucun_role_ne_sort_de_son_pays(monde, senegal, traces):
    """Chaque rôle du Togo lit chaque route de lecture : rien du Sénégal, jamais."""
    lectures = list(_lectures())
    assert len(lectures) > 40
    fuites = []
    for alias in ROLES_TOGO:
        client = client_de(monde[alias])
        for url in lectures:
            trouve = _fuites(client.get(url), traces)
            if trouve:
                fuites.append((alias, url, trouve))
    assert fuites == []


def test_sec008_contre_epreuve_le_senegal_voit_ses_donnees(monde, senegal, traces):
    """Les traces existent bien : l'administrateur du Sénégal les retrouve."""
    client = client_de(monde["admin.sn"])
    vues = set()
    for url in _lectures():
        vues |= set(_fuites(client.get(url), traces))
    assert {"Ndiaye", "VM Louga", "Vasculor"} <= vues


def test_sec008_recherche_et_ressemblances(monde, senegal):
    togo = client_de(monde["admin.tg"])
    for url in ("/api/v1/prospects/?q=Ndiaye&portee=pays", "/api/v1/etablissements/?q=Cabinet",
                "/api/v1/prospects/ressemblants/?nom=Ndiaye",
                "/api/v1/prospects/?q=Ndiaye&statut=archive"):  # fmt: skip
        r = togo.get(url)
        assert r.status_code in (200, 400), url
        texte = r.content.decode().lower()
        assert "ndiaye" not in texte and "cabinet" not in texte, url


@pytest.fixture
def piece(monde, senegal):
    """Une vraie pièce jointe d'un rapport du Sénégal."""
    from apps.planning.models import Visite
    from apps.rapports.models import PieceJointe, Rapport

    visite = Visite.objects.get(pk=senegal["visite"])
    rapport = Rapport.objects.create(pays=monde["sn"], visite=visite, delegue=monde["deleg.sn"])
    return PieceJointe.objects.create(
        id=uuid.uuid4(), pays=monde["sn"], rapport=rapport, nom="etude.pdf", taille=10,
        type_mime="application/pdf", prise_le=visite.planning.cree_le,
    )  # fmt: skip


def test_sec008_une_piece_jointe_d_un_autre_pays(monde, senegal, piece):
    for alias in ("admin.tg", "resp.tg", "sup.tg"):
        r = client_de(monde[alias]).get(f"/api/v1/rapports/pieces/{piece.pk}/")
        assert r.status_code in (403, 404), alias


# --- À l'intérieur d'un pays : rôle, réseau, délégué -------------------------------------------

#: Les objets du planning d'un délégué, et les routes qui les ouvrent.
PREFIXES_DU_DELEGUE = ("planning-", "visite", "rapport-", "passage-", "activite")


@pytest.fixture
def voisins(monde, senegal):
    """Au Sénégal, un autre délégué (autre réseau, autre poste) et un superviseur qui n'est pas
    celui du délégué."""
    sn = monde["sn"]
    division = org.creer_division(sn, "DERMA", "Dermatologie")
    reseau = org.creer_reseau(sn, division, "R2", "Peau")
    secteur = org.creer_secteur(sn, org.creer_zone(sn, "Sud"), "Ziguinchor")
    poste = org.creer_poste(sn, "vm", "VM Ziguinchor", [reseau], [secteur])
    comptes = {}
    for alias, identifiant, role in (("deleg2", "moussa.sn", Role.DELEGUE),
                                     ("sup2", "aida.sn", Role.SUPERVISEUR)):  # fmt: skip
        comptes[alias] = creer_utilisateur(identifiant, prenom="Fictif", nom="Fictif", pays=sn)
        attribuer_role(comptes[alias], role, sn, par=None, debut=DEBUT_ROLES)
    org.occuper(poste, comptes["deleg2"])
    org.rattacher(poste, comptes["sup2"])
    return comptes


def test_sec008_un_autre_delegue_ou_superviseur_n_ouvre_rien_du_delegue(monde, senegal, voisins):
    essais, fuites = 0, []
    for chemin, motif in _routes(get_resolver().url_patterns):
        vue = getattr(motif.callback, "view_class", None)
        if vue is None or not (motif.name or "").startswith(PREFIXES_DU_DELEGUE):
            continue
        if motif.name not in senegal or "<uuid:id>" not in chemin:
            continue
        methodes = [m for m in ("get", "post", "put", "patch", "delete") if hasattr(vue, m)]
        for alias, compte in voisins.items():
            client = client_de(compte)
            for methode in methodes:
                r = getattr(client, methode)(_url(chemin, senegal[motif.name]), {}, format="json")
                essais += 1
                if r.status_code not in (403, 404):
                    fuites.append((alias, methode.upper(), motif.name, r.status_code))
    assert essais > 40
    assert fuites == []


def test_sec008_les_files_du_superviseur_restent_a_son_equipe(monde, senegal, voisins):
    """Le superviseur non rattaché ne voit ni la semaine ni la journée du délégué."""
    sup2 = client_de(voisins["sup2"])
    for url in ("/api/v1/plannings/a-valider/", "/api/v1/rapports/a-traiter/",
                "/api/v1/rapports/retards/", "/api/v1/pilotage/equipe/"):  # fmt: skip
        r = sup2.get(url)
        assert str(monde["deleg.sn"].pk) not in r.content.decode(), url
    jour = date(2099, 4, 7).isoformat()
    r = sup2.get(f"/api/v1/rapports/journee/?delegue={monde['deleg.sn'].pk}&date={jour}")
    assert r.status_code in (403, 404)


def test_sec008_les_exports_d_un_pays_ne_portent_que_lui(monde, senegal, traces):
    """Indicateurs et rapports, CSV et Excel : rien du Sénégal dans un export du Togo."""
    for alias in ("resp.tg", "df.tg", "dm.tg", "sup.tg"):
        client = client_de(monde[alias])
        for contenu in ("indicateurs", "rapports"):
            for fichier in ("csv", "xlsx"):
                r = client.get(f"/api/v1/pilotage/export/?contenu={contenu}&fichier={fichier}"
                               "&periode=1a")  # fmt: skip
                assert r.status_code in (200, 403), (alias, contenu, fichier)
                assert _fuites(r, traces) == [], (alias, contenu, fichier)

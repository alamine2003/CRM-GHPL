"""Règles du suivi des ventes (prd.md §14.84) : saisie, clients, rattachement au poste, au
réseau et à la zone. Les vues vérifient les droits (matrice) ; l'audit est écrit ici.
"""

from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils.translation import gettext as _

from apps.organisation.models import Occupation, Poste, Zone
from apps.referentiel.models import Portefeuille, Produit
from apps.socle.erreurs import ErreurMetier

from .models import Client, SourceVente, TypeClient, Vente


def premier_du_mois(jour: date) -> date:
    return jour.replace(day=1)


def dernier_du_mois(jour: date) -> date:
    return jour.replace(day=monthrange(jour.year, jour.month)[1])


def _auditer(action: str, vente: Vente, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"ventes.{action}", objet=vente, pays=vente.pays, details=details)


def nombre(valeur, champ: str, *, entier: bool = False) -> Decimal:
    """Un nombre lu d'une saisie ou d'un fichier : « 1 250,50 » comme « 1250.5 »."""
    texte = str(valeur).strip().replace(" ", "").replace("\xa0", "").replace(" ", "")
    texte = texte.replace(",", ".")
    try:
        n = Decimal(texte)
    except InvalidOperation:
        raise ErreurMetier(
            "nombre_invalide",
            _("« %(valeur)s » n'est pas un nombre.") % {"valeur": valeur},
            champ=champ,
        ) from None
    if not n.is_finite() or abs(n) >= Decimal("1e12"):
        raise ErreurMetier("nombre_invalide", _("Ce nombre est trop grand."), champ=champ)
    if entier and n != n.to_integral_value():
        raise ErreurMetier("nombre_invalide", _("La quantité est un nombre entier."), champ=champ)
    return n


def poste_du_mois(pays, delegue, mois: date) -> Poste | None:
    """Le poste que le délégué occupait pendant le mois (le principal d'abord)."""
    debut, fin = premier_du_mois(mois), dernier_du_mois(mois)
    choisie = (
        Occupation.objects.filter(pays=pays, utilisateur=delegue, debut__lte=fin)
        .filter(Q(fin__isnull=True) | Q(fin__gt=debut))
        .select_related("poste")
        .order_by("-principal", "-debut")
        .first()
    )
    return choisie.poste if choisie else None


def reseau_du_produit(pays, produit: Produit, poste: Poste | None, mois: date):
    """Le réseau dont le portefeuille porte le produit ce mois-là. Faute de lien daté de ce mois
    (les portefeuilles sont souvent saisis après coup), le lien le plus récent du produit ; si
    plusieurs réseaux le portent, celui du poste du délégué d'abord."""
    debut, fin = premier_du_mois(mois), dernier_du_mois(mois)
    liens = Portefeuille.objects.filter(pays=pays, produit=produit, archive_le__isnull=True)
    du_mois = liens.filter(debut__lte=fin).exclude(fin__lte=debut)
    candidats = du_mois if du_mois.exists() else liens
    reseaux = [lien.reseau for lien in candidats.select_related("reseau").order_by("-debut")]
    if not reseaux:
        return None
    if poste is not None:
        du_poste = set(poste.reseaux.values_list("pk", flat=True))
        for reseau in reseaux:
            if reseau.pk in du_poste:
                return reseau
    return reseaux[0]


def verifier_delegue(pays, delegue) -> None:
    if not Occupation.objects.filter(pays=pays, utilisateur=delegue).exists():
        raise ErreurMetier(
            "delegue_inconnu", _("Cette personne n'occupe aucun poste dans ce pays."),
            champ="delegue",
        )  # fmt: skip


@transaction.atomic
def creer_client(pays, nom: str, type_: str, zone: Zone | None = None) -> Client:
    nom = (nom or "").strip()
    if not nom:
        raise ErreurMetier("champ_requis", _("Ce champ est obligatoire."), champ="nom")
    if type_ not in TypeClient.values:
        raise ErreurMetier("type_invalide", _("Type de client inconnu."), champ="type")
    existant = Client.objects.filter(
        pays=pays, type=type_, nom__iexact=nom, archive_le__isnull=True
    ).first()
    if existant:
        raise ErreurMetier("client_existant", _("Ce client existe déjà."), champ="nom")
    client = Client(pays=pays, nom=nom, type=type_, zone=zone)
    client.save()
    return client


def enregistrer_ligne(
    pays, auteur, *, mois: date, delegue, produit: Produit, client: Client,
    quantite: Decimal, montant_ttc: Decimal, source: str, lot=None, remplacer: bool = False,
) -> tuple[Vente, bool]:  # fmt: skip
    """Une ligne mensuelle. Une ligne qui existe déjà pour le même délégué, produit, client et
    mois est remplacée si `remplacer` (import), sinon refusée (saisie : on la modifie)."""
    mois = premier_du_mois(mois)
    verifier_delegue(pays, delegue)
    existante = Vente.objects.filter(
        pays=pays, mois=mois, delegue=delegue, produit=produit, client=client,
        archive_le__isnull=True,
    ).first()  # fmt: skip
    if existante and not remplacer:
        raise ErreurMetier(
            "vente_existante",
            _("Une ligne existe déjà pour ce mois, ce délégué, ce produit et ce client : "
              "modifiez-la."),
        )  # fmt: skip
    poste = poste_du_mois(pays, delegue, mois)
    valeurs = {
        "poste": poste,
        "reseau": reseau_du_produit(pays, produit, poste, mois),
        "zone": client.zone,
        "quantite": int(quantite),
        "montant_ttc": montant_ttc,
        "source": source,
        "lot": lot,
        "saisi_par": auteur,
    }
    if existante:
        for champ, valeur in valeurs.items():
            setattr(existante, champ, valeur)
        existante.save()
        if source == SourceVente.SAISIE:
            _auditer("modification", existante, mois=str(mois))
        return existante, False
    vente = Vente(pays=pays, mois=mois, delegue=delegue, produit=produit, client=client, **valeurs)
    vente.save()
    if source == SourceVente.SAISIE:
        _auditer("saisie", vente, mois=str(mois))
    return vente, True


@transaction.atomic
def modifier_ligne(vente: Vente, auteur, *, quantite=None, montant_ttc=None) -> Vente:
    """Corriger les chiffres d'une ligne : seuls la quantité et le montant changent ; pour le
    reste (mois, délégué, produit, client), on archive la ligne et on en saisit une autre."""
    avant = {"quantite": vente.quantite, "montant_ttc": str(vente.montant_ttc)}
    if quantite is not None:
        vente.quantite = int(quantite)
    if montant_ttc is not None:
        vente.montant_ttc = montant_ttc
    vente.source = SourceVente.SAISIE
    vente.saisi_par = auteur
    vente.save()
    _auditer("modification", vente, avant=avant,
             apres={"quantite": vente.quantite, "montant_ttc": str(vente.montant_ttc)})  # fmt: skip
    return vente


@transaction.atomic
def archiver_ligne(vente: Vente) -> None:
    vente.archiver()
    _auditer("archivage", vente, mois=str(vente.mois))

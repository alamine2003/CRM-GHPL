"""Import du fichier de ventes (classeur Excel) : une ligne par délégué, produit, client et mois.

Colonnes (la première ligne qui les porte sert d'en-tête, l'ordre est libre) :
MOIS · DELEGUE · PRODUIT · CLIENT · TYPE CLIENT · ZONE (facultative) · QUANTITE · CA TTC.

- Une simulation compte ce qui serait créé ou remplacé, sans rien écrire (transaction annulée).
- Chaque ligne rejetée a son motif dans le rapport : mois illisible, délégué ou produit inconnu,
  type de client inconnu, nombre invalide. **Un produit inconnu n'est jamais créé** : le
  catalogue vient du référentiel.
- Un réimport remplace les lignes déjà là (même mois, délégué, produit, client) et n'en ajoute
  pas : le même fichier, importé deux fois, donne le même résultat.
- Plusieurs lignes du fichier pour la même clé s'additionnent (plusieurs factures du mois).
- Un client inconnu est créé, avec le type et la zone du fichier.
"""

import re
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Utilisateur
from apps.imports.birdnotes import FichierInvalide, Rapport, _Simulation
from apps.imports.models import LotImport, Source
from apps.imports.organisation import cle
from apps.imports.tableur import ClasseurIllisible, lire_classeur
from apps.organisation.models import Occupation, Zone
from apps.referentiel.models import Produit
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays

from . import services
from .models import Client, SourceVente, TypeClient

COLONNES = {
    "mois": ("MOIS", "PERIODE"),
    "delegue": ("DELEGUE", "DELEGUE MEDICAL", "NOM ET PRENOMS"),
    "produit": ("PRODUIT", "PRODUITS"),
    "client": ("CLIENT", "PHARMACIE", "CLIENT / GROSSISTE"),
    "type": ("TYPE CLIENT", "TYPE DE CLIENT", "TYPE"),
    "zone": ("ZONE",),
    "quantite": ("QUANTITE", "QTE", "QUANTITES"),
    "montant": ("CA TTC", "CHIFFRE D AFFAIRES TTC", "CHIFFRE D'AFFAIRES TTC", "MONTANT TTC"),
}
OBLIGATOIRES = ("mois", "delegue", "produit", "client", "type", "quantite", "montant")
TYPES = {
    "PHARMACIE": TypeClient.PHARMACIE,
    "PHARMACIES": TypeClient.PHARMACIE,
    "PARAPHARMACIE": TypeClient.PARAPHARMACIE,
    "PARA": TypeClient.PARAPHARMACIE,
    "GROSSISTE": TypeClient.GROSSISTE,
    "GROSSISTES": TypeClient.GROSSISTE,
}


def lire_mois(texte: str) -> date | None:
    """« 2026-10 », « 2026-10-01 », « 10/2026 », « 01/10/2026 » ou un numéro de série Excel."""
    t = (texte or "").strip()
    try:
        if re.fullmatch(r"\d{4}-\d{1,2}(-\d{1,2})?", t):
            return date(int(t[:4]), int(t[5:7].rstrip("-")), 1)
        if re.fullmatch(r"\d{1,2}/\d{4}", t):
            mois, annee = t.split("/")
            return date(int(annee), int(mois), 1)
        if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", t):
            _jour, mois, annee = t.split("/")
            return date(int(annee), int(mois), 1)
        if re.fullmatch(r"\d{5}(\.\d+)?", t):
            return (date(1899, 12, 30) + timedelta(days=int(float(t)))).replace(day=1)
    except ValueError:
        return None
    return None


def _entetes(lignes: list[list[str]]) -> tuple[int, dict[str, int]]:
    for numero, ligne in enumerate(lignes[:10]):
        positions = {cle(v): i for i, v in enumerate(ligne) if v}
        trouvees = {}
        for nom, variantes in COLONNES.items():
            for variante in variantes:
                if cle(variante) in positions:
                    trouvees[nom] = positions[cle(variante)]
                    break
        if all(k in trouvees for k in OBLIGATOIRES):
            return numero, trouvees
    attendues = ", ".join(COLONNES[k][0] for k in OBLIGATOIRES)
    raise FichierInvalide(_("Colonnes attendues introuvables : %(colonnes)s.")
                          % {"colonnes": attendues})  # fmt: skip


def lire_fichier(contenu: bytes) -> list[dict]:
    try:
        feuilles = lire_classeur(contenu)
    except ClasseurIllisible as erreur:
        raise FichierInvalide(_("Fichier illisible : classeur Excel (.xlsx) attendu.")) from erreur
    for lignes in feuilles.values():
        try:
            debut, colonnes = _entetes(lignes)
        except FichierInvalide:
            continue
        resultat = []
        for numero, ligne in enumerate(lignes[debut + 1 :], start=debut + 2):
            valeurs = {k: (ligne[i] if i < len(ligne) else "").strip() for k, i in colonnes.items()}
            if any(valeurs.values()):
                resultat.append({"ligne": numero, **valeurs})
        return resultat
    raise FichierInvalide(_("Aucune feuille au format du fichier de ventes."))


class ImportVentes:
    def __init__(self, pays: Pays, auteur: Utilisateur, lignes: list[dict], lot: LotImport):
        self.pays, self.auteur, self.lignes, self.lot = pays, auteur, lignes, lot
        self.rapport = Rapport()
        self.produits = {}
        for p in Produit.objects.filter(pays=pays, archive_le__isnull=True):
            self.produits.setdefault(cle(p.libelle), p)
            self.produits.setdefault(cle(p.code), p)
        self.zones = {cle(z.libelle): z for z in Zone.objects.filter(pays=pays)}
        self.clients = {
            (c.type, cle(c.nom)): c
            for c in Client.objects.filter(pays=pays, archive_le__isnull=True)
        }
        self.personnes: dict[str, Utilisateur] = {}
        ids = Occupation.objects.filter(pays=pays).values("utilisateur_id")
        for u in Utilisateur.objects.filter(pk__in=ids):
            for forme in (f"{u.first_name} {u.last_name}", f"{u.last_name} {u.first_name}",
                          u.username, u.email):  # fmt: skip
                if forme.strip():
                    self.personnes.setdefault(cle(forme), u)

    def _rejeter(self, ligne: dict, motif: str) -> None:
        self.rapport.signaler("vente", f"ligne {ligne['ligne']}", motif, "rejet")

    def _client(self, ligne: dict, type_: str) -> Client:
        existant = self.clients.get((type_, cle(ligne["client"])))
        if existant:
            return existant
        zone = None
        if ligne.get("zone"):
            zone = self.zones.get(cle(ligne["zone"]))
            if zone is None:
                self.rapport.signaler(
                    "vente", f"ligne {ligne['ligne']}",
                    _("Zone « %(zone)s » inconnue : le client est créé sans zone.")
                    % {"zone": ligne["zone"]},
                )  # fmt: skip
        client = services.creer_client(self.pays, ligne["client"], type_, zone)
        self.clients[(type_, cle(client.nom))] = client
        self.rapport.compter("clients", "crees")
        return client

    def executer(self) -> Rapport:
        cumul: dict[tuple, dict] = defaultdict(lambda: {"quantite": Decimal(0),
                                                        "montant": Decimal(0)})  # fmt: skip
        for ligne in self.lignes:
            mois = lire_mois(ligne["mois"])
            if mois is None:
                self._rejeter(ligne, _("Mois illisible : « %(v)s ».") % {"v": ligne["mois"]})
                continue
            delegue = self.personnes.get(cle(ligne["delegue"]))
            if delegue is None:
                self._rejeter(ligne, _("Délégué inconnu : « %(v)s ».") % {"v": ligne["delegue"]})
                continue
            produit = self.produits.get(cle(ligne["produit"]))
            if produit is None:
                self._rejeter(ligne, _("Produit inconnu : « %(v)s ».") % {"v": ligne["produit"]})
                continue
            type_ = TYPES.get(cle(ligne["type"]))
            if type_ is None:
                self._rejeter(
                    ligne, _("Type de client inconnu : « %(v)s ».") % {"v": ligne["type"]}
                )
                continue
            if not ligne["client"]:
                self._rejeter(ligne, _("Client manquant."))
                continue
            try:
                quantite = services.nombre(ligne["quantite"], "quantite", entier=True)
                montant = services.nombre(ligne["montant"], "montant_ttc")
            except ErreurMetier as erreur:
                self._rejeter(ligne, str(erreur.detail))
                continue
            client = self._client(ligne, type_)
            somme = cumul[(mois, delegue.pk, produit.pk, client.pk)]
            somme["quantite"] += quantite
            somme["montant"] += montant
            somme.update(delegue=delegue, produit=produit, client=client, mois=mois)
        for somme in cumul.values():
            _vente, cree = services.enregistrer_ligne(
                self.pays, self.auteur, mois=somme["mois"], delegue=somme["delegue"],
                produit=somme["produit"], client=somme["client"],
                quantite=somme["quantite"], montant_ttc=somme["montant"],
                source=SourceVente.IMPORT, lot=self.lot, remplacer=True,
            )  # fmt: skip
            self.rapport.compter("ventes", "crees" if cree else "remplacees")
        return self.rapport


def importer(
    pays: Pays, auteur: Utilisateur, contenu: bytes, nom_fichier: str, *, simulation: bool
) -> LotImport:
    """Importe (ou simule) le fichier de ventes d'un pays."""
    lignes = lire_fichier(contenu)
    debut = timezone.now()
    rapport = Rapport()

    def nouveau_lot(statut, simule):
        return LotImport(
            pays=pays, source=Source.VENTES, fichier=nom_fichier[:200], simulation=simule,
            statut=statut, lance_par=auteur, debut=debut,
        )  # fmt: skip

    try:
        with transaction.atomic():
            lot = nouveau_lot(LotImport.Statut.TERMINE, simulation)
            lot.save()
            rapport = ImportVentes(pays, auteur, lignes, lot).executer()
            if simulation:
                raise _Simulation
    except _Simulation:
        lot = nouveau_lot(LotImport.Statut.SIMULE, True)
    lot.fin = timezone.now()
    lot.compteurs = {k: dict(v) for k, v in rapport.compteurs.items()}
    lot.anomalies = rapport.anomalies
    lot.save()
    from apps.audit.services import enregistrer

    enregistrer(
        "import.ventes", objet=lot, pays=pays,
        details={"simulation": simulation, "compteurs": lot.compteurs,
                 "anomalies": len(lot.anomalies)},
    )  # fmt: skip
    return lot

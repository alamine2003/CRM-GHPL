"""Import du fichier d'organisation (ORG-014).

Le fichier est un classeur Excel au format du fichier d'organisation : une feuille
« ORGANISATION », une ligne par poste, avec les colonnes GAMME (division), RESEAUX (réseau),
DF, DM, SUPERVISEUR, ZONE, SECTEUR / VILLE, NOM ET PRENOMS (occupant), FONCTION (type de
poste) et PRODUITS DE LA GAMME (portefeuille du réseau, séparés par « ; »).

- CA1 : une simulation compte créations et modifications sans rien écrire (transaction
  annulée), comme l'import BirdNotes.
- CA2 : chaque ligne rejetée a un motif dans le rapport.
- CA3 : « POSTE NON POURVU » (ou une case vide) crée un poste vacant.
- CA4 : un réimport retrouve ce qu'il a créé (références externes, noms normalisés) et ne crée
  aucun doublon.

Hypothèses [H] : le dernier mot de « NOM ET PRENOMS » est le nom, le reste le prénom ; une
personne inconnue reçoit un compte sans mot de passe (lien d'activation envoyé par
l'administrateur) ; « (assuré par les superviseurs) » désigne un superviseur occupant le poste ;
un produit absent du référentiel est signalé, jamais créé.
"""

import re
import unicodedata
from collections import Counter, defaultdict

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Role, RoleUtilisateur, Utilisateur
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.organisation.models import (
    Division,
    Occupation,
    PerimetreReseau,
    Poste,
    Rattachement,
    Reseau,
    Secteur,
    TypePoste,
    Zone,
    actif_le,
)
from apps.referentiel.models import Produit
from apps.referentiel.services import code_depuis, definir_portefeuille, portefeuille_actif
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .birdnotes import FichierInvalide, Rapport, _Simulation
from .models import LotImport, ReferenceExterne, Source
from .tableur import ClasseurIllisible, lire_classeur

COLONNES = {
    "gamme": "GAMME",
    "reseau": "RESEAUX",
    "df": "DF",
    "dm": "DM",
    "superviseur": "SUPERVISEUR",
    "zone": "ZONE",
    "secteur": "SECTEUR / VILLE",
    "personne": "NOM ET PRENOMS",
    "fonction": "FONCTION",
    "produits": "PRODUITS DE LA GAMME",
}
OBLIGATOIRES = ("reseau", "zone", "secteur", "personne", "fonction")
VACANT = re.compile(r"^(POSTE\s+)?(NON\s+POURVU|VACANT|A\s+POURVOIR)$")
LIBELLES_TYPE = {TypePoste.VM: "VM", TypePoste.VM_OTC: "VM OTC", TypePoste.KAM: "KAM",
                 TypePoste.DERMO: "Dermo"}  # fmt: skip


def cle(texte: str | None) -> str:
    """Forme de comparaison : sans accents, majuscules, espaces simples."""
    texte = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texte).strip().upper()


def type_poste(fonction: str) -> tuple[str | None, bool]:
    """(type de poste, assuré par un superviseur)."""
    f = cle(fonction)
    superviseur = "SUPERVISEUR" in f
    if "DERMO" in f:
        return TypePoste.DERMO, superviseur
    if "KAM" in f:
        return TypePoste.KAM, superviseur
    if "OTC" in f and "VM" in f:
        return TypePoste.VM_OTC, superviseur
    if re.match(r"^(VM|VISITEUR)", f):
        return TypePoste.VM, superviseur
    return None, superviseur


def _entetes(lignes: list[list[str]]) -> tuple[int, dict[str, int]]:
    for numero, ligne in enumerate(lignes[:10]):
        positions = {cle(v): i for i, v in enumerate(ligne) if v}
        trouvees = {k: positions[c] for k, c in COLONNES.items() if c in positions}
        if all(k in trouvees for k in OBLIGATOIRES):
            return numero, trouvees
    raise FichierInvalide(
        _("Colonnes attendues introuvables : %(colonnes)s.")
        % {"colonnes": ", ".join(COLONNES[k] for k in OBLIGATOIRES)}
    )


def lire_fichier(contenu: bytes) -> list[dict]:
    """Lignes de la feuille « ORGANISATION » (ou de la première feuille au bon format)."""
    try:
        feuilles = lire_classeur(contenu)
    except ClasseurIllisible as erreur:
        raise FichierInvalide(_("Fichier illisible : classeur Excel (.xlsx) attendu.")) from (
            erreur
        )
    ordre = sorted(feuilles, key=lambda nom: cle(nom) != "ORGANISATION")
    for nom in ordre:
        try:
            debut, colonnes = _entetes(feuilles[nom])
        except FichierInvalide:
            continue
        resultat = []
        for numero, ligne in enumerate(feuilles[nom][debut + 1 :], start=debut + 2):
            valeurs = {k: (ligne[i] if i < len(ligne) else "").strip() for k, i in colonnes.items()}
            if any(valeurs.values()):
                resultat.append({"ligne": numero, **valeurs})
        return resultat
    raise FichierInvalide(_("Aucune feuille au format du fichier d'organisation."))


def _scinder_nom(nom_complet: str) -> tuple[str, str]:
    mots = re.sub(r"\s+", " ", nom_complet).strip().split(" ")
    if len(mots) == 1:
        return mots[0].title(), mots[0].upper()
    return " ".join(mots[:-1]).title(), mots[-1].upper()


class ImportOrganisation:
    def __init__(self, pays: Pays, auteur: Utilisateur, lignes: list[dict], lot: LotImport):
        self.pays, self.auteur, self.lignes, self.lot = pays, auteur, lignes, lot
        self.rapport = Rapport()
        self.jour = aujourdhui(pays)
        self.refs = {
            r.identifiant: r.objet_id
            for r in ReferenceExterne.objects.filter(pays=pays, source=Source.ORGANISATION)
        }
        self.divisions = {cle(d.libelle): d for d in Division.objects.filter(pays=pays)}
        self.reseaux = {cle(r.libelle): r for r in Reseau.objects.filter(pays=pays)}
        self.zones = {cle(z.libelle): z for z in Zone.objects.filter(pays=pays)}
        self.secteurs = {cle(s.libelle): s for s in Secteur.objects.filter(pays=pays)}
        self.catalogue = {cle(p.libelle): p for p in Produit.objects.filter(
            pays=pays, archive_le__isnull=True)}  # fmt: skip
        self.personnes: dict[str, Utilisateur] = {}
        for u in Utilisateur.objects.filter(pays_principal=pays):
            self.personnes.setdefault(cle(f"{u.first_name} {u.last_name}"), u)
            self.personnes.setdefault(cle(f"{u.last_name} {u.first_name}"), u)
        self.portefeuilles: dict[Reseau, set] = defaultdict(set)
        self.produits_inconnus: Counter = Counter()

    # --- référentiel de l'organisation ----------------------------------------------------

    def _obtenir(self, cache: dict, entite: str, libelle: str, creer):
        objet = cache.get(cle(libelle))
        if objet is None:
            objet = creer()
            cache[cle(libelle)] = objet
            self.rapport.compter(entite, "crees")
        return objet

    def division(self, libelle: str) -> Division:
        libelle = libelle or _("Sans gamme")
        return self._obtenir(self.divisions, "divisions", libelle, lambda: org.creer_division(
            self.pays, code_depuis(libelle).upper(), libelle.strip()))  # fmt: skip

    def reseau(self, gamme: str, libelle: str) -> Reseau:
        def creer():
            code = code_depuis(libelle).upper()
            return org.creer_reseau(self.pays, self.division(gamme), code, libelle.strip())

        return self._obtenir(self.reseaux, "reseaux", libelle, creer)

    def zone(self, libelle: str) -> Zone:
        def creer():
            return org.creer_zone(self.pays, libelle.strip().title())

        return self._obtenir(self.zones, "zones", libelle, creer)

    def secteur(self, zone: str, libelle: str) -> Secteur:
        return self._obtenir(self.secteurs, "secteurs", libelle, lambda: org.creer_secteur(
            self.pays, self.zone(zone), libelle.strip().title()))  # fmt: skip

    # --- personnes ------------------------------------------------------------------------

    def identifiant_libre(self, prenom: str, nom: str) -> str:
        base = code_depuis(f"{prenom.split(' ')[0]}.{nom}").replace("_", ".")
        base = re.sub(r"\.+", ".", base).strip(".")[:40]
        identifiant, n = base, 1
        while Utilisateur.objects.filter(username=identifiant).exists():
            n += 1
            identifiant = f"{base}{n}"
        return identifiant

    def personne(self, nom_complet: str, role: str) -> Utilisateur:
        """Compte du pays au nom donné (créé s'il n'existe pas) portant le rôle demandé."""
        utilisateur = self.personnes.get(cle(nom_complet))
        if utilisateur is None:
            prenom, nom = _scinder_nom(nom_complet)
            utilisateur = creer_utilisateur(
                self.identifiant_libre(prenom, nom), prenom=prenom, nom=nom, pays=self.pays
            )
            self.personnes[cle(nom_complet)] = utilisateur
            self.rapport.compter("comptes", "crees")
        maintenant = timezone.now()
        if not RoleUtilisateur.objects.filter(
            Q(fin__isnull=True) | Q(fin__gt=maintenant),
            debut__lte=maintenant, utilisateur=utilisateur, pays=self.pays, role=role,
        ).exists():  # fmt: skip
            attribuer_role(utilisateur, role, self.pays, par=self.auteur)
            self.rapport.compter("roles", "attribues")
        return utilisateur

    def perimetre(self, nom_complet: str, role: str, reseau: Reseau) -> None:
        if not nom_complet:
            return
        personne = self.personne(nom_complet, role)
        if not PerimetreReseau.objects.filter(
            actif_le(self.jour), utilisateur=personne, reseau=reseau
        ).exists():
            org.ajouter_reseau_au_perimetre(personne, reseau)
            self.rapport.compter("perimetres", "crees")

    # --- postes ---------------------------------------------------------------------------

    def poste(self, reference: str, type_: str, libelle: str, reseau, secteur) -> Poste:
        poste = None
        if reference in self.refs:
            poste = Poste.objects.filter(pk=self.refs[reference], archive_le__isnull=True).first()
        if poste is not None:
            self.rapport.compter("postes", "existants")
            return poste
        base, n = libelle, 1
        while Poste.objects.filter(pays=self.pays, libelle=libelle).exists():
            n += 1
            libelle = f"{base} {n}"
        poste = org.creer_poste(self.pays, type_, libelle, [reseau], [secteur])
        ReferenceExterne.objects.create(
            pays=self.pays, source=Source.ORGANISATION, entite="poste", identifiant=reference,
            objet_type=poste._meta.label_lower, objet_id=poste.pk, lot=self.lot,
        )  # fmt: skip
        self.refs[reference] = poste.pk
        self.rapport.compter("postes", "crees")
        return poste

    def occupant(self, poste: Poste, ligne: dict, superviseur_occupe: bool) -> None:
        nom = ligne["personne"]
        en_cours = Occupation.objects.filter(actif_le(self.jour), poste=poste).first()
        if not nom or VACANT.match(cle(nom)):
            # CA3 : poste non pourvu → poste vacant.
            if en_cours is None:
                self.rapport.compter("postes", "vacants")
            return
        role = Role.SUPERVISEUR if superviseur_occupe else Role.DELEGUE
        personne = self.personne(nom, role)
        if en_cours is None:
            org.occuper(poste, personne)
            self.rapport.compter("occupations", "creees")
        elif en_cours.utilisateur_id == personne.pk:
            self.rapport.compter("occupations", "existantes")
        else:
            self.rapport.signaler(
                "poste", ligne["ligne"],
                _("Poste « %(poste)s » déjà occupé par une autre personne : inchangé.")
                % {"poste": poste.libelle},
            )  # fmt: skip

    def rattachement(self, poste: Poste, ligne: dict) -> None:
        if not ligne.get("superviseur"):
            self.rapport.signaler("poste", ligne["ligne"],
                                  _("Poste sans superviseur dans le fichier."))  # fmt: skip
            return
        superviseur = self.personne(ligne["superviseur"], Role.SUPERVISEUR)
        en_cours = Rattachement.objects.filter(actif_le(self.jour), poste=poste).first()
        if en_cours is not None and en_cours.superviseur_id == superviseur.pk:
            self.rapport.compter("rattachements", "existants")
            return
        org.rattacher(poste, superviseur)
        self.rapport.compter("rattachements", "modifies" if en_cours else "crees")

    def portefeuille(self, reseau: Reseau, texte: str) -> None:
        for libelle in filter(None, (p.strip() for p in re.split(r"[;\n]", texte or ""))):
            produit = self.catalogue.get(cle(libelle))
            if produit is None:
                self.produits_inconnus[libelle] += 1
            else:
                self.portefeuilles[reseau].add(produit)

    def ligne(self, ligne: dict, occurrences: Counter) -> None:
        manquantes = [COLONNES[k] for k in ("reseau", "zone", "secteur", "fonction")
                      if not ligne.get(k)]  # fmt: skip
        if manquantes:
            raise ErreurMetier("ligne_incomplete", _("Colonne vide : %(colonnes)s.")
                               % {"colonnes": ", ".join(manquantes)})  # fmt: skip
        type_, superviseur_occupe = type_poste(ligne["fonction"])
        if type_ is None:
            raise ErreurMetier("fonction_inconnue", _("Fonction inconnue : « %(fonction)s ».")
                               % {"fonction": ligne["fonction"]})  # fmt: skip
        reseau = self.reseau(ligne.get("gamme", ""), ligne["reseau"])
        secteur = self.secteur(ligne["zone"], ligne["secteur"])
        triplet = f"{cle(ligne['reseau'])}|{cle(ligne['secteur'])}|{type_}"
        occurrences[triplet] += 1
        reference = f"{triplet}|{occurrences[triplet]}"
        libelle = f"{LIBELLES_TYPE[type_]} {secteur.libelle} {reseau.libelle}"[:120]
        poste = self.poste(reference, type_, libelle, reseau, secteur)
        self.occupant(poste, ligne, superviseur_occupe)
        self.rattachement(poste, ligne)
        self.perimetre(ligne.get("df", ""), Role.DF, reseau)
        self.perimetre(ligne.get("dm", ""), Role.DM, reseau)
        self.portefeuille(reseau, ligne.get("produits", ""))

    def executer(self) -> Rapport:
        occurrences: Counter = Counter()
        for ligne in self.lignes:
            try:
                with transaction.atomic():
                    self.ligne(ligne, occurrences)
                self.rapport.compter("lignes", "importees")
            except ErreurMetier as erreur:
                self.rapport.signaler("ligne", ligne["ligne"], str(erreur.detail), "rejet")
            except ValidationError as erreur:
                self.rapport.signaler("ligne", ligne["ligne"], " ".join(erreur.messages), "rejet")
        for reseau, produits in self.portefeuilles.items():
            actuels = {p.produit_id for p in portefeuille_actif([reseau], self.jour)}
            if {p.pk for p in produits} - actuels:
                # Le portefeuille garde ses produits et reçoit ceux du fichier.
                definir_portefeuille(reseau, [*produits, *Produit.objects.filter(pk__in=actuels)])
                self.rapport.compter("portefeuilles", "modifies")
            else:
                self.rapport.compter("portefeuilles", "existants")
        for libelle, n in sorted(self.produits_inconnus.items()):
            self.rapport.signaler("produit", libelle,
                                  _("Produit absent du référentiel (%(n)s lignes) : non ajouté.")
                                  % {"n": n})  # fmt: skip
        return self.rapport


def importer(
    pays: Pays, auteur: Utilisateur, contenu: bytes, nom_fichier: str, *, simulation: bool
) -> LotImport:
    """Importe (ou simule) le fichier d'organisation dans un pays (ORG-014)."""
    lignes = lire_fichier(contenu)
    debut = timezone.now()
    rapport = Rapport()

    def nouveau_lot(statut, simule):
        return LotImport(
            pays=pays, source=Source.ORGANISATION, fichier=nom_fichier[:200], simulation=simule,
            statut=statut, lance_par=auteur, debut=debut,
        )  # fmt: skip

    try:
        with transaction.atomic():
            lot = nouveau_lot(LotImport.Statut.TERMINE, simulation)
            lot.save()
            rapport = ImportOrganisation(pays, auteur, lignes, lot).executer()
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
        "import.organisation", objet=lot, pays=pays,
        details={"simulation": simulation, "compteurs": lot.compteurs,
                 "anomalies": len(lot.anomalies)},
    )  # fmt: skip
    return lot

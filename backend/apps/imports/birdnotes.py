"""Import contrôlé de l'export du CRM en place, BirdNotes (PRP-013 ; décision du 4 octobre 2026).

Le fichier (JSON de l'extraction, ou son archive ZIP) est lu à l'exécution et n'est jamais
versionné. Ce qui est repris, dans l'ordre des dépendances :

1. secteurs et localités (une zone « À répartir » accueille les secteurs nouveaux) ;
2. gammes → divisions (gammes parentes) et réseaux (gammes filles), produits, portefeuilles ;
3. établissements (type déduit du nom, activité hospitalière) ;
4. prospects validés (actifs) et demandes de création en attente (`a_valider`).

Règles :
- simulation d'abord (CA1) : tout est calculé puis annulé ; seul le lot et son rapport restent ;
- chaque ligne écartée ou corrigée a un motif dans le rapport téléchargeable (CA2) ;
- les groupes de doublons signalés par BirdNotes sont gardés pour la file des doublons
  (0.1.8, CA3) ;
- un réimport retrouve ses références externes et ne crée rien de nouveau (CA4) ;
- rien n'est deviné : un libellé inconnu est signalé, jamais inventé.
"""

import io
import json
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import phonenumbers
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Utilisateur
from apps.organisation.models import Division, Localite, Reseau, Secteur, Zone, actif_le
from apps.prospects import services as prs
from apps.prospects.models import Activite, Etablissement, Prospect, StatutFiche
from apps.referentiel.models import Liste, Portefeuille, Produit, Valeur
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from . import correspondances as K
from .models import LotImport, ReferenceExterne, Source

ZONE_PAR_DEFAUT = "À répartir (import BirdNotes)"
#: Gamme technique de BirdNotes, sans réalité commerciale.
GAMMES_IGNOREES = {K.cle("Default")}


class FichierInvalide(ErreurMetier):
    def __init__(self, message: str):
        super().__init__("fichier_invalide", message)


def lire_fichier(contenu: bytes, nom: str) -> dict:
    """JSON de l'extraction, directement ou dans une archive ZIP."""
    try:
        if nom.lower().endswith(".zip") or contenu[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
                noms = [n for n in archive.namelist() if n.lower().endswith(".json")]
                if len(noms) != 1:
                    raise FichierInvalide(_("L'archive doit contenir un seul fichier JSON."))
                contenu = archive.read(noms[0])
        donnees = json.loads(contenu)
    except (zipfile.BadZipFile, UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise FichierInvalide(
            _("Fichier illisible : JSON ou ZIP d'export BirdNotes attendu.")
        ) from (erreur)
    if not isinstance(donnees, dict) or not isinstance(donnees.get("donnees"), dict):
        raise FichierInvalide(
            _("Ce fichier n'est pas un export BirdNotes (clé « donnees » absente).")
        )
    return donnees["donnees"]


@dataclass
class Rapport:
    compteurs: dict = field(default_factory=lambda: defaultdict(Counter))
    anomalies: list = field(default_factory=list)

    def compter(self, entite: str, action: str, n: int = 1) -> None:
        self.compteurs[entite][action] += n

    def signaler(self, entite: str, identifiant, motif: str, niveau: str = "avertissement"):
        self.anomalies.append(
            {"entite": entite, "identifiant": str(identifiant), "niveau": niveau, "motif": motif}
        )
        if niveau == "rejet":
            self.compter(f"{entite}s", "rejetes")  # compteurs au pluriel : « prospects »…


class ImportBirdNotes:
    def __init__(self, pays: Pays, auteur: Utilisateur, donnees: dict, lot: LotImport):
        self.pays, self.auteur, self.d, self.lot = pays, auteur, donnees, lot
        self.rapport = Rapport()
        self.jour = aujourdhui(pays)
        self.refs = {
            (r.entite, r.identifiant): r.objet_id
            for r in ReferenceExterne.objects.filter(pays=pays, source=Source.BIRDNOTES)
        }
        valeurs = Valeur.objects.filter(pays=pays, archive_le__isnull=True)
        self.valeurs = {(v.liste, v.code): v for v in valeurs}
        self.par_pk = {v.pk: v for v in valeurs}
        self.secteurs: dict[str, Secteur] = {}
        self.localites: dict[tuple[str, str], Localite] = {}

    # --- outils --------------------------------------------------------------------------

    def table(self, nom: str) -> list[dict]:
        return self.d.get(nom) or []

    def deja(self, entite: str, identifiant) -> bool:
        return (entite, str(identifiant)) in self.refs

    def referencer(self, entite: str, identifiant, objet, **complements) -> None:
        ReferenceExterne.objects.create(
            pays=self.pays, source=Source.BIRDNOTES, entite=entite, identifiant=str(identifiant),
            objet_type=objet._meta.label_lower, objet_id=objet.pk,
            complements={k: v for k, v in complements.items() if v not in (None, "", [])},
            lot=self.lot,
        )  # fmt: skip
        self.refs[(entite, str(identifiant))] = objet.pk

    def valeur(self, liste: str, code: str | None) -> Valeur | None:
        return self.valeurs.get((liste, code)) if code else None

    def telephones(self, entite, identifiant, *numeros) -> tuple[str, str]:
        """Numéros au format international ; un mobile va au champ mobile, les autres au
        champ professionnel. Un numéro inexploitable est signalé et laissé de côté."""
        mobile = pro = ""
        for brut in numeros:
            if not brut or not str(brut).strip():
                continue
            try:
                numero = phonenumbers.parse(str(brut), self.pays.code)
                valide = phonenumbers.is_possible_number(numero)
            except phonenumbers.NumberParseException:
                valide = False
            if not valide:
                self.rapport.signaler(
                    entite, identifiant, _("Téléphone inexploitable, non repris.")
                )
                continue
            e164 = phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)
            if phonenumbers.number_type(numero) == phonenumbers.PhoneNumberType.MOBILE:
                mobile = mobile or e164
            else:
                pro = pro or e164
        return mobile, pro

    # --- 1. secteurs et localités ----------------------------------------------------------

    def secteurs_et_localites(self) -> None:
        existants = {K.cle(s.libelle): s for s in Secteur.objects.filter(pays=self.pays)}
        zone = None
        for ligne in self.table("Secteurs"):
            nom, cle = ligne.get("Secteur") or "", K.cle(ligne.get("Secteur"))
            if not cle:
                self.rapport.signaler(
                    "secteur", ligne.get("ID secteur"), _("Secteur sans nom."), "rejet"
                )
                continue
            if cle in self.secteurs:
                self.rapport.signaler(
                    "secteur", ligne.get("ID secteur"),
                    _("« {nom} » est une variante d'un secteur déjà repris : fusionné.").format(
                        nom=nom
                    ),
                )  # fmt: skip
                self.rapport.compter("secteurs", "fusionnes")
                continue
            secteur = existants.get(cle)
            if secteur is None:
                if zone is None:
                    zone, _cree = Zone.objects.get_or_create(
                        pays=self.pays, libelle=ZONE_PAR_DEFAUT, archive_le__isnull=True
                    )
                secteur = Secteur(pays=self.pays, zone=zone, libelle=nom.strip().title())
                secteur.save()
                self.rapport.compter("secteurs", "crees")
            else:
                self.rapport.compter("secteurs", "existants")
            self.secteurs[cle] = secteur
            if not self.deja("secteur", ligne.get("ID secteur")):
                self.referencer("secteur", ligne.get("ID secteur"), secteur)
        if zone is not None:
            self.rapport.signaler(
                "zone", ZONE_PAR_DEFAUT,
                _("Les secteurs nouveaux sont dans une zone « À répartir » : rattachez-les à "
                  "leur zone dans Organisation."),
            )  # fmt: skip
        existantes = {
            (loc.secteur_id, K.cle(loc.libelle)): loc
            for loc in Localite.objects.filter(pays=self.pays)
        }
        for ligne in self.table("Localites"):
            secteur = self.secteurs.get(K.cle(ligne.get("Secteur")))
            nom = (ligne.get("Localité") or "").strip()
            if secteur is None or not nom:
                self.rapport.signaler(
                    "localite", ligne.get("ID localité"),
                    _("Localité sans nom ou d'un secteur inconnu."), "rejet",
                )  # fmt: skip
                continue
            cle = (secteur.pk, K.cle(nom))
            localite = existantes.get(cle)
            if localite is None:
                localite = Localite(pays=self.pays, secteur=secteur, libelle=nom.title())
                localite.save()
                existantes[cle] = localite
                self.rapport.compter("localites", "crees")
            else:
                self.rapport.compter("localites", "existants")
            self.localites[(K.cle(ligne.get("Secteur")), K.cle(nom))] = localite

    def lieu(self, secteur_nom, localite_nom):
        cle_secteur = K.cle(secteur_nom)
        return (
            self.secteurs.get(cle_secteur),
            self.localites.get((cle_secteur, K.cle(localite_nom))),
        )

    # --- 2. gammes, produits, portefeuilles --------------------------------------------------

    def gammes_et_produits(self) -> None:
        divisions = {d.code: d for d in Division.objects.filter(pays=self.pays)}
        reseaux = {r.code: r for r in Reseau.objects.filter(pays=self.pays)}

        def code(nom: str) -> str:
            return K.cle(nom).replace(" ", "-")[:20]

        def division(nom: str) -> Division:
            c = code(nom)
            if c not in divisions:
                divisions[c] = Division(pays=self.pays, code=c, libelle=nom.strip())
                divisions[c].save()
                self.rapport.compter("divisions", "crees")
            return divisions[c]

        def reseau(parente: str, nom: str) -> Reseau:
            c = code(nom)
            if c not in reseaux:
                reseaux[c] = Reseau(
                    pays=self.pays, division=division(parente), code=c, libelle=nom.strip()
                )
                reseaux[c].save()
                self.rapport.compter("reseaux", "crees")
            return reseaux[c]

        for ligne in self.table("Gammes"):
            if K.cle(ligne.get("Gamme")) in GAMMES_IGNOREES:
                continue
            if ligne.get("Niveau") == "Parente":
                division(ligne["Gamme"])
            else:
                reseau(ligne.get("Gamme parente") or ligne["Gamme"], ligne["Gamme"])

        produits = {K.cle(p.libelle): p for p in Produit.objects.filter(pays=self.pays)}
        codes_pris = {p.code for p in produits.values()}

        def code_produit(nom: str, fourni: str) -> str:
            base = (fourni or K.cle(nom).replace(" ", "-"))[:36]
            candidat, n = base, 1
            while candidat in codes_pris:
                n += 1
                candidat = f"{base}-{n}"
            codes_pris.add(candidat)
            return candidat

        par_id: dict[str, Produit] = {}
        for ligne in self.table("Produits"):
            ident = ligne.get("ID produit")
            nom = (ligne.get("Produit") or "").strip()
            if not nom:
                self.rapport.signaler("produit", ident, _("Produit sans nom."), "rejet")
                continue
            produit = produits.get(K.cle(nom))
            if produit is None:
                produit = Produit(
                    pays=self.pays, libelle=nom,
                    code=code_produit(nom, (ligne.get("Code") or "").strip().upper()),
                )  # fmt: skip
                produit.save()
                produits[K.cle(nom)] = produit
                self.rapport.compter("produits", "crees")
            else:
                self.rapport.compter("produits", "existants")
            par_id[str(ident)] = produit
            if not self.deja("produit", ident):
                self.referencer("produit", ident, produit)

        actifs = {
            (p.reseau_id, p.produit_id)
            for p in Portefeuille.objects.filter(actif_le(self.jour), pays=self.pays)
        }
        for ligne in self.table("Portefeuille"):
            gamme = ligne.get("Gamme") or ""
            produit = par_id.get(str(ligne.get("ID produit")))
            if K.cle(gamme) in GAMMES_IGNOREES:
                self.rapport.compter("portefeuilles", "gamme_technique_ignoree")
                continue
            if produit is None:
                self.rapport.signaler("portefeuille", gamme, _("Produit inconnu."), "rejet")
                continue
            r = reseau(ligne.get("Gamme parente") or gamme, gamme)
            if (r.pk, produit.pk) in actifs:
                self.rapport.compter("portefeuilles", "existants")
                continue
            Portefeuille(pays=self.pays, reseau=r, produit=produit, debut=self.jour).save()
            actifs.add((r.pk, produit.pk))
            self.rapport.compter("portefeuilles", "crees")
        sans_reseau = [p for p in par_id.values() if not p.portefeuilles.exists()]
        if sans_reseau:
            self.rapport.signaler(
                "produit", _("{n} produits").format(n=len(sans_reseau)),
                _("Produits de la gamme technique « Default » seulement : rangez-les dans un "
                  "portefeuille ou archivez-les."),
            )  # fmt: skip

    # --- 3. établissements ---------------------------------------------------------------------

    def secteurs_des_prospects(self) -> dict:
        """Secteurs portés par les prospects de chaque établissement (nom BirdNotes)."""
        par_nom: dict = defaultdict(Counter)
        for table in ("Prospects", "Prospects en attente"):
            for ligne in self.table(table):
                if ligne.get("Établissement") and ligne.get("Secteur"):
                    par_nom[ligne["Établissement"]][ligne["Secteur"]] += 1
        return par_nom

    def etablissements(self) -> None:
        deduits = self.secteurs_des_prospects()
        for ligne in self.table("Etablissements"):
            ident = ligne.get("ID établissement")
            if self.deja("etablissement", ident):
                self.rapport.compter("etablissements", "existants")
                continue
            nom = (ligne.get("Établissement") or "").strip()
            libelle_secteur = ligne.get("Secteur")
            if not libelle_secteur and deduits.get(nom):
                # BirdNotes laisse des établissements sans secteur : on prend celui de la
                # majorité de leurs prospects, signalé pour vérification.
                libelle_secteur = deduits[nom].most_common(1)[0][0]
                self.rapport.compter("etablissements", "secteur_deduit")
            secteur, _sans_localite = self.lieu(libelle_secteur, None)
            if not nom or secteur is None:
                motif = (
                    _("Établissement sans secteur ni prospect rattaché : non repris.")
                    if nom and not libelle_secteur
                    else _("Établissement sans nom ou sans secteur connu.")
                )
                self.rapport.signaler("etablissement", ident, motif, "rejet")
                continue
            code_type = K.type_etablissement(nom)
            if code_type == "autre":
                self.rapport.compter("etablissements", "type_a_preciser")
            fiche = Etablissement(
                pays=self.pays, nom=nom, nom_normalise=prs.normaliser_nom(nom),
                type=self.valeur(Liste.TYPE_ETABLISSEMENT, code_type), secteur=secteur,
                activite=Activite.HOSPITALIER if ligne.get("Activité (H/P)") == "H" else "",
                statut=StatutFiche.ACTIF, cree_par=self.auteur, valide_par=self.auteur,
                valide_le=timezone.now(),
            )  # fmt: skip
            fiche.save()
            self.referencer("etablissement", ident, fiche, nom_source=nom)
            self.rapport.compter("etablissements", "crees")
        if self.rapport.compteurs["etablissements"]["secteur_deduit"]:
            self.rapport.signaler(
                "etablissement",
                _("{n} établissements").format(
                    n=self.rapport.compteurs["etablissements"]["secteur_deduit"]
                ),
                _("Sans secteur dans BirdNotes : secteur déduit de leurs prospects, à vérifier."),
            )
        if self.rapport.compteurs["etablissements"]["type_a_preciser"]:
            self.rapport.signaler(
                "etablissement",
                _("{n} établissements").format(
                    n=self.rapport.compteurs["etablissements"]["type_a_preciser"]
                ),
                _("Type non reconnu d'après le nom : classés « Autre », à préciser."),
            )

    # --- 4. prospects ----------------------------------------------------------------------------

    def prospect(self, ligne: dict, statut: str, doublons: dict) -> None:
        ident = ligne.get("ID prospect")
        if self.deja("prospect", ident):
            self.rapport.compter("prospects", "existants")
            return
        nom = (ligne.get("Nom") or "").strip() or (ligne.get("Nom complet") or "").strip()
        if not nom:
            self.rapport.signaler("prospect", ident, _("Prospect sans nom."), "rejet")
            return
        code_specialite = K.specialite(ligne.get("Spécialité"))
        specialite = self.valeur(Liste.SPECIALITE, code_specialite)
        if ligne.get("Spécialité") and specialite is None:
            self.rapport.signaler(
                "prospect",
                ident,
                _("Spécialité inconnue « {libelle} ».").format(libelle=ligne["Spécialité"]),
            )
        type_ = (
            self.par_pk.get(specialite.parent_id)
            if specialite and specialite.parent_id
            else self.valeur(
                Liste.TYPE_PROSPECT,
                K.TYPES_PROSPECT.get(K.cle(ligne.get("Type prospect")), "autre"),
            )
        )
        if type_ is None:
            self.rapport.signaler("prospect", ident, _("Type de prospect introuvable."), "rejet")
            return
        brut = (ligne.get("Potentiel") or "").strip().upper()
        potentiel = K.POTENTIELS.get(brut)
        if potentiel is None:
            self.rapport.signaler("prospect", ident, _("Potentiel absent ou inconnu."), "rejet")
            return
        if potentiel != brut:
            self.rapport.signaler(
                "prospect",
                ident,
                _("Potentiel « {brut} » ramené à « {potentiel} ».").format(
                    brut=brut, potentiel=potentiel
                ),
            )
        grade = self.valeur(Liste.GRADE, K.GRADES.get(K.cle(ligne.get("Grade"))))
        secteur, localite = self.lieu(ligne.get("Secteur"), ligne.get("Localité"))
        mobile, pro = self.telephones("prospect", ident, ligne.get("GSM"), ligne.get("Téléphone"))
        civilite = (
            "pr" if grade and grade.code.startswith("professeur")
            else "dr" if grade and grade.code == "docteur" else ""
        )  # fmt: skip
        fiche = Prospect(
            pays=self.pays, civilite=civilite, nom=nom.title(),
            prenom=(ligne.get("Prénom") or "").strip().title(),
            nom_normalise=prs.normaliser_nom(ligne.get("Prénom") or "", nom),
            type=type_, specialite=specialite, potentiel=potentiel, grade=grade,
            activite={"H": Activite.HOSPITALIER, "P": Activite.PRIVE}.get(
                ligne.get("Activité (H/P)") or "", ""
            ),
            secteur=secteur, localite=localite, telephone_mobile=mobile, telephone_pro=pro,
            courriel=(ligne.get("Email") or "").strip().lower(), statut=statut,
            cree_par=self.auteur,
            valide_par=self.auteur if statut == StatutFiche.ACTIF else None,
            valide_le=timezone.now() if statut == StatutFiche.ACTIF else None,
        )  # fmt: skip
        fiche.save()
        latitude, longitude = ligne.get("Latitude"), ligne.get("Longitude")
        self.referencer(
            "prospect", ident, fiche,
            etablissement=ligne.get("Établissement"),
            delegues=ligne.get("Délégués affectés"),
            groupe_doublons=doublons.get(str(ident)),
            gps=[latitude, longitude] if latitude and longitude else None,
        )  # fmt: skip
        self.rapport.compter("prospects", "crees")

    def prospects(self) -> None:
        doublons = {
            str(r.get("ID prospect")): r.get("Groupe") for r in self.table("Doublons prospects")
        }
        for ligne in self.table("Prospects"):
            self.prospect(ligne, StatutFiche.ACTIF, doublons)
        for ligne in self.table("Prospects en attente"):
            if ligne.get("ID prospect d'origine"):
                # Demande de modification d'une fiche : reprise avec les propositions (0.1.8).
                self.rapport.compter("demandes_modification", "non_reprises")
                continue
            self.prospect(ligne, StatutFiche.A_VALIDER, doublons)
        groupes = len(set(doublons.values()))
        if groupes:
            self.rapport.signaler(
                "prospect", _("{n} groupes").format(n=groupes),
                _("Doublons probables signalés par BirdNotes : gardés pour la file des doublons "
                  "(0.1.8)."),
            )  # fmt: skip
        if self.rapport.compteurs["demandes_modification"]["non_reprises"]:
            self.rapport.signaler(
                "prospect",
                _("{n} demandes").format(
                    n=self.rapport.compteurs["demandes_modification"]["non_reprises"]
                ),
                _(
                    "Demandes de modification en attente dans BirdNotes : à traiter avec les "
                    "propositions de modification (0.1.8)."
                ),
            )

    def executer(self) -> Rapport:
        self.secteurs_et_localites()
        self.gammes_et_produits()
        self.etablissements()
        self.prospects()
        return self.rapport


class _Simulation(Exception):
    """Annule l'import simulé une fois le rapport établi."""


def importer(
    pays: Pays, auteur: Utilisateur, contenu: bytes, nom_fichier: str, *, simulation: bool
) -> LotImport:
    """Importe (ou simule) un export BirdNotes dans un pays ; renvoie le lot et son rapport."""
    donnees = lire_fichier(contenu, nom_fichier)
    debut = timezone.now()
    rapport = Rapport()
    try:
        with transaction.atomic():
            lot = LotImport(
                pays=pays, source=Source.BIRDNOTES, fichier=nom_fichier[:200],
                simulation=simulation, statut=LotImport.Statut.TERMINE, lance_par=auteur,
                debut=debut,
            )  # fmt: skip
            lot.save()
            rapport = ImportBirdNotes(pays, auteur, donnees, lot).executer()
            if simulation:
                raise _Simulation
    except _Simulation:
        lot = LotImport(
            pays=pays, source=Source.BIRDNOTES, fichier=nom_fichier[:200], simulation=True,
            statut=LotImport.Statut.SIMULE, lance_par=auteur, debut=debut,
        )  # fmt: skip
    lot.fin = timezone.now()
    lot.compteurs = {k: dict(v) for k, v in rapport.compteurs.items()}
    lot.anomalies = rapport.anomalies
    lot.save()
    from apps.audit.services import enregistrer

    enregistrer(
        "import.birdnotes", objet=lot, pays=pays,
        details={"simulation": simulation, "compteurs": lot.compteurs,
                 "anomalies": len(lot.anomalies)},
    )  # fmt: skip
    return lot


def rapport_csv(lot: LotImport) -> str:
    """Rapport d'anomalies téléchargeable (CA2), séparateur « ; » pour Excel en français."""
    import csv

    sortie = io.StringIO()
    ecrivain = csv.writer(sortie, delimiter=";")
    ecrivain.writerow([_("Entité"), _("Identifiant source"), _("Niveau"), _("Motif")])
    for a in lot.anomalies:
        ecrivain.writerow([a["entite"], a["identifiant"], a["niveau"], a["motif"]])
    return "﻿" + sortie.getvalue()

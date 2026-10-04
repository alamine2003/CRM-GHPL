"""Services des fiches prospects (PRP-002, PRP-006, RG-041).

Les vues vérifient les droits (matrice) ; les règles et l'audit sont ici.
"""

import re
import unicodedata

import phonenumbers
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Role, Utilisateur
from apps.perimetre.matrice import PAYS_CONSULTATION, SIEGE
from apps.perimetre.perimetre import Perimetre
from apps.referentiel.models import Liste, Valeur
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays

from .models import Civilite, Potentiel, Prospect, StatutFiche

#: Titres retirés du nom normalisé : « Dr Diop » et « Diop » sont la même personne.
TITRES = {"dr", "docteur", "pr", "professeur", "m", "mr", "mme", "mlle", "madame", "monsieur"}

#: Rôles qui voient toutes les fiches du pays, y compris celles à valider des délégués.
VOIENT_TOUT = SIEGE | PAYS_CONSULTATION


def _auditer(action: str, prospect: Prospect, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"prospect.{action}", objet=prospect, pays=prospect.pays, details=details)


def normaliser_nom(*parties: str) -> str:
    """Minuscules, sans accents, sans titre ni ponctuation : « Dr Aïssatou N'Diaye » →
    « aissatou ndiaye »."""
    texte = " ".join(p for p in parties if p)
    texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    texte = re.sub(r"['’`-]", "", texte)
    mots = [m for m in re.split(r"[^a-z0-9]+", texte) if m and m not in TITRES]
    return " ".join(mots)


def normaliser_telephone(valeur: str, pays: Pays, champ: str) -> str:
    """Format international E.164 (§14.1) ; un numéro local s'entend dans le pays de la fiche."""
    valeur = (valeur or "").strip()
    if not valeur:
        return ""
    try:
        numero = phonenumbers.parse(valeur, pays.code)
    except phonenumbers.NumberParseException:
        numero = None
    if numero is None or not phonenumbers.is_possible_number(numero):
        raise ErreurMetier(
            "telephone_invalide", _("Ce numéro de téléphone n'est pas valide."), champ=champ
        )
    return phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)


def _valeur(pays: Pays, valeur: Valeur | None, liste: str, champ: str) -> Valeur | None:
    if valeur is None:
        return None
    if valeur.pays_id != pays.pk or valeur.liste != liste or valeur.est_archive:
        raise ErreurMetier(
            "valeur_invalide", _("Valeur inconnue ou archivée dans ce pays."), champ=champ
        )
    return valeur


def _verifier(pays: Pays, champs: dict) -> dict:
    """PRP-002 CA1 : nom et type obligatoires ; la spécialité suit le type (§14.1)."""
    nom = (champs.get("nom") or "").strip()
    if not nom:
        raise ErreurMetier("champ_requis", _("Le nom est obligatoire."), champ="nom")
    type_ = _valeur(pays, champs.get("type"), Liste.TYPE_PROSPECT, "type")
    if type_ is None:
        raise ErreurMetier("champ_requis", _("Le type de prospect est obligatoire."), champ="type")
    specialite = _valeur(pays, champs.get("specialite"), Liste.SPECIALITE, "specialite")
    if specialite and specialite.parent_id and specialite.parent_id != type_.pk:
        raise ErreurMetier(
            "specialite_incompatible",
            _("Cette spécialité ne s'applique pas à ce type de prospect."),
            champ="specialite",
        )
    # « Selon le type » : obligatoire quand le pays a défini des spécialités pour ce type.
    if specialite is None and type_.enfants.filter(archive_le__isnull=True).exists():
        raise ErreurMetier(
            "champ_requis", _("La spécialité est obligatoire pour ce type."), champ="specialite"
        )
    potentiel = champs.get("potentiel")
    if potentiel not in Potentiel.values:
        raise ErreurMetier("champ_requis", _("Le potentiel est obligatoire."), champ="potentiel")
    civilite = champs.get("civilite") or ""
    if civilite and civilite not in Civilite.values:
        raise ErreurMetier("valeur_invalide", _("Civilité inconnue."), champ="civilite")
    prenom = (champs.get("prenom") or "").strip()
    return {
        "civilite": civilite,
        "nom": nom,
        "prenom": prenom,
        "nom_normalise": normaliser_nom(prenom, nom),
        "type": type_,
        "specialite": specialite,
        "numero_ordre": re.sub(r"\s+", "", champs.get("numero_ordre") or "").upper(),
        "telephone_mobile": normaliser_telephone(
            champs.get("telephone_mobile"), pays, "telephone_mobile"
        ),
        "telephone_pro": normaliser_telephone(champs.get("telephone_pro"), pays, "telephone_pro"),
        "courriel": (champs.get("courriel") or "").strip().lower(),
        "potentiel": potentiel,
    }


def _enregistrer(prospect: Prospect) -> Prospect:
    try:
        with transaction.atomic():
            prospect.save()
    except IntegrityError as erreur:
        raise ErreurMetier(
            "numero_ordre_deja_utilise",
            _("Ce numéro d'ordre est déjà celui d'une autre fiche de ce pays."),
            champ="numero_ordre",
        ) from erreur
    return prospect


def creer_prospect(pays: Pays, auteur: Utilisateur, *, actif: bool, **champs) -> Prospect:
    """PRP-002 ; PRP-006 : créée par un délégué, la fiche est `a_valider` et ne sert qu'à lui
    jusqu'à sa validation. Créée par l'administrateur pays, elle est aussitôt `actif`."""
    valeurs = _verifier(pays, champs)
    prospect = Prospect(
        pays=pays,
        cree_par=auteur,
        statut=StatutFiche.ACTIF if actif else StatutFiche.A_VALIDER,
        **valeurs,
    )
    if actif:
        prospect.valide_par, prospect.valide_le = auteur, timezone.now()
    _enregistrer(prospect)
    _auditer("creation", prospect, statut=prospect.statut)
    return prospect


SUIVIS = ["civilite", "nom", "prenom", "type", "specialite", "numero_ordre",
          "telephone_mobile", "telephone_pro", "courriel", "potentiel"]  # fmt: skip


def modifier_prospect(prospect: Prospect, **champs) -> Prospect:
    """Modification d'une fiche ; chaque champ changé est audité (ancienne, nouvelle valeur).
    L'historique détaillé des fiches communes et les propositions arrivent en 0.1.7."""
    if prospect.statut not in (StatutFiche.A_VALIDER, StatutFiche.ACTIF):
        raise ErreurMetier("archive", _("Une fiche archivée ne se modifie plus."))
    actuels = {c: getattr(prospect, c) for c in SUIVIS}
    valeurs = _verifier(prospect.pays, {**actuels, **champs})
    changes = {}
    for champ, nouvelle in valeurs.items():
        ancienne = getattr(prospect, champ)
        if ancienne != nouvelle:
            setattr(prospect, champ, nouvelle)
            if champ in SUIVIS:
                changes[champ] = {"ancien": str(ancienne or ""), "nouveau": str(nouvelle or "")}
    if changes:
        _enregistrer(prospect)
        _auditer("modification", prospect, **changes)
    return prospect


def valider(prospect: Prospect, par: Utilisateur) -> Prospect:
    """L'administrateur pays rend commune une fiche créée par un délégué (RG-041). Le
    détecteur de doublons (0.1.7) fera ce passage automatiquement quand il ne trouve rien."""
    if prospect.statut != StatutFiche.A_VALIDER:
        raise ErreurMetier("deja_valide", _("Cette fiche n'est pas à valider."))
    prospect.statut, prospect.valide_par, prospect.valide_le = (
        StatutFiche.ACTIF, par, timezone.now()
    )  # fmt: skip
    prospect.save(update_fields=["statut", "valide_par", "valide_le"])
    _auditer("validation", prospect)
    return prospect


def archiver(prospect: Prospect, motif: str = "") -> Prospect:
    """Aucune suppression (PRP-012 CA2) : une fiche archivée n'est plus proposée."""
    if prospect.statut == StatutFiche.ARCHIVE:
        return prospect
    ancien = prospect.statut
    prospect.statut = StatutFiche.ARCHIVE
    prospect.save(update_fields=["statut"])
    prospect.archiver()
    _auditer("archivage", prospect, ancien=ancien, motif=motif.strip())
    return prospect


# --- Lectures -------------------------------------------------------------------------------


def prospects_visibles(perimetre: Perimetre) -> QuerySet:
    """Fiches du pays actif ; une fiche à valider n'est visible que de son auteur et de
    l'administration du pays (RG-041, PRP-006 CA1)."""
    qs = perimetre.filtrer_par_pays(Prospect.objects.all())
    if perimetre.roles & VOIENT_TOUT:
        return qs
    return qs.filter(
        Q(statut=StatutFiche.ACTIF)
        | Q(statut=StatutFiche.A_VALIDER, cree_par=perimetre.utilisateur)
    )


def peut_modifier(perimetre: Perimetre, prospect: Prospect) -> bool:
    """L'administrateur pays modifie toute fiche ; l'auteur, sa fiche tant qu'elle est à
    valider. Les autres proposeront une modification (PRP-014, 0.1.7)."""
    if Role.ADMIN_PAYS in perimetre.roles:
        return True
    auteur = prospect.cree_par_id == perimetre.utilisateur.pk
    return prospect.statut == StatutFiche.A_VALIDER and auteur


def rechercher(qs: QuerySet, texte: str) -> QuerySet:
    """Recherche tolérante aux accents, à la casse et aux titres (« dr ndiaye ») ; les
    chiffres cherchent aussi dans le numéro d'ordre et les téléphones."""
    texte = (texte or "").strip()
    if not texte:
        return qs
    filtre = Q()
    for mot in normaliser_nom(texte).split():
        filtre &= Q(nom_normalise__contains=mot)
    chiffres = re.sub(r"\D", "", texte)
    if len(chiffres) >= 4:
        filtre |= Q(telephone_mobile__contains=chiffres) | Q(telephone_pro__contains=chiffres)
    filtre |= Q(numero_ordre__iexact=re.sub(r"\s+", "", texte))
    return qs.filter(filtre)

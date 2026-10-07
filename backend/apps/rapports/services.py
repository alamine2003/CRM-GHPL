"""Rapports de visite (cycle 0.5).

0.5.1 : un rapport par visite effectuée (RG-030, RPT-001), son socle obligatoire (RPT-002) et
les champs du pays (RPT-008). Le délégué l'écrit en brouillon, puis le soumet : sans le socle
ni les champs obligatoires de son pays, la soumission est refusée (RPT-002 CA1). La version
figée, l'heure limite et le retard arrivent avec la soumission complète (0.5.7).
"""

import re
import unicodedata
from datetime import datetime

from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework import status

from apps.planning.etats import StatutVisite
from apps.planning.models import Visite
from apps.referentiel.models import Liste, Valeur
from apps.socle.erreurs import ErreurMetier

from .models import ChampRapport, Rapport, StatutRapport, TypeChamp

#: Statuts où le délégué écrit encore son rapport.
MODIFIABLES = (StatutRapport.BROUILLON, StatutRapport.A_CORRIGER, StatutRapport.ROUVERT)


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(action, objet=objet, pays=objet.pays, details=details)


# --- Champs du pays (RPT-008) -----------------------------------------------------------------


def champs_actifs(pays):
    actifs = ChampRapport.objects.filter(pays=pays, archive_le__isnull=True)
    return actifs.order_by("ordre", "libelle")


def _code(libelle: str) -> str:
    texte = unicodedata.normalize("NFKD", libelle).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", texte).strip("_")[:60] or "champ"


def _exiger_options(type_champ: str, options: list) -> list[str]:
    options = [str(o).strip() for o in options or [] if str(o).strip()]
    if type_champ == TypeChamp.LISTE and len(options) < 2:
        raise ErreurMetier(
            "options_requises", _("Une liste propose au moins deux choix."), champ="options"
        )
    return options if type_champ == TypeChamp.LISTE else []


@transaction.atomic
def creer_champ(pays, *, libelle: str, type: str, options=None,
                obligatoire=False) -> ChampRapport:  # fmt: skip
    libelle = (libelle or "").strip()
    if not libelle:
        raise ErreurMetier("libelle_requis", _("Le libellé est obligatoire."), champ="libelle")
    code = base = _code(libelle)
    n = 1
    while ChampRapport.objects.filter(pays=pays, code=code, archive_le__isnull=True).exists():
        n += 1
        code = f"{base}_{n}"
    dernier = champs_actifs(pays).order_by("-ordre").values_list("ordre", flat=True).first()
    champ = ChampRapport.objects.create(
        pays=pays, code=code, libelle=libelle, type=type,
        options=_exiger_options(type, options), obligatoire=obligatoire,
        ordre=(dernier or 0) + 1,
    )  # fmt: skip
    _auditer("rapport.champ_creation", champ, code=code, type=type, obligatoire=obligatoire)
    return champ


@transaction.atomic
def modifier_champ(champ: ChampRapport, **valeurs) -> ChampRapport:
    """Le type ne change pas (les rapports déjà écrits le gardent) ; libellé, choix et
    caractère obligatoire valent pour les rapports créés ensuite (RPT-008 CA1)."""
    if "libelle" in valeurs:
        libelle = (valeurs["libelle"] or "").strip()
        if not libelle:
            raise ErreurMetier("libelle_requis", _("Le libellé est obligatoire."), champ="libelle")
        champ.libelle = libelle
    if "options" in valeurs:
        champ.options = _exiger_options(champ.type, valeurs["options"])
    if "obligatoire" in valeurs:
        champ.obligatoire = bool(valeurs["obligatoire"])
    if "ordre" in valeurs:
        champ.ordre = valeurs["ordre"]
    champ.save()
    _auditer("rapport.champ_modification", champ, champs=sorted(valeurs))
    return champ


def archiver_champ(champ: ChampRapport) -> ChampRapport:
    champ.archiver()
    _auditer("rapport.champ_archivage", champ, code=champ.code)
    return champ


# --- Rapport (RPT-001, RPT-002) ---------------------------------------------------------------


def produits_proposes(visite: Visite):
    """Le portefeuille du réseau de la visite, le jour de la visite (RG-033)."""
    from apps.planning.services import postes_de_la_semaine
    from apps.referentiel.services import produits_du_portefeuille

    if visite.reseau_id:
        reseaux = [visite.reseau]
    else:
        reseaux = {r for p in postes_de_la_semaine(visite.planning) for r in p.reseaux.all()}
    return produits_du_portefeuille(reseaux, visite.date)


def resultats(pays):
    return Valeur.objects.filter(pays=pays, liste=Liste.RESULTAT_VISITE,
                                 archive_le__isnull=True).order_by("ordre", "libelle")  # fmt: skip


def rapport_attendu(visite: Visite) -> bool:
    """RPT-001 CA1 : une visite effectuée dont le rapport n'est pas soumis."""
    if visite.statut != StatutVisite.EFFECTUEE:
        return False
    rapport = getattr(visite, "rapport", None)
    return rapport is None or rapport.statut in MODIFIABLES


@transaction.atomic
def rapport_de(visite: Visite) -> Rapport:
    """Le rapport de la visite, créé en brouillon à la première ouverture (RG-030), avec les
    champs du pays en vigueur à cet instant (RPT-008 CA1)."""
    existant = Rapport.objects.filter(visite=visite).first()
    if existant is not None:
        return existant
    if visite.statut != StatutVisite.EFFECTUEE:
        raise ErreurMetier(
            "visite_non_effectuee",
            _("Le rapport s'écrit une fois la visite terminée."),
            status.HTTP_409_CONFLICT,
        )
    rapport = Rapport.objects.create(
        pays=visite.pays, visite=visite, delegue_id=visite.planning.delegue_id,
        objectif_prevu=visite.objectif or "",
        definitions=[c.definition() for c in champs_actifs(visite.pays)],
    )  # fmt: skip
    _auditer("rapport.creation", rapport, visite=str(visite.pk))
    return rapport


def _exiger_modifiable(rapport: Rapport) -> None:
    if rapport.statut not in MODIFIABLES:
        raise ErreurMetier(
            "rapport_non_modifiable",
            _("Ce rapport est soumis : il ne se modifie plus."),
            status.HTTP_409_CONFLICT,
        )


def _valeur_champ(definition: dict, valeur):
    """Contrôle d'une valeur selon le type du champ ; rien (None ou vide) est accepté ici."""
    if valeur in (None, ""):
        return None
    code, type_champ = definition["code"], definition["type"]
    erreur = ErreurMetier("champ_invalide", _("Valeur invalide pour « %(libelle)s ».")
                          % {"libelle": definition["libelle"]}, champ=code)  # fmt: skip
    if type_champ == TypeChamp.NOMBRE:
        if isinstance(valeur, bool) or not isinstance(valeur, int | float):
            raise erreur
        return valeur
    if type_champ == TypeChamp.CASE:
        if not isinstance(valeur, bool):
            raise erreur
        return valeur
    if type_champ == TypeChamp.LISTE:
        if valeur not in definition["options"]:
            raise erreur
        return valeur
    texte = str(valeur).strip()
    if len(texte) > 1000:
        raise erreur
    return texte or None


@transaction.atomic
def enregistrer(rapport: Rapport, **valeurs) -> Rapport:
    """Le brouillon : chaque envoi reprend tout ce que le délégué a saisi."""
    rapport = Rapport.objects.select_for_update().get(pk=rapport.pk)
    _exiger_modifiable(rapport)
    if "produits" in valeurs:
        ids = produits_proposes(rapport.visite).values_list("pk", flat=True)
        proposes = {str(p) for p in ids}
        produits = [str(p) for p in valeurs["produits"] or []]
        if any(p not in proposes for p in produits) or len(set(produits)) != len(produits):
            raise ErreurMetier(
                "produit_hors_portefeuille",
                _("Seuls les produits du portefeuille du réseau de la visite se présentent."),
                champ="produits",
            )
        rapport.produits = produits
    if "resultat" in valeurs:
        resultat = valeurs["resultat"]
        if resultat is not None and not resultats(rapport.pays).filter(pk=resultat).exists():
            raise ErreurMetier("resultat_invalide", _("Résultat inconnu."), champ="resultat")
        rapport.resultat_id = resultat
    for cle in ("resultat_obtenu", "resume", "prochaine_action"):
        if cle in valeurs:
            setattr(rapport, cle, (valeurs[cle] or "").strip())
    if "champs" in valeurs:
        par_code = {d["code"]: d for d in rapport.definitions}
        inconnus = set(valeurs["champs"] or {}) - set(par_code)
        if inconnus:
            raise ErreurMetier("champ_inconnu", _("Ce champ n'est pas dans ce rapport."),
                               champ=sorted(inconnus)[0])  # fmt: skip
        rapport.champs = {
            code: v
            for code, brute in (valeurs["champs"] or {}).items()
            if (v := _valeur_champ(par_code[code], brute)) is not None
        }
    rapport.save()
    return rapport


def manquants(rapport: Rapport) -> list[str]:
    """Le socle (RPT-002) puis les champs obligatoires du pays, par code."""
    socle = [
        champ
        for champ, rempli in (
            ("produits", bool(rapport.produits)),
            ("resultat", rapport.resultat_id is not None),
            ("resume", bool(rapport.resume)),
            ("prochaine_action", bool(rapport.prochaine_action)),
        )
        if not rempli
    ]
    pays = [d["code"] for d in rapport.definitions
            if d["obligatoire"] and rapport.champs.get(d["code"]) in (None, "", False)]  # fmt: skip
    return socle + pays


@transaction.atomic
def soumettre(rapport: Rapport, soumis_le: datetime) -> Rapport:
    """RPT-002 CA1 : impossible sans le socle et les champs obligatoires du pays."""
    rapport = Rapport.objects.select_for_update().get(pk=rapport.pk)
    if rapport.statut == StatutRapport.SOUMIS and rapport.soumis_le == soumis_le:
        return rapport  # rejeu du même envoi (OFF-003)
    _exiger_modifiable(rapport)
    if manque := manquants(rapport):
        raise ErreurMetier(
            "rapport_incomplet",
            _("Complétez le rapport avant de le soumettre."),
            manquants=manque,
        )
    rapport.statut = StatutRapport.SOUMIS
    rapport.soumis_le = soumis_le
    rapport.save(update_fields=["statut", "soumis_le", "modifie_le"])
    _auditer("rapport.soumission", rapport, visite=str(rapport.visite_id),
             soumis_le=soumis_le.isoformat())  # fmt: skip
    return rapport

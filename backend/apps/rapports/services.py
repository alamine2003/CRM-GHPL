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

from .models import ChampRapport, Rapport, RetourPrescripteur, StatutRapport, TypeChamp, TypeRemise

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


def _hors_portefeuille() -> ErreurMetier:
    return ErreurMetier(
        "produit_hors_portefeuille",
        _("Seuls les produits du portefeuille du réseau de la visite se présentent."),
        champ="presentations",
    )


def _presentations(rapport: Rapport, saisies: list[dict]) -> list[dict]:
    """RPT-004 : les produits dans l'ordre de présentation, chacun avec le retour du
    prescripteur ; un produit « autre », saisi en clair, si le pays l'autorise (CA2)."""
    from apps.socle.services import valeur_parametre

    proposes = {str(p.pk): p.libelle for p in produits_proposes(rapport.visite)}
    autre_autorise = valeur_parametre(rapport.pays, "produit_autre_autorise")
    vues, resultat = set(), []
    for saisie in saisies:
        retour = saisie.get("retour") or None
        if retour is not None and retour not in RetourPrescripteur.values:
            raise ErreurMetier("retour_invalide", _("Retour du prescripteur inconnu."),
                               champ="presentations")  # fmt: skip
        produit = str(saisie["produit"]) if saisie.get("produit") else None
        if produit is not None:
            if produit not in proposes:
                raise _hors_portefeuille()
            libelle = proposes[produit]
        else:
            libelle = (saisie.get("libelle") or "").strip()[:120]
            if not autre_autorise:
                raise _hors_portefeuille()
            if not libelle:
                raise ErreurMetier("produit_autre_vide", _("Nommez le produit présenté."),
                                   champ="presentations")  # fmt: skip
        cle = produit or libelle.casefold()
        if cle in vues:
            raise ErreurMetier("produit_en_double", _("Un produit se présente une seule fois."),
                               champ="presentations")  # fmt: skip
        vues.add(cle)
        resultat.append({"produit": produit, "libelle": libelle, "retour": retour})
    return resultat


def articles(pays):
    return Valeur.objects.filter(pays=pays, liste=Liste.ARTICLE_PROMOTIONNEL,
                                 archive_le__isnull=True).order_by("ordre", "libelle")  # fmt: skip


def _remises(rapport: Rapport, saisies: list[dict]) -> list[dict]:
    """RPT-005 : échantillons (produits du portefeuille) et cadeaux (articles du pays) remis,
    avec leur quantité ; aucune notion de solde ni de dotation (CA1, RG-038)."""
    proposes = {str(p.pk): p.libelle for p in produits_proposes(rapport.visite)}
    cadeaux = {str(v.pk): v.libelle for v in articles(rapport.pays)}
    resultat = []
    for saisie in saisies:
        quantite = saisie.get("quantite")
        if isinstance(quantite, bool) or not isinstance(quantite, int) or not 1 <= quantite <= 999:
            raise ErreurMetier("quantite_invalide", _("Quantité attendue entre 1 et 999."),
                               champ="remises")  # fmt: skip
        if saisie.get("type") == TypeRemise.ECHANTILLON:
            produit = str(saisie.get("produit") or "")
            if produit not in proposes:
                raise _hors_portefeuille()
            resultat.append({"type": TypeRemise.ECHANTILLON.value, "produit": produit,
                             "article": None, "libelle": proposes[produit],
                             "quantite": quantite})  # fmt: skip
        elif saisie.get("type") == TypeRemise.CADEAU:
            article = str(saisie.get("article") or "")
            if article not in cadeaux:
                raise ErreurMetier("article_invalide", _("Article inconnu."), champ="remises")
            resultat.append({"type": TypeRemise.CADEAU.value, "produit": None,
                             "article": article, "libelle": cadeaux[article],
                             "quantite": quantite})  # fmt: skip
        else:
            raise ErreurMetier("remise_invalide", _("Échantillon ou cadeau attendu."),
                               champ="remises")  # fmt: skip
    return resultat


@transaction.atomic
def enregistrer(rapport: Rapport, **valeurs) -> Rapport:
    """Le brouillon : chaque envoi reprend tout ce que le délégué a saisi."""
    rapport = Rapport.objects.select_for_update().get(pk=rapport.pk)
    _exiger_modifiable(rapport)
    if "presentations" in valeurs:
        rapport.presentations = _presentations(rapport, valeurs["presentations"] or [])
    if "remises" in valeurs:
        rapport.remises = _remises(rapport, valeurs["remises"] or [])
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
            ("produits", bool(rapport.presentations)),
            # RPT-004 : le retour du prescripteur sur chaque produit présenté.
            ("retours", all(p["retour"] for p in rapport.presentations)),
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

"""Rapports de visite (cycle 0.5).

0.5.1 : un rapport par visite effectuée (RG-030, RPT-001), son socle obligatoire (RPT-002) et
les champs du pays (RPT-008). Le délégué l'écrit en brouillon, puis le soumet : sans le socle
ni les champs obligatoires de son pays, la soumission est refusée (RPT-002 CA1).

0.5.7 (RPT-010) : chaque soumission fige une version (RG-037) ; après 23 h 59, heure du pays,
le jour de la visite, le rapport est en retard (RG-032). L'heure du téléphone fait foi, sauf
incohérence de plus de 15 minutes avec celle du serveur [H].
"""

import re
import unicodedata
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status

from apps.planning.etats import StatutVisite
from apps.planning.models import Visite
from apps.referentiel.models import Liste, Valeur
from apps.socle.erreurs import ErreurMetier

from .models import (
    ChampRapport,
    PieceJointe,
    Rapport,
    RetourPrescripteur,
    StatutRapport,
    TypeChamp,
    TypeRemise,
    VersionRapport,
)

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


def modele_rapport(visite: Visite) -> Rapport:
    """OFF-002 (0.8.2) : le rapport de la visite s'il existe ; sinon un modèle vierge, non
    enregistré, que le téléphone garde pour écrire le rapport sans réseau. Le serveur ne crée
    le rapport qu'à son premier envoi, une fois la visite terminée (RG-030)."""
    existant = Rapport.objects.filter(visite=visite).first()
    if existant is not None:
        return existant
    return Rapport(
        pays=visite.pays, visite=visite, delegue_id=visite.planning.delegue_id,
        objectif_prevu=visite.objectif or "",
        definitions=[c.definition() for c in champs_actifs(visite.pays)],
    )  # fmt: skip


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


def types_action(pays):
    return Valeur.objects.filter(pays=pays, liste=Liste.TYPE_ACTION,
                                 archive_le__isnull=True).order_by("ordre", "libelle")  # fmt: skip


def action_precedente(visite: Visite) -> dict | None:
    """RPT-006 CA1 : la prochaine action notée à la dernière visite du même délégué chez le
    même prospect, rappelée à la visite suivante ; jamais celle d'un collègue."""
    if visite.prospect_id is None:
        return None
    rapport = (
        Rapport.objects.filter(delegue_id=visite.planning.delegue_id,
                               visite__prospect_id=visite.prospect_id,
                               visite__date__lt=visite.date)
        .exclude(statut=StatutRapport.BROUILLON)
        .exclude(prochaine_action="", prochaine_action_type__isnull=True)
        .select_related("visite", "prochaine_action_type")
        .order_by("-visite__date", "-visite__heure")
        .first()
    )  # fmt: skip
    if rapport is None:
        return None
    return {"date": rapport.visite.date,
            "type": rapport.prochaine_action_type.libelle if rapport.prochaine_action_type else "",
            "texte": rapport.prochaine_action, "echeance": rapport.prochaine_action_echeance,
            "visite_proposee": rapport.visite_proposee}  # fmt: skip


def preparation(visite: Visite) -> dict | None:
    """DC-47, engagement 5 : « Préparer ma visite », lisible en 10 secondes. À partir des
    rapports du même délégué chez ce prospect : le dernier retour sur chaque produit, les
    échantillons déjà remis et le nombre de visites rapportées. Jamais ceux d'un collègue."""
    if visite.prospect_id is None:
        return None
    rapports = list(
        Rapport.objects.filter(delegue_id=visite.planning.delegue_id,
                               visite__prospect_id=visite.prospect_id,
                               visite__date__lt=visite.date)
        .exclude(statut=StatutRapport.BROUILLON)
        .select_related("visite")
        .order_by("-visite__date", "-visite__heure")
    )  # fmt: skip
    if not rapports:
        return None
    retours: dict[str, dict] = {}
    echantillons: dict[str, dict] = {}
    for r in rapports:  # du plus récent au plus ancien : le premier retour vu est le dernier
        for p in r.presentations:
            cle = p.get("produit") or p.get("libelle")
            if cle and cle not in retours and p.get("retour"):
                retours[cle] = {"libelle": p.get("libelle") or "", "retour": p["retour"],
                                "date": r.visite.date}  # fmt: skip
        for x in r.remises:
            if x.get("type") == TypeRemise.ECHANTILLON:
                cle = x.get("produit") or x.get("libelle")
                ligne = echantillons.setdefault(cle, {"libelle": x.get("libelle") or "",
                                                      "quantite": 0})  # fmt: skip
                ligne["quantite"] += int(x.get("quantite") or 0)
    return {"visites": len(rapports), "derniere": rapports[0].visite.date,
            "retours": list(retours.values()),
            "echantillons": sorted(echantillons.values(),
                                   key=lambda e: -e["quantite"])}  # fmt: skip


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
def enregistrer(rapport: Rapport, version: int | None = None, **valeurs) -> Rapport:
    """Le brouillon : chaque envoi reprend tout ce que le délégué a saisi.

    RG-050 : un rapport soumis, validé ou rendu ne se modifie pas, la décision l'emporte.
    RG-052 : avec `version`, la saisie qui s'appuie sur une version périmée est un conflit ; la
    version 0 désigne le modèle vierge gardé par le téléphone (OFF-002), que la première
    ouverture du rapport porte à 1.
    """
    rapport = Rapport.objects.select_for_update().get(pk=rapport.pk)
    _exiger_modifiable(rapport)
    if version is not None and rapport.version > max(version, 1):
        raise ErreurMetier(
            "conflit_version",
            _("Ce rapport a changé ailleurs depuis votre dernière synchronisation : ouvrez-le "
              "pour choisir la version à garder."),
            status.HTTP_409_CONFLICT,
            version=rapport.version,
        )  # fmt: skip
    if "presentations" in valeurs:
        rapport.presentations = _presentations(rapport, valeurs["presentations"] or [])
    if "remises" in valeurs:
        rapport.remises = _remises(rapport, valeurs["remises"] or [])
    if "resultat" in valeurs:
        resultat = valeurs["resultat"]
        if resultat is not None and not resultats(rapport.pays).filter(pk=resultat).exists():
            raise ErreurMetier("resultat_invalide", _("Résultat inconnu."), champ="resultat")
        rapport.resultat_id = resultat
    if "prochaine_action_type" in valeurs:
        type_action = valeurs["prochaine_action_type"]
        if type_action is not None and not types_action(rapport.pays).filter(
                pk=type_action).exists():  # fmt: skip
            raise ErreurMetier("type_action_invalide", _("Type d'action inconnu."),
                               champ="prochaine_action_type")  # fmt: skip
        rapport.prochaine_action_type_id = type_action
    if "prochaine_action_echeance" in valeurs:
        echeance = valeurs["prochaine_action_echeance"]
        if echeance is not None and echeance < rapport.visite.date:
            raise ErreurMetier("echeance_passee",
                               _("L'échéance ne peut pas précéder la visite."),
                               champ="prochaine_action_echeance")  # fmt: skip
        rapport.prochaine_action_echeance = echeance
    if "visite_proposee" in valeurs:
        rapport.visite_proposee = bool(valeurs["visite_proposee"])
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
            # RPT-006 : la prochaine action a un type et se décrit.
            ("prochaine_action_type", rapport.prochaine_action_type_id is not None),
            ("prochaine_action", bool(rapport.prochaine_action)),
        )
        if not rempli
    ]
    pays = [d["code"] for d in rapport.definitions
            if d["obligatoire"] and rapport.champs.get(d["code"]) in (None, "", False)]  # fmt: skip
    return socle + pays


#: RPT-010 CA1 [H] : au-delà, l'heure du téléphone n'est plus crue.
TOLERANCE_HORLOGE = timedelta(minutes=15)


def echeance(rapport: Rapport) -> datetime:
    """RG-032 : le rapport est attendu le jour de la visite avant minuit, heure du pays."""
    from apps.socle.services import debut_du_jour

    return debut_du_jour(rapport.pays, rapport.visite.date + timedelta(days=1))


def en_retard(rapport: Rapport) -> bool:
    """Soumis : tel que marqué à la première soumission. Sinon : l'échéance est passée."""
    if rapport.soumis_le is not None:
        return rapport.en_retard
    return timezone.now() >= echeance(rapport)


def contenu_fige(rapport: Rapport) -> dict:
    """Le rapport tel que soumis (RG-037)."""
    echeance_action = rapport.prochaine_action_echeance
    return {
        "objectif_prevu": rapport.objectif_prevu,
        "presentations": rapport.presentations,
        "resultat": str(rapport.resultat_id) if rapport.resultat_id else None,
        "resultat_obtenu": rapport.resultat_obtenu,
        "resume": rapport.resume,
        "prochaine_action": rapport.prochaine_action,
        "prochaine_action_type": (
            str(rapport.prochaine_action_type_id) if rapport.prochaine_action_type_id else None
        ),  # fmt: skip
        "prochaine_action_echeance": echeance_action.isoformat() if echeance_action else None,
        "visite_proposee": rapport.visite_proposee,
        "remises": rapport.remises,
        "champs": rapport.champs,
        "definitions": rapport.definitions,
        "pieces_jointes": [
            str(p.pk) for p in rapport.pieces_jointes.filter(archive_le__isnull=True)
        ],  # fmt: skip
    }


def _horodatage(rapport: Rapport, soumis_le: datetime, envoye_le: datetime | None,
                recu_le: datetime) -> tuple[datetime, bool]:  # fmt: skip
    """RPT-010 CA1 [H] : l'heure de soumission du téléphone, si elle est cohérente ; sinon
    l'heure de réception, et l'écart est signalé. Incohérente : dans le futur, avant la fin
    de la visite, ou envoyée par un téléphone dont l'horloge s'écarte de celle du serveur."""
    douteux = (
        soumis_le > recu_le + TOLERANCE_HORLOGE
        or (envoye_le is not None and abs(envoye_le - recu_le) > TOLERANCE_HORLOGE)
        or (rapport.visite.fin_le is not None
            and soumis_le < rapport.visite.fin_le - TOLERANCE_HORLOGE)
    )  # fmt: skip
    return (recu_le, True) if douteux else (soumis_le, False)


@transaction.atomic
def soumettre(rapport: Rapport, soumis_le: datetime, envoye_le: datetime | None = None) -> Rapport:
    """RPT-002 CA1 : impossible sans le socle et les champs obligatoires du pays. RPT-010 :
    version figée, marquage en retard, horodatage du téléphone contrôlé."""
    rapport = (
        Rapport.objects.select_for_update(of=("self",))
        .select_related("visite__planning__delegue", "correction_par", "rouvert_par")
        .get(pk=rapport.pk)
    )
    derniere = rapport.versions.order_by("-numero").first()
    if (rapport.statut == StatutRapport.SOUMIS and derniere is not None
            and derniere.heure_telephone == soumis_le):  # fmt: skip
        return rapport  # rejeu du même envoi (OFF-003)
    _exiger_modifiable(rapport)
    if manque := manquants(rapport):
        raise ErreurMetier(
            "rapport_incomplet",
            _("Complétez le rapport avant de le soumettre."),
            manquants=manque,
        )
    recu_le = timezone.now()
    moment, douteux = _horodatage(rapport, soumis_le, envoye_le, recu_le)
    premiere = derniere is None
    # RPT-015 : la version garde la demande à laquelle elle répond.
    repond_a = (_correction_figee(rapport) if rapport.statut == StatutRapport.A_CORRIGER
                else _reouverture_figee(rapport) if rapport.statut == StatutRapport.ROUVERT
                else None)  # fmt: skip
    demandeur = (rapport.correction_par if rapport.statut == StatutRapport.A_CORRIGER
                 else rapport.rouvert_par)  # fmt: skip
    rapport.statut = StatutRapport.SOUMIS
    rapport.soumis_le = moment
    # RG-032 : seule la première soumission peut être en retard (comme le planning).
    if premiere:
        rapport.en_retard = moment >= echeance(rapport)
        rapport.horodatage_douteux = douteux
    rapport.save(update_fields=["statut", "soumis_le", "en_retard", "horodatage_douteux",
                                "modifie_le"])  # fmt: skip
    VersionRapport.objects.create(
        pays=rapport.pays, rapport=rapport, numero=(derniere.numero + 1) if derniere else 1,
        contenu=contenu_fige(rapport), soumis_le=moment, heure_telephone=soumis_le,
        recu_le=recu_le, en_retard=premiere and rapport.en_retard,
        horodatage_douteux=douteux, correction=repond_a,
    )  # fmt: skip
    _auditer("rapport.soumission", rapport, visite=str(rapport.visite_id),
             soumis_le=moment.isoformat(), en_retard=rapport.en_retard,
             horodatage_douteux=douteux)  # fmt: skip
    if repond_a and demandeur is not None:
        _prevenir_correction_faite(rapport, demandeur)
    elif premiere:
        _prevenir_soumission(rapport)
    return rapport


def _prevenir_soumission(rapport: Rapport) -> None:
    """prd.md §18 (0.6.8) : « n rapports à valider », un compteur par jour et par superviseur
    responsable, plutôt qu'une notification par rapport."""
    from apps.identite.models import Utilisateur
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier_regroupe
    from apps.planning.services import responsables
    from apps.socle.services import aujourdhui

    jour = aujourdhui(rapport.pays).isoformat()
    for sup in Utilisateur.objects.filter(pk__in=responsables(rapport.visite.planning)):
        notifier_regroupe(sup, TypeNotification.RAPPORTS_SOUMIS, rapport.pays,
                          f"soumis:{jour}")  # fmt: skip


def _correction_figee(rapport: Rapport) -> dict | None:
    if rapport.correction_le is None:
        return None
    par = rapport.correction_par
    return {
        "le": rapport.correction_le.isoformat(),
        "par": f"{par.first_name} {par.last_name}".strip() if par else "",
        "commentaire": rapport.correction_commentaire,
        "champs": rapport.correction_champs,
    }


def _reouverture_figee(rapport: Rapport) -> dict | None:
    if rapport.rouvert_le is None:
        return None
    par = rapport.rouvert_par
    return {
        "le": rapport.rouvert_le.isoformat(),
        "par": f"{par.first_name} {par.last_name}".strip() if par else "",
        "commentaire": rapport.rouvert_motif,
        "champs": [],
        "reouverture": True,
    }


def _prevenir_correction_faite(rapport: Rapport, demandeur) -> None:
    """28.A : qui a demandé la correction (ou rouvert le rapport, RPT-016) apprend que le
    rapport corrigé est revenu."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    visite = rapport.visite
    delegue = visite.planning.delegue
    notifier(demandeur, TypeNotification.RAPPORT_CORRIGE, rapport.pays,
             delegue=str(delegue.pk), date=visite.date.isoformat(), visite=str(visite.pk),
             nom=f"{delegue.first_name} {delegue.last_name}".strip())  # fmt: skip


# --- Pièces jointes (RPT-007) -----------------------------------------------------------------

#: CA1 [H] : 10 Mo par fichier, 3 par rapport.
TAILLE_MAX_PIECE = 10 * 1024 * 1024
PIECES_MAX = 3

#: DC-48 : seuls les PDF, reconnus par leurs premiers octets et non par leur nom. Pas de photo :
#: aucun usage établi, et le risque d'y voir une ordonnance ou un patient.
SIGNATURE_PDF = b"%PDF-"


def _type_du_contenu(entete: bytes) -> tuple[str, str] | None:
    return ("application/pdf", "pdf") if entete.startswith(SIGNATURE_PDF) else None


def _exiger_ajout_possible(rapport: Rapport, prise_le: datetime) -> None:
    """Pendant la rédaction ; ou après la soumission si la pièce a été prise avant, et n'a pu
    partir qu'au retour du réseau (téléversement différé)."""
    if rapport.statut in MODIFIABLES:
        return
    if rapport.soumis_le and prise_le <= rapport.soumis_le:
        return
    _exiger_modifiable(rapport)


@transaction.atomic
def joindre(rapport: Rapport, *, id, fichier, prise_le: datetime) -> PieceJointe:
    """RPT-007 : ajoute un document PDF ; rejouer le même envoi ne crée rien de plus."""
    from django.core.files.base import ContentFile

    rapport = Rapport.objects.select_for_update().get(pk=rapport.pk)
    # Rejeu : la pièce déjà reçue (même retirée depuis) est rendue telle quelle.
    existante = PieceJointe.objects.filter(pk=id).first()
    if existante is not None:
        if existante.rapport_id != rapport.pk:
            raise ErreurMetier("identifiant_pris", _("Cet identifiant est déjà utilisé."),
                               status.HTTP_409_CONFLICT)  # fmt: skip
        return existante
    _exiger_ajout_possible(rapport, prise_le)
    if fichier.size > TAILLE_MAX_PIECE:
        raise ErreurMetier("piece_trop_lourde",
                           _("Un fichier ne dépasse pas 10 Mo."), champ="fichier")  # fmt: skip
    if rapport.pieces_jointes.filter(archive_le__isnull=True).count() >= PIECES_MAX:
        raise ErreurMetier(
            "pieces_trop_nombreuses", _("Trois pièces jointes au plus par rapport."),
            champ="fichier",
        )  # fmt: skip
    contenu = fichier.read()
    reconnu = _type_du_contenu(contenu[:16])
    if reconnu is None:
        raise ErreurMetier("type_de_fichier",
                           _("Seuls les documents PDF sont acceptés."),
                           champ="fichier")  # fmt: skip
    mime, extension = reconnu
    nom = (getattr(fichier, "name", "") or "").rsplit("/", 1)[-1][:200] or f"piece.{extension}"
    piece = PieceJointe(pk=id, pays=rapport.pays, rapport=rapport, nom=nom, type_mime=mime,
                        taille=len(contenu), prise_le=prise_le)  # fmt: skip
    piece.fichier.save(f"{id}.{extension}", ContentFile(contenu), save=False)
    piece.save()
    _auditer("rapport.piece_jointe_ajout", rapport, piece=str(piece.pk), taille=piece.taille,
             type=mime)  # fmt: skip
    return piece


@transaction.atomic
def retirer_piece(piece: PieceJointe) -> None:
    rapport = Rapport.objects.select_for_update().get(pk=piece.rapport_id)
    _exiger_modifiable(rapport)
    # RG-005 : retirée du rapport, la pièce reste archivée (conservation, RG-060).
    piece.archiver()
    _auditer("rapport.piece_jointe_retrait", rapport, piece=str(piece.pk))

"""Services de l'organisation d'un pays (ORG-003 à ORG-008).

Les vues passent par ces fonctions (architecture §7.2) ; les droits de l'acteur
sont vérifiés par les vues (matrice), les règles métier ici. L'audit de ces
changements sera écrit ici avec le journal d'audit (0.0.8, AUD-001).
"""

from datetime import date

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils.translation import gettext as _

from apps.identite.models import Role, Utilisateur
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays
from apps.socle.services import aujourdhui

from .models import (
    Division,
    Localite,
    Occupation,
    PerimetreReseau,
    Poste,
    Rattachement,
    Remplacement,
    Reseau,
    Secteur,
    TypePoste,
    Zone,
    actif_le,
)

# Rôles qui peuvent occuper un poste : le délégué, et le superviseur qui visite lui-même (§6.2).
ROLES_OCCUPANTS = {Role.DELEGUE, Role.SUPERVISEUR}
# Un poste est rattaché à un superviseur ; le poste d'un superviseur-visiteur l'est à son DM
# (RG-023).
ROLES_RATTACHEMENT = {Role.SUPERVISEUR, Role.DM}
ROLES_PERIMETRE_RESEAUX = {Role.DF, Role.DM}


def _auditer(action: str, objet, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"organisation.{action}", objet=objet, details=details)


def _doublon(erreur: IntegrityError) -> ErreurMetier:
    return ErreurMetier("libelle_deja_utilise", _("Ce libellé ou ce code est déjà utilisé."))


def _enregistrer(objet):
    creation = objet._state.adding
    try:
        with transaction.atomic():
            objet.save()
    except IntegrityError as erreur:
        raise _doublon(erreur) from erreur
    if creation:
        _auditer(f"{type(objet).__name__.lower()}.creation", objet)
    return objet


def _texte(valeur: str, champ: str) -> str:
    valeur = (valeur or "").strip()
    if not valeur:
        raise ErreurMetier("champ_requis", _("Ce champ est obligatoire."), champ=champ)
    return valeur


def _meme_pays_actif(objet, pays: Pays, code: str):
    if objet.pays_id != pays.pk or objet.est_archive:
        raise ErreurMetier(code, _("Élément inconnu ou archivé dans ce pays."))
    return objet


# --- Divisions, réseaux, zones, secteurs ----------------------------------------------------


def creer_division(pays: Pays, code: str, libelle: str) -> Division:
    return _enregistrer(
        Division(pays=pays, code=_texte(code, "code").upper(), libelle=_texte(libelle, "libelle"))
    )


def creer_reseau(pays: Pays, division: Division, code: str, libelle: str) -> Reseau:
    _meme_pays_actif(division, pays, "division_invalide")
    return _enregistrer(
        Reseau(
            pays=pays,
            division=division,
            code=_texte(code, "code").upper(),
            libelle=_texte(libelle, "libelle"),
        )
    )


def creer_zone(pays: Pays, libelle: str) -> Zone:
    return _enregistrer(Zone(pays=pays, libelle=_texte(libelle, "libelle")))


def creer_secteur(pays: Pays, zone: Zone, libelle: str) -> Secteur:
    """Un secteur appartient à une seule zone (ORG-003 CA1)."""
    _meme_pays_actif(zone, pays, "zone_invalide")
    return _enregistrer(Secteur(pays=pays, zone=zone, libelle=_texte(libelle, "libelle")))


def creer_localite(secteur: Secteur, libelle: str) -> Localite:
    """Une localité appartient à un secteur actif de son pays."""
    if secteur.est_archive:
        raise ErreurMetier("secteur_invalide", _("Élément inconnu ou archivé dans ce pays."))
    return _enregistrer(
        Localite(pays=secteur.pays, secteur=secteur, libelle=_texte(libelle, "libelle"))
    )


def deplacer_secteur(secteur: Secteur, zone: Zone) -> Secteur:
    """Rattache un secteur à une autre zone de son pays (secteurs repris d'un import dans la
    zone « À répartir », redécoupage du territoire). Ses postes et établissements le suivent."""
    if secteur.est_archive or zone.est_archive or zone.pays_id != secteur.pays_id:
        raise ErreurMetier("zone_invalide", _("Élément inconnu ou archivé dans ce pays."))
    if zone.pk == secteur.zone_id:
        return secteur
    ancienne = secteur.zone.libelle
    secteur.zone = zone
    try:
        with transaction.atomic():
            secteur.save(update_fields=["zone"])
    except IntegrityError as erreur:
        raise _doublon(erreur) from erreur
    _auditer("secteur.deplacement", secteur, ancienne=ancienne, nouvelle=zone.libelle)
    return secteur


def renommer(objet, libelle: str):
    if objet.est_archive:
        raise ErreurMetier("archive", _("Un élément archivé ne se modifie plus."))
    ancien = objet.libelle
    objet.libelle = _texte(libelle, "libelle")
    try:
        with transaction.atomic():
            objet.save(update_fields=["libelle"])
    except IntegrityError as erreur:
        raise _doublon(erreur) from erreur
    _auditer(
        f"{type(objet).__name__.lower()}.renommage", objet, ancien=ancien, nouveau=objet.libelle
    )
    return objet


def archiver(objet):
    """Archive (RG-005). Un élément archivé n'est plus proposé mais reste dans l'historique
    (ORG-003 CA2). On n'archive pas un parent qui a encore des enfants actifs."""
    enfants = {
        Division: ("reseaux", _("Archivez d'abord les réseaux de cette division.")),
        Zone: ("secteurs", _("Archivez d'abord les secteurs de cette zone.")),
    }.get(type(objet))
    if enfants and getattr(objet, enfants[0]).filter(archive_le__isnull=True).exists():
        raise ErreurMetier("elements_actifs", enfants[1])
    # Un établissement appartient toujours à un secteur actif (PRP-003 CA1).
    if (
        isinstance(objet, Secteur)
        and objet.etablissements.filter(statut__in=["a_valider", "actif"]).exists()
    ):
        raise ErreurMetier(
            "elements_actifs", _("Rattachez d'abord les établissements de ce secteur à un autre.")
        )
    if isinstance(objet, Poste):
        jour = aujourdhui(objet.pays)
        if objet.occupations.filter(Q(fin__isnull=True) | Q(fin__gt=jour)).exists():
            raise ErreurMetier("poste_occupe", _("Terminez d'abord l'occupation de ce poste."))
        for rattachement in objet.rattachements.filter(Q(fin__isnull=True) | Q(fin__gt=jour)):
            rattachement.fin = max(jour, rattachement.debut)
            rattachement.save(update_fields=["fin"])
    objet.archiver()
    _auditer(f"{type(objet).__name__.lower()}.archivage", objet)
    return objet


# --- Postes (ORG-005) -----------------------------------------------------------------------


def _verifier_liens_poste(pays: Pays, reseaux, secteurs) -> None:
    for reseau in reseaux:
        _meme_pays_actif(reseau, pays, "reseau_invalide")
    for secteur in secteurs:
        _meme_pays_actif(secteur, pays, "secteur_invalide")


@transaction.atomic
def creer_poste(pays: Pays, type_poste: str, libelle: str, reseaux=(), secteurs=()) -> Poste:
    """Un poste peut être vacant et couvrir plusieurs secteurs (ORG-005)."""
    if type_poste not in TypePoste.values:
        raise ErreurMetier("type_poste_invalide", _("Type de poste inconnu."))
    _verifier_liens_poste(pays, reseaux, secteurs)
    poste = _enregistrer(
        Poste(pays=pays, type_poste=type_poste, libelle=_texte(libelle, "libelle"))
    )
    poste.reseaux.set(reseaux)
    poste.secteurs.set(secteurs)
    return poste


@transaction.atomic
def modifier_poste(poste: Poste, *, libelle=None, type_poste=None, reseaux=None, secteurs=None):
    if poste.est_archive:
        raise ErreurMetier("archive", _("Un élément archivé ne se modifie plus."))
    _verifier_liens_poste(poste.pays, reseaux or (), secteurs or ())
    if type_poste is not None:
        if type_poste not in TypePoste.values:
            raise ErreurMetier("type_poste_invalide", _("Type de poste inconnu."))
        poste.type_poste = type_poste
    if libelle is not None:
        poste.libelle = _texte(libelle, "libelle")
    try:
        with transaction.atomic():
            poste.save()
    except IntegrityError as erreur:
        raise _doublon(erreur) from erreur
    if reseaux is not None:
        poste.reseaux.set(reseaux)
    if secteurs is not None:
        poste.secteurs.set(secteurs)
    _auditer("poste.modification", poste)
    return poste


# --- Liens datés : occupations, rattachements, périmètres ------------------------------------


def a_un_role_dans(utilisateur: Utilisateur, pays: Pays, roles: set[str]) -> bool:
    """Rôle actif aujourd'hui dans ce pays, en tenant compte des affectations (ORG-009)."""
    from apps.perimetre.perimetre import calculer_perimetre

    if not utilisateur.is_active:
        return False
    try:
        perimetre = calculer_perimetre(utilisateur, pays.code)
    except ErreurMetier:
        return False
    return bool(perimetre.roles & roles)


def _debut(pays: Pays, debut: date | None) -> date:
    return debut or aujourdhui(pays)


def _chevauche(qs, debut: date, fin: date | None):
    qs = qs.filter(Q(fin__isnull=True) | Q(fin__gt=debut))
    return qs.filter(debut__lt=fin) if fin else qs


def terminer(lien, fin: date | None = None):
    """Termine un lien daté à la date donnée (aujourd'hui par défaut) ; fin = début l'annule."""
    jour = aujourdhui(lien.pays)
    fin = fin or jour
    if lien.fin is not None and lien.fin <= jour:
        raise ErreurMetier("deja_termine", _("Ce lien est déjà terminé."))
    if fin < lien.debut:
        raise ErreurMetier("fin_invalide", _("La fin ne peut pas précéder le début."))
    lien.fin = fin
    lien.save(update_fields=["fin"])
    _auditer(f"{type(lien).__name__.lower()}.fin", lien, fin=str(fin))
    return lien


@transaction.atomic
def occuper(poste: Poste, utilisateur: Utilisateur, debut: date | None = None) -> Occupation:
    """Une personne occupe un poste à partir d'une date (ORG-006).

    Un poste n'a qu'un occupant à la fois ; la première occupation en cours d'une personne
    est son poste principal (RG-011).
    """
    poste = Poste.objects.select_for_update().get(pk=poste.pk)
    if poste.est_archive:
        raise ErreurMetier("archive", _("Ce poste est archivé."))
    if not a_un_role_dans(utilisateur, poste.pays, ROLES_OCCUPANTS):
        raise ErreurMetier(
            "occupant_invalide",
            _("Seul un délégué ou un superviseur de ce pays peut occuper un poste."),
        )
    debut = _debut(poste.pays, debut)
    if _chevauche(poste.occupations.all(), debut, None).exists():
        raise ErreurMetier("poste_deja_occupe", _("Ce poste est déjà occupé à cette date."))
    if _chevauche(poste.occupations.filter(utilisateur=utilisateur), debut, None).exists():
        raise ErreurMetier("deja_occupant", _("Cette personne occupe déjà ce poste."))
    principal = not _chevauche(
        Occupation.objects.filter(utilisateur=utilisateur, pays=poste.pays, principal=True),
        debut,
        None,
    ).exists()
    return _enregistrer(
        Occupation(
            pays=poste.pays, poste=poste, utilisateur=utilisateur, debut=debut, principal=principal
        )
    )


@transaction.atomic
def rattacher(poste: Poste, superviseur: Utilisateur, debut: date | None = None) -> Rattachement:
    """Rattache un poste à un superviseur à partir d'une date (ORG-007).

    Le rattachement précédent prend fin ce jour-là ; les décisions passées ne changent pas (CA2).
    """
    poste = Poste.objects.select_for_update().get(pk=poste.pk)
    if poste.est_archive:
        raise ErreurMetier("archive", _("Ce poste est archivé."))
    if not a_un_role_dans(superviseur, poste.pays, ROLES_RATTACHEMENT):
        raise ErreurMetier(
            "superviseur_invalide", _("Seul un superviseur ou un DM de ce pays peut être choisi.")
        )
    debut = _debut(poste.pays, debut)
    suivants = poste.rattachements.filter(Q(fin__isnull=True) | Q(fin__gt=debut))
    if suivants.filter(debut__gte=debut).exists():
        raise ErreurMetier(
            "rattachement_posterieur", _("Un rattachement commence déjà à cette date ou après.")
        )
    for precedent in suivants:
        precedent.fin = debut
        precedent.save(update_fields=["fin"])
    return _enregistrer(
        Rattachement(pays=poste.pays, poste=poste, superviseur=superviseur, debut=debut)
    )


@transaction.atomic
def ajouter_reseau_au_perimetre(
    utilisateur: Utilisateur, reseau: Reseau, debut: date | None = None
) -> PerimetreReseau:
    """Ajoute un réseau au périmètre daté d'un DF ou d'un DM (ORG-008)."""
    if reseau.est_archive:
        raise ErreurMetier("archive", _("Ce réseau est archivé."))
    if not a_un_role_dans(utilisateur, reseau.pays, ROLES_PERIMETRE_RESEAUX):
        raise ErreurMetier(
            "role_df_dm_requis", _("Seul un DF ou un DM de ce pays a un périmètre de réseaux.")
        )
    debut = _debut(reseau.pays, debut)
    existants = PerimetreReseau.objects.filter(utilisateur=utilisateur, reseau=reseau)
    if _chevauche(existants, debut, None).exists():
        raise ErreurMetier("reseau_deja_dans_perimetre", _("Ce réseau est déjà dans le périmètre."))
    return _enregistrer(
        PerimetreReseau(pays=reseau.pays, utilisateur=utilisateur, reseau=reseau, debut=debut)
    )


def terminer_liens(utilisateur: Utilisateur, pays: Pays) -> None:
    """Fin, aujourd'hui, des occupations, rattachements et périmètres d'une personne dans un
    pays (transfert, ORG-010)."""
    jour = aujourdhui(pays)
    for modele, champ in (
        (Occupation, "utilisateur"),
        (Rattachement, "superviseur"),
        (PerimetreReseau, "utilisateur"),
    ):
        en_cours = modele.objects.filter(**{champ: utilisateur, "pays": pays})
        for lien in en_cours.filter(Q(fin__isnull=True) | Q(fin__gt=jour)):
            lien.fin = max(jour, lien.debut)
            lien.save(update_fields=["fin"])


# --- Lectures -------------------------------------------------------------------------------


def superviseur_du_poste(poste: Poste, jour: date | None = None) -> Utilisateur | None:
    jour = jour or aujourdhui(poste.pays)
    rattachement = poste.rattachements.select_related("superviseur").filter(actif_le(jour)).first()
    return rattachement.superviseur if rattachement else None


# --- Remplaçant daté d'un superviseur (ORG-013, RG-020) ---------------------------------------


def superviseurs_du_pays(pays: Pays) -> list[Utilisateur]:
    """Superviseurs dont le rôle est actif aujourd'hui dans ce pays."""
    from django.utils import timezone

    maintenant = timezone.now()
    return list(
        Utilisateur.objects.filter(
            roles__pays=pays, roles__role=Role.SUPERVISEUR, roles__debut__lte=maintenant,
            is_active=True,
        )
        .filter(Q(roles__fin__isnull=True) | Q(roles__fin__gt=maintenant))
        .distinct()
        .order_by("last_name", "first_name")
    )  # fmt: skip


def superviseurs_du_dm(dm: Utilisateur, pays: Pays, jour: date | None = None) -> set:
    """Superviseurs des postes dont un réseau est dans le périmètre daté du DM (ORG-008)."""
    jour = jour or aujourdhui(pays)
    reseaux = PerimetreReseau.objects.filter(actif_le(jour), utilisateur=dm, pays=pays).values(
        "reseau"
    )
    return set(
        Rattachement.objects.filter(actif_le(jour), pays=pays, poste__reseaux__in=reseaux)
        .values_list("superviseur_id", flat=True)
        .distinct()
    )


def dms_des_reseaux(pays: Pays, reseaux, jour: date | None = None) -> set:
    """DM dont le périmètre daté couvre l'un de ces réseaux (ORG-008)."""
    jour = jour or aujourdhui(pays)
    return set(
        PerimetreReseau.objects.filter(actif_le(jour), pays=pays, reseau__in=reseaux)
        .values_list("utilisateur_id", flat=True)
        .distinct()
    )


def recours_du_pays(pays: Pays, jour: date | None = None) -> set:
    """Qui décide à la place du superviseur (1.3.0 [D] : plus le DM) : les administrateurs du
    pays ; à défaut, ceux du siège (le Sénégal, siège sans administrateur pays). Ils reçoivent
    l'escalade d'un planning ou d'une journée de rapports (PLN-016, RG-019) et valident les
    postes rattachés à un DM (superviseur-visiteur, RG-023)."""
    from apps.identite.models import RoleUtilisateur

    jour = jour or aujourdhui(pays)
    actifs = RoleUtilisateur.objects.filter(
        utilisateur__is_active=True, debut__date__lte=jour
    ).filter(Q(fin__isnull=True) | Q(fin__date__gt=jour))
    du_pays = set(
        actifs.filter(role=Role.ADMIN_PAYS, pays=pays).values_list("utilisateur_id", flat=True)
    )
    if du_pays:
        return du_pays
    return set(
        actifs.filter(role=Role.ADMIN_SIEGE, pays__isnull=True).values_list(
            "utilisateur_id", flat=True
        )
    )


def remplacements_actifs(pays: Pays, jour: date | None = None):
    jour = jour or aujourdhui(pays)
    return Remplacement.objects.filter(
        pays=pays, archive_le__isnull=True, debut__lte=jour, fin__gte=jour
    )


def remplaces_par(remplacant: Utilisateur, pays: Pays, jour: date | None = None) -> list:
    """Superviseurs que cette personne remplace ce jour-là (ORG-013 CA1, CA3)."""
    return [
        r.superviseur
        for r in remplacements_actifs(pays, jour)
        .filter(remplacant=remplacant)
        .select_related("superviseur")
    ]


@transaction.atomic
def designer_remplacant(
    pays: Pays, superviseur: Utilisateur, remplacant: Utilisateur, debut: date, fin: date, par
) -> Remplacement:
    """ORG-013 : un autre superviseur du pays remplace celui-ci du `debut` au `fin` inclus."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    if remplacant.pk == superviseur.pk:
        raise ErreurMetier(
            "remplacant_invalide", _("Un superviseur ne se remplace pas lui-même."),
            champ="remplacant",
        )  # fmt: skip
    for personne, champ in ((superviseur, "superviseur"), (remplacant, "remplacant")):
        if not a_un_role_dans(personne, pays, {Role.SUPERVISEUR}):
            raise ErreurMetier(
                "superviseur_invalide",
                _("Le remplacé et le remplaçant sont des superviseurs de ce pays."),
                champ=champ,
            )
    if fin < debut:
        raise ErreurMetier("periode_invalide", _("La fin précède le début."), champ="fin")
    if debut < aujourdhui(pays):
        raise ErreurMetier(
            "periode_passee", _("Un remplacement commence aujourd'hui ou plus tard."),
            champ="debut",
        )  # fmt: skip
    chevauchement = Remplacement.objects.filter(
        superviseur=superviseur, archive_le__isnull=True, debut__lte=fin, fin__gte=debut
    )
    if chevauchement.exists():
        raise ErreurMetier(
            "remplacement_chevauchement",
            _("Un remplaçant est déjà désigné pour ce superviseur sur une partie de la période."),
            409,
            champ="debut",
        )
    remplacement = _enregistrer(
        Remplacement(pays=pays, superviseur=superviseur, remplacant=remplacant, debut=debut,
                     fin=fin, designe_par=par)
    )  # fmt: skip
    notifier(remplacant, TypeNotification.REMPLACEMENT_ATTRIBUE, pays,
             debut=debut.isoformat(), fin=fin.isoformat(),
             nom=f"{superviseur.first_name} {superviseur.last_name}".strip())  # fmt: skip
    return remplacement


@transaction.atomic
def terminer_remplacement(remplacement: Remplacement) -> Remplacement:
    """Fin anticipée (ORG-013 CA3) : l'accès cesse aussitôt. Un remplacement qui n'a pas encore
    servi (il commence aujourd'hui ou plus tard) est retiré ; sinon il finit hier."""
    from datetime import timedelta

    jour = aujourdhui(remplacement.pays)
    if remplacement.debut >= jour:
        remplacement.archiver()
        _auditer("remplacement.retrait", remplacement)
    elif remplacement.fin >= jour:
        remplacement.fin = jour - timedelta(days=1)
        remplacement.save(update_fields=["fin"])
        _auditer("remplacement.fin", remplacement, fin=str(remplacement.fin))
    return remplacement

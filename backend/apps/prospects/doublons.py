"""Doublons des fiches prospects (prd.md §14.6 ; PRP-007 à PRP-010).

- PRP-007 : `ressemblantes` propose, pendant la saisie, les fiches au nom approchant (faute de
  frappe, accent, titre), au même téléphone ou au même numéro d'ordre.
- PRP-008 : `detecter` classe une fiche à l'enregistrement : `certain` (même numéro d'ordre,
  ou même mobile personnel avec un nom similaire) → fusion automatique ; `probable` → file
  de l'administrateur pays ; `aucun` → la fiche devient commune. Un même téléphone fixe
  (le standard d'une clinique) ne suffit jamais (CA2). Chaque décision est auditée avec son
  score et ses critères (CA3).
- PRP-009 : `trancher` fusionne, garde séparées (la paire ne revient plus) ou refuse.
- PRP-010 : `defusionner` rend à chaque fiche ses exercices, listes cibles et champs.
"""

from dataclasses import dataclass, field
from difflib import SequenceMatcher

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.identite.models import Utilisateur
from apps.socle.erreurs import ErreurMetier
from apps.socle.models import Pays

from .models import (
    Changement,
    Cible,
    DoublonProbable,
    Exercice,
    Fusion,
    Prospect,
    StatutDoublon,
    StatutFiche,
)

#: Seuil de similarité des noms [H] : au-dessus, deux noms désignent la même personne
#: (« Aissatou Ndiaye » / « Aïssatou N'Diaye » / « Aissatu Ndiaye »).
SEUIL_NOM = 0.85
#: Seuil des suggestions pendant la saisie [H], plus large que celui du détecteur.
SEUIL_SUGGESTION = 0.72
#: Nombre de suggestions affichées.
SUGGESTIONS_MAX = 5

VIVANTES = (StatutFiche.ACTIF, StatutFiche.A_VALIDER)

#: Champs de la fiche conservée complétés par ceux de la fiche absorbée quand ils sont vides.
COMPLETABLES = ["numero_ordre", "telephone_mobile", "telephone_pro", "courriel", "grade_id",
                "secteur_id", "localite_id", "activite", "specialite_id"]  # fmt: skip


@dataclass
class Decision:
    niveau: str  # certain, probable, aucun
    candidat: Prospect | None = None
    score: int = 0
    criteres: list[str] = field(default_factory=list)


def similarite(a: str, b: str) -> float:
    """Similarité de deux noms normalisés, insensible à l'ordre des mots (« Awa Ndiaye » /
    « Ndiaye Awa ») et aux fautes de frappe."""
    if not a or not b:
        return 0.0
    directe = SequenceMatcher(None, a, b).ratio()
    triee = SequenceMatcher(None, " ".join(sorted(a.split())), " ".join(sorted(b.split()))).ratio()
    return max(directe, triee)


def couvre(saisie: str, nom: str) -> bool:
    """Chaque mot saisi (2 lettres au moins) commence un mot du nom : « ndiaye » couvre
    « aissatou ndiaye », « aiss nd » aussi (PRP-007, saisie en cours)."""
    mots = [m for m in saisie.split() if len(m) >= 2]
    noms = nom.split()
    return bool(mots) and all(any(n.startswith(m) for n in noms) for m in mots)


def _candidates(pays: Pays, nom_normalise: str, champs: dict, exclure=None) -> QuerySet:
    """Présélection en base : un mot du nom (3 lettres au moins, ses 4 premières) en commun,
    ou un identifiant fort (numéro d'ordre, téléphones)."""
    filtre = Q()
    for mot in nom_normalise.split():
        if len(mot) >= 3:
            filtre |= Q(nom_normalise__contains=mot[:4])
    for cle in ("numero_ordre", "telephone_mobile", "telephone_pro"):
        if champs.get(cle):
            filtre |= Q(**{cle: champs[cle]})
    if not filtre:
        return Prospect.objects.none()
    qs = Prospect.objects.filter(filtre, pays=pays, statut__in=VIVANTES)
    if exclure is not None:
        qs = qs.exclude(pk=exclure.pk)
    return qs.select_related("type", "specialite", "secteur")


def _evaluer(fiche: dict, autre: Prospect) -> Decision:
    """Score de 0 à 100 et critères lisibles d'une paire (CA3)."""
    nom = similarite(fiche["nom_normalise"], autre.nom_normalise)
    criteres: list[str] = []
    if nom >= SEUIL_NOM:
        criteres.append("nom_similaire")
    meme_ordre = bool(fiche.get("numero_ordre")) and fiche["numero_ordre"] == autre.numero_ordre
    meme_mobile = (
        bool(fiche.get("telephone_mobile")) and fiche["telephone_mobile"] == autre.telephone_mobile
    )
    meme_fixe = bool(fiche.get("telephone_pro")) and fiche["telephone_pro"] == autre.telephone_pro
    if meme_ordre:
        criteres.append("meme_numero_ordre")
    if meme_mobile:
        criteres.append("meme_mobile")
    if meme_fixe:
        criteres.append("meme_telephone_fixe")
    if fiche.get("specialite_id") and fiche["specialite_id"] == autre.specialite_id:
        criteres.append("meme_specialite")
    elif fiche.get("type_id") and fiche["type_id"] == autre.type_id:
        criteres.append("meme_type")
    if fiche.get("secteur_id") and fiche["secteur_id"] == autre.secteur_id:
        criteres.append("meme_secteur")

    score = round(nom * 60)
    score += 40 if meme_ordre else 0
    score += 25 if meme_mobile else 0
    score += 10 if meme_fixe and nom >= SEUIL_NOM else 0
    score += 5 * len({"meme_specialite", "meme_type", "meme_secteur"} & set(criteres))
    score = min(score, 100)

    if meme_ordre or (meme_mobile and nom >= SEUIL_NOM):
        niveau = "certain"
    elif nom >= SEUIL_NOM or meme_mobile:
        # Un standard partagé (même fixe) avec des noms différents n'est pas un doublon (CA2).
        niveau = "probable"
    else:
        niveau = "aucun"
    return Decision(niveau, autre, score, criteres)


def _valeurs(prospect: Prospect) -> dict:
    return {
        "nom_normalise": prospect.nom_normalise,
        "numero_ordre": prospect.numero_ordre,
        "telephone_mobile": prospect.telephone_mobile,
        "telephone_pro": prospect.telephone_pro,
        "specialite_id": prospect.specialite_id,
        "type_id": prospect.type_id,
        "secteur_id": prospect.secteur_id,
    }


def _separees(prospect: Prospect) -> set:
    """Fiches que l'administrateur a déclarées distinctes de celle-ci (PRP-009 CA2)."""
    paires = DoublonProbable.objects.filter(
        Q(fiche=prospect) | Q(candidat=prospect), statut=StatutDoublon.SEPARES
    ).values_list("fiche_id", "candidat_id")
    return {x for paire in paires for x in paire} - {prospect.pk}


def detecter(prospect: Prospect) -> Decision:
    """PRP-008 : meilleure correspondance d'une fiche parmi les fiches vivantes du pays."""
    fiche = _valeurs(prospect)
    exclues = _separees(prospect)
    meilleure = Decision("aucun")
    rang = {"aucun": 0, "probable": 1, "certain": 2}
    for autre in _candidates(prospect.pays, prospect.nom_normalise, fiche, exclure=prospect):
        if autre.pk in exclues:
            continue
        d = _evaluer(fiche, autre)
        if (rang[d.niveau], d.score) > (rang[meilleure.niveau], meilleure.score):
            meilleure = d
    return meilleure


def ressemblantes(qs: QuerySet, pays: Pays, champs: dict) -> list[tuple[Prospect, int, list]]:
    """PRP-007 CA1 : fiches visibles qui ressemblent à la saisie en cours, les plus proches
    d'abord."""
    from .services import normaliser_nom

    nom = normaliser_nom(champs.get("prenom", ""), champs.get("nom", ""))
    fiche = {"nom_normalise": nom, **{k: champs.get(k) for k in
             ("numero_ordre", "telephone_mobile", "telephone_pro")}}  # fmt: skip
    if len(nom) < 3 and not any(fiche[k] for k in ("numero_ordre", "telephone_mobile")):
        return []
    ids = _candidates(pays, nom, fiche).values("pk")
    resultats = []
    for autre in qs.filter(pk__in=ids, statut__in=VIVANTES)[:200]:
        d = _evaluer(fiche, autre)
        proche = similarite(nom, autre.nom_normalise) >= SEUIL_SUGGESTION
        if d.niveau != "aucun" or proche or couvre(nom, autre.nom_normalise):
            resultats.append((autre, d.score, d.criteres))
    resultats.sort(key=lambda r: -r[1])
    return resultats[:SUGGESTIONS_MAX]


def _auditer(action: str, prospect: Prospect, **details) -> None:
    from apps.audit.services import enregistrer

    enregistrer(f"prospect.{action}", objet=prospect, pays=prospect.pays, details=details)


def _historiser(prospect: Prospect, champ: str, ancienne, nouvelle, auteur, origine: str):
    Changement.objects.create(
        pays=prospect.pays,
        objet=Changement.Objet.PROSPECT,
        objet_id=prospect.pk,
        champ=champ,
        ancienne=str(ancienne or "")[:300],
        nouvelle=str(nouvelle or "")[:300],
        auteur=auteur,
        origine=origine,
    )


@transaction.atomic
def fusionner(
    conservee: Prospect,
    absorbee: Prospect,
    *,
    par: Utilisateur | None,
    automatique: bool,
    score: int = 0,
    criteres: list | None = None,
) -> Fusion:
    """Fusionne `absorbee` dans `conservee` : exercices, listes cibles (et plus tard visites et
    rapports) suivent la fiche conservée ; ses champs vides sont complétés. Réversible."""
    if conservee.pk == absorbee.pk or conservee.pays_id != absorbee.pays_id:
        raise ErreurMetier("fusion_impossible", _("Ces deux fiches ne peuvent pas fusionner."))
    if absorbee.statut not in VIVANTES or conservee.statut not in VIVANTES:
        raise ErreurMetier("fusion_impossible", _("Seules des fiches en cours fusionnent."))
    transferts: dict = {"exercices": [], "exercices_termines": [], "cibles": [],
                        "cibles_terminees": [], "champs": {}}  # fmt: skip
    jour = timezone.localdate()
    statut_avant = absorbee.statut
    if absorbee._state.adding:
        # Fiche tout juste saisie (fusion automatique) : enregistrée directement fusionnée,
        # sans exercice ni liste cible à transférer.
        absorbee.statut, absorbee.fusionne_dans = StatutFiche.FUSIONNE, conservee
        absorbee.save()
    else:
        _transferer(conservee, absorbee, transferts, jour)
    return _terminer_fusion(conservee, absorbee, transferts, statut_avant, par, automatique,
                            score, criteres)  # fmt: skip


def _transferer(conservee: Prospect, absorbee: Prospect, transferts: dict, jour) -> None:
    lieux = set(
        conservee.exercices.filter(fin__isnull=True).values_list("etablissement_id", flat=True)
    )
    for e in absorbee.exercices.filter(fin__isnull=True):
        if e.etablissement_id in lieux:
            e.fin = max(jour, e.debut)
            e.save(update_fields=["fin"])
            transferts["exercices_termines"].append(str(e.pk))
        else:
            if e.principal and conservee.exercices.filter(fin__isnull=True, principal=True):
                e.principal = False
            e.prospect = conservee
            e.save(update_fields=["prospect", "principal"])
            transferts["exercices"].append(str(e.pk))

    postes = set(conservee.cibles.filter(fin__isnull=True).values_list("poste_id", flat=True))
    for c in absorbee.cibles.filter(fin__isnull=True):
        if c.poste_id in postes:
            c.fin = max(jour, c.debut)
            c.save(update_fields=["fin"])
            transferts["cibles_terminees"].append(str(c.pk))
        else:
            c.prospect = conservee
            c.save(update_fields=["prospect"])
            transferts["cibles"].append(str(c.pk))


def _terminer_fusion(conservee, absorbee, transferts, statut_avant, par, automatique, score,
                     criteres) -> Fusion:  # fmt: skip
    absorbee.statut, absorbee.fusionne_dans = StatutFiche.FUSIONNE, conservee
    absorbee.save(update_fields=["statut", "fusionne_dans"])

    for champ in COMPLETABLES:
        if not getattr(conservee, champ) and getattr(absorbee, champ):
            transferts["champs"][champ] = str(getattr(absorbee, champ))
            setattr(conservee, champ, getattr(absorbee, champ))
            _historiser(conservee, champ.removesuffix("_id"), "", getattr(absorbee, champ),
                        par, "fusion")  # fmt: skip
    if transferts["champs"]:
        conservee.save(update_fields=list(transferts["champs"]))

    fusion = Fusion.objects.create(
        pays=conservee.pays,
        conservee=conservee,
        absorbee=absorbee,
        automatique=automatique,
        score=score,
        criteres=criteres or [],
        statut_avant=statut_avant,
        transferts=transferts,
        par=par,
    )
    _auditer("fusion", conservee, absorbee=str(absorbee.pk), automatique=automatique,
             score=score, criteres=criteres or [])  # fmt: skip
    return fusion


@transaction.atomic
def defusionner(fusion: Fusion, par: Utilisateur) -> Prospect:
    """PRP-010 : chaque fiche retrouve ses exercices, listes cibles et champs d'origine."""
    if fusion.defaite_le is not None:
        raise ErreurMetier("deja_defusionnee", _("Cette fusion a déjà été défaite."))
    conservee, absorbee = fusion.conservee, fusion.absorbee
    t = fusion.transferts
    for objet in [*Exercice.objects.filter(pk__in=t.get("exercices", [])),
                  *Cible.objects.filter(pk__in=t.get("cibles", []))]:  # fmt: skip
        objet.prospect = absorbee
        objet.save(update_fields=["prospect"])
    for e in Exercice.objects.filter(pk__in=t.get("exercices_termines", [])):
        # Réouvert seulement si aucun autre exercice en cours n'occupe le couple.
        if not Exercice.objects.filter(
            prospect=absorbee, etablissement=e.etablissement, fin__isnull=True
        ).exists():
            e.fin = None
            e.save(update_fields=["fin"])
    for c in Cible.objects.filter(pk__in=t.get("cibles_terminees", [])):
        if not Cible.objects.filter(prospect=absorbee, poste=c.poste, fin__isnull=True).exists():
            c.fin = None
            c.save(update_fields=["fin"])
    retires = []
    for champ, valeur in t.get("champs", {}).items():
        if str(getattr(conservee, champ)) == valeur:
            setattr(conservee, champ, "" if not champ.endswith("_id") else None)
            retires.append(champ)
            _historiser(conservee, champ.removesuffix("_id"), valeur, "", par, "defusion")
    if retires:
        conservee.save(update_fields=retires)

    champs = ["statut", "fusionne_dans"]
    if absorbee.numero_ordre and Prospect.objects.filter(
        pays=absorbee.pays, numero_ordre=absorbee.numero_ordre, statut__in=VIVANTES
    ).exclude(pk=absorbee.pk):
        # Deux personnes distinctes ne partagent pas un numéro d'ordre : la fiche défusionnée
        # le perd, l'historique en garde la trace (à ressaisir avec le bon numéro).
        _historiser(absorbee, "numero_ordre", absorbee.numero_ordre, "", par, "defusion")
        absorbee.numero_ordre = ""
        champs.append("numero_ordre")
    absorbee.statut, absorbee.fusionne_dans = fusion.statut_avant, None
    absorbee.save(update_fields=champs)
    fusion.defaite_le, fusion.defaite_par = timezone.now(), par
    fusion.save(update_fields=["defaite_le", "defaite_par"])
    # La paire ne doit pas être refusionnée automatiquement : elle est désormais distincte.
    DoublonProbable.objects.update_or_create(
        pays=conservee.pays,
        fiche=absorbee,
        candidat=conservee,
        defaults={
            "score": fusion.score,
            "criteres": fusion.criteres,
            "statut": StatutDoublon.SEPARES,
            "decide_par": par,
            "decide_le": timezone.now(),
        },  # fmt: skip
    )
    _auditer("defusion", conservee, absorbee=str(absorbee.pk), fusion=str(fusion.pk))
    return absorbee


@transaction.atomic
def appliquer(prospect: Prospect, auteur: Utilisateur) -> tuple[Prospect, Decision]:
    """PRP-008 à l'enregistrement d'une nouvelle fiche (pas encore en base). Renvoie la fiche à
    montrer (la conservée en cas de fusion automatique) et la décision."""
    d = detecter(prospect)
    if d.niveau == "certain":
        fusionner(d.candidat, prospect, par=None, automatique=True, score=d.score,
                  criteres=d.criteres)  # fmt: skip
    elif prospect._state.adding:
        prospect.save()
    _auditer("detection_doublons", prospect, niveau=d.niveau, score=d.score,
             criteres=d.criteres, candidat=str(d.candidat.pk) if d.candidat else None,
             auteur=str(auteur.pk))  # fmt: skip
    if d.niveau == "certain":
        return d.candidat, d
    if d.niveau == "probable":
        DoublonProbable.objects.get_or_create(
            pays=prospect.pays,
            fiche=prospect,
            candidat=d.candidat,
            defaults={"score": d.score, "criteres": d.criteres},
        )
        return prospect, d
    if prospect.statut == StatutFiche.A_VALIDER:
        # « aucun » : la fiche devient commune (§14.6).
        prospect.statut, prospect.valide_le = StatutFiche.ACTIF, timezone.now()
        prospect.save(update_fields=["statut", "valide_le"])
    return prospect, d


@transaction.atomic
def trancher(doublon: DoublonProbable, decision: str, par: Utilisateur, conserver=None):
    """PRP-009 : fusionner (la fiche choisie est conservée, le candidat par défaut), garder
    séparées, ou refuser la nouvelle fiche."""
    from . import services

    if doublon.statut != StatutDoublon.EN_ATTENTE:
        raise ErreurMetier("deja_tranche", _("Ce doublon a déjà été tranché."))
    fiche, candidat = doublon.fiche, doublon.candidat
    if decision == "fusionner":
        conservee = fiche if conserver == str(fiche.pk) else candidat
        absorbee = candidat if conservee is fiche else fiche
        if conservee.statut == StatutFiche.A_VALIDER:
            services.valider(conservee, par)
        fusionner(conservee, absorbee, par=par, automatique=False, score=doublon.score,
                  criteres=doublon.criteres)  # fmt: skip
        doublon.statut = StatutDoublon.FUSIONNES
    elif decision == "separer":
        if fiche.statut == StatutFiche.A_VALIDER:
            services.valider(fiche, par)
        doublon.statut = StatutDoublon.SEPARES
    elif decision == "refuser":
        services.archiver(fiche, _("Doublon refusé"))
        doublon.statut = StatutDoublon.REFUSE
    else:
        raise ErreurMetier("decision_inconnue", _("Décision inconnue."), champ="decision")
    doublon.decide_par, doublon.decide_le = par, timezone.now()
    doublon.save(update_fields=["statut", "decide_par", "decide_le"])
    _auditer("doublon_tranche", fiche, decision=decision, candidat=str(candidat.pk),
             score=doublon.score)  # fmt: skip
    # Les autres paires de la fiche absorbée ou refusée n'ont plus d'objet.
    if decision in ("fusionner", "refuser"):
        for autre in DoublonProbable.objects.filter(
            Q(fiche__statut__in=[StatutFiche.FUSIONNE, StatutFiche.ARCHIVE])
            | Q(candidat__statut__in=[StatutFiche.FUSIONNE, StatutFiche.ARCHIVE]),
            pays=doublon.pays,
            statut=StatutDoublon.EN_ATTENTE,
        ):
            autre.statut, autre.decide_par, autre.decide_le = (
                StatutDoublon.REFUSE, par, timezone.now())  # fmt: skip
            autre.save(update_fields=["statut", "decide_par", "decide_le"])
    return doublon


def alimenter_depuis_import(pays: Pays) -> int:
    """Verse dans la file les doublons que l'import BirdNotes a gardés sans rien fusionner
    (§14.7) : groupes signalés par BirdNotes et fiches au même nom. Une paire déjà connue (en
    file, tranchée ou gardée séparée) n'est pas recréée. Renvoie le nombre de paires créées."""
    from apps.imports.models import ReferenceExterne, Source

    groupes: dict[str, list] = {}
    for ref in ReferenceExterne.objects.filter(
        pays=pays, source=Source.BIRDNOTES, entite="prospect"
    ):
        for cle, critere in (("groupe_doublons", "groupe_birdnotes"), ("homonymes", "meme_nom")):
            if ref.complements.get(cle):
                groupes.setdefault(f"{critere}|{ref.complements[cle]}", []).append(ref.objet_id)
    connues = {
        frozenset(p)
        for p in DoublonProbable.objects.filter(pays=pays).values_list("fiche_id", "candidat_id")
    }
    creees = 0
    for cle, ids in groupes.items():
        fiches = list(
            Prospect.objects.filter(pk__in=ids, statut__in=VIVANTES).order_by("statut", "cree_le")
        )
        if len(fiches) < 2:
            continue
        # La première fiche commune sert de référence ; les autres lui sont comparées.
        candidat, autres = fiches[0], fiches[1:]
        for fiche in autres:
            if frozenset((fiche.pk, candidat.pk)) in connues:
                continue
            d = _evaluer(_valeurs(fiche), candidat)
            DoublonProbable.objects.create(
                pays=pays, fiche=fiche, candidat=candidat, score=d.score,
                criteres=[cle.split("|")[0], *d.criteres],
            )  # fmt: skip
            connues.add(frozenset((fiche.pk, candidat.pk)))
            creees += 1
    return creees

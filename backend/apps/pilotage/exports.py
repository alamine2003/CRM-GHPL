"""Exports contrôlés et audités (RPT-019, DSH-008, RG-061 ; 0.7.8).

Deux contenus, tirés du tableau de pilotage avec la même période et les mêmes filtres : les
indicateurs de chaque délégué, ou les rapports soumis de leurs visites de la période. Le
périmètre est celui du tableau (CA1) : un délégué hors périmètre n'y figure jamais. Chaque
export crée un événement d'audit avec ses filtres et son nombre de lignes (CA2).

Formats : CSV (séparateur « ; », UTF-8 avec BOM, lisible tel quel par Excel en français) et
classeur Excel (.xlsx, écrit sans dépendance). Une cellule qui commence par =, +, - ou @ est
préfixée d'une apostrophe : un tableur ne l'exécute pas comme une formule.
"""

from __future__ import annotations

import csv
import io
import zipfile
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from django.utils.translation import gettext as _

from apps.rapports.models import Rapport, StatutRapport

FORMATS = {
    "csv": ("text/csv; charset=utf-8", "csv"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
}
CONTENUS = ("indicateurs", "rapports")


def _sur(valeur):
    """Neutralise une cellule texte qui serait lue comme une formule."""
    if isinstance(valeur, str) and valeur[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + valeur
    return valeur


def _pourcent(taux):
    return "" if taux is None else round(taux * 100)


def _heure(pays, moment) -> str:
    """Un instant à l'heure du pays, lisible et triable : « 2026-09-21 09:55 »."""
    return moment.astimezone(ZoneInfo(pays.fuseau)).strftime("%Y-%m-%d %H:%M") if moment else ""


def _nom(utilisateur) -> str:
    return f"{utilisateur.first_name} {utilisateur.last_name}".strip()


def indicateurs(donnees: dict) -> tuple[list[str], list[list]]:
    """Une ligne par délégué du tableau, dans l'ordre alphabétique du tableau (DC-49)."""
    entetes = [
        _("Délégué"), _("Poste"), _("Visites prévues échues"), _("Visites faites"),
        _("Dont imprévues"), _("Réalisation (%)"), _("Écarts"), _("Écarts justifiés (%)"),
        _("Géolocalisées (%)"), _("Rapports dans le délai (%)"), _("Couverture du cycle (%)"),
    ]  # fmt: skip
    lignes = []
    for x in donnees["delegues"]:
        p, c = x["semaine"], x["cycle"]
        lignes.append([
            _nom(x["delegue"]), x["poste"].libelle, p["visites"]["echues"],
            p["visites"]["effectuees"], p["visites"]["imprevues"],
            _pourcent(p["taux"]["realisation"]), p["visites"]["ecarts"],
            _pourcent(p["taux"]["ecarts_justifies"]), _pourcent(p["taux"]["geolocalisation"]),
            _pourcent(p["taux"]["rapports_dans_delai"]), _pourcent(c["taux"]["couverture"]),
        ])  # fmt: skip
    return entetes, lignes


def rapports(pays, donnees: dict) -> tuple[list[str], list[list]]:
    """Les rapports soumis (ou décidés) des délégués du tableau, pour les visites de la
    période ; jamais un brouillon. Le texte libre y figure : seul l'encadrement exporte."""
    entetes = [
        _("Date de la visite"), _("Délégué"), _("Prospect"), _("Établissement"), _("Statut"),
        _("Soumis le"), _("En retard"), _("Validé le"), _("Mode de validation"),
        _("Objectif prévu"), _("Résultat obtenu"), _("Produits présentés"),
        _("Prochaine action"), _("Échéance"), _("Résumé"),
    ]  # fmt: skip
    ids = [x["delegue"].pk for x in donnees["delegues"]]
    qs = (
        Rapport.objects.filter(pays=pays, delegue_id__in=ids,
                               visite__date__gte=donnees["debut"],
                               visite__date__lte=donnees["fin"])
        .exclude(statut=StatutRapport.BROUILLON)
        .select_related("delegue", "visite__prospect", "visite__etablissement",
                        "prochaine_action_type")
        .order_by("visite__date", "delegue__last_name", "delegue__first_name", "visite__heure")
    )  # fmt: skip
    oui, non = _("Oui"), _("Non")
    lignes = []
    for r in qs:
        v = r.visite
        prospect = f"{v.prospect.prenom} {v.prospect.nom}".strip() if v.prospect else ""
        action = " : ".join(x for x in (r.prochaine_action_type.libelle
                                        if r.prochaine_action_type else "",
                                        r.prochaine_action) if x)  # fmt: skip
        lignes.append([
            v.date.isoformat(), _nom(r.delegue), prospect,
            v.etablissement.nom if v.etablissement else "", r.get_statut_display(),
            _heure(pays, r.soumis_le),
            oui if r.en_retard else non,
            _heure(pays, r.valide_le),
            r.get_mode_validation_display() if r.mode_validation else "",
            r.objectif_prevu, r.resultat_obtenu,
            ", ".join(p.get("libelle", "") for p in r.presentations),
            action,
            r.prochaine_action_echeance.isoformat() if r.prochaine_action_echeance else "",
            r.resume,
        ])  # fmt: skip
    return entetes, lignes


def en_csv(entetes: list, lignes: list) -> bytes:
    tampon = io.StringIO()
    ecrivain = csv.writer(tampon, delimiter=";", lineterminator="\r\n")
    ecrivain.writerow(entetes)
    for ligne in lignes:
        ecrivain.writerow([_sur(x) for x in ligne])
    return ("﻿" + tampon.getvalue()).encode("utf-8")


def _colonne(n: int) -> str:
    lettres = ""
    n += 1
    while n:
        n, reste = divmod(n - 1, 26)
        lettres = chr(65 + reste) + lettres
    return lettres


def _cellule(ligne: int, colonne: int, valeur, style: int = 0) -> str:
    """Une cellule : nombre, ou texte en ligne ; une valeur vide n'écrit rien."""
    if valeur is None or valeur == "":
        return ""
    ref = f"{_colonne(colonne)}{ligne}"
    attribut = f' s="{style}"' if style else ""
    if isinstance(valeur, int | float) and not isinstance(valeur, bool):
        return f'<c r="{ref}"{attribut}><v>{valeur}</v></c>'
    texte = escape(str(_sur(valeur)))
    return f'<c r="{ref}" t="inlineStr"{attribut}><is><t xml:space="preserve">{texte}</t></is></c>'


_ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
_PAQUET = "http://schemas.openxmlformats.org/package/2006"
_PAQUET_MIME = "application/vnd.openxmlformats-package"
_SML = "application/vnd.openxmlformats-officedocument.spreadsheetml"
_FEUILLE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_RELATIONS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _relations(liens: list[tuple[str, str, str]]) -> str:
    corps = "".join(f'<Relationship Id="{i}" Type="{_RELATIONS}/{t}" Target="{c}"/>'
                    for i, t, c in liens)  # fmt: skip
    return f'{_ENTETE}<Relationships xmlns="{_PAQUET}/relationships">{corps}</Relationships>'


def en_xlsx(entetes: list, lignes: list, titre: str) -> bytes:
    """Un classeur d'une feuille : en-tête en gras, figé, filtre automatique."""
    rangees = [f'<row r="1">{"".join(_cellule(1, i, x, 1) for i, x in enumerate(entetes))}</row>']
    for n, ligne in enumerate(lignes, start=2):
        rangees.append(
            f'<row r="{n}">{"".join(_cellule(n, i, x) for i, x in enumerate(ligne))}</row>'
        )
    fin = f"{_colonne(len(entetes) - 1)}{len(lignes) + 1}"
    feuille = (
        f'{_ENTETE}<worksheet xmlns="{_FEUILLE}">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" '
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<sheetData>{''.join(rangees)}</sheetData>"
        f'<autoFilter ref="A1:{fin}"/></worksheet>'
    )
    fin_filtre = f"$A$1:${_colonne(len(entetes) - 1)}${len(lignes) + 1}"
    nom = escape(titre[:31])
    fichiers = {
        "[Content_Types].xml": (
            f'{_ENTETE}<Types xmlns="{_PAQUET}/content-types">'
            f'<Default Extension="rels" ContentType="{_PAQUET_MIME}.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'<Override PartName="/xl/workbook.xml" ContentType="{_SML}.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            f'ContentType="{_SML}.worksheet+xml"/>'
            f'<Override PartName="/xl/styles.xml" ContentType="{_SML}.styles+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": _relations([("rId1", "officeDocument", "xl/workbook.xml")]),
        "xl/workbook.xml": (
            f'{_ENTETE}<workbook xmlns="{_FEUILLE}" xmlns:r="{_RELATIONS}">'
            f'<sheets><sheet name="{nom}" sheetId="1" r:id="rId1"/></sheets>'
            '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" '
            f"hidden=\"1\">'{nom}'!{fin_filtre}</definedName></definedNames></workbook>"
        ),
        "xl/_rels/workbook.xml.rels": _relations(
            [
                ("rId1", "worksheet", "worksheets/sheet1.xml"),
                ("rId2", "styles", "styles.xml"),
            ]
        ),  # fmt: skip
        "xl/styles.xml": (
            f'{_ENTETE}<styleSheet xmlns="{_FEUILLE}">'
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
            '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill>'
            '<fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border/></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
            '</cellStyleXfs><cellXfs count="2">'
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/>'
            "</cellStyles></styleSheet>"
        ),
        "xl/worksheets/sheet1.xml": feuille,
    }
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as archive:
        for nom, contenu in fichiers.items():
            archive.writestr(nom, contenu)
    return tampon.getvalue()

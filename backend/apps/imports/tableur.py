"""Lecture minimale d'un classeur Excel (.xlsx) : valeurs des cellules, feuille par feuille.

Le format est un ZIP de fichiers XML (Office Open XML). Seules les valeurs comptent ici :
chaînes partagées, chaînes en ligne, nombres et booléens. Aucune formule n'est évaluée (la
valeur mise en cache par Excel est lue). Le fichier vient d'un téléversement : `defusedxml`
refuse les entités XML dangereuses (expansion, entités externes).
"""

import io
import re
import zipfile
from xml.etree.ElementTree import ParseError

from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


class ClasseurIllisible(ValueError):
    pass


def _texte(element) -> str:
    return "".join(t.text or "" for t in element.iter(f"{{{NS['m']}}}t"))


def _colonne(reference: str) -> int:
    lettres = re.match(r"[A-Z]+", reference).group()
    n = 0
    for lettre in lettres:
        n = n * 26 + ord(lettre) - 64
    return n - 1


def lire_classeur(contenu: bytes) -> dict[str, list[list[str]]]:
    """{nom de feuille: lignes de valeurs textuelles}, dans l'ordre du classeur."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(contenu))
        classeur = ET.fromstring(archive.read("xl/workbook.xml"))
        liens = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    except (zipfile.BadZipFile, KeyError, ParseError, DefusedXmlException) as erreur:
        raise ClasseurIllisible(str(erreur)) from erreur
    cibles = {lien.get("Id"): lien.get("Target") for lien in liens}
    partagees = []
    if "xl/sharedStrings.xml" in archive.namelist():
        partagees = [_texte(si) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
    feuilles = {}
    for feuille in classeur.find("m:sheets", NS):
        cible = cibles.get(feuille.get(REL), "")
        chemin = cible.lstrip("/") if cible.startswith("/") else f"xl/{cible}"
        try:
            donnees = ET.fromstring(archive.read(chemin)).find("m:sheetData", NS)
        except (KeyError, ParseError, DefusedXmlException) as erreur:
            raise ClasseurIllisible(str(erreur)) from erreur
        lignes = []
        for ligne in donnees if donnees is not None else []:
            valeurs: list[str] = []
            for cellule in ligne:
                indice = _colonne(cellule.get("r")) if cellule.get("r") else len(valeurs)
                type_ = cellule.get("t")
                if type_ == "inlineStr":
                    valeur = _texte(cellule)
                else:
                    v = cellule.find("m:v", NS)
                    valeur = "" if v is None or v.text is None else v.text
                    if type_ == "s" and valeur:
                        valeur = partagees[int(valeur)]
                    elif type_ is None and re.fullmatch(r"-?\d+\.0", valeur):
                        valeur = valeur[:-2]  # « 1.0 » saisi comme 1
                valeurs.extend([""] * (indice - len(valeurs)))
                valeurs.append(valeur.strip())
            lignes.append(valeurs)
        feuilles[feuille.get("name")] = lignes
    return feuilles

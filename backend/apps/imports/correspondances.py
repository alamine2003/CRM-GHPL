"""Correspondances entre les libellés du CRM en place (BirdNotes) et les codes d'INNOV CRM.

Le nettoyage se fait ici, une fois pour toutes : doublons (INFIRMIER et INFIRMIERE),
variantes (SAGE FEMME D'ETAT), coquilles (NECHIRURGIEN UROLOGUE). Ces tables ne contiennent
que des libellés génériques de la profession, jamais de donnée de l'export (CLAUDE.md).
Un libellé absent des tables est signalé dans le rapport d'import, jamais deviné.
"""

import re
import unicodedata


def cle(texte: str | None) -> str:
    """« Sage femme d'État » → « SAGE FEMME D ETAT » : comparaison sans accents ni casse."""
    texte = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", " ", texte.upper()).strip()


#: Spécialité BirdNotes → code de spécialité (catalogue du référentiel).
SPECIALITES = {
    cle(libelle): code
    for code, libelles in {
        "medecine_generale": ["MEDECIN GENERALISTE"],
        "medecine_interne": ["INTERNISTE"],
        "cardiologie": ["CARDIOLOGUE"],
        "cardiologie_pediatrique": ["CARDIOLOGUE-PEDIATRE"],
        "endocrinologie": ["ENDOCRINOLOGUE"],
        "diabetologie": ["DIABETOLOGUE"],
        "gynecologie": ["GYNECOLOGUE", "GYNECOLOGUE-OBSTETRICIEN"],
        "pediatrie": ["PEDIATRE"],
        "dermatologie": ["DERMATOLOGUE"],
        "gastro_enterologie": ["GASTRO-ENTEROLOGUE", "GASTROLOGUE"],
        "pneumologie": ["PNEUMOLOGUE"],
        "rhumatologie": ["RHUMATOLOGUE"],
        "neurologie": ["NEUROLOGUE"],
        "nephrologie": ["NEPHROLOGUE"],
        "hematologie": ["HEMATOLOGUE"],
        "infectiologie": ["INFECTIOLOGUE"],
        "oncologie": ["ONCOLOGUE", "CANCEROLOGUES"],
        "orl": ["ORL"],
        "ophtalmologie": ["OPHTALMOLOGUE"],
        "urologie": ["UROLOGUE", "CHIRURGIEN UROLOGUE", "NECHIRURGIEN UROLOGUE"],
        "psychiatrie": ["PSYCHIATRE"],
        "pedopsychiatrie": ["PEDOPSYCHIATRE"],
        "geriatrie": ["GERIATRE"],
        "anesthesie_reanimation": ["ANESTHESISTE-REANIMATEUR"],
        "urgences": ["URGENTISTE"],
        "medecine_travail": ["MEDECIN DU TRAVAIL"],
        "medecine_sport": ["MEDECIN DU SPORT"],
        "chirurgie_generale": ["CHIRURGIEN", "CHIRURGIEN GENERALE"],
        "chirurgie_digestive": ["CHIRURGIEN DIGESTIVE"],
        "chirurgie_cardio_vasculaire": ["CHIRURGIEN CARDIO-VASCULAIRE"],
        "chirurgie_orthopedique": ["CHIRURGIEN ORTHOPEDISTE"],
        "chirurgie_pediatrique": ["CHIRURGIEN PEDIATRIQUE"],
        "chirurgie_maxillo_faciale": ["CHIRURGIEN MAXILLO-FACIALE"],
        "neurochirurgie": ["NEUROCHIRURGIEN"],
        "chirurgie_dentaire": ["CHIRURGIEN DENTISTE", "DENTISTE"],
        "interne": ["INTERNE"],
        "sage_femme": ["SAGE-FEMME", "SAGE FEMME D'ETAT"],
        "infirmier": ["INFIRMIER", "INFIRMIERE", "INFIRMIER-PEDIATRE"],
        "aide_infirmier": ["AIDE INFIRMIERE"],
        "technicien_superieur": ["TECHNICIEN SUPERIEUR", "TSO", "TSO(BLOC)"],
        "kinesitherapie": ["KINESITHERAPEUTE"],
        "orthophonie": ["ORTHOPHONISTE"],
        "officine": ["PHARMACIE", "OFFICINE"],
        "parapharmacie": ["PARAPHARMACIE"],
    }.items()
    for libelle in libelles
}

#: Type BirdNotes → type de prospect, quand la spécialité ne le donne pas. Le type saisi est
#: peu fiable (des sages-femmes classées « Médecin ») : la spécialité l'emporte toujours.
TYPES_PROSPECT = {
    cle("Médecin"): "medecin",
    cle("Paramédical"): "paramedical",
    cle("Commercial"): "pharmacie",
    cle("PHARMACIE"): "pharmacie",
    cle("OFFICINE"): "pharmacie",
    cle("PARAPHARMACIE"): "pharmacie",
}

#: Grade BirdNotes → code de grade ; « Paramédical » ou « Pharmacien » ne sont pas des grades.
GRADES = {
    cle("Docteur"): "docteur",
    cle("Professeur"): "professeur",
    cle("Professeur agrégé"): "professeur_agrege",
    cle("Chef service"): "chef_service",
    cle("Assistant"): "assistant",
    cle("Résident"): "resident",
}

#: Potentiels hors A/B/C relevés dans l'export, ramenés au plus proche et signalés.
POTENTIELS = {"A": "A", "B": "B", "C": "C", "BB": "B", "D": "C", "X": "C"}

#: Début du nom d'un établissement → type (« P/S Keur Massar » → poste de santé).
PREFIXES_ETABLISSEMENT = [
    (("POSTE", "PS", "P S", "P SANTE", "POSTE SANTE"), "poste_sante"),
    (("CENTRE DE SANTE", "CS", "C S", "CDS", "CENTRE"), "centre_sante"),
    (("PHARMACIE", "PH", "PHCIE"), "pharmacie"),
    (("CABINET",), "cabinet"),
    (("CLINIQUE", "POLYCLINIQUE"), "clinique"),
    (("HOPITAL", "CHU", "CHR", "EPS"), "hopital"),
]


#: Titres saisis dans le nom ou à la place du prénom → civilité (2 415 fiches ont « DR » en
#: guise de prénom). Le titre sort du nom ; prénom et nom collés restent à séparer à la main.
TITRES = {
    "DR": "dr", "DOCTEUR": "dr", "PR": "pr", "PROFESSEUR": "pr",
    "MME": "mme", "MLLE": "mme", "MADAME": "mme", "M": "m", "MR": "m", "MONSIEUR": "m",
}  # fmt: skip


def extraire_titre(prenom: str | None, nom: str | None) -> tuple[str, str, str, bool]:
    """(civilité, prénom, nom, à séparer) : « DR » / « MOUSSA DIOP » → (« dr », « », « MOUSSA
    DIOP », vrai). Un titre en tête du nom ou du prénom est retiré de la même façon."""
    civilite = ""
    prenom, nom = (prenom or "").strip(), (nom or "").strip()
    if cle(prenom) in TITRES:
        civilite, prenom = TITRES[cle(prenom)], ""
    for attribut in ("prenom", "nom"):
        texte = prenom if attribut == "prenom" else nom
        mots = texte.split()
        if len(mots) > 1 and cle(mots[0]) in TITRES:
            civilite = civilite or TITRES[cle(mots[0])]
            texte = " ".join(mots[1:])
        prenom, nom = (texte, nom) if attribut == "prenom" else (prenom, texte)
    a_separer = civilite != "" and not prenom and len(nom.split()) > 1
    return civilite, prenom, nom, a_separer


#: Localités de BirdNotes qui n'en sont pas (« INTERMEDIARE 1 », 1 338 fiches) : non reprises.
LOCALITES_FICTIVES = re.compile(r"^INTERMEDIAI?RE( \d+)?$")


def type_etablissement(nom: str) -> str:
    """Type déduit du nom ; « autre » quand rien ne correspond (signalé dans le rapport)."""
    texte = cle(nom)
    for prefixes, code in PREFIXES_ETABLISSEMENT:
        for prefixe in prefixes:
            if texte == prefixe or texte.startswith(prefixe + " "):
                return code
    return "autre"


def specialite(libelle: str | None) -> str | None:
    return SPECIALITES.get(cle(libelle))

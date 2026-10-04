"""Valeurs proposées à l'ouverture d'un pays (PRP-001) ; l'administrateur pays les ajuste.

Décision du 4 octobre 2026 : ces listes suivent la pratique réelle du Sénégal, relevée
dans l'export du CRM en place (BirdNotes), nettoyée de ses doublons. Le fichier lui-même
n'est jamais versionné (CLAUDE.md : aucune donnée réelle dans le dépôt) ; seuls des
libellés génériques de la profession figurent ici.

- Types de prospect : médecin, paramédical, pharmacie (prd.md §14.1, révisé). Sage-femme
  et infirmier sont des spécialités paramédicales, comme sur le terrain.
- Spécialités rattachées à leur type ; grades (docteur, professeur…).
- Types d'établissement : prd.md §14.2, plus le poste de santé, premier type relevé.
- Motifs d'écart : proposition [H], à confirmer par pays (dépendance prd.md §22).
- Classes thérapeutiques et produits : référentiel du laboratoire (import ou saisie).

Chaque entrée : (code, libellé français, libellé anglais[, code du parent]).
"""

TYPES_PROSPECT = [
    ("medecin", "Médecin", "Doctor"),
    ("paramedical", "Paramédical", "Allied health"),
    ("pharmacie", "Pharmacie", "Pharmacy"),
    ("autre", "Autre", "Other"),
]

TYPES_ETABLISSEMENT = [
    ("cabinet", "Cabinet", "Private practice"),
    ("hopital", "Hôpital", "Hospital"),
    ("clinique", "Clinique", "Clinic"),
    ("centre_sante", "Centre de santé", "Health centre"),
    ("poste_sante", "Poste de santé", "Health post"),
    ("pharmacie", "Pharmacie", "Pharmacy"),
    ("grossiste", "Grossiste", "Wholesaler"),
    ("autre", "Autre", "Other"),
]

_M, _P, _O = "medecin", "paramedical", "pharmacie"

SPECIALITES = [
    # Médecins
    ("medecine_generale", "Médecine générale", "General practice", _M),
    ("medecine_interne", "Médecine interne", "Internal medicine", _M),
    ("cardiologie", "Cardiologie", "Cardiology", _M),
    ("cardiologie_pediatrique", "Cardiologie pédiatrique", "Paediatric cardiology", _M),
    ("endocrinologie", "Endocrinologie", "Endocrinology", _M),
    ("diabetologie", "Diabétologie", "Diabetology", _M),
    ("gynecologie", "Gynécologie-obstétrique", "Obstetrics and gynaecology", _M),
    ("pediatrie", "Pédiatrie", "Paediatrics", _M),
    ("dermatologie", "Dermatologie", "Dermatology", _M),
    ("gastro_enterologie", "Gastro-entérologie", "Gastroenterology", _M),
    ("pneumologie", "Pneumologie", "Pulmonology", _M),
    ("rhumatologie", "Rhumatologie", "Rheumatology", _M),
    ("neurologie", "Neurologie", "Neurology", _M),
    ("nephrologie", "Néphrologie", "Nephrology", _M),
    ("hematologie", "Hématologie", "Haematology", _M),
    ("infectiologie", "Infectiologie", "Infectious diseases", _M),
    ("oncologie", "Oncologie", "Oncology", _M),
    ("orl", "ORL", "ENT", _M),
    ("ophtalmologie", "Ophtalmologie", "Ophthalmology", _M),
    ("urologie", "Urologie", "Urology", _M),
    ("psychiatrie", "Psychiatrie", "Psychiatry", _M),
    ("pedopsychiatrie", "Pédopsychiatrie", "Child psychiatry", _M),
    ("geriatrie", "Gériatrie", "Geriatrics", _M),
    ("anesthesie_reanimation", "Anesthésie-réanimation", "Anaesthesiology", _M),
    ("urgences", "Médecine d'urgence", "Emergency medicine", _M),
    ("medecine_travail", "Médecine du travail", "Occupational medicine", _M),
    ("medecine_sport", "Médecine du sport", "Sports medicine", _M),
    ("chirurgie_generale", "Chirurgie générale", "General surgery", _M),
    ("chirurgie_digestive", "Chirurgie digestive", "Digestive surgery", _M),
    ("chirurgie_cardio_vasculaire", "Chirurgie cardio-vasculaire", "Cardiovascular surgery", _M),
    ("chirurgie_orthopedique", "Chirurgie orthopédique", "Orthopaedic surgery", _M),
    ("chirurgie_pediatrique", "Chirurgie pédiatrique", "Paediatric surgery", _M),
    ("chirurgie_maxillo_faciale", "Chirurgie maxillo-faciale", "Maxillofacial surgery", _M),
    ("neurochirurgie", "Neurochirurgie", "Neurosurgery", _M),
    ("chirurgie_dentaire", "Chirurgie dentaire", "Dentistry", _M),
    ("interne", "Interne en médecine", "Medical intern", _M),
    # Paramédicaux
    ("sage_femme", "Sage-femme", "Midwife", _P),
    ("infirmier", "Infirmier", "Nurse", _P),
    ("aide_infirmier", "Aide-infirmier", "Nursing assistant", _P),
    ("technicien_superieur", "Technicien supérieur de santé", "Senior health technician", _P),
    ("kinesitherapie", "Kinésithérapie", "Physiotherapy", _P),
    ("orthophonie", "Orthophonie", "Speech therapy", _P),
    # Pharmacie
    ("officine", "Officine", "Retail pharmacy", _O),
    ("parapharmacie", "Parapharmacie", "Parapharmacy", _O),
]

GRADES = [
    ("docteur", "Docteur", "Doctor"),
    ("professeur", "Professeur", "Professor"),
    ("professeur_agrege", "Professeur agrégé", "Associate professor"),
    ("chef_service", "Chef de service", "Head of department"),
    ("assistant", "Assistant", "Assistant"),
    ("resident", "Résident", "Resident"),
]

MOTIFS_ECART = [
    ("prospect_absent", "Prospect absent", "Prospect absent"),
    ("cabinet_ferme", "Cabinet fermé", "Practice closed"),
    ("rendez_vous_reporte", "Rendez-vous reporté", "Appointment postponed"),
    ("urgence", "Urgence du prospect", "Prospect emergency"),
    ("greve", "Grève", "Strike"),
    ("intemperies", "Intempéries", "Bad weather"),
    ("transport", "Problème de transport", "Transport problem"),
    ("autre", "Autre motif", "Other reason"),
]

#: Listes initiales, dans l'ordre de création (un parent avant ses enfants).
INITIALES = {
    "type_prospect": TYPES_PROSPECT,
    "type_etablissement": TYPES_ETABLISSEMENT,
    "specialite": SPECIALITES,
    "grade": GRADES,
    "motif_ecart": MOTIFS_ECART,
}


def synchroniser(Valeur, pays, *, journal=None) -> None:  # noqa: N803 (modèle passé en argument)
    """Aligne les listes d'un pays sur ce catalogue : ajoute ce qui manque, met à jour le
    libellé et le parent des valeurs par défaut, archive les anciennes valeurs par défaut
    (une valeur archivée reste lisible là où elle a servi, PRP-001 CA2). Une valeur ajoutée
    par le pays n'est jamais touchée.

    Utilisable depuis une migration (modèle historique) : `journal(valeur, creation)` écrit
    le journal des changements quand l'appelant le demande.
    """
    from django.utils import timezone

    anglais = pays.langue == "en"
    parents = {}
    for liste, entrees in INITIALES.items():
        for ordre, (code, fr, en, *parent) in enumerate(entrees, start=1):
            libelle = en if anglais else fr
            valeur = Valeur.objects.filter(pays=pays, liste=liste, code=code).first()
            creation = valeur is None
            if creation:
                valeur = Valeur(pays=pays, liste=liste, code=code)
            valeur.libelle, valeur.ordre = libelle, ordre
            valeur.parent = parents.get(parent[0]) if parent else None
            valeur.archive_le = None
            valeur.save()
            if journal:
                journal(valeur, creation)
            if liste == "type_prospect":
                parents[code] = valeur
    connus = {(liste, e[0]) for liste, entrees in INITIALES.items() for e in entrees}
    for liste, codes in ANCIENS_CODES.items():
        for code in codes:
            if (liste, code) in connus:
                continue
            ancienne = Valeur.objects.filter(pays=pays, liste=liste, code=code).first()
            if ancienne and ancienne.archive_le is None:
                ancienne.archive_le = timezone.now()
                ancienne.save()
                if journal:
                    journal(ancienne, False)


#: Valeurs par défaut des versions précédentes (0.1.1 à 0.1.3), remplacées le 4 octobre 2026.
ANCIENS_CODES = {
    "type_prospect": ["pharmacien", "sage_femme", "infirmier", "chirurgien_dentiste"],
    "specialite": [],
}

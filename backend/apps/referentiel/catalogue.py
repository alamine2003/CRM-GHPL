"""Valeurs proposées à l'ouverture d'un pays (PRP-001) ; l'administrateur pays les ajuste.

Types de prospect et d'établissement : prd.md §14.1 et §14.2. Spécialités et motifs
d'écart : proposition [H], à confirmer par pays (liste des motifs : dépendance prd.md §22).
Les classes thérapeutiques et les produits viennent du référentiel du laboratoire (import
en 0.1.8 ou saisie) : aucune valeur par défaut.

Chaque entrée : (code, libellé français, libellé anglais[, code du parent]).
"""

TYPES_PROSPECT = [
    ("medecin", "Médecin", "Doctor"),
    ("pharmacien", "Pharmacien", "Pharmacist"),
    ("sage_femme", "Sage-femme", "Midwife"),
    ("infirmier", "Infirmier", "Nurse"),
    ("chirurgien_dentiste", "Chirurgien-dentiste", "Dentist"),
    ("autre", "Autre", "Other"),
]

TYPES_ETABLISSEMENT = [
    ("cabinet", "Cabinet", "Private practice"),
    ("hopital", "Hôpital", "Hospital"),
    ("clinique", "Clinique", "Clinic"),
    ("centre_sante", "Centre de santé", "Health centre"),
    ("pharmacie", "Pharmacie", "Pharmacy"),
    ("grossiste", "Grossiste", "Wholesaler"),
    ("autre", "Autre", "Other"),
]

SPECIALITES = [
    ("medecine_generale", "Médecine générale", "General practice", "medecin"),
    ("medecine_interne", "Médecine interne", "Internal medicine", "medecin"),
    ("cardiologie", "Cardiologie", "Cardiology", "medecin"),
    ("endocrinologie", "Endocrinologie-diabétologie", "Endocrinology", "medecin"),
    ("gynecologie", "Gynécologie et obstétrique", "Obstetrics and gynaecology", "medecin"),
    ("pediatrie", "Pédiatrie", "Paediatrics", "medecin"),
    ("dermatologie", "Dermatologie", "Dermatology", "medecin"),
    ("gastro_enterologie", "Gastro-entérologie", "Gastroenterology", "medecin"),
    ("pneumologie", "Pneumologie", "Pulmonology", "medecin"),
    ("rhumatologie", "Rhumatologie", "Rheumatology", "medecin"),
    ("neurologie", "Neurologie", "Neurology", "medecin"),
    ("orl", "ORL", "ENT", "medecin"),
    ("ophtalmologie", "Ophtalmologie", "Ophthalmology", "medecin"),
    ("urologie", "Urologie", "Urology", "medecin"),
    ("psychiatrie", "Psychiatrie", "Psychiatry", "medecin"),
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
    "motif_ecart": MOTIFS_ECART,
}

"""Instance de démonstration aux données fictives (DEM-001).

Les volumes reprennent la structure réelle du Sénégal relevée dans le fichier
d'organisation (prd.md §7.1) : 4 divisions, 19 réseaux, 2 zones, 48 secteurs,
24 superviseurs, 227 postes pour 207 personnes. Tous les noms sont tirés au
hasard dans des listes de prénoms et de noms courants : aucune personne réelle,
aucun téléphone, aucun courriel joignable (CA2).
"""

import random
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.apps import apps
from django.db import connection, transaction

from apps.identite.models import Role, Utilisateur
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.organisation.models import Poste, TypePoste
from apps.planning.services import creer_jour_ferie
from apps.prospects import ciblage
from apps.prospects.models import Etablissement, Prospect
from apps.prospects.propositions import proposer
from apps.prospects.services import (
    creer_etablissement,
    creer_exercice,
    creer_prospect,
    saisir_prospect,
)
from apps.referentiel import services as ref
from apps.referentiel.models import Valeur
from apps.socle.services import aujourdhui, creer_pays

PRENOMS = [
    "Aminata", "Fatou", "Awa", "Mariama", "Khady", "Ndèye", "Coumba", "Aïssatou", "Binta",
    "Rokhaya", "Astou", "Yacine", "Dieynaba", "Adama", "Kadiatou", "Oumou", "Ramatoulaye",
    "Mamadou", "Moussa", "Ibrahima", "Cheikh", "Ousmane", "Abdoulaye", "Modou", "Babacar",
    "Pape", "Lamine", "Serigne", "Alioune", "Malick", "Souleymane", "Boubacar", "Idrissa",
    "Kossi", "Komlan", "Yao", "Akossiwa", "Afi", "Edem", "Sena", "Mawuli", "Dzifa",
]  # fmt: skip
NOMS = [
    "Diop", "Ndiaye", "Fall", "Sow", "Ba", "Sy", "Mbaye", "Gueye", "Faye", "Diallo",
    "Ndour", "Sarr", "Cissé", "Kane", "Thiam", "Seck", "Diouf", "Camara", "Touré", "Niang",
    "Mendy", "Sène", "Wade", "Dieng", "Kébé", "Badji", "Lô", "Samb", "Dramé", "Tall",
    "Agbeko", "Mensah", "Adjovi", "Kouassi", "Amegah", "Dossou", "Lawson", "Akakpo",
]  # fmt: skip

DIVISIONS = [
    ("CARDIO", "Cardio-métabolique", ["Cardio Vasculaire", "Diabétologie", "Néphrologie",
                                      "Lipides", "Hypertension"]),
    ("FEMME", "Santé de la femme", ["Gynécologie", "Obstétrique", "Fertilité", "Ménopause"]),
    ("ANTI", "Anti-infectieux", ["Antibiotiques", "Antipaludiques", "Antiviraux",
                                 "Hôpital"]),
    ("GRAND", "Grand public", ["Pédiatrie", "Dermatologie", "Gastro-entérologie",
                               "Douleur", "ORL", "OTC Pharmacies"]),
]  # fmt: skip

#: Proportions des spécialités relevées sur le terrain (prd.md §14.1) : les paramédicaux et
#: les officines forment plus de la moitié des fiches, la médecine générale un huitième.
SPECIALITES_DEMO = [
    ("sage_femme", 24.5), ("infirmier", 24.4), ("officine", 14.8), ("medecine_generale", 12.7),
    ("gynecologie", 4.0), ("pediatrie", 3.5), ("medecine_interne", 2.5), ("cardiologie", 2.0),
    ("aide_infirmier", 2.0), ("technicien_superieur", 1.5), ("endocrinologie", 1.2),
    ("diabetologie", 1.0), ("dermatologie", 1.0), ("gastro_enterologie", 1.0),
    ("pneumologie", 0.8), ("rhumatologie", 0.6), ("orl", 0.6), ("chirurgie_dentiste", 0),
    ("kinesitherapie", 0.5), ("parapharmacie", 0.3),
]  # fmt: skip

QUARTIERS = ["Centre", "Nord", "Sud", "Est", "Ouest", "Marché", "Gare", "Extension"]

ZONES = {
    "Dakar": [
        "Plateau", "Médina", "Fann", "Mermoz", "Ouakam", "Ngor", "Yoff", "Parcelles Assainies",
        "Grand Dakar", "HLM", "Liberté", "Sicap", "Point E", "Almadies", "Grand Yoff",
        "Pikine Nord", "Pikine Sud", "Guédiawaye", "Thiaroye", "Keur Massar", "Rufisque",
        "Bargny", "Diamniadio", "Sébikotane",
    ],
    "Régions": [
        "Thiès Ville", "Thiès Est", "Mbour", "Saly", "Tivaouane", "Kaolack", "Kaffrine",
        "Fatick", "Diourbel", "Touba", "Mbacké", "Louga", "Saint-Louis", "Richard-Toll",
        "Matam", "Tambacounda", "Kédougou", "Kolda", "Sédhiou", "Ziguinchor", "Oussouye",
        "Bignona", "Linguère", "Podor",
    ],
}  # fmt: skip

# Répartition des types de poste (ordre de grandeur de la phase test).
TYPES = [(TypePoste.VM, 0.7), (TypePoste.VM_OTC, 0.12), (TypePoste.KAM, 0.1),
         (TypePoste.DERMO, 0.08)]  # fmt: skip


ABREGES = {TypePoste.VM: "VM", TypePoste.VM_OTC: "OTC", TypePoste.KAM: "KAM",
           TypePoste.DERMO: "Dermo"}  # fmt: skip


# Classes thérapeutiques par division, et terminaisons des noms de produits fictifs.
CLASSES = {
    "CARDIO": [("Antihypertenseurs", "tens"), ("Antidiabétiques", "glyx"),
               ("Hypolipémiants", "lipra"), ("Anticoagulants", "coagine")],
    "FEMME": [("Hormones", "estra"), ("Fer et vitamines", "ferol"), ("Fertilité", "fertil")],
    "ANTI": [("Antibiotiques", "cilline"), ("Antipaludiques", "palune"),
             ("Antiviraux", "virex")],
    "GRAND": [("Antalgiques", "dolor"), ("Dermocosmétiques", "derma"),
              ("Gastro-entérologie", "gastrol"), ("ORL et toux", "tussil"),
              ("Pédiatrie", "kidia")],
}  # fmt: skip
SYLLABES = ["Va", "No", "Ze", "Ka", "Lu", "Mi", "Sa", "To", "Ri", "Be", "Do", "Fa", "Pe",
            "Xa", "Qui", "Ro", "Ti", "Me", "La", "Cy"]  # fmt: skip
DOSAGES = ["5 mg", "10 mg", "20 mg", "50 mg", "100 mg", "250 mg", "500 mg", "1 g", "sirop",
           "crème", "gel", "comprimés", "sachets"]  # fmt: skip


# Centres approximatifs des zones de démonstration, pour des coordonnées plausibles.
CENTRES = {"SN": [(14.6928, -17.4467), (14.7910, -16.9359)], "TG": [(6.1319, 1.2228)]}


@dataclass
class Volumes:
    reseaux_par_division: tuple[int, ...] = (5, 4, 4, 6)  # 19 réseaux
    secteurs_par_zone: tuple[int, ...] = (24, 24)  # 48 secteurs
    superviseurs: int = 24
    postes: int = 227
    delegues: int = 207
    dm: int = 7
    sans_superviseur: int = 3
    produits: int = 156  # dont la moitié environ sur plusieurs réseaux
    prospects: int = 1200

    def reduits(self, facteur: float) -> "Volumes":
        def r(n):
            return max(1, round(n * facteur))

        return Volumes(
            reseaux_par_division=tuple(r(n) for n in self.reseaux_par_division),
            secteurs_par_zone=tuple(r(n) for n in self.secteurs_par_zone),
            superviseurs=r(self.superviseurs),
            postes=r(self.postes),
            delegues=r(self.delegues),
            dm=r(self.dm),
            sans_superviseur=r(self.sans_superviseur),
            produits=max(12, r(self.produits)),
            prospects=max(30, r(self.prospects)),
        )


@dataclass
class Bilan:
    pays: dict[str, dict[str, int]] = field(default_factory=dict)
    comptes: dict[str, str] = field(default_factory=dict)


def _paques(annee: int) -> date:
    """Dimanche de Pâques (calendrier grégorien, algorithme de Meeus)."""
    a, b, c = annee % 19, annee // 100, annee % 100
    d, e = divmod(b, 4)
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 19 * m) // 433
    mois = (h + m - 7 * n + 90) // 25
    return date(annee, mois, (h + m - 7 * n + 33 * mois + 19) % 32)


def vider() -> None:
    """Vide toutes les tables métier et le journal d'audit (démonstration uniquement).

    L'audit est immuable (AUD-001) : ses déclencheurs ne sont suspendus que le temps de
    vider cette base fictive, par le propriétaire des tables.
    """
    tables = []
    for etiquette in (
        "socle",
        "identite",
        "organisation",
        "referentiel",
        "prospects",
        "imports",
        "planning",
        "audit",
    ):
        for modele in apps.get_app_config(etiquette).get_models(include_auto_created=True):
            tables.append(connection.ops.quote_name(modele._meta.db_table))
    with connection.cursor() as curseur:
        # Contrôles différés en attente : les exécuter avant de vider.
        curseur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        curseur.execute("ALTER TABLE audit_evenementaudit DISABLE TRIGGER audit_sans_troncature")
        curseur.execute(f"TRUNCATE {', '.join(sorted(set(tables)))} RESTART IDENTITY CASCADE")
        curseur.execute("ALTER TABLE audit_evenementaudit ENABLE TRIGGER audit_sans_troncature")
        curseur.execute("SET CONSTRAINTS ALL DEFERRED")


class Generateur:
    def __init__(self, mot_de_passe: str, graine: int = 2026):
        # Tirage reproductible de données fictives, sans usage cryptographique.
        self.alea = random.Random(graine)  # noqa: S311
        self.mot_de_passe = mot_de_passe
        self.identifiants: set[str] = set()
        self.bilan = Bilan()

    # --- Personnes ---------------------------------------------------------------------------

    def _identifiant(self, prenom: str, nom: str) -> str:
        import unicodedata

        def simple(texte):
            texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
            return "".join(c for c in texte.lower() if c.isalpha())

        base = f"{simple(prenom)}.{simple(nom)}"
        identifiant, n = base, 1
        while identifiant in self.identifiants:
            n += 1
            identifiant = f"{base}{n}"
        self.identifiants.add(identifiant)
        return identifiant

    def personne(self, pays, role: str | None, *, prenom=None, nom=None) -> Utilisateur:
        prenom = prenom or self.alea.choice(PRENOMS)
        nom = nom or self.alea.choice(NOMS)
        identifiant = self._identifiant(prenom, nom)
        compte = creer_utilisateur(
            identifiant,
            prenom=prenom,
            nom=nom,
            pays=pays,
            # Domaine réservé (RFC 2606) : aucun courriel ne peut partir vers une vraie boîte.
            courriel=f"{identifiant}@demo.invalid",
        )
        compte.set_password(self.mot_de_passe)
        compte.save()
        if role:
            attribuer_role(compte, role, pays, par=None)
        return compte

    def premier(self, cle: str, compte: Utilisateur) -> Utilisateur:
        """Retient un compte par rôle pour l'afficher en fin de génération."""
        self.bilan.comptes.setdefault(cle, compte.username)
        return compte

    # --- Pays ----------------------------------------------------------------------------------

    def pays(self, code: str, volumes: Volumes) -> None:
        a = self.alea
        pays = creer_pays(code)
        debut = aujourdhui(pays) - timedelta(days=60)
        self.premier(f"responsable_pays ({code})", self.personne(pays, Role.RESPONSABLE_PAYS))
        self.premier(f"admin_pays ({code})", self.personne(pays, Role.ADMIN_PAYS))

        reseaux_par_division = []
        for (code_div, libelle, noms), nombre in zip(
            DIVISIONS, volumes.reseaux_par_division, strict=True
        ):
            division = org.creer_division(pays, code_div, libelle)
            reseaux = [
                org.creer_reseau(pays, division, f"{code_div[:3]}{i + 1}", noms[i % len(noms)]
                                 + ("" if i < len(noms) else f" {i // len(noms) + 1}"))
                for i in range(nombre)
            ]  # fmt: skip
            reseaux_par_division.append(reseaux)
            df = self.premier(f"df ({code})", self.personne(pays, Role.DF))
            for reseau in reseaux:
                org.ajouter_reseau_au_perimetre(df, reseau, debut)
        tous_reseaux = [r for groupe in reseaux_par_division for r in groupe]

        # DM : les réseaux sont répartis entre eux.
        dms = [self.personne(pays, Role.DM) for _ in range(volumes.dm)]
        self.premier(f"dm ({code})", dms[0])
        for i, reseau in enumerate(tous_reseaux):
            org.ajouter_reseau_au_perimetre(dms[i % len(dms)], reseau, debut)

        secteurs_par_zone = []
        for (zone_libelle, noms), nombre in zip(
            ZONES.items(), volumes.secteurs_par_zone, strict=True
        ):
            zone = org.creer_zone(pays, zone_libelle)
            secteurs_par_zone.append(
                [org.creer_secteur(pays, zone, noms[i % len(noms)]
                                   + ("" if i < len(noms) else f" {i // len(noms) + 1}"))
                 for i in range(nombre)]
            )  # fmt: skip

        produits_crees = self.produits(pays, reseaux_par_division, volumes.produits)

        superviseurs = [self.personne(pays, Role.SUPERVISEUR) for _ in range(volumes.superviseurs)]
        self.premier(f"superviseur ({code})", superviseurs[0])
        delegues = [self.personne(pays, Role.DELEGUE) for _ in range(volumes.delegues)]
        self.premier(f"delegue ({code})", delegues[0])

        types = [t for t, _ in TYPES]
        poids = [p for _, p in TYPES]
        postes = []
        for i in range(volumes.postes):
            type_poste = a.choices(types, poids)[0]
            division = a.randrange(len(reseaux_par_division))
            reseaux = a.sample(
                reseaux_par_division[division], k=min(len(reseaux_par_division[division]),
                                                      a.choice([1, 1, 2]))
            )  # fmt: skip
            zone = secteurs_par_zone[i % len(secteurs_par_zone)]
            secteurs = a.sample(zone, k=min(len(zone), a.choice([1, 2, 2, 3])))
            libelle = f"{ABREGES[type_poste]} {secteurs[0].libelle} {reseaux[0].libelle} {i + 1}"
            postes.append(org.creer_poste(pays, type_poste, libelle, reseaux, secteurs))

        # Les premiers postes sont occupés, les autres restent vacants (227 postes, 207 personnes).
        for poste, delegue in zip(postes, delegues, strict=False):
            org.occuper(poste, delegue, debut - timedelta(days=a.randrange(0, 400)))
        rattaches = postes[: len(postes) - volumes.sans_superviseur]
        for i, poste in enumerate(rattaches):
            org.rattacher(poste, superviseurs[i % len(superviseurs)], debut)

        localites = self.localites(secteurs_par_zone)
        self.bilan.pays[code] = {
            "divisions": len(reseaux_par_division),
            "reseaux": len(tous_reseaux),
            "secteurs": sum(len(z) for z in secteurs_par_zone),
            "superviseurs": len(superviseurs),
            "postes": len(postes),
            "delegues": len(delegues),
            "produits": produits_crees,
            "etablissements": self.etablissements(pays, secteurs_par_zone, localites, delegues[0]),
            "prospects": self.prospects(pays, volumes.prospects, localites, delegues[0]),
        }
        self.bilan.pays[code]["exercices"] = self.exercices(pays)
        self.bilan.pays[code]["cibles"] = self.cibles(pays)
        self.bilan.pays[code].update(self.a_trancher(pays, delegues[0]))
        self.bilan.pays[code]["jours_feries"] = self.jours_feries(pays)

    def exercices(self, pays) -> int:
        """Lieux d'exercice fictifs (PRP-004) : chaque prospect exerce dans un établissement de
        son secteur adapté à son métier (l'officine en pharmacie, la sage-femme en poste ou
        centre de santé…), un sur quatre dans un second, depuis une date passée."""
        a = self.alea
        lieux_par_metier = {
            "pharmacie": ("pharmacie",),
            "paramedical": ("poste_sante", "centre_sante", "hopital"),
            "medecin": ("cabinet", "clinique", "hopital", "centre_sante"),
        }
        etablissements = defaultdict(list)
        for e in Etablissement.objects.filter(pays=pays).select_related("type"):
            etablissements[(e.secteur_id, e.type.code)].append(e)
        jour, nombre = aujourdhui(pays), 0
        prospects = Prospect.objects.filter(pays=pays).select_related("type", "localite")
        for prospect in prospects:
            secteur = prospect.localite.secteur_id if prospect.localite else None
            types = lieux_par_metier.get(prospect.type.code, ("cabinet",))
            possibles = [e for t in types for e in etablissements[(secteur, t)]]
            if not possibles:
                continue
            for etablissement in a.sample(
                possibles, k=min(len(possibles), a.choices([1, 2], [3, 1])[0])
            ):
                creer_exercice(
                    prospect,
                    etablissement,
                    prospect.cree_par,
                    debut=jour - timedelta(days=a.randrange(30, 900)),
                )
                nombre += 1
        return nombre

    def cibles(self, pays) -> int:
        """Listes cibles fictives (PRP-011) : chaque poste occupé cible les prospects de ses
        secteurs, potentiel A d'abord, jusqu'à 60 ; fréquences par défaut selon le potentiel,
        quelques-unes relevées. Les postes vacants restent sans liste."""
        a = self.alea
        admin = Utilisateur.objects.filter(roles__role=Role.ADMIN_PAYS, roles__pays=pays).first()
        nombre = 0
        occupes = Poste.objects.filter(pays=pays, occupations__isnull=False).distinct()
        for poste in occupes.order_by("libelle"):
            prospects = list(ciblage.candidats(poste).order_by("potentiel", "nom")[:60])
            for cible in ciblage.ajouter(poste, prospects, admin)["creees"]:
                if cible.prospect.potentiel == "A" and a.random() < 0.3:
                    ciblage.modifier_frequence(cible, cible.frequence + 1)
                nombre += 1
        return nombre

    def jours_feries(self, pays) -> int:
        """Calendrier de l'année en cours et de la suivante (ORG-012) : seulement les fêtes à
        date certaine (fixes, ou calculées depuis Pâques). Les fêtes à date variable (Korité,
        Tabaski…) restent à saisir par l'administrateur pays quand leur date est annoncée."""
        annee = aujourdhui(pays).year
        independance = {"SN": (4, 4), "TG": (4, 27)}.get(pays.code)
        nombre = 0
        for a in (annee, annee + 1):
            paques = _paques(a)
            jours = [
                (date(a, 1, 1), "Jour de l'an"),
                (date(a, 5, 1), "Fête du travail"),
                (date(a, 8, 15), "Assomption"),
                (date(a, 11, 1), "Toussaint"),
                (date(a, 12, 25), "Noël"),
                (paques + timedelta(days=1), "Lundi de Pâques"),
                (paques + timedelta(days=39), "Ascension"),
                (paques + timedelta(days=50), "Lundi de Pentecôte"),
            ]
            if independance:
                jours.append((date(a, *independance), "Fête de l'indépendance"))
            for jour, libelle in jours:
                creer_jour_ferie(pays, date=jour, libelle=libelle)
                nombre += 1
        return nombre

    def a_trancher(self, pays, delegue) -> dict[str, int]:
        """De quoi montrer la file des doublons (PRP-009) et les propositions (PRP-014) : un
        délégué ressaisit quelques fiches existantes avec une faute de frappe, que le détecteur
        verse dans la file (PRP-008), et propose un courriel fictif pour une fiche commune."""
        a = self.alea
        modeles = list(
            Prospect.objects.filter(pays=pays, statut="actif", type__code="medecin")
            .exclude(prenom="")
            .order_by("nom", "prenom")[:200]
        )
        en_file = 0
        for modele in a.sample(modeles, k=min(4, len(modeles))):
            coupe = a.randrange(1, len(modele.nom))
            _fiche, decision = saisir_prospect(
                pays, delegue, actif=False, civilite=modele.civilite,
                nom=modele.nom[:coupe] + modele.nom[coupe + 1 :], prenom=modele.prenom,
                type=modele.type, specialite=modele.specialite, potentiel=modele.potentiel,
            )  # fmt: skip
            en_file += decision.niveau == "probable"
        propositions = 0
        if modeles:
            proposer(delegue, a.choice(modeles), {"courriel": "cabinet@demo.invalid"},
                     commentaire="Courriel donné lors de la visite.")  # fmt: skip
            propositions = 1
        return {"doublons": en_file, "propositions": propositions}

    def localites(self, secteurs_par_zone) -> dict:
        """Deux à quatre localités fictives par secteur (« Centre », « Nord »…) : le terrain
        découpe chaque secteur en quartiers ou villages (prd.md §14.1)."""
        a = self.alea
        par_secteur = {}
        for secteurs in secteurs_par_zone:
            for secteur in secteurs:
                parties = a.sample(QUARTIERS, k=a.randint(2, 4))
                par_secteur[secteur.pk] = [
                    org.creer_localite(secteur, f"{secteur.libelle} {partie}") for partie in parties
                ]
        return par_secteur

    def etablissements(self, pays, secteurs_par_zone, localites, delegue) -> int:
        """Établissements fictifs (PRP-003), répartis comme sur le terrain : postes et centres
        de santé, cabinets, pharmacies, une clinique de temps en temps ; un hôpital par zone.
        Coordonnées tirées autour d'un point de la zone, une fois sur cinq absentes pour montrer
        le signalement « sans GPS »."""
        a = self.alea
        types = {v.code: v for v in Valeur.objects.filter(pays=pays, liste="type_etablissement")}
        admin = Utilisateur.objects.filter(roles__role=Role.ADMIN_PAYS, roles__pays=pays).first()
        centres = CENTRES.get(pays.code, CENTRES["SN"])
        nombre = 0
        for z, secteurs in enumerate(secteurs_par_zone):
            lat0, lon0 = centres[z % len(centres)]
            secteur_hopital = secteurs[0]
            plan = [("hopital", f"Hôpital régional {secteur_hopital.libelle}", secteur_hopital)]
            for secteur in secteurs:
                plan += [("poste_sante", f"Poste de santé {a.choice(NOMS)}", secteur)
                         for _ in range(a.randint(1, 3))]  # fmt: skip
                plan += [("cabinet", f"Cabinet médical {a.choice(NOMS)}", secteur)
                         for _ in range(a.randint(0, 2))]  # fmt: skip
                plan += [("pharmacie", f"Pharmacie {secteur.libelle}", secteur)]
                if a.random() < 0.5:
                    plan.append(("centre_sante", f"Centre de santé {secteur.libelle}", secteur))
                if a.random() < 0.3:
                    plan.append(("clinique", f"Clinique {a.choice(NOMS)}", secteur))
            for code, nom, secteur in plan:
                gps = a.random() > 0.2
                a_valider = nombre < 3
                public = code in ("hopital", "centre_sante", "poste_sante")
                creer_etablissement(
                    pays, delegue if a_valider else admin, actif=not a_valider, nom=nom,
                    type=types[code], secteur=secteur,
                    localite=a.choice(localites[secteur.pk]),
                    activite="hospitalier" if public else "prive",
                    latitude=round(lat0 + a.uniform(-0.25, 0.25), 6) if gps else None,
                    longitude=round(lon0 + a.uniform(-0.25, 0.25), 6) if gps else None,
                )  # fmt: skip
                nombre += 1
        return nombre

    def prospects(self, pays, nombre: int, localites, delegue) -> int:
        """Fiches fictives (DEM-001 CA2) : noms tirés des listes, aucun téléphone ni courriel ;
        quelques fiches créées par un délégué attendent leur validation (PRP-006).

        Spécialités, potentiels, activité et grades suivent les proportions relevées sur le
        terrain au Sénégal (agrégats seulement, voir SPECIALITES_DEMO)."""
        a = self.alea
        valeurs = {(v.liste, v.code): v for v in Valeur.objects.filter(pays=pays)}
        admin = Utilisateur.objects.filter(roles__role=Role.ADMIN_PAYS, roles__pays=pays).first()
        toutes = [loc for liste in localites.values() for loc in liste]
        codes, poids = zip(*SPECIALITES_DEMO, strict=True)
        for i in range(nombre):
            specialite = valeurs[("specialite", a.choices(codes, poids)[0])]
            type_ = specialite.parent
            medecin = type_.code == "medecin"
            grade = None
            if medecin:
                code_grade = a.choices(["docteur", "professeur", "professeur_agrege", ""],
                                       [0.75, 0.04, 0.03, 0.18])[0]  # fmt: skip
                grade = valeurs.get(("grade", code_grade))
            a_valider = i < 6
            creer_prospect(
                pays, delegue if a_valider else admin, actif=not a_valider,
                civilite=("pr" if grade and grade.code.startswith("professeur")
                          else "dr" if medecin else ""),
                nom=a.choice(NOMS), prenom=a.choice(PRENOMS), type=type_,
                specialite=specialite, grade=grade,
                potentiel=a.choices("ABC", [0.42, 0.46, 0.12])[0],
                activite=a.choices(["prive", "hospitalier"], [0.71, 0.29])[0],
                localite=a.choice(toutes),
                numero_ordre=f"DEMO-{pays.code}-{i + 1:05d}" if medecin else "",
            )  # fmt: skip
        return nombre

    def produits(self, pays, reseaux_par_division, nombre: int) -> int:
        """Produits fictifs classés par division, et portefeuilles de 6 à 25 produits par
        réseau ; un produit sur deux environ est porté par plusieurs réseaux (prd.md §7.1)."""
        a = self.alea
        noms: set[str] = set()
        par_division = []
        for (code_div, _, _), reseaux in zip(DIVISIONS, reseaux_par_division, strict=True):
            classes = [
                (ref.creer_valeur(pays, "classe_therapeutique", libelle), fin)
                for libelle, fin in CLASSES[code_div]
            ]
            produits = []
            for _ in range(max(6, nombre // len(DIVISIONS))):
                classe, fin = a.choice(classes)
                nom = f"{a.choice(SYLLABES)}{a.choice(SYLLABES).lower()}{fin}"
                libelle = f"{nom} {a.choice(DOSAGES)}"
                if libelle in noms:
                    continue
                noms.add(libelle)
                produits.append(ref.creer_produit(pays, libelle, classe=classe))
            par_division.append((reseaux, produits))
        for reseaux, produits in par_division:
            portes = set()
            for reseau in reseaux:
                choix = a.sample(produits, k=min(len(produits), a.randint(6, 25)))
                ref.definir_portefeuille(reseau, choix)
                portes.update(p.pk for p in choix)
            # Aucun produit orphelin : ceux qu'aucun réseau n'a tirés vont au premier.
            orphelins = [p for p in produits if p.pk not in portes]
            if orphelins:
                courant = list(ref.produits_du_portefeuille([reseaux[0]], aujourdhui(pays)))
                ref.definir_portefeuille(reseaux[0], courant + orphelins)
        return len(noms)

    @transaction.atomic
    def tout(self, volumes: Volumes, pays_secondaires: tuple[str, ...] = ("TG",)) -> Bilan:
        self.premier("admin_siege", self.personne(None, Role.ADMIN_SIEGE))
        self.premier("direction_siege", self.personne(None, Role.DIRECTION_SIEGE))
        self.premier("admin_technique", self.personne(None, Role.ADMIN_TECHNIQUE))
        self.pays("SN", volumes)
        for code in pays_secondaires:
            self.pays(code, volumes.reduits(0.2))
        return self.bilan

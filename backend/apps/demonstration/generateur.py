"""Instance de démonstration aux données fictives (DEM-001).

Les volumes reprennent la structure réelle du Sénégal relevée dans le fichier
d'organisation (prd.md §7.1) : 4 divisions, 19 réseaux, 2 zones, 48 secteurs,
24 superviseurs, 227 postes pour 207 personnes. Tous les noms sont tirés au
hasard dans des listes de prénoms et de noms courants : aucune personne réelle,
aucun téléphone, aucun courriel joignable (CA2).
"""

import random
from dataclasses import dataclass, field
from datetime import timedelta

from django.apps import apps
from django.db import connection, transaction

from apps.identite.models import Role, Utilisateur
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.organisation.models import TypePoste
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


@dataclass
class Volumes:
    reseaux_par_division: tuple[int, ...] = (5, 4, 4, 6)  # 19 réseaux
    secteurs_par_zone: tuple[int, ...] = (24, 24)  # 48 secteurs
    superviseurs: int = 24
    postes: int = 227
    delegues: int = 207
    dm: int = 7
    sans_superviseur: int = 3

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
        )


@dataclass
class Bilan:
    pays: dict[str, dict[str, int]] = field(default_factory=dict)
    comptes: dict[str, str] = field(default_factory=dict)


def vider() -> None:
    """Vide toutes les tables métier (démonstration uniquement)."""
    tables = []
    for etiquette in ("socle", "identite", "organisation"):
        for modele in apps.get_app_config(etiquette).get_models(include_auto_created=True):
            tables.append(connection.ops.quote_name(modele._meta.db_table))
    with connection.cursor() as curseur:
        curseur.execute(f"TRUNCATE {', '.join(sorted(set(tables)))} RESTART IDENTITY CASCADE")


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

        self.bilan.pays[code] = {
            "divisions": len(reseaux_par_division),
            "reseaux": len(tous_reseaux),
            "secteurs": sum(len(z) for z in secteurs_par_zone),
            "superviseurs": len(superviseurs),
            "postes": len(postes),
            "delegues": len(delegues),
        }

    @transaction.atomic
    def tout(self, volumes: Volumes, pays_secondaires: tuple[str, ...] = ("TG",)) -> Bilan:
        self.premier("admin_siege", self.personne(None, Role.ADMIN_SIEGE))
        self.premier("direction_siege", self.personne(None, Role.DIRECTION_SIEGE))
        self.pays("SN", volumes)
        for code in pays_secondaires:
            self.pays(code, volumes.reduits(0.2))
        return self.bilan

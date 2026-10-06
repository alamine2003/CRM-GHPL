"""Catalogue des paramètres configurables par pays (prd.md §7.5, ORG-011).

Toute variation entre pays est une donnée, jamais du code (ADR-017). Chaque
paramètre a une valeur par défaut (ORG-011 CA1) et un validateur ; une
modification crée une nouvelle valeur datée, sans effacer les précédentes,
pour que les objets déjà validés gardent les règles de leur époque (CA3).

Les valeurs marquées [H] sont des hypothèses du cadrage (prd.md §24, O-08).
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ValidationError

HEURE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
TYPES_POSTE = ("vm", "vm_otc", "kam", "dermo")


def _heure(valeur: Any) -> None:
    if not isinstance(valeur, str) or not HEURE.match(valeur):
        raise ValidationError("Heure attendue au format HH:MM.")


def _entier(minimum: int, maximum: int) -> Callable[[Any], None]:
    def valider(valeur: Any) -> None:
        if isinstance(valeur, bool) or not isinstance(valeur, int):
            raise ValidationError("Nombre entier attendu.")
        if not minimum <= valeur <= maximum:
            raise ValidationError(f"Valeur attendue entre {minimum} et {maximum}.")

    return valider


def _booleen(valeur: Any) -> None:
    if not isinstance(valeur, bool):
        raise ValidationError("Vrai ou faux attendu.")


def _jours_ouvres(valeur: Any) -> None:
    if (
        not isinstance(valeur, list)
        or not valeur
        or len(set(valeur)) != len(valeur)
        or any(isinstance(j, bool) or j not in range(1, 8) for j in valeur)
    ):
        raise ValidationError("Liste de jours distincts attendue (1 = lundi … 7 = dimanche).")


def _echeance(valeur: Any) -> None:
    if not isinstance(valeur, dict) or set(valeur) != {"jour", "heure"}:
        raise ValidationError("Objet {jour, heure} attendu.")
    _entier(1, 7)(valeur["jour"])
    _heure(valeur["heure"])


def _plage(valeur: Any) -> None:
    if not isinstance(valeur, dict) or set(valeur) != {"debut", "fin"}:
        raise ValidationError("Objet {debut, fin} attendu.")
    _heure(valeur["debut"])
    _heure(valeur["fin"])
    if valeur["debut"] >= valeur["fin"]:
        raise ValidationError("Le début doit précéder la fin.")


def _bornes(minimum: int, maximum: int) -> Callable[[Any], None]:
    """Un objet {min, max} d'entiers, min < max, dans [minimum, maximum]."""

    def valider(valeur: Any) -> None:
        if not isinstance(valeur, dict) or set(valeur) != {"min", "max"}:
            raise ValidationError("Objet {min, max} attendu.")
        for borne in ("min", "max"):
            _entier(minimum, maximum)(valeur[borne])
        if valeur["min"] >= valeur["max"]:
            raise ValidationError("Le minimum doit être inférieur au maximum.")

    return valider


def _seuils(valeur: Any) -> None:
    if not isinstance(valeur, dict) or set(valeur) != set(TYPES_POSTE):
        raise ValidationError(f"Un seuil par type de poste attendu : {', '.join(TYPES_POSTE)}.")
    for seuil in valeur.values():
        if not isinstance(seuil, dict) or set(seuil) != {"min", "max"}:
            raise ValidationError("Chaque seuil est un objet {min, max}.")
        _entier(0, 50)(seuil["min"])
        _entier(0, 50)(seuil["max"])
        if seuil["min"] > seuil["max"]:
            raise ValidationError("Le minimum ne peut pas dépasser le maximum.")


def _conservation(valeur: Any) -> None:
    attendu = {"activite_annees", "gps_mois", "pieces_jointes_annees"}
    if not isinstance(valeur, dict) or set(valeur) != attendu:
        raise ValidationError(f"Objet attendu avec : {', '.join(sorted(attendu))}.")
    _entier(1, 30)(valeur["activite_annees"])
    _entier(1, 120)(valeur["gps_mois"])
    _entier(1, 30)(valeur["pieces_jointes_annees"])


def _format_date(valeur: Any) -> None:
    if valeur not in ("JJ/MM/AAAA", "AAAA-MM-JJ", "MM/JJ/AAAA"):
        raise ValidationError("Format attendu : JJ/MM/AAAA, AAAA-MM-JJ ou MM/JJ/AAAA.")


@dataclass(frozen=True)
class DefinitionParametre:
    cle: str
    description: str
    defaut: Any
    valider: Callable[[Any], None]
    hypothese: bool = False


CATALOGUE: dict[str, DefinitionParametre] = {
    d.cle: d
    for d in [
        DefinitionParametre(
            "format_date", "Format d'affichage des dates", "JJ/MM/AAAA", _format_date
        ),
        DefinitionParametre(
            "jours_ouvres",
            "Jours ouvrés (1 = lundi … 7 = dimanche)",
            [1, 2, 3, 4, 5],
            _jours_ouvres,
        ),
        DefinitionParametre(
            "echeance_soumission_planning",
            "Fermeture de la semaine : jour et heure, dans la semaine du planning, avant "
            "lesquels il est soumis (RG-013, décision du 6 octobre 2026)",
            {"jour": 1, "heure": "00:00"},
            _echeance,
        ),
        DefinitionParametre(
            "echeance_approbation_planning",
            "Échéance d'approbation du planning, semaine précédente (RG-013)",
            {"jour": 5, "heure": "18:00"},
            _echeance,
        ),
        DefinitionParametre(
            "heure_limite_rapport",
            "Heure limite du rapport le jour de la visite (RG-032)",
            "23:59",
            _heure,
        ),
        DefinitionParametre(
            "seuils_visites_jour",
            "Visites par jour et par type de poste (RG-016)",
            {
                "vm": {"min": 6, "max": 10},
                "vm_otc": {"min": 6, "max": 10},
                "kam": {"min": 3, "max": 6},
                "dermo": {"min": 6, "max": 10},
            },
            _seuils,
            hypothese=True,
        ),
        DefinitionParametre(
            "plage_horaire_visites",
            "Plage horaire des visites conformes (VIS-010)",
            {"debut": "08:00", "fin": "20:00"},
            _plage,
        ),
        DefinitionParametre(
            "visites_sans_gps_tolerees",
            "Visites sans GPS tolérées par journée (VIS-010)",
            # Valeur du CRM en place au Sénégal (4 octobre 2026) ; son sens exact reste à confirmer.
            3,
            _entier(0, 50),
            hypothese=True,
        ),
        DefinitionParametre(
            "distance_pointage_m",
            "Distance de pointage acceptée en mètres (VIS-010)",
            # Tolérance appliquée aujourd'hui au Sénégal (décision du 4 octobre 2026).
            100,
            _entier(10, 5000),
        ),
        DefinitionParametre(
            "duree_visite_minutes",
            "Durée d'une visite conforme, en minutes : en deçà ou au-delà, la journée est à "
            "vérifier (VIS-010)",
            {"min": 3, "max": 180},
            _bornes(1, 600),
            hypothese=True,
        ),
        DefinitionParametre(
            "cycle_visite_semaines",
            "Durée du cycle de visite en semaines (fréquences cibles, PRP-011)",
            4,
            _entier(1, 12),
        ),
        *(
            DefinitionParametre(
                f"frequence_cible_{potentiel.lower()}",
                f"Fréquence cible par défaut d'un prospect {potentiel}, en visites par cycle "
                "(PRP-011)",
                defaut,
                _entier(1, 20),
                hypothese=True,
            )
            for potentiel, defaut in (("A", 2), ("B", 1), ("C", 1))
        ),
        DefinitionParametre(
            "geolocalisation_active",
            "Géolocalisation au début et à la fin des visites (RG-028)",
            True,
            _booleen,
        ),
        DefinitionParametre(
            "attente_gps_secondes",
            "Attente de la position au début et à la fin d'une visite, en secondes ; au-delà, la "
            "visite continue « sans GPS » (VIS-003, décision du 6 octobre 2026)",
            60,
            _entier(10, 300),
        ),
        DefinitionParametre(
            "rappel_planning_non_soumis",
            "Rappel du planning non soumis, semaine précédente (NOT-006)",
            {"jour": 5, "heure": "09:00"},
            _echeance,
        ),
        DefinitionParametre(
            "alerte_planning_non_approuve",
            "Alerte au DM des plannings non approuvés, jour de la semaine (RG-019)",
            {"jour": 1, "heure": "00:00"},
            _echeance,
        ),
        DefinitionParametre(
            "delai_escalade_heures_ouvrees",
            "Délai avant escalade vers le DM (RG-019)",
            24,
            _entier(1, 240),
        ),
        DefinitionParametre(
            "conservation",
            "Durées de conservation (RG-060)",
            {"activite_annees": 5, "gps_mois": 12, "pieces_jointes_annees": 3},
            _conservation,
        ),
    ]
}


def definition(cle: str) -> DefinitionParametre:
    try:
        return CATALOGUE[cle]
    except KeyError:
        raise ValidationError(f"Paramètre inconnu : {cle}.") from None

"""Le suivi des ventes reprend le monde des tests du périmètre (deux pays, un compte par rôle)."""

from datetime import date

import pytest

from apps.identite.models import Role
from apps.identite.services import attribuer_role, creer_utilisateur
from apps.organisation import services as org
from apps.perimetre.tests.conftest import (  # noqa: F401
    DEBUT_ROLES,
    _courriels_immediats,
    api,
    monde,
)
from apps.referentiel import services as ref
from apps.ventes import services
from apps.ventes.models import SourceVente, TypeClient


@pytest.fixture
def ventes(monde):  # noqa: F811
    """Deux réseaux, deux postes, deux délégués, trois produits, quatre clients (fictifs), et des
    ventes de 2025 et de 2024."""
    sn, admin = monde["sn"], monde["admin.sn"]
    division = org.creer_division(sn, "CAR", "Cardiologie")
    cardio = org.creer_reseau(sn, division, "CAR1", "Cardio")
    gyneco = org.creer_reseau(sn, division, "GYN1", "Gynéco")
    dakar = org.creer_zone(sn, "Dakar")
    thies = org.creer_zone(sn, "Thiès")
    plateau = org.creer_secteur(sn, dakar, "Plateau")
    centre = org.creer_secteur(sn, thies, "Centre")
    poste1 = org.creer_poste(sn, "vm", "VM Plateau", [cardio], [plateau])
    poste2 = org.creer_poste(sn, "vm", "VM Thiès", [gyneco], [centre])
    gabriel = monde["deleg.sn"]
    moussa = creer_utilisateur("moussa.fall", prenom="Moussa", nom="Fall", pays=sn)
    attribuer_role(moussa, Role.DELEGUE, sn, par=None, debut=DEBUT_ROLES)
    org.occuper(poste1, gabriel, date(2024, 1, 1))
    org.occuper(poste2, moussa, date(2024, 1, 1))
    org.rattacher(poste1, monde["sup.sn"])
    org.ajouter_reseau_au_perimetre(monde["df.sn"], cardio)
    cardiol = ref.creer_produit(sn, "Cardiol 10 mg")
    gynopril = ref.creer_produit(sn, "Gynopril")
    orphelin = ref.creer_produit(sn, "Orphelin")
    ref.definir_portefeuille(cardio, [cardiol])
    ref.definir_portefeuille(gyneco, [gynopril])
    pharmacie = services.creer_client(sn, "Pharmacie du Plateau", TypeClient.PHARMACIE, dakar)
    grossiste = services.creer_client(sn, "Grossiste Sahel", TypeClient.GROSSISTE, thies)
    para = services.creer_client(sn, "Para Médina", TypeClient.PARAPHARMACIE)

    def ligne(mois, delegue, produit, client, quantite, montant):
        services.enregistrer_ligne(
            sn, admin, mois=mois, delegue=delegue, produit=produit, client=client,
            quantite=quantite, montant_ttc=montant, source=SourceVente.SAISIE,
        )  # fmt: skip

    ligne(date(2025, 1, 1), gabriel, cardiol, pharmacie, 100, 1000)
    ligne(date(2025, 2, 1), gabriel, cardiol, pharmacie, 200, 2000)
    ligne(date(2025, 1, 1), moussa, gynopril, grossiste, 50, 500)
    ligne(date(2025, 3, 1), moussa, gynopril, grossiste, 10, 100)
    ligne(date(2024, 1, 1), gabriel, cardiol, pharmacie, 50, 500)
    return {
        "cardio": cardio, "gyneco": gyneco, "dakar": dakar, "thies": thies, "poste1": poste1,
        "poste2": poste2, "gabriel": gabriel, "moussa": moussa, "cardiol": cardiol,
        "gynopril": gynopril, "orphelin": orphelin, "pharmacie": pharmacie,
        "grossiste": grossiste, "para": para,
    }  # fmt: skip

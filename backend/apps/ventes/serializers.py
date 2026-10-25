"""Sérialiseurs de l'API des ventes. Les montants voyagent en chaînes décimales (jamais de
flottant : un chiffre d'affaires ne s'arrondit pas en route)."""

from rest_framework import serializers

from apps.imports.serializers import ImportBirdNotesSerializer  # noqa: F401  (même formulaire)

from .models import EtatObjectifVente, SourceVente, TypeClient, Vente
from .synthese import REGROUPEMENTS

TYPES_CLIENT = serializers.ChoiceField(choices=TypeClient.choices)


class DelegueVenteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField()


class ElementSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    libelle = serializers.CharField()


class ClientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    nom = serializers.CharField()
    type = TYPES_CLIENT
    zone = ElementSerializer(allow_null=True)


def representer_ligne(vente: Vente) -> dict:
    """Une ligne telle que l'API la rend ; les liens sont préchargés par la vue."""
    d = vente.delegue

    def element(objet, champ="libelle"):
        return None if objet is None else {"id": objet.pk, "libelle": getattr(objet, champ)}

    return {
        "id": vente.pk,
        "mois": vente.mois.strftime("%Y-%m"),
        "delegue": {"id": d.pk, "nom": f"{d.first_name} {d.last_name}".strip() or d.username},
        "produit": element(vente.produit),
        "client": {"id": vente.client.pk, "nom": vente.client.nom, "type": vente.client.type,
                   "zone": element(vente.client.zone)},
        "reseau": element(vente.reseau),
        "zone": element(vente.zone),
        "quantite": vente.quantite,
        "montant_ttc": vente.montant_ttc,
        "source": vente.source,
        "modifie_le": vente.modifie_le,
    }  # fmt: skip


class LigneVenteRenduSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    mois = serializers.CharField(help_text="AAAA-MM")
    delegue = DelegueVenteSerializer()
    produit = ElementSerializer()
    client = ClientSerializer()
    reseau = ElementSerializer(allow_null=True)
    zone = ElementSerializer(allow_null=True)
    quantite = serializers.IntegerField()
    montant_ttc = serializers.DecimalField(max_digits=14, decimal_places=2)
    source = serializers.ChoiceField(choices=SourceVente.choices)
    modifie_le = serializers.DateTimeField()


class PageLignesSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    page = serializers.IntegerField()
    taille = serializers.IntegerField()
    resultats = LigneVenteRenduSerializer(many=True)


class SaisieVenteSerializer(serializers.Serializer):
    mois = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", help_text="AAAA-MM")
    delegue = serializers.UUIDField()
    produit = serializers.UUIDField()
    client = serializers.UUIDField()
    quantite = serializers.CharField()
    montant_ttc = serializers.CharField()


class ModificationVenteSerializer(serializers.Serializer):
    quantite = serializers.CharField(required=False)
    montant_ttc = serializers.CharField(required=False)


class SaisieClientSerializer(serializers.Serializer):
    nom = serializers.CharField(max_length=160)
    type = TYPES_CLIENT
    zone = serializers.UUIDField(required=False, allow_null=True)


class ChoixSyntheseSerializer(serializers.Serializer):
    annee = serializers.IntegerField(required=False, min_value=2000, max_value=2100)
    mois_fin = serializers.IntegerField(required=False, min_value=1, max_value=12)
    par = serializers.ChoiceField(choices=REGROUPEMENTS, default="produit")
    delegue = serializers.UUIDField(required=False)
    produit = serializers.UUIDField(required=False)
    classe = serializers.UUIDField(required=False)
    reseau = serializers.UUIDField(required=False)
    zone = serializers.UUIDField(required=False)
    client = serializers.UUIDField(required=False)
    type_client = serializers.ChoiceField(choices=TypeClient.choices, required=False)


class ChoixExportVentesSerializer(ChoixSyntheseSerializer):
    """Ce qu'on exporte (`contenu`) et comment (`fichier`), avec la période et les filtres de la
    synthèse affichée."""

    contenu = serializers.ChoiceField(choices=["ventilation", "mensuel", "lignes"],
                                      default="ventilation")  # fmt: skip
    fichier = serializers.ChoiceField(choices=["csv", "xlsx"], default="xlsx")


class TotauxVentesSerializer(serializers.Serializer):
    montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    quantite = serializers.IntegerField()
    precedent_montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    precedent_quantite = serializers.IntegerField()
    lignes = serializers.IntegerField()
    evolution = serializers.FloatField(allow_null=True)


class MoisVentesSerializer(serializers.Serializer):
    mois = serializers.CharField(help_text="AAAA-MM")
    montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    quantite = serializers.IntegerField()
    precedent_montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    precedent_quantite = serializers.IntegerField()


class GroupeVentesSerializer(serializers.Serializer):
    id = serializers.UUIDField(allow_null=True)
    cle = serializers.CharField()
    libelle = serializers.CharField()
    montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    quantite = serializers.IntegerField()
    part = serializers.FloatField(allow_null=True)
    precedent_montant_ttc = serializers.DecimalField(max_digits=16, decimal_places=2)
    evolution = serializers.FloatField(allow_null=True)


class SyntheseVentesSerializer(serializers.Serializer):
    devise = serializers.CharField(
        help_text="Code ISO 4217 du pays : tous les montants s'y lisent."
    )
    annee = serializers.IntegerField()
    mois_fin = serializers.IntegerField()
    par = serializers.ChoiceField(choices=REGROUPEMENTS)
    ytd = TotauxVentesSerializer()
    mensuel = MoisVentesSerializer(many=True)
    ventilation = GroupeVentesSerializer(many=True)


class ChoixTypeClientSerializer(serializers.Serializer):
    valeur = serializers.CharField()
    libelle = serializers.CharField()


class OptionsVentesSerializer(serializers.Serializer):
    """Ce que les filtres proposent : seulement ce qui apparaît dans les ventes visibles."""

    annees = serializers.ListField(child=serializers.IntegerField())
    aujourdhui_annee = serializers.IntegerField()
    aujourdhui_mois = serializers.IntegerField()
    delegues = DelegueVenteSerializer(many=True)
    produits = ElementSerializer(many=True)
    classes = ElementSerializer(many=True)
    reseaux = ElementSerializer(many=True)
    zones = ElementSerializer(many=True)
    types_client = ChoixTypeClientSerializer(many=True)


class SaisieObjectifVenteSerializer(serializers.Serializer):
    """La cible de l'année, ou ses douze mois (janvier à décembre) ; les deux si la somme colle."""

    reseau = serializers.UUIDField()
    produit = serializers.UUIDField(required=False, allow_null=True)
    delegue = serializers.UUIDField(
        required=False, allow_null=True, help_text="1.8.0 : l'objectif d'un délégué du réseau."
    )
    annee = serializers.IntegerField(min_value=2000, max_value=2100)
    cible = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mois = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True, max_length=12
    )


class ModificationObjectifVenteSerializer(serializers.Serializer):
    cible = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mois = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True, max_length=12
    )


class ChoixObjectifsSerializer(serializers.Serializer):
    annee = serializers.IntegerField(required=False, min_value=2000, max_value=2100)
    mois_fin = serializers.IntegerField(required=False, min_value=1, max_value=12)


class ChoixExportObjectifsSerializer(ChoixObjectifsSerializer):
    fichier = serializers.ChoiceField(choices=["csv", "xlsx"], default="xlsx")


class ObjectifVenteRenduSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    reseau = ElementSerializer()
    produit = ElementSerializer(allow_null=True)
    delegue = DelegueVenteSerializer(allow_null=True)
    annee = serializers.IntegerField()
    cible = serializers.DecimalField(max_digits=16, decimal_places=2)
    attendu = serializers.DecimalField(max_digits=16, decimal_places=2)
    realise = serializers.DecimalField(max_digits=16, decimal_places=2)
    ecart = serializers.DecimalField(max_digits=16, decimal_places=2)
    taux_cible = serializers.FloatField(allow_null=True)
    taux_attendu = serializers.FloatField(allow_null=True)
    etat = serializers.ChoiceField(choices=EtatObjectifVente.choices)
    mois = serializers.ListField(
        child=serializers.DecimalField(max_digits=16, decimal_places=2),
        help_text="Les douze montants de l'année, janvier à décembre.",
    )
    repartition_libre = serializers.BooleanField(
        help_text="Faux : la cible est répartie à parts égales."
    )
    realise_mois = serializers.ListField(
        child=serializers.DecimalField(max_digits=16, decimal_places=2),
        help_text="Le réalisé de chaque mois de l'année, janvier à décembre.",
    )
    cible_deleguee = serializers.DecimalField(
        max_digits=16, decimal_places=2, allow_null=True,
        help_text="Objectif de réseau : la somme des objectifs de ses délégués ; sinon vide.",
    )  # fmt: skip
    modifiable = serializers.BooleanField(
        help_text="Celui qui lit peut corriger ou archiver cet objectif."
    )


class TotalObjectifsSerializer(serializers.Serializer):
    cible = serializers.DecimalField(max_digits=16, decimal_places=2)
    attendu = serializers.DecimalField(max_digits=16, decimal_places=2)
    realise = serializers.DecimalField(max_digits=16, decimal_places=2)
    taux_cible = serializers.FloatField(allow_null=True)
    taux_attendu = serializers.FloatField(allow_null=True)


class ReseauObjectifSerializer(ElementSerializer):
    produits = ElementSerializer(many=True)
    delegues = DelegueVenteSerializer(many=True)


class ObjectifsVentesSerializer(serializers.Serializer):
    devise = serializers.CharField()
    annee = serializers.IntegerField()
    mois_fin = serializers.IntegerField()
    objectifs = ObjectifVenteRenduSerializer(many=True)
    total = TotalObjectifsSerializer(
        allow_null=True,
        help_text="Les objectifs de réseau seuls (jamais ceux de produit ou de délégué).",
    )
    reseaux_gerables = ReseauObjectifSerializer(
        many=True, help_text="Ce que l'administrateur pays peut viser ; vide pour les autres."
    )

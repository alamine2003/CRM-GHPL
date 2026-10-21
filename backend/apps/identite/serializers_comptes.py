from rest_framework import serializers

from apps.socle.models import CHOIX_LANGUES

from .models import AffectationPays, Appareil, Role, RoleUtilisateur, Transfert, Utilisateur
from .serializers import PaysResumeSerializer


class RoleSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code", allow_null=True, default=None)
    libelle = serializers.CharField(source="get_role_display")
    actif = serializers.SerializerMethodField()
    attribue_par = serializers.CharField(source="attribue_par.username", default=None)
    retire_par = serializers.CharField(source="retire_par.username", default=None)

    class Meta:
        model = RoleUtilisateur
        fields = ["id", "role", "libelle", "pays", "debut", "fin", "actif", "attribue_par",
                  "retire_par"]  # fmt: skip

    def get_actif(self, role) -> bool:
        return role.est_actif()


class UtilisateurSerializer(serializers.ModelSerializer):
    identifiant = serializers.CharField(source="username")
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")
    courriel = serializers.CharField(source="email")
    actif = serializers.BooleanField(source="is_active")
    pays_principal = PaysResumeSerializer(allow_null=True)
    roles = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = ["id", "identifiant", "prenom", "nom", "courriel", "langue", "actif",
                  "pays_principal", "roles", "last_login"]  # fmt: skip

    def get_roles(self, utilisateur) -> list[str]:
        """Rôles actifs ; depuis un pays actif, seulement ceux de ce pays (ORG-009)."""
        pays = self.context.get("pays")
        return sorted(
            {
                r.role
                for r in utilisateur.roles.all()
                if r.est_actif() and (pays is None or r.pays_id == pays.pk)
            }
        )


class CreationUtilisateurSerializer(serializers.Serializer):
    identifiant = serializers.CharField(max_length=150)
    prenom = serializers.CharField(max_length=150)
    nom = serializers.CharField(max_length=150)
    courriel = serializers.EmailField(required=False, allow_blank=True)
    langue = serializers.ChoiceField(choices=CHOIX_LANGUES, required=False)


class AttributionRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)


class PerimetreSerializer(serializers.Serializer):
    pays_actif = PaysResumeSerializer(allow_null=True)
    vue_consolidee = serializers.BooleanField()
    roles = serializers.ListField(child=serializers.CharField())
    actions = serializers.ListField(child=serializers.CharField())
    pays_accessibles = PaysResumeSerializer(many=True)


class AffectationSerializer(serializers.ModelSerializer):
    pays = serializers.CharField(source="pays.code")
    active = serializers.SerializerMethodField()
    accorde_par = serializers.CharField(source="accorde_par.username", default=None)
    retire_par = serializers.CharField(source="retire_par.username", default=None)

    class Meta:
        model = AffectationPays
        fields = ["id", "pays", "motif", "debut", "fin", "active", "accorde_par", "retire_par"]

    def get_active(self, affectation) -> bool:
        from apps.socle.services import aujourdhui

        return affectation.est_active(aujourdhui(affectation.pays))


class AffectationCreationSerializer(serializers.Serializer):
    pays = serializers.CharField(max_length=2)
    role = serializers.ChoiceField(choices=Role.choices)
    motif = serializers.CharField(max_length=300)
    debut = serializers.DateField(required=False)
    fin = serializers.DateField(required=False, allow_null=True)


class FinAffectationSerializer(serializers.Serializer):
    fin = serializers.DateField(required=False)


class TransfertSerializer(serializers.ModelSerializer):
    pays_origine = serializers.CharField(source="pays_origine.code")
    pays_destination = serializers.CharField(source="pays_destination.code")
    autorise_par = serializers.CharField(source="autorise_par.username", default=None)

    class Meta:
        model = Transfert
        fields = ["id", "pays_origine", "pays_destination", "motif", "le", "autorise_par"]


class TransfertCreationSerializer(serializers.Serializer):
    pays = serializers.CharField(max_length=2)
    motif = serializers.CharField(max_length=300)
    role = serializers.ChoiceField(choices=Role.choices, required=False)


class AppareilSerializer(serializers.ModelSerializer):
    """Téléphone enregistré (USR-006 CA1 : appareil, système, version, dernier contact)."""

    identifiant = serializers.CharField(source="utilisateur.username")
    prenom = serializers.CharField(source="utilisateur.first_name")
    nom = serializers.CharField(source="utilisateur.last_name")
    plateforme_libelle = serializers.CharField(source="get_plateforme_display")
    revoque = serializers.BooleanField(source="est_revoque")

    class Meta:
        model = Appareil
        fields = ["id", "identifiant", "prenom", "nom", "plateforme", "plateforme_libelle",
                  "systeme", "modele", "version_app", "cree_le", "dernier_contact", "revoque",
                  "revoque_le"]  # fmt: skip


class DroitsDOSerializer(serializers.Serializer):
    """Les groupes de droits d'un DO : vrai quand ils sont ouverts (1.6.1)."""

    ventes = serializers.BooleanField()
    pilotage = serializers.BooleanField()
    rapports = serializers.BooleanField()
    prospects = serializers.BooleanField()


class CompteDOSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    identifiant = serializers.CharField()
    prenom = serializers.CharField()
    nom = serializers.CharField()
    pays = PaysResumeSerializer(allow_null=True)
    droits = DroitsDOSerializer()


class ModificationDroitsDOSerializer(serializers.Serializer):
    ventes = serializers.BooleanField(required=False)
    pilotage = serializers.BooleanField(required=False)
    rapports = serializers.BooleanField(required=False)
    prospects = serializers.BooleanField(required=False)

from rest_framework import serializers

from apps.socle.models import CHOIX_LANGUES

from .models import Role, RoleUtilisateur, Utilisateur
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
        return sorted({r.role for r in utilisateur.roles.all() if r.est_actif()})


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

from rest_framework import serializers

from .models import Session, Utilisateur


class PaysResumeSerializer(serializers.Serializer):
    code = serializers.CharField()
    nom = serializers.CharField()
    fuseau = serializers.CharField()


class MoiSerializer(serializers.ModelSerializer):
    identifiant = serializers.CharField(source="username")
    prenom = serializers.CharField(source="first_name")
    nom = serializers.CharField(source="last_name")
    courriel = serializers.CharField(source="email")
    pays_principal = PaysResumeSerializer(allow_null=True)
    est_siege = serializers.BooleanField()

    class Meta:
        model = Utilisateur
        fields = ["id", "identifiant", "prenom", "nom", "courriel", "langue", "pays_principal",
                  "est_siege"]  # fmt: skip


class ConnexionSerializer(serializers.Serializer):
    identifiant = serializers.CharField(max_length=150)
    mot_de_passe = serializers.CharField(max_length=256, trim_whitespace=False)
    client = serializers.ChoiceField(choices=Session.Client.choices)


class RafraichissementSerializer(serializers.Serializer):
    rafraichissement = serializers.CharField(
        required=False,
        help_text="Application mobile uniquement ; le portail utilise le cookie.",
    )


class JetonsSerializer(serializers.Serializer):
    acces = serializers.CharField(help_text="Jeton d'accès, à envoyer en « Bearer ».")
    expire_dans = serializers.IntegerField(help_text="Durée de validité du jeton d'accès (s).")
    rafraichissement = serializers.CharField(
        allow_null=True,
        help_text="Application mobile uniquement ; nul pour le portail (cookie HttpOnly).",
    )
    utilisateur = MoiSerializer()


class OubliSerializer(serializers.Serializer):
    identifiant = serializers.CharField(max_length=254, help_text="Identifiant ou courriel.")


class ReinitialisationSerializer(serializers.Serializer):
    jeton = serializers.CharField(max_length=128)
    mot_de_passe = serializers.CharField(max_length=256, trim_whitespace=False)


class ChangementSerializer(serializers.Serializer):
    actuel = serializers.CharField(max_length=256, trim_whitespace=False)
    nouveau = serializers.CharField(max_length=256, trim_whitespace=False)

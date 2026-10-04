from rest_framework import serializers

from apps.socle.models import CHOIX_LANGUES

from .models import Appareil, Session, Utilisateur


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


class DescriptionAppareilSerializer(serializers.Serializer):
    identifiant_installation = serializers.RegexField(
        r"^[A-Za-z0-9-]{8,64}$", help_text="Tiré au hasard à l'installation de l'application."
    )
    plateforme = serializers.ChoiceField(choices=Appareil.Plateforme.choices)
    systeme = serializers.CharField(max_length=60, required=False, allow_blank=True)
    modele = serializers.CharField(max_length=80, required=False, allow_blank=True)
    version_app = serializers.CharField(max_length=20, required=False, allow_blank=True)


class ConnexionSerializer(serializers.Serializer):
    identifiant = serializers.CharField(max_length=150)
    mot_de_passe = serializers.CharField(max_length=256, trim_whitespace=False)
    client = serializers.ChoiceField(choices=Session.Client.choices)
    appareil = DescriptionAppareilSerializer(
        required=False, help_text="Obligatoire pour l'application mobile (USR-006)."
    )


class ChangementLangueSerializer(serializers.Serializer):
    langue = serializers.ChoiceField(choices=CHOIX_LANGUES)


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

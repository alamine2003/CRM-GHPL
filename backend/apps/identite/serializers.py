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
    double_auth_active = serializers.SerializerMethodField()
    double_auth_requise = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = ["id", "identifiant", "prenom", "nom", "courriel", "langue", "pays_principal",
                  "est_siege", "double_auth_active", "double_auth_requise"]  # fmt: skip

    def get_double_auth_active(self, utilisateur) -> bool:
        from .double_auth import est_active

        return est_active(utilisateur)

    def get_double_auth_requise(self, utilisateur) -> bool:
        """Rôle sensible (SEC-003) : la double authentification est obligatoire."""
        from .double_auth import exige_double_auth

        return exige_double_auth(utilisateur)


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


class JetonPushSerializer(serializers.Serializer):
    """NOT-002 (0.8.5) : l'adresse push d'Expo de ce téléphone."""

    jeton = serializers.RegexField(
        r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,160}\]$", max_length=200
    )


class PreferenceNotificationSerializer(serializers.Serializer):
    """NOT-005 (0.8.6) : une notification que la personne reçoit, et si elle part en push."""

    type = serializers.CharField()
    obligatoire = serializers.BooleanField()
    push = serializers.BooleanField()


class ChangementPreferencesSerializer(serializers.Serializer):
    #: Les types que la personne ne veut plus recevoir en push.
    coupes = serializers.ListField(child=serializers.CharField(max_length=32), max_length=30)


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
    double_auth_a_activer = serializers.BooleanField(
        help_text="Vrai si le compte doit activer la double authentification avant tout accès."
    )


class EtapeDoubleAuthSerializer(serializers.Serializer):
    etape = serializers.CharField(help_text="« code_requis » : envoyer le code à connexion/code/.")
    jeton_etape = serializers.CharField()
    expire_dans = serializers.IntegerField()


class ConnexionCodeSerializer(serializers.Serializer):
    jeton_etape = serializers.CharField(max_length=2000)
    code = serializers.CharField(max_length=20, help_text="Code de l'application ou de secours.")


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class EtatDoubleAuthSerializer(serializers.Serializer):
    active = serializers.BooleanField()
    requise = serializers.BooleanField()
    codes_secours_restants = serializers.IntegerField()


class InitialisationDoubleAuthSerializer(serializers.Serializer):
    secret = serializers.CharField(help_text="À saisir à la main si le QR code ne passe pas.")
    uri = serializers.CharField(help_text="Adresse otpauth:// à afficher en QR code.")


class CodesSecoursSerializer(serializers.Serializer):
    codes_secours = serializers.ListField(child=serializers.CharField())


class SessionSerializer(serializers.ModelSerializer):
    appareil = serializers.SerializerMethodField()
    adresse = serializers.SerializerMethodField()
    courante = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = ["id", "client", "appareil", "adresse", "cree_le", "utilisee_le", "expire_le",
                  "double_auth_validee", "courante"]  # fmt: skip

    def get_appareil(self, session) -> str | None:
        a = session.appareil
        return f"{a.modele or a.get_plateforme_display()} · {a.systeme}".strip(" ·") if a else None

    def get_adresse(self, session) -> str | None:
        """Adresse partiellement masquée : assez pour reconnaître, pas pour pister."""
        ip = session.adresse_ip or ""
        if ":" in ip:
            return ":".join(ip.split(":")[:3]) + ":x"
        parties = ip.split(".")
        return ".".join(parties[:2] + ["x", "x"]) if len(parties) == 4 else None

    def get_courante(self, session) -> bool:
        return str(session.pk) == str(self.context.get("courante"))


class OubliSerializer(serializers.Serializer):
    identifiant = serializers.CharField(max_length=254, help_text="Identifiant ou courriel.")


class ReinitialisationSerializer(serializers.Serializer):
    jeton = serializers.CharField(max_length=128)
    mot_de_passe = serializers.CharField(max_length=256, trim_whitespace=False)


class ChangementSerializer(serializers.Serializer):
    actuel = serializers.CharField(max_length=256, trim_whitespace=False)
    nouveau = serializers.CharField(max_length=256, trim_whitespace=False)


class ActiviteCompteSerializer(serializers.Serializer):
    """Événement d'audit de l'utilisateur lui-même (connexions, sécurité du compte)."""

    le = serializers.DateTimeField()
    action = serializers.CharField()
    resultat = serializers.CharField()
    client = serializers.CharField(allow_null=True)
    adresse = serializers.CharField(allow_null=True)

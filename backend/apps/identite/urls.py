from django.urls import path

from . import views

urlpatterns = [
    path("connexion/", views.ConnexionView.as_view(), name="connexion"),
    path("connexion/code/", views.ConnexionCodeView.as_view(), name="connexion-code"),
    path("double-auth/", views.DoubleAuthView.as_view(), name="double-auth"),
    path(
        "double-auth/initialiser/",
        views.DoubleAuthInitialisationView.as_view(),
        name="double-auth-initialiser",
    ),
    path(
        "double-auth/activer/", views.DoubleAuthActivationView.as_view(), name="double-auth-activer"
    ),
    path(
        "double-auth/codes-secours/",
        views.DoubleAuthCodesSecoursView.as_view(),
        name="double-auth-codes-secours",
    ),
    path(
        "double-auth/desactiver/",
        views.DoubleAuthDesactivationView.as_view(),
        name="double-auth-desactiver",
    ),
    path("sessions/", views.SessionsView.as_view(), name="sessions"),
    path("activite/", views.ActiviteView.as_view(), name="mon-activite"),
    path(
        "sessions/autres/revoquer/",
        views.SessionsAutresRevocationView.as_view(),
        name="sessions-revoquer-autres",
    ),
    path(
        "sessions/<uuid:id>/revoquer/",
        views.SessionRevocationView.as_view(),
        name="session-revoquer",
    ),
    path("rafraichir/", views.RafraichissementView.as_view(), name="rafraichir"),
    path("deconnexion/", views.DeconnexionView.as_view(), name="deconnexion"),
    path("moi/", views.MoiView.as_view(), name="moi"),
    path("mot-de-passe/oubli/", views.OubliView.as_view(), name="mot-de-passe-oubli"),
    path(
        "mot-de-passe/reinitialisation/",
        views.ReinitialisationView.as_view(),
        name="mot-de-passe-reinitialisation",
    ),
    path(
        "mot-de-passe/changement/",
        views.ChangementView.as_view(),
        name="mot-de-passe-changement",
    ),
]

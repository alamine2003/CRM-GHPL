from django.urls import path

from . import views

urlpatterns = [
    path("connexion/", views.ConnexionView.as_view(), name="connexion"),
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

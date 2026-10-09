"""Le navigateur doit pouvoir envoyer les en-têtes propres à INNOV CRM (architecture §11)."""

from django.test import override_settings


@override_settings(CORS_ALLOWED_ORIGINS=["https://crm.exemple.org"])
def test_entetes_autorises_par_le_controle_cors(client):
    reponse = client.options(
        "/api/v1/auth/perimetre/",
        HTTP_ORIGIN="https://crm.exemple.org",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization, x-pays, x-innov-client, x-version-app",
    )
    autorises = reponse["Access-Control-Allow-Headers"].lower()
    for entete in ("authorization", "x-pays", "x-innov-client", "x-version-app", "accept-language"):
        assert entete in autorises
    assert reponse["Access-Control-Allow-Credentials"] == "true"

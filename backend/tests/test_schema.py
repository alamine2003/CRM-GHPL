"""Le schéma OpenAPI versionné doit correspondre au code (ADR-012)."""

from pathlib import Path

from django.core.management import call_command
from django.utils import translation

SCHEMA = Path(__file__).resolve().parents[1] / "schema.yaml"


def test_schema_openapi_a_jour(tmp_path):
    genere = tmp_path / "schema.yaml"
    # Le schéma contient des libellés traduits : on le génère toujours en français,
    # quelle que soit la langue laissée active par un autre test.
    with translation.override("fr"):
        call_command("spectacular", "--file", str(genere), "--validate", "--fail-on-warn")
    assert SCHEMA.exists(), "backend/schema.yaml manque : lancer `make schema`."
    assert genere.read_text() == SCHEMA.read_text(), (
        "backend/schema.yaml n'est pas à jour : lancer `make schema` et commiter."
    )

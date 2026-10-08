import json
from pathlib import Path

from ai_service.openapi import build_openapi_document

COMMITTED = Path(__file__).parent.parent / "openapi.json"


def test_the_committed_contract_matches_the_code() -> None:
    # Regenerate with: uv run python -m ai_service.openapi
    assert json.loads(COMMITTED.read_text()) == build_openapi_document()


def test_documents_the_service_token_and_error_responses() -> None:
    document = build_openapi_document()
    operation = document["paths"]["/v1/classifications"]["post"]

    assert operation["security"] == [{"serviceToken": []}]
    assert document["components"]["securitySchemes"]["serviceToken"] == {
        "type": "http",
        "scheme": "bearer",
    }
    assert set(operation["responses"]) == {"200", "400", "401", "422", "502", "503"}
    assert "422" not in document["paths"]["/health/live"]["get"]["responses"]

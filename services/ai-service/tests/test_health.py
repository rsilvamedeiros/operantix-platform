from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.main import create_app


def client() -> TestClient:
    return TestClient(create_app(Settings(environment="test")))


def test_liveness_answers_ok() -> None:
    response = client().get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_its_checks() -> None:
    response = client().get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {}}


def test_unknown_routes_answer_with_the_platform_error_shape() -> None:
    response = client().get("/nope")

    assert response.status_code == 404
    assert response.json() == {"code": "NOT_FOUND", "message": "Not Found"}

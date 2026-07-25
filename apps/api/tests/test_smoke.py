from fastapi.testclient import TestClient
from knowledge_os_api.application import create_app


def test_api_health_contract_is_exact() -> None:
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"component": "api", "status": "ok"}


def test_api_metadata_is_versioned() -> None:
    info = create_app().openapi()["info"]

    assert info == {"title": "Knowledge OS API", "version": "0.1.0"}

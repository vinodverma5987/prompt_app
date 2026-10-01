from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.service import LocalInsightProvider


@pytest.fixture
def api(tmp_path):
    provider = Mock(wraps=LocalInsightProvider())
    app = create_app(str(tmp_path / "test.sqlite3"), provider)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, provider


def submit(client, **overrides):
    return client.post(
        "/api/prompts",
        json={
            "prompt": "Improve customer onboarding",
            "targetLanguage": "en",
            **overrides,
        },
    )


@pytest.mark.parametrize(
    "payload,code",
    [
        ({"targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": "", "targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": "   ", "targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": 123, "targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": True, "targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": "x" * 4001, "targetLanguage": "en"}, "INVALID_REQUEST"),
        ({"prompt": "valid prompt", "targetLanguage": "xx"}, "INVALID_LANGUAGE"),
        ({"prompt": "valid prompt"}, "INVALID_LANGUAGE"),
        ({"prompt": "valid prompt", "targetLanguage": "en", "contextId": "bad"}, "INVALID_REQUEST"),
        ({"prompt": "valid prompt", "targetLanguage": "en", "contextId": 123}, "INVALID_REQUEST"),
        ({"prompt": "valid prompt", "targetLanguage": "en", "extra": True}, "INVALID_REQUEST"),
    ],
)
def test_invalid_inputs_never_call_provider(api, payload, code):
    client, provider = api
    response = client.post("/api/prompts", json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == code
    assert response.json()["details"]
    provider.generate.assert_not_called()


@pytest.mark.parametrize(
    "prompt", ["a", "hi", "abcd", "help me", "tell me more", "onboarding", "?????"]
)
def test_clarification_precedes_provider(api, prompt):
    client, provider = api
    response = submit(client, prompt=prompt)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "NEEDS_CLARIFICATION"
    assert data["contextId"]
    provider.generate.assert_not_called()


def test_followup_reuses_context_and_generates_once(api):
    client, provider = api
    clarification = submit(client, prompt="help").json()
    result = submit(client, contextId=clarification["contextId"]).json()
    assert result["status"] == "SUCCESS"
    assert result["contextId"] == clarification["contextId"]
    assert result["requestId"] != clarification["requestId"]
    provider.generate.assert_called_once()


def test_pagination_reads_stable_snapshot_without_provider(api):
    client, provider = api
    first = submit(client).json()
    assert len(first["insights"]) == 10
    assert first["pagination"] == {
        "page": 1,
        "pageSize": 10,
        "totalItems": 12,
        "totalPages": 2,
        "hasMore": True,
        "nextPage": 2,
    }
    url = f"/api/requests/{first['requestId']}/insights"
    second = client.get(url, params={"page": 2}).json()
    assert len(second["insights"]) == 2
    assert second["pagination"]["nextPage"] is None
    assert not second["pagination"]["hasMore"]
    assert {i["id"] for i in first["insights"]}.isdisjoint(i["id"] for i in second["insights"])
    assert client.get(url).json() == first
    assert client.get(url, params={"page": 3}).status_code == 404
    assert client.get(url, params={"page": 0}).status_code == 422
    assert client.get(url, params={"page": "nonsense"}).status_code == 422
    provider.generate.assert_called_once()


@pytest.mark.parametrize("count", [0, 1, 10, 11, 20, 21])
def test_pagination_boundaries(api, count):
    client, provider = api
    provider.generate.return_value = [
        {"id": str(i), "title": "Title", "content": "Content", "metadata": {}} for i in range(count)
    ]
    first = submit(client).json()
    assert first["pagination"]["totalItems"] == count
    assert first["pagination"]["hasMore"] == (count > 10)
    assert first["pagination"]["totalPages"] == max(1, (count + 9) // 10)
    assert len(first["insights"]) == min(count, 10)


@pytest.mark.parametrize("language", ["en", "es", "fr", "de"])
def test_language_selects_localized_fixtures(api, language):
    client, _ = api
    result = submit(client, targetLanguage=language).json()
    assert result["targetLanguage"] == language
    assert all(item["metadata"]["language"] == language for item in result["insights"])
    assert (
        result["insights"][0]["title"] == LocalInsightProvider().generate("", language)[0]["title"]
    )


def test_context_and_request_errors_are_structured(api):
    client, provider = api
    assert submit(client, contextId=str(uuid4())).json()["error"] == "CONTEXT_NOT_FOUND"
    assert client.get(f"/api/requests/{uuid4()}/insights").json()["error"] == "REQUEST_NOT_FOUND"
    pending = submit(client, prompt="hi").json()
    assert client.get(f"/api/requests/{pending['requestId']}/insights").status_code == 409
    provider.generate.assert_not_called()


def test_malformed_json_returns_safe_structured_error(api):
    client, provider = api
    result = client.post(
        "/api/prompts", content="{bad", headers={"content-type": "application/json"}
    )
    assert result.status_code == 422
    assert result.json()["error"] == "INVALID_REQUEST"
    assert "input" not in result.json()
    provider.generate.assert_not_called()


def test_unexpected_provider_failure_returns_safe_error(api):
    client, provider = api
    provider.generate.side_effect = RuntimeError("private implementation detail")
    result = submit(client)
    assert result.status_code == 500
    assert result.json()["error"] == "INTERNAL_ERROR"
    assert "private implementation detail" not in result.text


def test_results_survive_application_restart(tmp_path):
    path = str(tmp_path / "persistent.sqlite3")
    with TestClient(create_app(path)) as client:
        data = submit(client).json()
    provider = Mock()
    with TestClient(create_app(path, provider)) as client:
        assert client.get(f"/api/requests/{data['requestId']}/insights").json() == data
    provider.generate.assert_not_called()

"""Verify a running app through its actual HTTP origin (uses local demo requests)."""

import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

origin = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"


def request(path, body=None):
    payload = json.dumps(body).encode() if body is not None else None
    req = Request(
        origin + path, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urlopen(req, timeout=10) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


status, health = request("/api/health")
assert status == 200 and health["status"] == "ok"
status, short = request("/api/prompts", {"prompt": "hi", "targetLanguage": "en"})
assert status == 200 and short["status"] == "NEEDS_CLARIFICATION"
status, first = request(
    "/api/prompts",
    {
        "prompt": "How can we improve customer onboarding?",
        "targetLanguage": "fr",
        "contextId": short["contextId"],
    },
)
assert status == 200 and len(first["insights"]) == 10
assert first["contextId"] == short["contextId"]
assert first["insights"][0]["metadata"]["language"] == "fr"
status, second = request(f"/api/requests/{first['requestId']}/insights?page=2")
assert status == 200 and len(second["insights"]) == 2
assert second["pagination"]["nextPage"] is None
status, invalid = request(
    "/api/prompts", {"prompt": "A detailed prompt", "targetLanguage": "xx"}
)
assert status == 422 and invalid["error"] == "INVALID_LANGUAGE"
print(
    "HTTP smoke test passed: health, clarification, follow-up, localization, pagination, validation."
)

import os

os.environ.setdefault("LLM_PROVIDER", "mock")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_full_conversation_flow_reaches_core_complete():
    resp = client.post("/api/session")
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    answers = [
        "Jane Smith",
        "1 Main St, Springfield",
        "yes",
        "no",
        "James Smith",
        "brother",
    ]
    last = None
    for answer in answers:
        last = client.post(f"/api/session/{session_id}/message", json={"message": answer})
        assert last.status_code == 200

    assert last.json()["core_complete"] is True
    assert "Jane Smith" in last.json()["document"]


def test_unknown_session_returns_404():
    resp = client.post("/api/session/does-not-exist/message", json={"message": "hi"})
    assert resp.status_code == 404


def test_empty_message_rejected():
    session_id = client.post("/api/session").json()["session_id"]
    resp = client.post(f"/api/session/{session_id}/message", json={"message": "   "})
    assert resp.status_code == 400


def test_state_and_document_endpoints_reflect_latest_confirmed_state():
    session_id = client.post("/api/session").json()["session_id"]
    client.post(f"/api/session/{session_id}/message", json={"message": "Jane Smith"})

    state = client.get(f"/api/session/{session_id}/state").json()
    assert state["full_name"] == "Jane Smith"

    doc = client.get(f"/api/session/{session_id}/document").json()["document"]
    assert "Jane Smith" in doc

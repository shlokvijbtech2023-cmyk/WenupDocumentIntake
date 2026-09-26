import asyncio
import os
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app, _SESSIONS, _cleanup_expired_sessions
from app.models import SessionData

client = TestClient(app)


def test_session_reset_clears_data():
    """Verify that resetting a session completely discards transient data for privacy."""
    resp = client.post("/api/session")
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    # Post some sensitive personal intake data
    client.post(f"/api/session/{session_id}/message", json={"message": "Alice Montgomery"})
    assert session_id in _SESSIONS

    # Reset session via POST
    reset_resp = client.post(f"/api/session/{session_id}/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["status"] == "ok"
    assert session_id not in _SESSIONS

    # Subsequent access should 404
    get_resp = client.get(f"/api/session/{session_id}/state")
    assert get_resp.status_code == 404


def test_session_delete_endpoint_clears_data():
    """Verify DELETE /api/session/{id} removes session."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]
    assert session_id in _SESSIONS

    del_resp = client.delete(f"/api/session/{session_id}")
    assert del_resp.status_code == 200
    assert session_id not in _SESSIONS


def test_session_expiration_cleanup():
    """Verify that sessions exceeding TTL are pruned."""
    old_session_id = "old-session-123"
    old_session = SessionData(session_id=old_session_id)
    # Set created_at to 3 hours ago
    old_session.created_at = time.time() - 10800
    old_session.updated_at = time.time() - 10800
    _SESSIONS[old_session_id] = old_session

    fresh_session_id = "fresh-session-456"
    fresh_session = SessionData(session_id=fresh_session_id)
    _SESSIONS[fresh_session_id] = fresh_session

    _cleanup_expired_sessions()

    assert old_session_id not in _SESSIONS
    assert fresh_session_id in _SESSIONS

    # Clean up
    _SESSIONS.pop(fresh_session_id, None)


def test_children_cleared_when_has_children_corrected_to_false():
    """Domain rule: when user explicitly corrects has_children to False,
    previously recorded children_names must be cleared."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    # Step 1: name
    client.post(f"/api/session/{session_id}/message", json={"message": "John Doe"})
    # Step 2: address
    client.post(f"/api/session/{session_id}/message", json={"message": "10 Downing St"})
    # Step 3: worldwide
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    # Step 4: children
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    # Step 5: names
    r5 = client.post(f"/api/session/{session_id}/message", json={"message": "Tom, Jerry"})
    state5 = r5.json()["state"]
    assert state5["has_children"] is True
    assert state5["children_names"] == ["Tom", "Jerry"]

    # Step 6: Correction - "actually no, I don't have children"
    r6 = client.post(f"/api/session/{session_id}/message", json={"message": "actually no, I don't have children"})
    state6 = r6.json()["state"]
    assert state6["has_children"] is False
    assert state6["children_names"] == []

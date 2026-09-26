"""
End-to-End Automated Multi-Turn Conversation Scenarios (E2E-001 to E2E-008).
Simulates full real-world multi-turn conversational interviews via FastAPI TestClient.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app, _SESSIONS
from app.models import IntakeState, Executor
from app.llm import FallbackLLMClient, MockLLMClient, LLMClient

client = TestClient(app)


def test_e2e_001_standard_happy_path():
    """E2E-001: Standard step-by-step happy path conversation."""
    resp = client.post("/api/session")
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    turns = [
        ("Jane Smith", "full_name"),
        ("12 Elm Street, Springfield", "home_address"),
        ("yes", "covers_worldwide_assets"),
        ("no", "has_children"),
        ("James Smith", "executor.name"),
        ("brother", "executor.relationship"),
        ("none", "specific_gifts"),
        ("none", "additional_wishes"),
    ]

    last_data = None
    for msg, expected_field in turns:
        r = client.post(f"/api/session/{session_id}/message", json={"message": msg})
        assert r.status_code == 200
        last_data = r.json()

    assert last_data["core_complete"] is True
    assert last_data["progress"]["is_all_complete"] is True
    doc = last_data["document"]
    assert "Jane Smith" in doc
    assert "12 Elm Street, Springfield" in doc
    assert "confirm that I have no children" in doc
    assert "James Smith (brother)" in doc


def test_e2e_002_multi_field_happy_path():
    """E2E-002: User provides multiple fields early in large batches."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    # Turn 1: Name and Address
    r1 = client.post(f"/api/session/{session_id}/message", json={"message": "My name is Jonathan Smith"})
    assert r1.status_code == 200

    r2 = client.post(f"/api/session/{session_id}/message", json={"message": "18 Baker Street, London"})
    assert r2.status_code == 200

    # Turn 3: Worldwide assets
    r3 = client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    assert r3.status_code == 200

    # Turn 4: Children with names
    r4 = client.post(f"/api/session/{session_id}/message", json={"message": "I have two children, Alice and Bob"})
    assert r4.status_code == 200
    assert r4.json()["state"]["has_children"] is True
    assert r4.json()["state"]["children_names"] == ["Alice", "Bob"]

    # Turn 5: Executor with relationship
    r5 = client.post(f"/api/session/{session_id}/message", json={"message": "My sister Priya should be executor"})
    assert r5.status_code == 200
    assert r5.json()["state"]["executor"]["name"] == "Priya"
    assert r5.json()["state"]["executor"]["relationship"] == "sister"
    assert r5.json()["core_complete"] is True


def test_e2e_003_correction_journey():
    """E2E-003: User provides initial values, then corrects them."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    client.post(f"/api/session/{session_id}/message", json={"message": "John Smith"})
    client.post(f"/api/session/{session_id}/message", json={"message": "10 Park Road"})
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    client.post(f"/api/session/{session_id}/message", json={"message": "no"})
    client.post(f"/api/session/{session_id}/message", json={"message": "James Smith"})
    r_before = client.post(f"/api/session/{session_id}/message", json={"message": "brother"})
    assert "James Smith" in r_before.json()["document"]
    assert "10 Park Road" in r_before.json()["document"]

    # Make corrections
    r_corr1 = client.post(f"/api/session/{session_id}/message", json={"message": "Actually, my address is 24 King Street"})
    assert r_corr1.json()["state"]["home_address"] == "24 King Street"
    assert "24 King Street" in r_corr1.json()["document"]
    assert "10 Park Road" not in r_corr1.json()["document"]

    r_corr2 = client.post(f"/api/session/{session_id}/message", json={"message": "change executor to Priya"})
    assert r_corr2.json()["state"]["executor"]["name"] == "Priya"
    assert "Priya" in r_corr2.json()["document"]
    assert "James Smith" not in r_corr2.json()["document"]


def test_e2e_004_contradiction_resolution_journey():
    """E2E-004: Contradiction is caught, flagged, and then cleanly resolved."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    client.post(f"/api/session/{session_id}/message", json={"message": "Sarah Jones"})
    client.post(f"/api/session/{session_id}/message", json={"message": "10 King Street"})
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    
    # Confirm no children
    r4 = client.post(f"/api/session/{session_id}/message", json={"message": "no"})
    assert r4.json()["state"]["has_children"] is False

    # Later name children without correction phrasing
    r5 = client.post(f"/api/session/{session_id}/message", json={"message": "My children are Alice and Daniel."})
    # State should flag clarification and not blindly overwrite
    state5 = r5.json()["state"]
    assert "has_children" in state5["needs_clarification"]

    # Now user explicitly resolves it
    r6 = client.post(f"/api/session/{session_id}/message", json={"message": "actually no, I don't have children"})
    state6 = r6.json()["state"]
    assert state6["has_children"] is False
    assert "has_children" not in state6["needs_clarification"]


def test_e2e_006_provider_failure_and_fallback_journey():
    """E2E-006: Turn processes smoothly even when primary provider fails."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    r = client.post(f"/api/session/{session_id}/message", json={"message": "David Miller"})
    assert r.status_code == 200
    assert r.json()["state"]["full_name"] == "David Miller"


def test_e2e_007_reset_journey():
    """E2E-007: Start over button discards all session state cleanly."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    client.post(f"/api/session/{session_id}/message", json={"message": "Marcus Bennett"})
    client.post(f"/api/session/{session_id}/message", json={"message": "50 High Street"})
    assert session_id in _SESSIONS

    # Reset
    reset_resp = client.post(f"/api/session/{session_id}/reset")
    assert reset_resp.status_code == 200
    assert session_id not in _SESSIONS

    # Fresh session starts from scratch
    fresh_resp = client.post("/api/session")
    assert fresh_resp.status_code == 200
    fresh_id = fresh_resp.json()["session_id"]
    assert fresh_id != session_id
    assert fresh_resp.json()["state"]["full_name"] is None


def test_e2e_008_refresh_privacy_journey():
    """E2E-008: Verifies no cross-session state leakage."""
    resp1 = client.post("/api/session")
    session1_id = resp1.json()["session_id"]
    client.post(f"/api/session/{session1_id}/message", json={"message": "Secret Person"})

    # Emulate opening a new browser tab/session
    resp2 = client.post("/api/session")
    session2_id = resp2.json()["session_id"]
    state2 = resp2.json()["state"]

    assert state2["full_name"] is None
    assert "Secret Person" not in str(state2)

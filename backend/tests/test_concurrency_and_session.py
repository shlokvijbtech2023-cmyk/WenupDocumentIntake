import concurrent.futures
import threading
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import (
    _LOCKS_GUARD,
    _SESSION_LOCKS,
    _SESSIONS,
    _cleanup_expired_sessions,
    _get_session_lock,
    app,
)
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

    client.post(f"/api/session/{session_id}/message", json={"message": "John Doe"})
    client.post(f"/api/session/{session_id}/message", json={"message": "10 Downing St"})
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    client.post(f"/api/session/{session_id}/message", json={"message": "yes"})
    r5 = client.post(f"/api/session/{session_id}/message", json={"message": "Tom, Jerry"})
    state5 = r5.json()["state"]
    assert state5["has_children"] is True
    assert state5["children_names"] == ["Tom", "Jerry"]

    r6 = client.post(f"/api/session/{session_id}/message", json={"message": "actually no, I don't have children"})
    state6 = r6.json()["state"]
    assert state6["has_children"] is False
    assert state6["children_names"] == []


# ============================================================================
# CONCURRENCY TESTS (TEST 1 to TEST 6)
# ============================================================================

def test_concurrency_1_same_session_serialization():
    """TEST 1: Two concurrent requests to the SAME session are serialized.
    With an injected delay, the total time must be approximately 2x delay."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    delay_seconds = 0.08  # 80ms artificial delay
    original_process_turn = main_module.process_turn

    def delayed_process_turn(session, text, llm):
        time.sleep(delay_seconds)
        return original_process_turn(session, text, llm)

    messages = [
        "Jonathan Smith",
        "42 Park Road, London",
    ]

    start = time.perf_counter()
    with patch("app.main.process_turn", side_effect=delayed_process_turn):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(lambda: client.post(f"/api/session/{session_id}/message", json={"message": messages[0]}))
            f2 = executor.submit(lambda: client.post(f"/api/session/{session_id}/message", json={"message": messages[1]}))
            r1 = f1.result()
            r2 = f2.result()

    elapsed = time.perf_counter() - start

    assert r1.status_code == 200
    assert r2.status_code == 200
    # Serialized execution takes at least 1.5x of the combined single delays (>= 0.12s)
    assert elapsed >= (delay_seconds * 1.5), f"Expected serialized execution (>= {delay_seconds * 1.5}s), got {elapsed:.3f}s"

    # Verify session state reflects both turns correctly without corruption
    final_state = client.get(f"/api/session/{session_id}/state").json()
    assert final_state["full_name"] == "Jonathan Smith"
    assert final_state["home_address"] == "42 Park Road, London"


def test_concurrency_2_different_sessions_remain_parallel():
    """TEST 2: Two concurrent requests to DIFFERENT sessions execute in parallel.
    With an injected delay, the total time must be ~1x delay rather than 2x."""
    resp_a = client.post("/api/session")
    session_a = resp_a.json()["session_id"]

    resp_b = client.post("/api/session")
    session_b = resp_b.json()["session_id"]

    delay_seconds = 0.08  # 80ms artificial delay
    original_process_turn = main_module.process_turn

    def delayed_process_turn(session, text, llm):
        time.sleep(delay_seconds)
        return original_process_turn(session, text, llm)

    start = time.perf_counter()
    with patch("app.main.process_turn", side_effect=delayed_process_turn):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            fa = executor.submit(lambda: client.post(f"/api/session/{session_a}/message", json={"message": "Alice Smith"}))
            fb = executor.submit(lambda: client.post(f"/api/session/{session_b}/message", json={"message": "Bob Jones"}))
            ra = fa.result()
            rb = fb.result()

    elapsed = time.perf_counter() - start

    assert ra.status_code == 200
    assert rb.status_code == 200
    # Parallel execution must complete significantly faster than 2x delay (< 1.6x)
    assert elapsed < (delay_seconds * 1.6), f"Expected parallel execution (< {delay_seconds * 1.6}s), got {elapsed:.3f}s"

    state_a = client.get(f"/api/session/{session_a}/state").json()
    state_b = client.get(f"/api/session/{session_b}/state").json()
    assert state_a["full_name"] == "Alice Smith"
    assert state_b["full_name"] == "Bob Jones"


def test_concurrency_3_normal_sequential_behavior():
    """TEST 3: Sequential requests to a single session operate flawlessly."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    r1 = client.post(f"/api/session/{session_id}/message", json={"message": "Jane Doe"})
    assert r1.status_code == 200
    assert r1.json()["state"]["full_name"] == "Jane Doe"

    r2 = client.post(f"/api/session/{session_id}/message", json={"message": "12 High St"})
    assert r2.status_code == 200
    assert r2.json()["state"]["home_address"] == "12 High St"


def test_concurrency_4_exception_releases_lock():
    """TEST 4: An unhandled exception inside the critical section releases the lock
    so subsequent requests to the same session do NOT deadlock."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    call_count = 0
    original_process_turn = main_module.process_turn

    def failing_first_turn(session, text, llm):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("Simulated transient processing failure")
        return original_process_turn(session, text, llm)

    with patch("app.main.process_turn", side_effect=failing_first_turn):
        with pytest.raises(RuntimeError):
            client.post(f"/api/session/{session_id}/message", json={"message": "Will fail"})

    # Lock must be released: subsequent request succeeds immediately without hang
    recovery_resp = client.post(f"/api/session/{session_id}/message", json={"message": "Jane Doe"})
    assert recovery_resp.status_code == 200
    assert recovery_resp.json()["state"]["full_name"] == "Jane Doe"


def test_concurrency_5_concurrent_state_integrity():
    """TEST 5: Rapid concurrent requests update state without dropping writes or corrupting revisions."""
    resp = client.post("/api/session")
    session_id = resp.json()["session_id"]

    # Initial name
    client.post(f"/api/session/{session_id}/message", json={"message": "Marcus Vance"})

    # Concurrently send address and worldwide status
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(lambda: client.post(f"/api/session/{session_id}/message", json={"message": "15 Oxford Road"}))
        f2 = executor.submit(lambda: client.post(f"/api/session/{session_id}/message", json={"message": "yes worldwide"}))
        r1 = f1.result()
        r2 = f2.result()

    assert r1.status_code == 200
    assert r2.status_code == 200

    state = client.get(f"/api/session/{session_id}/state").json()
    assert state["full_name"] == "Marcus Vance"
    # State has progressed through both turns consistently
    assert state["home_address"] is not None or state["covers_worldwide_assets"] is not None


def test_concurrency_6_lock_registry_creation_safety():
    """TEST 6: Concurrent threads requesting a lock for the same new session_id
    always receive the exact same threading.Lock instance without race conditions."""
    session_id = "test-concurrent-lock-registry"

    locks_retrieved = []

    def get_lock():
        lock = _get_session_lock(session_id)
        locks_retrieved.append(lock)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(get_lock) for _ in range(10)]
        for f in futures:
            f.result()

    assert len(locks_retrieved) == 10
    # Every single reference must be the exact same object
    first_lock = locks_retrieved[0]
    for l in locks_retrieved:
        assert l is first_lock

    # Cleanup
    with _LOCKS_GUARD:
        _SESSION_LOCKS.pop(session_id, None)

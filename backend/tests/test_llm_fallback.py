from app.llm import FallbackLLMClient, MockLLMClient
from app.models import IntakeState, Turn


class _AlwaysFailsClient:
    """Simulates a real provider that's down / has a bad key."""
    def extract(self, history, state, next_field):
        return {"updates": [], "assistant_message": "", "_error": "llm_call_failed: connection refused"}


class _RaisesClient:
    """Simulates a provider SDK that raises instead of returning cleanly."""
    def extract(self, history, state, next_field):
        raise ConnectionError("boom")


class _AlwaysWorksClient:
    def __init__(self):
        self.calls = 0

    def extract(self, history, state, next_field):
        self.calls += 1
        return {"updates": [{"field": "full_name", "value": "Jane Smith", "status": "set"}],
                "assistant_message": "Got it."}


def test_successful_primary_is_used_and_tagged():
    primary = _AlwaysWorksClient()
    client = FallbackLLMClient(primary, MockLLMClient())
    result = client.extract([Turn(role="user", content="Jane Smith")], IntakeState(), "full_name")

    assert result["_provider"] == "primary"
    assert primary.calls == 1
    assert result["updates"][0]["field"] == "full_name"


def test_primary_error_response_falls_back_to_backup():
    client = FallbackLLMClient(_AlwaysFailsClient(), MockLLMClient())
    result = client.extract(
        [Turn(role="user", content="Jane Smith")], IntakeState(), "full_name"
    )

    assert result["_provider"] == "mock_fallback"
    assert "llm_call_failed" in result["_primary_error"]
    # backup actually produced a usable extraction, not an empty stall
    assert result["updates"][0]["field"] == "full_name"
    assert result["updates"][0]["value"] == "Jane Smith"


def test_primary_raising_an_exception_also_falls_back():
    client = FallbackLLMClient(_RaisesClient(), MockLLMClient())
    result = client.extract(
        [Turn(role="user", content="Jane Smith")], IntakeState(), "full_name"
    )

    assert result["_provider"] == "mock_fallback"
    assert "boom" in result["_primary_error"]


def test_conversation_continues_seamlessly_through_a_primary_outage(fresh_session=None):
    from app.conversation import process_turn
    from app.models import SessionData

    session = SessionData(session_id="fallback-test")
    client = FallbackLLMClient(_AlwaysFailsClient(), MockLLMClient())
    result = process_turn(session, "Jane Smith", client)

    assert result["ok"] is True  # not the generic "couldn't reach model" failure path
    assert result["llm_provider_used"] == "mock_fallback"
    assert session.state.full_name == "Jane Smith"

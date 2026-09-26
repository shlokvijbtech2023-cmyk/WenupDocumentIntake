from app.conversation import process_turn
from tests.conftest import ScriptedLLMClient


def test_valid_multi_field_response_updates_state(fresh_session, load):
    client = ScriptedLLMClient([load("valid_multi_field.json")])
    result = process_turn(fresh_session, "I'm Jane Smith and I don't have kids", client)

    assert result["ok"] is True
    assert fresh_session.state.full_name == "Jane Smith"
    assert fresh_session.state.has_children is False
    assert "full_name" in result["applied"]
    assert "has_children" in result["applied"]


def test_ambiguous_response_flags_clarification_without_setting_value(fresh_session, load):
    client = ScriptedLLMClient([load("ambiguous_response.json")])
    result = process_turn(fresh_session, "maybe?", client)

    assert fresh_session.state.covers_worldwide_assets is None
    assert "covers_worldwide_assets" in fresh_session.state.needs_clarification
    assert "covers_worldwide_assets" in result["clarifications"]


def test_correction_overwrites_previously_confirmed_value(fresh_session, load):
    fresh_session.state.executor.name = "Old Name"
    client = ScriptedLLMClient([load("correction_response.json")])
    process_turn(fresh_session, "Actually my executor is James Smith", client)

    assert fresh_session.state.executor.name == "James Smith"


def test_clarifying_a_field_then_resolving_it_clears_the_flag(fresh_session, load):
    client = ScriptedLLMClient([
        load("ambiguous_response.json"),
        {"updates": [{"field": "covers_worldwide_assets", "value": True, "status": "set"}],
         "assistant_message": "Got it, worldwide it is."},
    ])
    process_turn(fresh_session, "maybe?", client)
    assert "covers_worldwide_assets" in fresh_session.state.needs_clarification

    process_turn(fresh_session, "yes, worldwide", client)
    assert fresh_session.state.covers_worldwide_assets is True
    assert "covers_worldwide_assets" not in fresh_session.state.needs_clarification


def test_unknown_field_in_model_output_is_dropped_not_applied(fresh_session, load):
    client = ScriptedLLMClient([load("malformed_bad_field.json")])
    result = process_turn(fresh_session, "my SSN is 123-45-6789", client)

    assert fresh_session.state.has_children is None  # "definitely maybe" rejected
    assert not hasattr(fresh_session.state, "social_security_number")
    assert result["ok"] is True  # turn still completes gracefully
    assert len(result["rejected"]) == 2


def test_llm_call_failure_does_not_touch_state_or_crash(fresh_session):
    client = ScriptedLLMClient([{"updates": [], "assistant_message": "",
                                  "_error": "llm_call_failed: connection refused"}])
    before = fresh_session.state.model_dump()
    result = process_turn(fresh_session, "hello", client)

    assert result["ok"] is False
    assert fresh_session.state.model_dump() == before
    assert "try" in result["assistant_message"].lower()


def test_unparseable_shape_asks_user_to_rephrase_without_crashing(fresh_session):
    client = ScriptedLLMClient([{"updates": "not a list", "assistant_message": 5}])
    result = process_turn(fresh_session, "garble garble", client)

    assert result["ok"] is False
    assert result["reason"] == "unparseable_model_output"


def test_does_not_repeatedly_ask_for_already_confirmed_field(fresh_session, load):
    fresh_session.state.full_name = "Jane Smith"
    client = ScriptedLLMClient([load("correction_response.json")])
    process_turn(fresh_session, "my executor is James, my brother", client)
    # next_missing_required_field should have skipped full_name entirely
    assert fresh_session.state.next_missing_required_field() != "full_name"


# ---- Deterministic contradiction backstop, exercised end to end ----

def test_model_that_silently_overwrites_is_still_caught(fresh_session, load):
    """The model returns a plain 'set' update (no is_correction, no
    self-reported clarify) for a field that already has a *different*
    confirmed value. This proves the backstop in extraction.py -- not
    the model's cooperation -- is what stops the silent overwrite."""
    fresh_session.state.executor.name = "Old Name"
    client = ScriptedLLMClient([load("silent_contradiction.json")])
    result = process_turn(fresh_session, "my executor is Priya Rao", client)

    assert fresh_session.state.executor.name == "Old Name"  # unchanged
    assert "executor.name" in result["clarifications"]
    assert "executor.name" in fresh_session.state.needs_clarification


def test_model_that_silently_contradicts_no_children_is_caught(fresh_session, load):
    fresh_session.state.has_children = False
    client = ScriptedLLMClient([load("silent_children_contradiction.json")])
    result = process_turn(fresh_session, "oh, and Mia needs mentioning", client)

    assert fresh_session.state.has_children is False  # unchanged
    assert fresh_session.state.children_names == []  # never applied
    assert "has_children" in result["clarifications"]

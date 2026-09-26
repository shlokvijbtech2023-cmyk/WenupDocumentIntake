"""
Multi-Field Extraction and Question Planner Regression Suite.

Verifies end-to-end extraction across complex, multi-field, out-of-order,
and negative statements without restricting extraction to the currently asked question.
Guarantees canonical state is updated before question planning selects the next missing field.
"""
import pytest
from app.models import SessionData, IntakeState, Executor
from app.llm import MockLLMClient, get_llm_client
from app.conversation import process_turn
from app.extraction import validate_updates, ExtractionResult, FieldUpdate


@pytest.fixture
def mock_client():
    return MockLLMClient()


def test_multi_001_sarah_wilson_exact_regression(mock_client):
    """TEST-MULTI-001: Exact bug scenario reported during manual QA."""
    session = SessionData(session_id="multi-001")
    # Initial question was full_name
    msg = "My name is Sarah Wilson. I don't have any children and my executor is Daniel Wilson, who is my brother."
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.full_name == "Sarah Wilson"
    assert session.state.has_children is False
    assert session.state.children_names == []
    assert session.state.executor.name == "Daniel Wilson"
    assert session.state.executor.relationship == "brother"

    # The planner must not ask for full_name again; must ask for home_address
    assert "full name" not in res["assistant_message"].lower()
    assert "home address" in res["assistant_message"].lower()
    assert session.state.next_missing_required_field() == "home_address"


def test_multi_002_all_core_fields_in_one_turn(mock_client):
    """TEST-MULTI-002: Five core fields populated in a single turn."""
    session = SessionData(session_id="multi-002")
    msg = ("My name is Arjun Mehta, I live at 42 Park Street, Kolkata, "
           "I have worldwide assets, I have two children named Aarav and Riya, "
           "and my executor is Daniel Mehta, my brother.")
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.full_name == "Arjun Mehta"
    assert session.state.home_address == "42 Park Street, Kolkata"
    assert session.state.covers_worldwide_assets is True
    assert session.state.has_children is True
    assert session.state.children_names == ["Aarav", "Riya"]
    assert session.state.executor.name == "Daniel Mehta"
    assert session.state.executor.relationship == "brother"

    # All required fields complete -> moves to specific gifts
    assert session.state.is_core_complete() is True
    assert "specific gifts" in res["assistant_message"].lower()


def test_multi_003_explicit_negatives_do_not_become_unknown(mock_client):
    """TEST-MULTI-003: Negative answers stored as explicit False/empty, not None/unknown."""
    session = SessionData(session_id="multi-003")
    msg = "I don't have children, I don't have worldwide assets, and I don't have any specific gifts."
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.has_children is False
    assert session.state.children_names == []
    assert session.state.covers_worldwide_assets is False
    assert session.state.specific_gifts == []
    assert session.state.gifts_addressed is True


def test_multi_004_executor_name_and_relationship(mock_client):
    """TEST-MULTI-004: Joint executor name and relationship extraction."""
    session = SessionData(session_id="multi-004")
    session.state.full_name = "Jane Smith"
    session.state.home_address = "10 London Road"
    session.state.covers_worldwide_assets = False
    session.state.has_children = False

    res = process_turn(session, "My executor is Priya Shah, my sister.", mock_client)

    assert res["ok"] is True
    assert session.state.executor.name == "Priya Shah"
    assert session.state.executor.relationship == "sister"
    assert session.state.executor.is_complete() is True


def test_multi_005_children_and_names(mock_client):
    """TEST-MULTI-005: Extract has_children=True and list of child names."""
    session = SessionData(session_id="multi-005")
    res = process_turn(session, "I have two children, Aarav and Meera.", mock_client)

    assert res["ok"] is True
    assert session.state.has_children is True
    assert session.state.children_names == ["Aarav", "Meera"]


def test_multi_006_name_address_children_and_executor(mock_client):
    """TEST-MULTI-006: Multi-field extraction with corrections."""
    session = SessionData(session_id="multi-006")
    msg = "My name is Rahul. Actually I live at 22 MG Road, Pune, I have no children, and my executor is Amit, my brother."
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.full_name == "Rahul"
    assert session.state.home_address == "22 MG Road, Pune"
    assert session.state.has_children is False
    assert session.state.children_names == []
    assert session.state.executor.name == "Amit"
    assert session.state.executor.relationship == "brother"


def test_multi_007_long_natural_language_comprehensive(mock_client):
    """TEST-MULTI-007: Equivalent natural language phrasing."""
    session = SessionData(session_id="multi-007")
    msg = "My name's Sarah Wilson. I have no kids. Daniel Wilson is my brother and executor."
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.full_name == "Sarah Wilson"
    assert session.state.has_children is False
    assert session.state.executor.name == "Daniel Wilson"
    assert session.state.executor.relationship == "brother"
    assert "home address" in res["assistant_message"].lower()


def test_multi_008_out_of_order_extraction(mock_client):
    """TEST-MULTI-008: Extraction order is completely independent of question order."""
    session = SessionData(session_id="multi-008")
    # Sentence gives executor first, worldwide assets second, address third, and name last
    msg = "Executor Daniel Wilson my brother, worldwide assets yes, live at 10 Downing Street London, name is Sarah Wilson, no children."
    res = process_turn(session, msg, mock_client)

    assert res["ok"] is True
    assert session.state.full_name == "Sarah Wilson"
    assert session.state.home_address == "10 Downing Street London"
    assert session.state.covers_worldwide_assets is True
    assert session.state.has_children is False
    assert session.state.executor.name == "Daniel Wilson"
    assert session.state.executor.relationship == "brother"
    assert session.state.is_core_complete() is True


def test_invalid_field_assignment_protection(mock_client):
    """Field-aware validation rejects relationship words for full_name."""
    session = SessionData(session_id="invalid-val-001")
    # Current question is full_name
    res = process_turn(session, "Brother", mock_client)

    # Must NOT set full_name = "Brother"
    assert session.state.full_name != "Brother"
    assert session.state.full_name is None
    # Must still ask for full name
    assert session.state.next_missing_required_field() == "full_name"


def test_relationship_valid_in_correct_context(mock_client):
    """Relationship words are valid when answering executor.relationship."""
    session = SessionData(session_id="valid-rel-001")
    session.state.full_name = "Sarah Wilson"
    session.state.home_address = "42 Park Lane"
    session.state.covers_worldwide_assets = True
    session.state.has_children = False
    session.state.executor.name = "Daniel Wilson"

    res = process_turn(session, "Brother", mock_client)
    assert res["ok"] is True
    assert session.state.executor.relationship == "brother"
    assert session.state.executor.is_complete() is True


def test_question_planner_uses_fresh_canonical_state(mock_client):
    """Question planner evaluates next missing field AFTER canonical mutations."""
    session = SessionData(session_id="planner-001")
    assert session.state.next_missing_required_field() == "full_name"

    res = process_turn(session, "I am Sarah Wilson and I have no children.", mock_client)

    assert session.state.full_name == "Sarah Wilson"
    assert session.state.has_children is False
    # Next field must be home_address, NOT full_name or has_children
    assert session.state.next_missing_required_field() == "home_address"
    assert "home address" in res["assistant_message"].lower()

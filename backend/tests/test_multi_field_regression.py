"""
Regression tests for multi-field natural-language extraction,
field mapping, zero-dump gift/wish safety, and question planning.
"""
import pytest
from app.models import SessionData, IntakeState
from app.conversation import process_turn
from app.llm import MockLLMClient


def test_alex_morgan_single_turn_all_9_fields():
    """Exact regression test for the single-turn 9-field input."""
    session = SessionData(session_id="alex-morgan-test")
    client = MockLLMClient()
    user_msg = (
        "I’m Alex Morgan. My executor is my sister Emily Morgan. I live at 42 Park Lane, "
        "Manchester. I have two children, Olivia and Ethan. I own assets in the UK and "
        "the US. I’d like my watch to go to my brother James, and my grandmother’s ring "
        "to go to Olivia. As for my other wishes, I’d like everything to be handled "
        "peacefully and I want my family to stay in touch."
    )

    resp = process_turn(session, user_msg, client)

    assert resp["ok"] is True
    state = session.state

    # 1. Full name
    assert state.full_name == "Alex Morgan"

    # 2. Home address
    assert state.home_address == "42 Park Lane, Manchester"

    # 3. Worldwide assets
    assert state.covers_worldwide_assets is True

    # 4. Children
    assert state.has_children is True
    assert "Olivia" in state.children_names
    assert "Ethan" in state.children_names
    assert len(state.children_names) == 2

    # 5. Executor & relationship
    assert state.executor.name == "Emily Morgan"
    assert state.executor.relationship == "sister"

    # 6. Specific gifts (must NOT be the whole message!)
    assert state.specific_gifts != [user_msg]
    assert state.specific_gifts != user_msg
    assert len(state.specific_gifts) >= 2
    gift_str = " ".join(state.specific_gifts).lower()
    assert "watch" in gift_str and "james" in gift_str
    assert "ring" in gift_str and "olivia" in gift_str
    assert "i live at 42 park lane" not in gift_str

    # 7. Additional wishes (must NOT be the whole message!)
    assert state.additional_wishes != user_msg
    assert state.additional_wishes is not None
    assert "peacefully" in state.additional_wishes.lower()
    assert "stay in touch" in state.additional_wishes.lower()
    assert "alex morgan" not in state.additional_wishes.lower()

    # 8. Core & All completion
    assert state.is_core_complete() is True
    assert state.gifts_addressed is True
    assert state.wishes_addressed is True
    assert state.next_outstanding_field() is None

    # 9. Assistant response must NOT ask for full name or repeat questions
    assert "what is your full name" not in resp["assistant_message"].lower()
    assert "what's your full name" not in resp["assistant_message"].lower()
    assert "have everything i need" in resp["assistant_message"].lower()


def test_field_mapping_a_name_only():
    """Test A: My name is Sarah Wilson."""
    session = SessionData(session_id="test-a")
    client = MockLLMClient()
    resp = process_turn(session, "My name is Sarah Wilson.", client)
    assert resp["ok"] is True
    assert session.state.full_name == "Sarah Wilson"


def test_field_mapping_b_executor_brother():
    """Test B: My executor is my brother Daniel Wilson."""
    session = SessionData(session_id="test-b")
    client = MockLLMClient()
    resp = process_turn(session, "My executor is my brother Daniel Wilson.", client)
    assert resp["ok"] is True
    assert session.state.executor.name == "Daniel Wilson"
    assert session.state.executor.relationship == "brother"


def test_field_mapping_c_no_children():
    """Test C: I don't have any children."""
    session = SessionData(session_id="test-c")
    client = MockLLMClient()
    resp = process_turn(session, "I don't have any children.", client)
    assert resp["ok"] is True
    assert session.state.has_children is False
    assert session.state.children_names == []


def test_field_mapping_d_two_children():
    """Test D: I have two children, Olivia and Ethan."""
    session = SessionData(session_id="test-d")
    client = MockLLMClient()
    resp = process_turn(session, "I have two children, Olivia and Ethan.", client)
    assert resp["ok"] is True
    assert session.state.has_children is True
    assert session.state.children_names == ["Olivia", "Ethan"]


def test_field_mapping_e_address_rejects_relationship():
    """Test E: When asking for home address, user says 'Brother.' -> address unchanged."""
    session = SessionData(session_id="test-e")
    client = MockLLMClient()
    # State has no address
    session.state.full_name = "Sarah Wilson"
    assert session.state.next_outstanding_field() == "home_address"

    resp = process_turn(session, "Brother.", client)
    assert resp["ok"] is True
    # home_address must remain unset (None)
    assert session.state.home_address is None


@pytest.mark.parametrize("order_text,expected_name,expected_exec,expected_rel,expected_addr", [
    (
        "I'd like my watch to go to James. I live at 10 Downing Street, London. My executor is my wife Sarah Connor. As for my wishes, play jazz at my funeral. I am John Connor. I own assets worldwide and have three children, Tim and May.",
        "John Connor", "Sarah Connor", "wife", "10 Downing Street, London"
    ),
    (
        "I have two children, Leo and Mia. Appoint as my executor my solicitor Arthur Dent. My name is Priya Sharma. For my wishes, scatter ashes in the ocean. My address is 55 Baker Street, London. Specific gifts: give my car to Leo. I own assets in the UK and France.",
        "Priya Sharma", "Arthur Dent", "solicitor", "55 Baker Street, London"
    ),
])
def test_multi_field_order_invariance(order_text, expected_name, expected_exec, expected_rel, expected_addr):
    """Test that arbitrary order of semantic fields extracts cleanly without positional dependence."""
    session = SessionData(session_id="test-order")
    client = MockLLMClient()
    resp = process_turn(session, order_text, client)

    assert resp["ok"] is True
    state = session.state
    assert state.full_name == expected_name
    assert state.executor.name == expected_exec
    assert state.executor.relationship == expected_rel
    assert state.home_address == expected_addr
    assert state.covers_worldwide_assets is True
    assert state.has_children is True
    assert len(state.children_names) >= 2
    assert len(state.specific_gifts) >= 1
    assert state.additional_wishes != ""
    assert state.is_core_complete() is True


def test_shlok_and_gift_car_compound_name_and_gift():
    """Regression: 'Shlok and I want to gift a car' extracts Shlok as full_name
    and 'A car' as specific_gifts (never the entire sentence as full_name)."""
    session = SessionData(session_id="test-shlok-gift")
    client = MockLLMClient()
    resp = process_turn(session, "Shlok and I want to gift a car", client)

    assert resp["ok"] is True
    assert session.state.full_name == "Shlok"
    assert session.state.full_name != "Shlok and I want to gift a car"
    assert len(session.state.specific_gifts) >= 1
    assert any("car" in g.lower() for g in session.state.specific_gifts)
    # Next question should advance to home_address (or next missing core field)
    assert session.state.next_missing_required_field() == "home_address"


def test_i_am_shlok_and_i_want_to_give_a_car():
    """Regression: 'I am Shlok and I want to give a car' extracts Shlok as full_name
    and car as gift."""
    session = SessionData(session_id="test-shlok-give-car")
    client = MockLLMClient()
    resp = process_turn(session, "I am Shlok and I want to give a car", client)

    assert resp["ok"] is True
    assert session.state.full_name == "Shlok"
    assert len(session.state.specific_gifts) >= 1
    assert any("car" in g.lower() for g in session.state.specific_gifts)


def test_executor_refusal_no_one_requires_mandatory_explanation():
    """When asked for executor name, saying 'no one' does NOT set executor.name
    and informs the user that appointing an executor is mandatory."""
    session = SessionData(session_id="test-no-one-exec")
    session.state.full_name = "Shlok"
    session.state.home_address = "42 Park Lane"
    session.state.covers_worldwide_assets = True
    session.state.has_children = False
    assert session.state.next_missing_required_field() == "executor.name"

    client = MockLLMClient()
    resp = process_turn(session, "no one", client)

    assert resp["ok"] is True
    assert session.state.executor.name is None
    assert session.state.executor.relationship is None
    assert "mandatory" in resp["assistant_message"].lower()
    assert "relationship" not in resp["assistant_message"].lower()
    assert session.state.next_missing_required_field() == "executor.name"


def test_executor_refusal_i_dont_have_an_executor():
    """Saying 'I don't have an executor' or 'nobody' enforces mandatory explanation."""
    session = SessionData(session_id="test-dont-have-exec")
    session.state.full_name = "Shlok"
    session.state.home_address = "42 Park Lane"
    session.state.covers_worldwide_assets = True
    session.state.has_children = False

    client = MockLLMClient()
    resp = process_turn(session, "I don't have an executor", client)

    assert resp["ok"] is True
    assert session.state.executor.name is None
    assert "mandatory" in resp["assistant_message"].lower()
    assert session.state.next_missing_required_field() == "executor.name"


def test_compound_name_and_wishes_tricky_sentence():
    """'Shlok, please play jazz at my funeral' extracts Shlok as full_name and wish text."""
    session = SessionData(session_id="test-name-wish")
    client = MockLLMClient()
    resp = process_turn(session, "Shlok, please play jazz at my funeral", client)

    assert resp["ok"] is True
    assert session.state.full_name == "Shlok"
    assert session.state.additional_wishes is not None
    assert "jazz" in session.state.additional_wishes.lower()


def test_compound_name_address_and_executor():
    """'My name is Priya, I live at 14 Elm Rd and my brother James is my executor' extracts all 4 fields."""
    session = SessionData(session_id="test-priya-compound")
    client = MockLLMClient()
    resp = process_turn(session, "My name is Priya, I live at 14 Elm Rd and my brother James is my executor", client)

    assert resp["ok"] is True
    assert session.state.full_name == "Priya"
    assert session.state.home_address == "14 Elm Rd"
    assert session.state.executor.name == "James"
    assert session.state.executor.relationship == "brother"


def test_compound_name_no_kids_gift_to_nephew():
    """'I am Sarah Connor, I have no kids, give my watch to my nephew Tim' extracts name, negative children, and gift."""
    session = SessionData(session_id="test-sarah-no-kids-gift")
    client = MockLLMClient()
    resp = process_turn(session, "I am Sarah Connor, I have no kids, give my watch to my nephew Tim", client)

    assert resp["ok"] is True
    assert session.state.full_name == "Sarah Connor"
    assert session.state.has_children is False
    assert session.state.children_names == []
    assert any("watch" in g.lower() for g in session.state.specific_gifts)


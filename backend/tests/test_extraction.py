import pytest
from pydantic import ValidationError

from app.extraction import parse_extraction_result, validate_updates, ExtractionResult, FieldUpdate
from app.models import IntakeState, Executor


def test_valid_fixture_all_applied(load):
    raw = load("valid_multi_field.json")
    result = parse_extraction_result(raw)
    outcome = validate_updates(result, IntakeState())
    fields = {u.field for u in outcome.applied}
    assert fields == {"full_name", "has_children"}
    assert outcome.rejected == []
    assert outcome.clarifications == []


def test_ambiguous_fixture_becomes_clarification_not_applied(load):
    raw = load("ambiguous_response.json")
    result = parse_extraction_result(raw)
    outcome = validate_updates(result, IntakeState())
    assert outcome.applied == []
    assert len(outcome.clarifications) == 1
    assert outcome.clarifications[0].field == "covers_worldwide_assets"


def test_correction_fixture_applies_and_overwrites_confirmed_value(load):
    raw = load("correction_response.json")
    result = parse_extraction_result(raw)
    state = IntakeState(executor=Executor(name="Old Name"))  # something to correct
    outcome = validate_updates(result, state)
    assert len(outcome.applied) == 1
    assert outcome.applied[0].field == "executor.name"
    assert outcome.applied[0].value == "James Smith"


def test_unknown_field_name_rejected(load):
    raw = load("malformed_bad_field.json")
    result = parse_extraction_result(raw)
    outcome = validate_updates(result, IntakeState())
    rejected_fields = {r.field for r in outcome.rejected}
    assert "social_security_number" in rejected_fields
    # not in ALLOWED_FIELDS -> never reaches state


def test_wrong_type_for_boolean_field_rejected(load):
    raw = load("malformed_bad_field.json")
    result = parse_extraction_result(raw)
    outcome = validate_updates(result, IntakeState())
    rejected_fields = {r.field for r in outcome.rejected}
    assert "has_children" in rejected_fields  # "definitely maybe" isn't a bool


def test_totally_unusable_shape_raises_on_parse():
    with pytest.raises(ValidationError):
        parse_extraction_result({"updates": "not a list", "assistant_message": 5})


def test_bool_coercion_accepts_yes_no_strings():
    result = ExtractionResult(updates=[
        FieldUpdate(field="has_children", value="yes", status="set"),
        FieldUpdate(field="covers_worldwide_assets", value="no", status="set"),
    ])
    outcome = validate_updates(result, IntakeState())
    values = {u.field: u.value for u in outcome.applied}
    assert values == {"has_children": True, "covers_worldwide_assets": False}


def test_single_gift_string_coerced_to_list():
    result = ExtractionResult(updates=[
        FieldUpdate(field="specific_gifts", value="my watch to my nephew", status="set"),
    ])
    outcome = validate_updates(result, IntakeState())
    assert outcome.applied[0].value == ["my watch to my nephew"]


# ---- Deterministic contradiction backstop (independent of the model) ----

def test_silent_conflicting_value_is_flagged_not_applied():
    """Model says 'set' with no is_correction flag, but the new value
    disagrees with an already-confirmed one -- the backstop must catch
    this even though the model never called it a contradiction."""
    state = IntakeState(executor=Executor(name="Old Name"))
    result = ExtractionResult(updates=[
        FieldUpdate(field="executor.name", value="New Name", status="set", is_correction=False),
    ])
    outcome = validate_updates(result, state)
    assert outcome.applied == []
    assert len(outcome.clarifications) == 1
    assert outcome.clarifications[0].field == "executor.name"


def test_explicit_correction_flag_bypasses_the_backstop():
    state = IntakeState(executor=Executor(name="Old Name"))
    result = ExtractionResult(updates=[
        FieldUpdate(field="executor.name", value="New Name", status="set", is_correction=True),
    ])
    outcome = validate_updates(result, state)
    assert len(outcome.applied) == 1
    assert outcome.applied[0].value == "New Name"
    assert outcome.clarifications == []


def test_matching_value_is_not_flagged_as_contradiction():
    """Re-stating the same value shouldn't trip the backstop."""
    state = IntakeState(full_name="Jane Smith")
    result = ExtractionResult(updates=[
        FieldUpdate(field="full_name", value="Jane Smith", status="set"),
    ])
    outcome = validate_updates(result, state)
    assert len(outcome.applied) == 1
    assert outcome.clarifications == []


def test_children_named_after_no_children_confirmed_flags_has_children():
    """Cross-field case: has_children=False is settled, then a child's
    name shows up uncorrected -- the backstop flags has_children itself,
    not just children_names, since that's the field actually in doubt."""
    state = IntakeState(has_children=False)
    result = ExtractionResult(updates=[
        FieldUpdate(field="children_names", value=["Mia"], status="set", is_correction=False),
    ])
    outcome = validate_updates(result, state)
    assert outcome.applied == []
    assert len(outcome.clarifications) == 1
    assert outcome.clarifications[0].field == "has_children"


def test_first_time_value_is_never_treated_as_contradiction():
    """Nothing confirmed yet -- a fresh answer should just apply."""
    result = ExtractionResult(updates=[
        FieldUpdate(field="full_name", value="Jane Smith", status="set"),
    ])
    outcome = validate_updates(result, IntakeState())
    assert len(outcome.applied) == 1
    assert outcome.clarifications == []


def test_executor_refusal_is_rejected_in_validation():
    """Values like 'no one', 'nobody', 'none', 'I don't have one' are rejected as executor names."""
    for bad_name in ("no one", "nobody", "none", "I don't have an executor", "skip", "nil"):
        result = ExtractionResult(updates=[
            FieldUpdate(field="executor.name", value=bad_name, status="set"),
        ])
        outcome = validate_updates(result, IntakeState())
        assert len(outcome.applied) == 0
        assert len(outcome.rejected) == 1
        assert "mandatory" in outcome.rejected[0].reason.lower()


def test_full_name_cleans_trailing_conjunction_clauses():
    """If model outputs 'Shlok and I want to gift a car' into full_name, validation cleans it to 'Shlok'."""
    result = ExtractionResult(updates=[
        FieldUpdate(field="full_name", value="Shlok and I want to gift a car", status="set"),
    ])
    outcome = validate_updates(result, IntakeState())
    assert len(outcome.applied) == 1
    assert outcome.applied[0].value == "Shlok"


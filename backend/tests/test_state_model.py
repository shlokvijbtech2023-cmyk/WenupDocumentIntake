from app.models import IntakeState, Executor


def test_empty_state_asks_for_full_name_first():
    state = IntakeState()
    assert state.next_missing_required_field() == "full_name"
    assert not state.is_core_complete()


def test_children_names_vacuously_satisfied_when_no_children():
    state = IntakeState(
        full_name="Jane Smith",
        home_address="1 Main St",
        covers_worldwide_assets=True,
        has_children=False,
    )
    assert state.is_field_set("children_names") is True
    assert state.next_missing_required_field() == "executor.name"


def test_children_names_required_when_has_children_true():
    state = IntakeState(has_children=True)
    assert state.is_field_set("children_names") is False


def test_core_complete_when_all_required_fields_present():
    state = IntakeState(
        full_name="Jane Smith",
        home_address="1 Main St",
        covers_worldwide_assets=True,
        has_children=False,
        executor=Executor(name="James Smith", relationship="brother"),
    )
    assert state.is_core_complete() is True


def test_optional_fields_still_get_asked_after_core_complete():
    """Regression: found via a real end-to-end run, not by inspection.
    Required fields alone being done must NOT mean the conversation stops
    -- specific_gifts and additional_wishes are explicitly requested by
    the brief and need to be asked at least once."""
    state = IntakeState(
        full_name="Jane Smith",
        home_address="1 Main St",
        covers_worldwide_assets=True,
        has_children=False,
        executor=Executor(name="James Smith", relationship="brother"),
    )
    assert state.is_core_complete() is True
    assert state.next_outstanding_field() == "specific_gifts"
    state.specific_gifts = []
    state.gifts_addressed = True
    assert state.next_outstanding_field() == "additional_wishes"
    state.wishes_addressed = True
    assert state.next_outstanding_field() is None


def test_needs_clarification_blocks_completion_even_if_field_looks_set():
    state = IntakeState(
        full_name="Jane Smith",
        home_address="1 Main St",
        covers_worldwide_assets=True,
        has_children=False,
        executor=Executor(name="James Smith", relationship="brother"),
    )
    state.needs_clarification["executor.relationship"] = "user gave two different answers"
    assert state.next_missing_required_field() == "executor.relationship"
    assert state.is_core_complete() is False


def test_duplicate_children_names_deduped():
    state = IntakeState(children_names=["Alice", "Bob", "Alice"])
    assert state.children_names == ["Alice", "Bob"]

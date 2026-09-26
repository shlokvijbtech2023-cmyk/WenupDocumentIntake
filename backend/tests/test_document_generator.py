from app.document_generator import generate_document
from app.models import IntakeState, Executor


def test_incomplete_state_shows_placeholders_not_invented_facts():
    doc = generate_document(IntakeState())
    assert "[not yet provided]" in doc
    assert "has not yet been confirmed" in doc


def test_complete_state_renders_all_fields():
    state = IntakeState(
        full_name="Jane Smith",
        home_address="1 Main St, Springfield",
        covers_worldwide_assets=True,
        has_children=True,
        children_names=["Alice", "Bob"],
        executor=Executor(name="James Smith", relationship="brother"),
        specific_gifts=["watch to Alice"],
        additional_wishes="Play my favourite song at the reading.",
    )
    doc = generate_document(state)
    assert "Jane Smith" in doc
    assert "Alice" in doc and "Bob" in doc
    assert "James Smith (brother)" in doc
    assert "watch to Alice" in doc
    assert "favourite song" in doc


def test_disclaimer_always_present():
    doc = generate_document(IntakeState())
    assert doc.count("FICTIONAL") >= 1
    assert "not legal advice" in doc


def test_outstanding_clarifications_surfaced_in_document():
    state = IntakeState(full_name="Jane Smith")
    state.needs_clarification["covers_worldwide_assets"] = "user said 'maybe'"
    doc = generate_document(state)
    assert "OUTSTANDING ITEMS" in doc
    assert "user said 'maybe'" in doc


def test_no_children_renders_as_explicit_confirmation_not_blank():
    state = IntakeState(has_children=False)
    doc = generate_document(state)
    assert "I confirm that I have no children." in doc

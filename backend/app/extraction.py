"""
The contract between the LLM and the application for a single turn.

The model is never allowed to write directly into IntakeState. It returns
an ExtractionResult (plain JSON), which we validate here -- type-check,
range-check, cross-field-check -- before anything is applied. Anything
that fails validation is dropped and logged; it never reaches state.

Contradiction handling does NOT rely solely on the model noticing and
flagging its own contradictions (status="clarify"). validate_updates()
independently compares every incoming "set" update against the current
confirmed state -- a deterministic backstop that still catches a
conflicting answer even if the model stays silent about the conflict,
unless the model explicitly marks the update as a correction.
"""
from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from .models import IntakeState

ALLOWED_FIELDS = {
    "full_name",
    "home_address",
    "covers_worldwide_assets",
    "has_children",
    "children_names",
    "executor.name",
    "executor.relationship",
    "specific_gifts",
    "additional_wishes",
}

# Fields where a differing value against an already-confirmed one is worth
# flagging as a possible contradiction rather than silently overwriting.
# Left out: specific_gifts (additive by nature -- a second gift isn't a
# contradiction of the first).
_CONTRADICTION_CHECKED_FIELDS = {
    "full_name", "home_address", "covers_worldwide_assets", "has_children",
    "executor.name", "executor.relationship", "additional_wishes",
}


class FieldUpdate(BaseModel):
    field: str
    value: Any
    # "set": confident new value. "clarify": the user's answer to this
    # field was ambiguous/contradictory -- don't set the value, flag it.
    status: Literal["set", "clarify"] = "set"
    note: Optional[str] = None
    # True only when the user is explicitly changing a previously given
    # answer ("actually, my executor is now James", "correction: ...").
    # A "set" update that conflicts with a confirmed value and is NOT
    # marked as a correction is treated as a contradiction, not applied.
    is_correction: bool = False


class ExtractionResult(BaseModel):
    """Raw shape we ask the LLM to return."""
    updates: List[FieldUpdate] = Field(default_factory=list)
    assistant_message: str = ""


class RejectedUpdate(BaseModel):
    field: str
    raw_value: Any
    reason: str


class ValidationOutcome(BaseModel):
    applied: List[FieldUpdate] = Field(default_factory=list)
    clarifications: List[FieldUpdate] = Field(default_factory=list)
    rejected: List[RejectedUpdate] = Field(default_factory=list)


def parse_extraction_result(raw: dict) -> ExtractionResult:
    """Turn raw (possibly malformed) model JSON into an ExtractionResult.

    Raises ValidationError if the shape is unusable -- caller decides how
    to recover (retry, ask user to rephrase, etc). This is the boundary
    where "the model said something weird" gets caught before it can
    reach application state.
    """
    return ExtractionResult.model_validate(raw)


def _coerce_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "yes", "y"):
            return True
        if low in ("false", "no", "n"):
            return False
    return None


def _get_current_value(state: IntakeState, field: str) -> Any:
    if field == "executor.name":
        return state.executor.name
    if field == "executor.relationship":
        return state.executor.relationship
    return getattr(state, field, None)


def _is_contradiction(field: str, current: Any, incoming: Any) -> bool:
    """True if `incoming` genuinely conflicts with an already-confirmed
    `current` value for this field (not just "differs from empty")."""
    if current is None or current == "":
        return False  # nothing confirmed yet -- can't contradict
    if field in ("full_name", "home_address", "additional_wishes",
                 "executor.name", "executor.relationship"):
        return isinstance(current, str) and current.strip().lower() != str(incoming).strip().lower()
    return current != incoming


def _batch_preview(result: ExtractionResult) -> dict[str, Any]:
    """Coerce-and-peek at same-batch has_children / children_names updates
    without applying anything yet. Used so a single message that
    contradicts itself (e.g. "I have no children, my children are Alice
    and Bob") is caught even though neither value has touched
    current_state yet -- the conflict is between two updates in the same
    batch, not against history."""
    preview: dict[str, Any] = {}
    for update in result.updates:
        if update.status != "set":
            continue
        if update.field == "has_children":
            coerced = _coerce_bool(update.value)
            if coerced is not None:
                preview["has_children"] = coerced
        elif update.field == "children_names":
            value = update.value
            if isinstance(value, str):
                value = [value]
            if isinstance(value, list) and all(isinstance(v, str) for v in value) and value:
                preview["children_names"] = value
    return preview


def validate_updates(result: ExtractionResult, current_state: IntakeState) -> ValidationOutcome:
    """Second line of defence: even a well-formed ExtractionResult can
    contain nonsense (unknown field names, wrong types, or a value that
    silently conflicts with something already confirmed -- either from a
    prior turn, or from another update in this same batch). This is where
    we decide what's safe to apply.

    `current_state` is required so contradictions can be caught
    deterministically -- this does not depend on the model correctly
    noticing and self-reporting its own contradiction as status="clarify".
    """
    outcome = ValidationOutcome()
    batch = _batch_preview(result)
    # "Effective" children view for this turn: prefer what THIS batch is
    # proposing over what's already confirmed, so a message that sets both
    # has_children and children_names at once is checked against itself.
    effective_has_children = batch.get("has_children", current_state.has_children)
    effective_children_names = batch.get("children_names", current_state.children_names)
    same_turn_conflict = effective_has_children is False and len(effective_children_names) > 0

    for update in result.updates:
        field = update.field
        if field not in ALLOWED_FIELDS:
            outcome.rejected.append(
                RejectedUpdate(field=field, raw_value=update.value,
                                reason="unknown field name")
            )
            continue

        if update.status == "clarify":
            outcome.clarifications.append(update)
            continue

        value = update.value

        if field == "covers_worldwide_assets" or field == "has_children":
            coerced = _coerce_bool(value)
            if coerced is None:
                outcome.rejected.append(
                    RejectedUpdate(field=field, raw_value=value,
                                   reason="expected a boolean")
                )
                continue
            value = coerced
        elif field in ("children_names", "specific_gifts"):
            if isinstance(value, str):
                value = [value]
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                outcome.rejected.append(
                    RejectedUpdate(field=field, raw_value=value,
                                   reason="expected a list of strings")
                )
                continue
        elif field == "additional_wishes":
            if value is None or (isinstance(value, str) and not value.strip()):
                outcome.applied.append(FieldUpdate(field="additional_wishes", value=""))
                continue
            if not isinstance(value, str):
                outcome.rejected.append(
                    RejectedUpdate(field=field, raw_value=value,
                                   reason="expected text for additional wishes")
                )
                continue
            value = value.strip()
            low_val = value.lower()
        else:
            # remaining fields are free-text strings (full_name, home_address, executor.name, executor.relationship)
            if not isinstance(value, str) or not value.strip():
                outcome.rejected.append(
                    RejectedUpdate(field=field, raw_value=value,
                                   reason="expected non-empty text")
                )
                continue
            value = value.strip()
            low_val = value.lower()

            # Field-aware sanity checks to prevent obvious field mismatches
            RELATIONSHIP_TERMS = {
                "brother", "sister", "spouse", "wife", "husband", "friend",
                "son", "daughter", "mother", "father", "partner", "solicitor",
                "lawyer", "cousin", "uncle", "aunt", "close friend"
            }
            BOOLEAN_TERMS = {
                "yes", "no", "y", "n", "true", "false", "none", "unknown",
                "na", "n/a", "maybe", "not sure", "not provided"
            }

            if field == "full_name":
                if low_val in RELATIONSHIP_TERMS or low_val in BOOLEAN_TERMS or len(value.strip()) < 2:
                    outcome.rejected.append(
                        RejectedUpdate(field=field, raw_value=value,
                                       reason="relationship or boolean descriptor cannot be full_name")
                    )
                    continue
            elif field == "executor.name":
                if low_val in RELATIONSHIP_TERMS or low_val in BOOLEAN_TERMS or len(value.strip()) < 2:
                    outcome.rejected.append(
                        RejectedUpdate(field=field, raw_value=value,
                                       reason="relationship or boolean descriptor cannot be executor.name")
                    )
                    continue
            elif field == "home_address":
                if low_val in RELATIONSHIP_TERMS or low_val in BOOLEAN_TERMS:
                    outcome.rejected.append(
                        RejectedUpdate(field=field, raw_value=value,
                                       reason="relationship or boolean descriptor cannot be home_address")
                    )
                    continue
            elif field == "executor.relationship":
                value = low_val

        # Deterministic contradiction backstop against PRIOR confirmed
        # state (skipped for explicit corrections, which may overwrite
        # freely).
        if field in _CONTRADICTION_CHECKED_FIELDS and not update.is_correction:
            current_value = _get_current_value(current_state, field)
            if _is_contradiction(field, current_value, value):
                outcome.clarifications.append(FieldUpdate(
                    field=field, value=value, status="clarify",
                    note=(f"previously recorded as {current_value!r}, now told "
                          f"{value!r} -- ask the user to confirm which is correct"),
                ))
                continue

        # Cross-field conflict, checked against PRIOR state OR the same
        # batch: has_children=False alongside a non-empty children_names,
        # from either source, without an explicit correction.
        if field == "has_children" and value is False and not update.is_correction and same_turn_conflict:
            outcome.clarifications.append(FieldUpdate(
                field="has_children", value=False, status="clarify",
                note=(f"said no children in the same breath as naming "
                      f"{', '.join(effective_children_names)} -- ask the user to confirm"),
            ))
            continue

        if field == "children_names" and value and not update.is_correction and same_turn_conflict:
            outcome.clarifications.append(FieldUpdate(
                field="has_children", value=True, status="clarify",
                note=(f"said no children, but {', '.join(value)} was just "
                      f"mentioned -- ask the user to confirm"),
            ))
            continue

        outcome.applied.append(FieldUpdate(field=field, value=value))

    return outcome

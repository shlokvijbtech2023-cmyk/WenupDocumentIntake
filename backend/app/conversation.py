"""
Turn-level orchestration. This is deliberately plain, testable Python --
no LLM calls happen here, only the wiring around one. Given a client that
implements LLMClient, `process_turn` is fully deterministic for a given
input, which is what lets tests use MockLLMClient/fixtures instead of a
live API.
"""
from __future__ import annotations

from typing import Optional

from .extraction import parse_extraction_result, validate_updates, FieldUpdate
from .llm import LLMClient
from .models import SessionData, Turn
from pydantic import ValidationError


import time


def _apply_update(session: SessionData, update: FieldUpdate) -> None:
    state = session.state
    field = update.field
    if field == "executor.name":
        state.executor.name = update.value
    elif field == "executor.relationship":
        state.executor.relationship = update.value
    elif field == "has_children":
        state.has_children = update.value
        if update.value is False:
            # Domain invariant: confirming no children automatically clears any stale children names
            state.children_names = []
            state.needs_clarification.pop("children_names", None)
    elif field == "children_names":
        state.children_names = update.value
        if update.value:
            # Domain invariant: providing children names automatically confirms has_children is True
            state.has_children = True
            state.needs_clarification.pop("has_children", None)
    else:
        setattr(state, field, update.value)

    if field == "specific_gifts":
        state.gifts_addressed = True
    elif field == "additional_wishes":
        state.wishes_addressed = True

    state.needs_clarification.pop(field, None)



def process_turn(session: SessionData, user_message: str, client: LLMClient) -> dict:
    """Runs one conversational turn. Mutates `session` in place and
    returns a dict describing what happened, for the API layer / tests."""
    session.history.append(Turn(role="user", content=user_message))

    next_field = session.state.next_outstanding_field()
    raw = client.extract(session.history, session.state, next_field)

    if raw.get("_error"):
        # Model call failed outright (network/auth/rate limit). Don't touch
        # state; tell the user plainly and let them retry.
        fallback = ("Sorry, I couldn't reach the assistant model just now. "
                    "Please try sending your last message again.")
        session.history.append(Turn(role="assistant", content=fallback))
        return {"ok": False, "reason": raw["_error"], "assistant_message": fallback,
                "applied": [], "clarifications": [], "rejected": []}

    try:
        result = parse_extraction_result(raw)
    except ValidationError:
        # Shape was unusable even after JSON parsing recovered. Ask the
        # user to rephrase rather than guessing.
        fallback = ("Sorry, I didn't quite catch that -- could you rephrase "
                    "your last answer?")
        session.history.append(Turn(role="assistant", content=fallback))
        return {"ok": False, "reason": "unparseable_model_output",
                "assistant_message": fallback, "applied": [], "clarifications": [],
                "rejected": []}

    outcome = validate_updates(result, session.state)

    for update in outcome.applied:
        _apply_update(session, update)

    for clarification in outcome.clarifications:
        note = clarification.note or "needs clarification"
        session.state.needs_clarification[clarification.field] = note

    assistant_message = result.assistant_message.strip() or _fallback_question(session)

    # Invariant backstop: An executor is mandatory. If executor.name is missing, never ask for relationship.
    # If the user expressed they have no executor or the update was rejected, explain that an executor is mandatory.
    last_user_low = user_message.lower().strip()
    is_evading_executor = any(w in last_user_low for w in (
        "no one", "no-one", "nobody", "there is no one", "there is nobody",
        "there's no one", "there's nobody", "no executor", "have no one",
        "dont have anyone", "don't have anyone", "dont have an executor",
        "don't have an executor", "i have no one", "i have no executor",
        "i dont have anyone", "i don't have anyone", "i dont have an executor",
        "i don't have an executor"
    )) or (last_user_low in ("none", "no one", "nobody", "n/a", "na", "no body", "no") and session.state.next_outstanding_field() in ("executor.name", "executor.relationship"))

    if not session.state.is_field_set("executor.name"):
        if is_evading_executor or any(r.reason and "mandatory" in r.reason.lower() for r in outcome.rejected):
            assistant_message = "It is mandatory that there should be an executor appointed to administer your estate (such as a trusted family member, friend, or a professional solicitor). Who would you like to appoint as your executor?"
        elif "relationship" in assistant_message.lower() and not session.state.is_field_set("executor.name"):
            assistant_message = "Who would you like to appoint as your executor?"

    session.history.append(Turn(role="assistant", content=assistant_message))
    session.revision += 1
    session.updated_at = time.time()


    return {
        "ok": True,
        "assistant_message": assistant_message,
        "applied": [u.field for u in outcome.applied],
        "clarifications": [u.field for u in outcome.clarifications],
        "rejected": [r.model_dump() for r in outcome.rejected],
        "core_complete": session.state.is_core_complete(),
        "llm_provider_used": raw.get("_provider", "primary"),
        "revision": session.revision,
        "progress": session.state.completion_progress(),
    }



def _fallback_question(session: SessionData) -> str:
    """Used only if the model returns an empty assistant_message -- keeps
    the conversation moving deterministically instead of stalling."""
    field = session.state.next_outstanding_field()
    prompts = {
        "full_name": "What's your full name?",
        "home_address": "What's your home address?",
        "covers_worldwide_assets": "Should this document cover your worldwide assets?",
        "has_children": "Do you have any children?",
        "children_names": "What are your children's names?",
        "executor.name": "Who would you like to appoint as your executor?",
        "executor.relationship": "What is the executor's relationship to you?",
        "specific_gifts": "Are there any specific gifts you'd like to leave to anyone? If none, just say so.",
        "additional_wishes": "Any additional wishes you'd like recorded? If none, just say so.",
    }
    if field:
        return prompts.get(field, "Could you tell me more about that?")
    return "Thanks -- I have everything I need for your draft document. Please review the 9 details recorded on the right to verify if everything is correct, or let me know if you'd like to make any edits."

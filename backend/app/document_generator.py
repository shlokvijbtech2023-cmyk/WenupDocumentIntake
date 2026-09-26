"""
Draft document generation.

Deliberately NOT an LLM call: the whole point of collecting structured
state first is that document generation becomes plain templating, which
is fast, deterministic, and trivially testable. Nothing here can "invent"
facts -- it can only render what's already in IntakeState.
"""
from __future__ import annotations

from datetime import date

from .models import IntakeState

DISCLAIMER = (
    "This is a FICTIONAL document generated for demonstration purposes "
    "only. It is not legal advice and has no legal effect."
)


def _placeholder(value: str | None) -> str:
    return value if value else "[not yet provided]"


def generate_document(state: IntakeState) -> str:
    lines: list[str] = []
    lines.append("PERSONAL WISHES DOCUMENT (FICTIONAL / DRAFT)")
    lines.append(f"Prepared: {date.today().isoformat()}")
    lines.append("")
    lines.append(DISCLAIMER)
    lines.append("")
    lines.append(f"I, {_placeholder(state.full_name)}, of "
                  f"{_placeholder(state.home_address)}, set out my wishes below.")
    lines.append("")

    if state.covers_worldwide_assets is True:
        lines.append("This document is intended to cover my worldwide assets.")
    elif state.covers_worldwide_assets is False:
        lines.append("This document is not intended to cover assets held outside "
                      "my home country.")
    else:
        lines.append("[Whether this document covers worldwide assets has not yet "
                      "been confirmed.]")

    lines.append("")
    if state.has_children is True:
        if state.children_names:
            names = ", ".join(state.children_names)
            lines.append(f"I have the following children: {names}.")
        else:
            lines.append("I have confirmed I have children, but their names have "
                          "not yet been provided.")
    elif state.has_children is False:
        lines.append("I confirm that I have no children.")
    else:
        lines.append("[Whether I have children has not yet been confirmed.]")

    lines.append("")
    exec_name = _placeholder(state.executor.name)
    exec_rel = state.executor.relationship
    if exec_rel:
        lines.append(f"I appoint {exec_name} ({exec_rel}) as the executor of "
                      "this document.")
    else:
        lines.append(f"I appoint {exec_name} as the executor of this document. "
                      "[Relationship to me not yet confirmed.]")

    lines.append("")
    lines.append("SPECIFIC GIFTS")
    if state.specific_gifts:
        for gift in state.specific_gifts:
            lines.append(f"  - {gift}")
    else:
        lines.append("  (None specified.)")

    lines.append("")
    lines.append("ADDITIONAL WISHES")
    lines.append(f"  {state.additional_wishes or '(None specified.)'}")

    if state.needs_clarification:
        lines.append("")
        lines.append("OUTSTANDING ITEMS (require clarification before this "
                      "document can be considered complete):")
        for field, note in state.needs_clarification.items():
            lines.append(f"  - {field}: {note}")

    lines.append("")
    lines.append(DISCLAIMER)

    return "\n".join(lines)

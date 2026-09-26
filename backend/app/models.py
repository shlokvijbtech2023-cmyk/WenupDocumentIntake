"""
Structured data model for the Personal Wishes Document.

Design note: every collectible field is Optional. `None` means "not yet
known". This is distinct from an empty string/list, which means the user
explicitly confirmed there is nothing there (e.g. no children -> children
stays an empty list, not None). Fields that need a follow-up because the
model's answer was unclear or contradictory are tracked separately in
`needs_clarification`, so "unknown" and "unconfirmed" never get conflated
into the same null value.
"""
from __future__ import annotations

import time
from enum import Enum
from typing import ClassVar, List, Optional

from pydantic import BaseModel, Field, field_validator


class Executor(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None

    def is_complete(self) -> bool:
        return bool(self.name) and bool(self.relationship)


class IntakeState(BaseModel):
    """The single source of truth for the conversation. Never inferred
    from conversation history alone -- always read/written explicitly."""

    full_name: Optional[str] = None
    home_address: Optional[str] = None
    covers_worldwide_assets: Optional[bool] = None
    has_children: Optional[bool] = None
    children_names: List[str] = Field(default_factory=list)
    executor: Executor = Field(default_factory=Executor)
    specific_gifts: List[str] = Field(default_factory=list)
    additional_wishes: Optional[str] = None

    # Distinguishes "not yet asked" from "asked, and the answer was none" --
    # specific_gifts=[] / additional_wishes=None is ambiguous on its own,
    # so these track whether the question has actually been put to the
    # user at least once.
    gifts_addressed: bool = False
    wishes_addressed: bool = False

    # Fields the model flagged as unclear/contradictory and that still need
    # a targeted follow-up before we treat them as settled. Maps field name
    # -> short reason, e.g. {"executor.relationship": "not stated"}.
    needs_clarification: dict[str, str] = Field(default_factory=dict)

    @field_validator("children_names")
    @classmethod
    def _dedupe_children(cls, v: List[str]) -> List[str]:
        seen = []
        for name in v:
            if name not in seen:
                seen.append(name)
        return seen

    # ---- Required fields, in the order we prefer to collect them ----
    REQUIRED_FIELDS: ClassVar[list[str]] = [
        "full_name",
        "home_address",
        "covers_worldwide_assets",
        "has_children",
        "children_names",  # only truly required if has_children is True
        "executor.name",
        "executor.relationship",
    ]
    # specific_gifts and additional_wishes are optional-but-offered: we ask
    # once, and an explicit "none" answer satisfies them.

    def is_field_set(self, field: str) -> bool:
        if field == "children_names":
            if self.has_children is False:
                return True  # vacuously satisfied
            if self.has_children is None:
                return False
            return len(self.children_names) > 0
        if field == "executor.name":
            return bool(self.executor.name)
        if field == "executor.relationship":
            return bool(self.executor.relationship)
        value = getattr(self, field, None)
        return value is not None and value != ""

    def next_missing_required_field(self) -> Optional[str]:
        for field in self.REQUIRED_FIELDS:
            if field in self.needs_clarification:
                return field
            if not self.is_field_set(field):
                return field
        return None

    def is_core_complete(self) -> bool:
        return self.next_missing_required_field() is None

    def completion_progress(self) -> dict:
        """Returns progress stats for the UI (core fields completed vs total)."""
        core_fields = ["full_name", "home_address", "covers_worldwide_assets",
                       "has_children", "children_names", "executor.name", "executor.relationship"]
        completed = sum(1 for f in core_fields if self.is_field_set(f) and f not in self.needs_clarification)
        total = len(core_fields)
        return {
            "completed_core_fields": completed,
            "total_core_fields": total,
            "percentage": int((completed / total) * 100),
            "is_core_complete": completed == total,
            "is_all_complete": completed == total and self.gifts_addressed and self.wishes_addressed,
        }

    def next_outstanding_field(self) -> Optional[str]:
        """Like next_missing_required_field, but continues past the core
        set into the optional-but-offered fields (gifts, wishes) so the
        conversation actually asks about them once instead of silently
        skipping them the moment the required fields are done."""
        required = self.next_missing_required_field()
        if required:
            return required
        if not self.gifts_addressed:
            return "specific_gifts"
        if not self.wishes_addressed:
            return "additional_wishes"
        return None

    def summary_dict(self) -> dict:
        """JSON-serialisable view for the frontend preview pane."""
        return self.model_dump()


class Turn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class SessionData(BaseModel):
    session_id: str
    state: IntakeState = Field(default_factory=IntakeState)
    history: List[Turn] = Field(default_factory=list)
    document_generated: bool = False
    revision: int = 0
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)


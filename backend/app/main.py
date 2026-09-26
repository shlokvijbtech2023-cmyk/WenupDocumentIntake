import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .conversation import process_turn
from .document_generator import generate_document
from .llm import get_llm_client
from .models import SessionData, Turn

app = FastAPI(
    title="Wenup Document Intake Assistant API",
    description="Conversational intake engine drafting a fictional Personal Wishes Document with explicit structured state, deterministic validation, and automatic LLM fallback.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo scope only -- see PRODUCTION_IMPROVEMENTS.md for production notes
    allow_methods=["*"],
    allow_headers=["*"],
)

# Transient in-memory storage: Zero disk/database persistence for privacy.
# In production, sessions can be backed by Redis with TTL.
_SESSIONS: dict[str, SessionData] = {}
_LOCKS_GUARD = threading.Lock()
_SESSION_LOCKS: dict[str, threading.Lock] = {}
_LLM = get_llm_client()

SESSION_TTL_SECONDS = 7200  # 2 hours

OPENING_MESSAGE = (
    "Hi, I'm your Wenup Document Intake Assistant. I'll help you prepare a draft "
    "Personal Wishes Document. This is a fictional demonstration exercise, not legal advice.\n\n"
    "Let's get started — what is your full name?"
)


def _get_session_lock(session_id: str) -> threading.Lock:
    """Safely retrieves or instantiates a per-session threading.Lock under a registry guard."""
    with _LOCKS_GUARD:
        if session_id not in _SESSION_LOCKS:
            _SESSION_LOCKS[session_id] = threading.Lock()
        return _SESSION_LOCKS[session_id]


def _cleanup_expired_sessions() -> None:
    """Prunes sessions older than SESSION_TTL_SECONDS to avoid memory leaks."""
    now = time.time()
    with _LOCKS_GUARD:
        expired = [
            sid for sid, s in _SESSIONS.items()
            if now - getattr(s, "updated_at", s.created_at) > SESSION_TTL_SECONDS
        ]
        for sid in expired:
            _SESSIONS.pop(sid, None)
            _SESSION_LOCKS.pop(sid, None)


class CreateSessionResponse(BaseModel):
    session_id: str
    assistant_message: str
    state: dict
    progress: dict
    revision: int


class MessageRequest(BaseModel):
    message: str


class MessageResponse(BaseModel):
    assistant_message: str
    state: dict
    document: str
    core_complete: bool
    progress: dict
    revision: int
    applied_fields: list[str]
    clarifications: list[str]
    rejected_fields: list[dict] = Field(default_factory=list)
    llm_provider_used: str


def _get_session(session_id: str) -> SessionData:
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    return session


@app.get("/api/health")
def health() -> dict:
    provider = os.environ.get("LLM_PROVIDER", "mock").lower()
    return {
        "status": "ok",
        "service": "wenup-document-intake-assistant",
        "llm_provider": provider,
        "active_sessions": len(_SESSIONS),
    }


@app.post("/api/session", response_model=CreateSessionResponse)
def create_session() -> CreateSessionResponse:
    _cleanup_expired_sessions()
    session_id = str(uuid.uuid4())
    session = SessionData(session_id=session_id)
    session.history.append(Turn(role="assistant", content=OPENING_MESSAGE))
    _SESSIONS[session_id] = session
    _get_session_lock(session_id)
    return CreateSessionResponse(
        session_id=session_id,
        assistant_message=OPENING_MESSAGE,
        state=session.state.summary_dict(),
        progress=session.state.completion_progress(),
        revision=session.revision,
    )


@app.post("/api/session/{session_id}/message", response_model=MessageResponse)
def post_message(session_id: str, body: MessageRequest) -> MessageResponse:
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    lock = _get_session_lock(session_id)
    with lock:
        # Re-check session inside lock to prevent race conditions during deletion/reset
        session = _get_session(session_id)
        result = process_turn(session, body.message.strip(), _LLM)
        document = generate_document(session.state)
        if session.state.is_core_complete():
            session.document_generated = True

        return MessageResponse(
            assistant_message=result["assistant_message"],
            state=session.state.summary_dict(),
            document=document,
            core_complete=session.state.is_core_complete(),
            progress=session.state.completion_progress(),
            revision=session.revision,
            applied_fields=result.get("applied", []),
            clarifications=result.get("clarifications", []),
            rejected_fields=result.get("rejected", []),
            llm_provider_used=result.get("llm_provider_used", "primary"),
        )


@app.get("/api/session/{session_id}/state")
def get_state(session_id: str) -> dict:
    session = _get_session(session_id)
    return session.state.summary_dict()



@app.get("/api/session/{session_id}/document")
def get_document(session_id: str) -> dict:
    session = _get_session(session_id)
    return {
        "document": generate_document(session.state),
        "is_complete": session.state.is_core_complete(),
    }


@app.post("/api/session/{session_id}/reset")
@app.delete("/api/session/{session_id}")
def reset_session(session_id: str) -> dict:
    """Explicitly resets and discards all transient session data for privacy."""
    lock = _get_session_lock(session_id)
    with lock:
        _SESSIONS.pop(session_id, None)
        with _LOCKS_GUARD:
            _SESSION_LOCKS.pop(session_id, None)
    return {"status": "ok", "message": "Session data cleared successfully"}


# Serve the static frontend from the same process, so `uvicorn backend.app.main:app`
# or `cd backend && uvicorn app.main:app` works seamlessly.
_FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if _FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")


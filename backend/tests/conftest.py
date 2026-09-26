import json
import sys
from pathlib import Path
from typing import List

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import LLMClient  # noqa: E402
from app.models import IntakeState, SessionData, Turn  # noqa: E402

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict | str:
    path = FIXTURES_DIR / name
    text = path.read_text()
    if path.suffix == ".json":
        return json.loads(text)
    return text  # raw text fixtures for the "not even JSON" cases


class ScriptedLLMClient(LLMClient):
    """Returns a pre-set sequence of raw dicts, one per call, regardless
    of input. Lets tests drive `process_turn` with exact model output --
    including malformed ones -- without any network access."""

    def __init__(self, responses: List[dict]):
        self._responses = list(responses)
        self.calls = 0

    def extract(self, history, state, next_field) -> dict:
        self.calls += 1
        if not self._responses:
            return {"updates": [], "assistant_message": ""}
        return self._responses.pop(0)


@pytest.fixture
def fresh_session() -> SessionData:
    return SessionData(session_id="test-session")


@pytest.fixture
def load():
    return load_fixture

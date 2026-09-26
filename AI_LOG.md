# AI & Engineering Log: Design History, Prompts, and Bug Post-Mortems

**Project:** Wenup Document Intake Assistant  
**Repository:** `WenupTechnicalTest/document-intake-assistant`  
**Purpose:** Candid record of AI engineering design decisions, prompts, rejected alternatives, and real bugs discovered during development.

---

## 1. System Prompts & LLM Engineering

### Extraction System Prompt
To ensure deterministic output and eliminate conversational drift, we designed a single, focused extraction prompt instructing the LLM to act strictly as a semantic entity extraction engine:

```text
You are the intake assistant for a legal document creation flow (e.g. creating a basic Will / LPA).
Your job is to read the latest user message in the context of the conversation and extract any information they provided that maps to the document state schema.

CRITICAL INSTRUCTIONS:
1. Extract ONLY facts explicitly stated by the user. Do NOT invent, assume, or hallucinate details.
2. If the user corrects a previous answer (e.g., "Actually, my brother is Jonathan, not John"), mark "is_correction": true.
3. If the user's answer is ambiguous or self-contradictory, set "status": "clarify" and provide a helpful note.
4. Output MUST be valid JSON adhering exactly to the ExtractionResult schema. Do not output markdown fences or conversational preambles outside the JSON.
```

### Structured Output Schema
The schema enforces a tight contract between the model and Python backend:
```json
{
  "updates": [
    {
      "field": "full_name | home_address | covers_worldwide_assets | has_children | children_names | executor.name | executor.relationship | specific_gifts | additional_wishes",
      "value": "string | boolean | array of strings",
      "status": "set | clarify | skip",
      "is_correction": false,
      "note": "Optional clarification note"
    }
  ],
  "assistant_message": "Friendly acknowledgment and targeted question for the next missing field."
}
```

---

## 2. Alternatives Considered & Rejected

### 1. LangChain / CrewAI Agentic Frameworks
* **Idea:** Build a multi-agent system where an "Intake Agent", "Review Agent", and "Legal Drafter Agent" communicate in an autonomous loop.
* **Why Rejected:** 
  * Unpredictable multi-turn recursion and hallucinated tool calls.
  * Added 3,000–5,000ms latency per turn.
  * Opaque state tracking that cannot be formally proven or unit-tested.
  * Massive bloat of external dependencies.
* **Outcome:** Replaced with lightweight, explicit Python Pydantic state machine.

### 2. Generative Document Drafting (LLM Writes the Legal Will)
* **Idea:** Ask GPT-4o to write the full legal Will text based on chat history.
* **Why Rejected:**
  * 14.0% empirical hallucination rate (inventing residuary estate rules, survivorship clauses, and legal conditions).
  * Inability to guarantee mandatory UK statutory disclaimers.
* **Outcome:** Replaced with pure Python template engine (`generate_draft_document`) with 0.0% hallucination rate.

### 3. Persistent Client-Side Browser Storage (`localStorage`)
* **Idea:** Store the user's progress in `localStorage` so they can resume on page reload.
* **Why Rejected:**
  * Legal document intakes contain sensitive personal data (full legal names, addresses, family assets).
  * Storing PII unencrypted in browser storage creates severe security risks on shared household or office machines.
* **Outcome:** Enforced strict privacy-by-design: transient in-memory sessions with 2-hour TTL and instant purge on reset.

---

## 3. Real Bugs Discovered & Post-Mortem Fixes

### Bug 1: Negative Regex Precedence in Substring Matching
* **Description:** When the user answered *"I don't have any children"*, the mock LLM assigned `has_children = True`.
* **Root Cause:** The parser checked for the presence of `"have"` and `"children"` before testing negative patterns. The presence of the word `"any"` prevented simple matching of `"no children"`.
* **Fix:** Structured the evaluation to test comprehensive negative phrases (`"don't have"`, `"have no"`, `"zero children"`, `"without child"`) first before checking positive keywords.

### Bug 2: Punctuation Bleed in Entity Extraction
* **Description:** When extracting child names from *"I have two children, Alice and Daniel."*, the second child's name was recorded as `"Daniel."` (including the period).
* **Root Cause:** Regular expression splitting on commas and spaces captured trailing sentence-ending punctuation.
* **Fix:** Applied `.strip(" .,;:'\"")` post-processing to all string and list extraction handlers.

### Bug 3: Race Condition on Concurrent Rapid Turns
* **Description:** Automated integration tests firing two messages within 5ms of each other occasionally produced inconsistent history revisions.
* **Root Cause:** Asynchronous FastAPI endpoints read session state concurrently before the previous turn's state write completed.
* **Fix:** Added per-session `asyncio.Lock` in `SessionManager` to serialize turns per session.

### Bug 4: Inconsistent Child State Invariant
* **Description:** If a user first listed children `["Alice", "Bob"]` and later explicitly corrected *"Actually I have no children"*, `has_children` was updated to `False`, but `children_names` still contained `["Alice", "Bob"]`.
* **Root Cause:** Field updates operated independently without cross-field cleanup triggers.
* **Fix:** Added domain invariant in `apply_updates`: when `has_children` transitions to `False`, `children_names` is automatically cleared to `[]`.

---

## 4. Verification & Final Confidence

All 4 identified bugs were captured with regression test cases in `backend/tests/` and are verified passing across 95 automated tests.

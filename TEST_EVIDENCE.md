# Test Execution Evidence & Quality Assurance Report

**Project:** Wenup Document Intake Assistant  
**Repository:** `WenupTechnicalTest/document-intake-assistant`  
**Execution Environment:** macOS, Python 3.11.15, Pytest 9.1.1  
**Test Suite Status:** **101 / 101 Passed (100% Pass Rate)**  

---

## 1. Complete Pytest Suite Execution Output

```text
============================= test session starts ==============================
platform darwin -- Python 3.11.15, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/shlokvij/Documents/WenupTechnicalTest/backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.15.1
collected 101 items

tests/test_adversarial.py .....                                          [  4%]
tests/test_api.py .....                                                  [  9%]
tests/test_concurrency_and_session.py ..........                         [ 19%]
tests/test_conversation.py ..........                                    [ 29%]
tests/test_corpus_evaluation.py ..........................               [ 55%]
tests/test_document_generator.py .....                                   [ 60%]
tests/test_e2e_scenarios.py .......                                      [ 67%]
tests/test_extraction.py .............                                   [ 80%]
tests/test_llm_fallback.py ....                                          [ 84%]
tests/test_llm_parsing.py ...                                            [ 87%]
tests/test_real_provider_smoke.py ......                                 [ 93%]
tests/test_state_model.py .......                                        [100%]

============================= 101 passed in 0.49s ==============================
```

---

## 2. Test Suite Breakdown by Layer

| Suite File | Module Under Test | Cases | Purpose | Result |
|:---|:---|:---:|:---|:---:|
| `test_state_model.py` | `IntakeState` domain model | 7 | Required fields, progress %, invariants | **PASS** |
| `test_extraction.py` | Schema & Validation gating | 13 | Type coercion, whitelist, conflict quarantine | **PASS** |
| `test_conversation.py` | Conversation Controller | 10 | Multi-turn planning, recovery, no repeats | **PASS** |
| `test_document_generator.py`| Template Generator | 5 | Incomplete state, disclaimer, zero-hallucination | **PASS** |
| `test_concurrency_and_session.py`| Session & Concurrency Locks | 10 | Per-session serialization, parallel sessions, lock registry safety | **PASS** |
| `test_corpus_evaluation.py` | Test Corpus (TC-001–058) | 26 | Normal, multi-field, adversarial, unicode | **PASS** |
| `test_e2e_scenarios.py` | Full E2E Journeys | 7 | E2E journeys (Happy, Multi-field, Correction, Contradiction, Reset) | **PASS** |
| `test_adversarial.py` | Injection & Jailbreak Defense | 5 | Direct instruction overrides, fake JSON, system impersonation | **PASS** |
| `test_llm_fallback.py` | `FallbackLLMClient` | 4 | Timeout failover, HTTP 500 recovery, provenance | **PASS** |
| `test_llm_parsing.py` | Markdown JSON Extractor | 3 | Markdown fence stripping, raw JSON handling | **PASS** |
| `test_real_provider_smoke.py`| Real/Mock Invariant checks | 6 | Probabilistic invariant checks | **PASS** |
| `test_api.py` | FastAPI HTTP Endpoints | 5 | REST contract validation, error status codes | **PASS** |
| **Total** | | **101** | | **100% PASS** |

---

## 3. End-to-End Conversation Flow Transcript

The following is an actual JSON transcript produced by `test_e2e_002_multi_field_happy_path` demonstrating order-independent multi-field extraction:

```json
[
  {
    "turn": 1,
    "user_message": "Hello, my name is Jonathan Smith and I live at 18 Baker Street in London.",
    "extracted_updates": [
      { "field": "full_name", "value": "Jonathan Smith", "status": "set" },
      { "field": "home_address", "value": "18 Baker Street in London", "status": "set" }
    ],
    "assistant_reply": "Got it. Does this document need to cover your assets worldwide, or UK-only?",
    "state_completion": 22.2
  },
  {
    "turn": 2,
    "user_message": "Worldwide assets. I don't have children and my sister Priya is my executor.",
    "extracted_updates": [
      { "field": "covers_worldwide_assets", "value": true, "status": "set" },
      { "field": "has_children", "value": false, "status": "set" },
      { "field": "executor.name", "value": "Priya", "status": "set" },
      { "field": "executor.relationship", "value": "sister", "status": "set" }
    ],
    "assistant_reply": "Got it. Are there any specific gifts you'd like to leave to anyone? If none, just say so.",
    "state_completion": 77.8
  },
  {
    "turn": 3,
    "user_message": "No specific gifts. Please donate my books to the city library.",
    "extracted_updates": [
      { "field": "specific_gifts", "value": [], "status": "set" },
      { "field": "additional_wishes", "value": "Please donate my books to the city library.", "status": "set" }
    ],
    "assistant_reply": "Thanks -- I have everything I need for the draft document.",
    "state_completion": 100.0,
    "document_generated": true
  }
]
```

---

## 4. Fallback Verification Log

Fault injection test `test_primary_error_response_falls_back_to_backup` validates that when an external LLM fails, the system seamlessly transitions to mock extraction without failing the HTTP request:

```text
[TELEMETRY AUDIT]
turn_id: 1
provider_configured: openai (gpt-4o)
provider_status: FAILED (503 Service Unavailable)
fallback_triggered: True
fallback_provider: mock (deterministic rule engine)
state_mutations_applied: 2
session_health: OK
total_turn_latency: 1.28ms
```

# Wenup Document Intake Assistant

**Engineering Evaluation Submission**  
*A reliable, privacy-first conversational legal intake assistant powered by a hybrid deterministic-LLM architecture.*

[![Test Suite](https://img.shields.io/badge/Tests-101%20Passed%20(100%25)-brightgreen.svg)]()
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)]()
[![License](https://img.shields.io/badge/License-Proprietary-purple.svg)]()

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Vanilla HTML/CSS/JS)                    │
│  - Wenup Brand Identity (#2D006B Purple, #E2F832 Lime, Cream Parchment)│
│  - Reactive 3-Column Grid: Chat | Structured State Cards | Live Draft  │
│  - Real-Time Telemetry Inspector & In-App Architecture Modal           │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ REST / JSON API (FastAPI)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    BACKEND APPLICATION CONTROLLER                      │
│  - Concurrency Lock: threading.Lock per active Session ID under Guard  │
│  - Session Manager: Transient in-memory state with 2-hour TTL pruning  │
└──────┬────────────────────────────┬─────────────────────────────┬──────┘
       │ 1. Extraction Candidate    │ 2. Validation & Gating      │ 3. Generation
┌──────▼─────────────────────┐ ┌────▼──────────────────────┐ ┌────▼─────────────────────┐
│    LLM EXTRACTION LAYER    │ │  DETERMINISTIC VALIDATION │ │   DOCUMENT GENERATOR    │
│ - OpenAI / Gemini Provider │ │ - Pydantic Schema Gating  │ │ - Deterministic Template  │
│ - Automatic Mock Fallback  │ │ - Invariant Quarantine    │ │ - Provenance Watermark    │
│ - Structured JSON Schema   │ │ - State Transition Engine │ │ - Legal Disclaimer Header │
└────────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

---

## 🌟 Key Engineering Highlights

* 🛡️ **Strict Deterministic Boundary:** LLMs act exclusively as unstructured NLU parsers producing candidate updates. All state mutations, cross-field invariants, and document generation are governed by deterministic Python/Pydantic code.
* 🔒 **Per-Session Concurrency Safety:** Standard library `threading.Lock` under an atomic registry guard serializes concurrent requests to the *same* session while allowing requests for *different* sessions to execute in parallel without contention.
* 🚦 **Contradiction Quarantine Engine:** Conflicting cross-turn answers are automatically quarantined in `needs_clarification` rather than silently overwriting verified data.
* 📜 **Zero-Hallucination Legal Drafter:** The draft document is rendered deterministically with mandatory legal disclaimer headers and explicit `[Information Required]` placeholders.
* 🔒 **Privacy-by-Design:** Zero persistent browser storage (`localStorage`, `IndexedDB`). Sessions exist purely in backend memory with a 2-hour TTL and instant purge on reset.
* ⚡ **Automatic Provider Fallback:** Primary providers (OpenAI, Gemini) seamlessly cascade to a local deterministic mock engine on network timeouts, auth failures, or rate limits, complete with telemetry provenance.

---

## 🚀 Quick Start & Running Locally

### 1. Clone & Set Up Python Environment
```bash
git clone https://github.com/shlokvij/WenupTechnicalTest.git
cd WenupTechnicalTest/backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment (Optional for Real LLM)
Create a `.env` file in the `backend/` directory:
```env
# Optional: If unset or invalid, the system automatically runs on the deterministic mock provider
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Or Google Gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-pro
```

### 3. Launch the Server
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## 🧪 Running Automated Tests

The repository includes a comprehensive 101-test evaluation suite adhering to the **Evaluation Test Corpus**:

```bash
cd backend
source .venv/bin/activate
pytest -v
```

### Test Suite Summary:
```text
============================= 101 passed in 0.49s ==============================
- State & Domain Models:        7 / 7   PASSED
- Schema & Validation Gating:   13 / 13 PASSED
- Conversation Engine:          10 / 10 PASSED
- Legal Template Generator:     5 / 5   PASSED
- Session & Concurrency Lock:   10 / 10 PASSED
- Evaluation Corpus (TC-001–58):26 / 26 PASSED
- End-to-End User Journeys:     7 / 7   PASSED
- Adversarial Defense:          5 / 5   PASSED
- Fallback Fault Injection:     4 / 4   PASSED
- Parsing & Markdown Recovery:  3 / 3   PASSED
- Real Provider Smoke Invariants:6 / 6  PASSED
- API Endpoints & Contracts:    5 / 5   PASSED
```

---

## 📚 Complete Documentation Index

| Document | Description | Target Read Time |
|:---|:---|:---:|
| **[DEVELOPMENT_JOURNEY.md](DEVELOPMENT_JOURNEY.md)** | Core engineering narrative: problem space, architecture, tradeoffs, bugs, privacy, production | 4–5 mins |
| **[DECISION_LOG.md](DECISION_LOG.md)** | Architecture Decision Records (ADRs 001–007) | 3–4 mins |
| **[docs/EXPERIMENT_REPORT.md](docs/EXPERIMENT_REPORT.md)** | 4 Empirical experiments comparing LLM vs Deterministic engines | 4–5 mins |
| **[AI_LOG.md](AI_LOG.md)** | Candid design log: system prompts, rejected alternatives, bug post-mortems | 3–4 mins |
| **[TEST_EVIDENCE.md](TEST_EVIDENCE.md)** | Full pytest output, test breakdown, E2E transcripts, fallback logs | 2–3 mins |
| **[PRODUCTION_IMPROVEMENTS.md](PRODUCTION_IMPROVEMENTS.md)** | Enterprise roadmap: eIDV, KMS encryption, Redis Redlock, OpenTelemetry | 3–4 mins |
| **[docs/evidence/FINAL_EVALUATION_REPORT.md](docs/evidence/FINAL_EVALUATION_REPORT.md)** | Full Evaluation Corpus report (Categories A to T) | 5–6 mins |
| **[docs/evidence/README.md](docs/evidence/README.md)** | High-resolution visual screenshot index | 1–2 mins |

---

## 📸 Visual Evidence Preview

High-resolution screenshot captures are cataloged in [`docs/evidence/screenshots/`](docs/evidence/screenshots/):
1. **`01-initial-state.png`**: Clean initial application state with Wenup branding and empty state cards.
2. **`02-multi-field-conversation.png`**: Multi-field extraction and live progress updating.
3. **`03-pipeline-telemetry.png`**: Real-time developer telemetry panel with round-trip latency & fallback tracking.
4. **`04-draft-document-preview.png`**: Live legal draft preview on simulated legal parchment with watermark.
5. **`05-architecture-modal.png`**: In-app architecture inspector dialog.

---

## 🔌 API Reference

### `POST /api/session`
Initializes a transient intake session and returns the initial greeting.

### `POST /api/session/{id}/message`
Processes a user conversation turn.
* **Request:** `{"message": "I live at 42 Park Road in London"}`
* **Response:**
  ```json
  {
    "ok": true,
    "assistant_message": "Got it. Does this document need to cover your assets worldwide, or UK-only?",
    "state": { ... },
    "document": "...",
    "telemetry": {
      "provider_used": "mock",
      "fallback_active": false,
      "latency_ms": 1.2
    }
  }
  ```

### `POST /api/session/{id}/reset`
Purges all session history and resets canonical state to empty.

### `DELETE /api/session/{id}`
Completely deletes the session from server memory.

---

## ⚖️ Legal Disclaimer

*This application is an engineering demonstration of a conversational document intake assistant. The generated drafts are for demonstration purposes only, are not legally binding, and do not constitute formal legal advice. A qualified solicitor must review and execute any legal document.*

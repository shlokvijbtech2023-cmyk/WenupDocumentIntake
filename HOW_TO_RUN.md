# How to Open & Run the Wenup Document Intake Assistant

This guide provides clear, step-by-step instructions to launch the web application, run the automated test suite, and view the generated documentation reports.

---

## ⚡ Quick Start (TL;DR)

If you already have Python installed, run these 3 commands from the repository root:

```bash
# 1. Navigate to backend directory
cd backend

# 2. Set up virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Start the application server
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

🌐 **Open your browser and navigate to:**  
👉 **[http://localhost:8000](http://localhost:8000)** (or [http://127.0.0.1:8000](http://127.0.0.1:8000))

*Note: The application starts in **Connected (mock)** mode by default — zero API keys or external network connections are required to test all features.*

---

## 📋 Prerequisites

* **Python 3.11+** (Python 3.10+ also supported)
* **Web Browser:** Google Chrome, Safari, Firefox, or Microsoft Edge
* **Terminal:** macOS/Linux Terminal or Windows PowerShell / WSL

---

## 🚀 Detailed Step-by-Step Instructions

### Step 1: Clone or Open the Repository
Open your terminal and navigate to the project directory:
```bash
cd /path/to/WenupTechnicalTest
```

### Step 2: Create & Activate a Virtual Environment
```bash
cd backend
python3 -m venv .venv

# On macOS / Linux:
source .venv/bin/activate

# On Windows (Command Prompt / PowerShell):
# .venv\Scripts\activate
```

### Step 3: Install Required Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: (Optional) Configure Real LLM API Keys
By default, the assistant runs on a **deterministic mock engine** that fully implements the natural language intake flow, state updates, validation, and document generation without needing an external API key.

If you wish to run with **OpenAI** or **Google Gemini**, create a `.env` file in the `backend/` directory:

```env
# Option A: OpenAI GPT-4o
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o

# Option B: Google Gemini
GEMINI_API_KEY=AIza-your-gemini-key-here
GEMINI_MODEL=gemini-2.5-pro
```

*(If an API key is missing or invalid, the built-in fallback client automatically cascades to the deterministic mock engine with full telemetry logging).*

### Step 5: Start the FastAPI Server
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

You will see output similar to:
```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Application startup complete.
```

### Step 6: Use the Web Application
Open **[http://localhost:8000](http://localhost:8000)** in your browser:

* **Conversational Intake:** Type your responses into the chat box or click the context-aware quick suggestion chips.
* **Multi-Field Input:** Try typing: *"My name is Jonathan Smith, I live at 18 Baker Street in London, and this covers worldwide assets."*
* **Structured State Cards:** Observe the middle column updating in real time with confirmed fields, status badges, and progress percentages.
* **Authoritative Draft Document:** The right column renders a live legal draft on simulated cream parchment paper.
* **Telemetry Inspector:** Click the "Pipeline Telemetry" tab in the right column to inspect round-trip latency, active LLM provider, and raw Pydantic JSON state.
* **In-App Architecture Modal:** Click the **Architecture** button in the top-right header to view the system data flow diagram and design rationale.
* **Start Over:** Click **Start Over** in the header to purge all in-memory intake data and start a clean session.

---

## 🧪 Running the Automated Test Suite

The test harness runs **101 automated tests** verifying deterministic validation, multi-turn state machines, zero-hallucination document drafting, adversarial prompt-injection defenses, and concurrency safety:

```bash
cd backend
source .venv/bin/activate
pytest -v
```

### Expected Output:
```text
============================= 101 passed in 0.48s ==============================
- Domain Models & Invariants:        7 / 7   PASSED
- Validation Gating & Whitelist:    13 / 13 PASSED
- Multi-Turn Conversation Engine:   10 / 10 PASSED
- Legal Template Generator:          5 / 5   PASSED
- Session & Concurrency Locks:      10 / 10 PASSED
- Evaluation Test Corpus (TC-001–58):26 / 26 PASSED
- End-to-End User Journeys:          7 / 7   PASSED
- Adversarial Prompt Injection:      5 / 5   PASSED
- Fallback Fault Injection:          4 / 4   PASSED
- Parsing & Markdown Recovery:       3 / 3   PASSED
- Real Provider Smoke Invariants:    6 / 6   PASSED
- FastAPI REST API Endpoints:        5 / 5   PASSED
```

---

## 📄 Opening the Word (.docx) Reports

Two formatted Microsoft Word documents with embedded screenshots and tables are available in the root directory:

1. **[`Wenup_Test_Evidence_and_Evaluation_Report.docx`](Wenup_Test_Evidence_and_Evaluation_Report.docx)**  
   *Complete test suite execution evidence, layer-by-layer breakdown, concurrency timing benchmarks, and visual screenshots.*
2. **[`Wenup_Architecture_Tradeoffs_and_Decision_Report.docx`](Wenup_Architecture_Tradeoffs_and_Decision_Report.docx)**  
   *Comparative analysis of architectural alternatives considered vs rejected, 4 empirical experiments, and enterprise production roadmap.*

*You can open these directly in Microsoft Word, Google Docs, Apple Pages, or LibreOffice.*

---

## 🔧 Troubleshooting & FAQs

### Port 8000 Already in Use
If another process is using port 8000, specify an alternative port:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8080
```
Then open **[http://localhost:8080](http://localhost:8080)** in your browser.

### Module Not Found Errors
Ensure your virtual environment is active (`source .venv/bin/activate`) and run:
```bash
pip install -r requirements.txt
```

---

## 📚 Related Documentation Files

* **[`README.md`](README.md)** — Master repository entry point and evaluator guide
* **[`DEVELOPMENT_JOURNEY.md`](DEVELOPMENT_JOURNEY.md)** — 4–5 min engineering narrative
* **[`DECISION_LOG.md`](DECISION_LOG.md)** — Architecture Decision Records (ADR-001 to ADR-007)
* **[`docs/EXPERIMENT_REPORT.md`](docs/EXPERIMENT_REPORT.md)** — 4 Empirical experiments
* **[`AI_LOG.md`](AI_LOG.md)** — Design history, system prompts, and bug post-mortems
* **[`PRODUCTION_IMPROVEMENTS.md`](PRODUCTION_IMPROVEMENTS.md)** — Enterprise production readiness roadmap

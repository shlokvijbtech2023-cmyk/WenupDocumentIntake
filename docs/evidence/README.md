# Evidence Artifacts & Screenshot Catalog

**Project:** Wenup Document Intake Assistant  
**Repository:** `WenupTechnicalTest/document-intake-assistant`  
**Directory:** `docs/evidence/screenshots/`  

This directory contains high-resolution visual evidence captured from live browser end-to-end sessions demonstrating the key UI states, telemetry inspector, legal draft preview, and architecture modal.

---

## Screenshot Index

### 1. Initial Application State (`01-initial-state.png`)
* **File:** `docs/evidence/screenshots/01-initial-state.png`
* **Description:** Clean initial load showing authentic Wenup branding (royal purple `#2D006B`, acid lime `#E2F832` badge), 9 empty structured state cards with status badges, legal disclaimer banner, and initial greeting.
* **Key Visuals:** 0% completion bar, clean parchment draft area, proactive question chips.

---

### 2. Multi-Field Extraction in Action (`02-multi-field-conversation.png`)
* **File:** `docs/evidence/screenshots/02-multi-field-conversation.png`
* **Description:** User provides full name and address in a single natural sentence. The system extracts both fields simultaneously without requiring sequential prompts.
* **Key Visuals:** Progress bar increases dynamically, state cards for Name and Address turn green (Confirmed), and assistant seamlessly asks for worldwide asset scope.

---

### 3. Pipeline Telemetry Inspector (`03-pipeline-telemetry.png`)
* **File:** `docs/evidence/screenshots/03-pipeline-telemetry.png`
* **Description:** Developer & Evaluator telemetry panel displaying real-time execution metrics for every turn.
* **Key Visuals:** Active provider, round-trip latency in milliseconds, session revision counter, fallback status, and quarantined contradictions.

---

### 4. Authoritative Draft Document Preview (`04-draft-document-preview.png`)
* **File:** `docs/evidence/screenshots/04-draft-document-preview.png`
* **Description:** Live legal draft document rendered on simulated cream legal parchment with non-binding legal watermark.
* **Key Visuals:** Mandatory statutory disclaimer header, verified factual clauses, explicit `[Information Required]` placeholders for missing fields, and cryptographic provenance audit footer.

---

### 5. Interactive Architecture Modal (`05-architecture-modal.png`)
* **File:** `docs/evidence/screenshots/05-architecture-modal.png`
* **Description:** In-app architecture inspector explaining the deterministic validation boundary, Pydantic state machine, zero-hallucination document generator, and privacy-by-design guarantees.
* **Key Visuals:** ASCII data flow diagram, design rationale summary, and interactive modal dialog.

---

## Directory Structure

```
docs/evidence/
├── README.md                           # This screenshot index
├── FINAL_EVALUATION_REPORT.md          # Comprehensive test evaluation report (A-T)
├── experiments/                        # Experiment harness logs
├── test-runs/                          # Pytest test execution logs
└── screenshots/
    ├── 01-initial-state.png            # Initial UI state
    ├── 02-multi-field-conversation.png # Multi-field extraction
    ├── 03-pipeline-telemetry.png       # Live telemetry inspector
    ├── 04-draft-document-preview.png   # Parchment draft preview
    └── 05-architecture-modal.png       # Architecture inspector modal
```

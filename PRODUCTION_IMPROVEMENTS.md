# Production Readiness & Architecture Evolution Roadmap

**Project:** Wenup Document Intake Assistant  
**Repository:** `WenupTechnicalTest/document-intake-assistant`  
**Scope:** Engineering enhancements required to transition the prototype into a regulated, enterprise-grade production legal platform.

---

## 1. Security, Identity & Compliance

### 1.1 Electronic Identity Verification (eIDV) & AML
* **Current State:** The user self-reports their full name and address in conversation.
* **Production Requirement:** Integrate with certified eIDV providers (e.g., Onfido, Yoti, GBG) to perform:
  * Government photo ID verification (Passport / UK Driving Licence).
  * Proof of address verification via UK Electoral Roll and Credit Reference Agencies.
  * Politically Exposed Persons (PEP) and Sanctions screening for AML compliance.

### 1.2 Cryptographic Field-Level Encryption (KMS)
* **Current State:** Transient in-memory dictionary storage.
* **Production Requirement:** If sessions require persistence across devices or save-and-resume workflows:
  * Implement AWS KMS / HashiCorp Vault envelope encryption.
  * Encrypt each PII field individually before persisting to database (AES-GCM-256).
  * Maintain strict audit logs of decryption key usage.

### 1.3 Role-Based Access Control (RBAC) & Solicitor Portal
* **Production Requirement:** Implement OAuth2 / OpenID Connect (OIDC) with fine-grained scopes:
  * `client:intake` (Read/write own session)
  * `solicitor:review` (Read-only access to drafts assigned for legal review)
  * `compliance:audit` (Access to provenance telemetry logs without viewing plaintext PII)

---

## 2. Distributed Architecture & Scalability

```
                       ┌─────────────────────────┐
                       │  Cloudflare WAF & DDoS  │
                       └────────────┬────────────┘
                                    │ HTTPS (TLS 1.3)
                       ┌────────────▼────────────┐
                       │   AWS ALB / Envoy Proxy │
                       └────────────┬────────────┘
               ┌────────────────────┼────────────────────┐
               │                    │                    │
        ┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐
        │ FastAPI Pod │      │ FastAPI Pod │      │ FastAPI Pod │
        │  (Worker 1) │      │  (Worker 2) │      │  (Worker 3) │
        └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
               │                    │                    │
               └────────────┬───────┴────────────────────┘
                            │ Distributed Redlock & TTL
               ┌────────────▼────────────────────────────┐
               │    Redis Sentinel / ElastiCache Cluster  │
               │   (Encrypted Sessions & Distributed Lock)│
               └─────────────────────────────────────────┘
```

### 2.1 Distributed Redis Session Store & Redlock
* **Current State:** Python `asyncio.Lock` and in-memory dictionary (single instance).
* **Production Requirement:** Deploy a multi-node Redis cluster utilizing the Redlock algorithm for distributed locking across autoscaled Kubernetes pods.

### 2.2 Stateless Microservices Separation
* Separate the architecture into dedicated microservices:
  1. **Gateway & Session Service:** Manages client websockets and session orchestration.
  2. **NLU Extraction Service:** Asynchronous worker queue processing LLM extraction calls with batching.
  3. **PDF Generation Service:** Isolated sandbox service compiling PDF/A documents via Weasyprint.

---

## 3. Observability, Telemetry & LLM Ops

### 3.1 OpenTelemetry Distributed Tracing
* Instrument all HTTP endpoints, LLM API calls, validation gates, and template renders with OpenTelemetry spans.
* Export traces to Datadog / Honeycomb for end-to-end latency waterfall inspection.

### 3.2 Real-Time LLM Observability & Prompt Drift Tracking
* Integrate **Langfuse** or **Arize Phoenix** to monitor:
  * Token consumption and dollar cost per intake turn.
  * Extraction confidence distributions over time.
  * Drift in prompt output formats across provider model updates.
  * Semantic clustering of user clarification requests to identify confusing intake questions.

### 3.3 Prometheus Metrics & Grafana Dashboards
* Export real-time Prometheus operational metrics:
  * `wenup_intake_turns_total{status, provider}`
  * `wenup_intake_fallback_triggered_total{reason}`
  * `wenup_intake_contradiction_quarantined_total{field}`
  * `wenup_intake_turn_latency_seconds_bucket`

---

## 4. Advanced Legal Engineering & Document Packaging

### 4.1 Cryptographically Signed PDF/A-1b Output
* **Production Requirement:** Replace plain text / markdown draft preview with archival-grade PDF/A-1b documents:
  * Embed cryptographic SHA-256 intake hash into document metadata.
  * Embed digital signature using an approved Law Society / SRA corporate certificate.

### 4.2 E-Signature Workflow Integration
* Direct API integration with DocuSign / Adobe Sign / OneSpan for digital execution:
  * Automated witness signing invitations for Wills under UK Wills Act 1837 / Electronic Communications Act 2000.
  * Audit trail certification recording IP addresses, timestamps, and witness signatures.

---

## 5. Summary Implementation Roadmap

| Phase | Timeline | Core Deliverables |
|:---|:---:|:---|
| **Phase 1: Security & Storage** | Weeks 1–3 | Redis distributed locks, KMS encryption, OAuth2 auth |
| **Phase 2: Observability** | Weeks 4–5 | OpenTelemetry tracing, Langfuse prompt drift monitoring, Grafana |
| **Phase 3: Legal & Signatures** | Weeks 6–8 | Weasyprint PDF/A generation, DocuSign API e-signing |
| **Phase 4: eIDV & Compliance** | Weeks 9–11| Onfido eIDV integration, AML screening, SRA compliance audit |

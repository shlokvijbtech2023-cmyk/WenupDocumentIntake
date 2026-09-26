// Wenup Document Intake Assistant — Frontend Application
// Connects to FastAPI backend via clean typed REST API.
// Explicit state is maintained strictly server-side (IntakeState is source of truth).

const API_BASE = window.DIA_API_BASE || "";

const els = {
  status: document.getElementById("connection-status"),
  statusLabel: document.getElementById("status-label"),
  progressCount: document.getElementById("progress-count"),
  progressFill: document.getElementById("progress-fill"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  sendBtn: document.getElementById("send-btn"),
  quickChipsWrapper: document.getElementById("quick-chips-wrapper"),
  turnCounter: document.getElementById("turn-counter"),
  stateCardsGrid: document.getElementById("state-cards-grid"),
  documentText: document.getElementById("document-text"),
  docStatusBadge: document.getElementById("doc-status-badge"),
  copyDocBtn: document.getElementById("copy-doc-btn"),
  copyBtnText: document.getElementById("copy-btn-text"),
  downloadDocBtn: document.getElementById("download-doc-btn"),
  tabBtns: document.querySelectorAll(".tab-btn"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  resetBtn: document.getElementById("reset-session-btn"),
  archModalBtn: document.getElementById("arch-modal-btn"),
  archModal: document.getElementById("arch-modal"),
  closeArchModalBtn: document.getElementById("close-arch-modal-btn"),
  closeModalFooterBtn: document.getElementById("close-modal-footer-btn"),
  
  // Telemetry elements
  telemetryProvider: document.getElementById("telemetry-provider"),
  telemetryRevision: document.getElementById("telemetry-revision"),
  telemetryComplete: document.getElementById("telemetry-complete"),
  telemetryApplied: document.getElementById("telemetry-applied"),
  telemetryClarified: document.getElementById("telemetry-clarified"),
  telemetryRejected: document.getElementById("telemetry-rejected"),
  telemetryJsonRaw: document.getElementById("telemetry-json-raw"),
};

const FIELD_METADATA = [
  { key: "full_name", label: "Full Name", icon: "👤", desc: "Testator's legal full name" },
  { key: "home_address", label: "Home Address", icon: "🏠", desc: "Residential address" },
  { key: "covers_worldwide_assets", label: "Worldwide Assets", icon: "🌍", desc: "Scope of asset coverage" },
  { key: "has_children", label: "Has Children", icon: "👶", desc: "Parental status" },
  { key: "children_names", label: "Children's Names", icon: "👥", desc: "Named beneficiaries (if applicable)" },
  { key: "executor.name", label: "Executor Name", icon: "⚖️", desc: "Appointed legal representative" },
  { key: "executor.relationship", label: "Executor Relationship", icon: "🤝", desc: "Relationship to testator" },
  { key: "specific_gifts", label: "Specific Gifts", icon: "🎁", desc: "Designated personal bequests" },
  { key: "additional_wishes", label: "Additional Wishes", icon: "📝", desc: "Funeral or personal wishes" },
];

let sessionId = null;
let currentTurnCount = 0;
let lastDocumentContent = "";

// ---------- Status & Progress Utilities ----------

function setStatus(label, kind = "ready") {
  els.statusLabel.textContent = label;
  els.status.className = `status-pill ${kind}`;
}

function updateProgress(progress) {
  if (!progress) return;
  const { completed_core_fields, total_core_fields, percentage, is_core_complete } = progress;
  els.progressCount.textContent = `${completed_core_fields} / ${total_core_fields} core fields (${percentage}%)`;
  els.progressFill.style.width = `${percentage}%`;
  
  if (is_core_complete) {
    els.progressFill.classList.add("complete");
    els.docStatusBadge.textContent = "Ready ✓";
    els.docStatusBadge.classList.add("complete");
  } else {
    els.progressFill.classList.remove("complete");
    els.docStatusBadge.textContent = "Draft";
    els.docStatusBadge.classList.remove("complete");
  }
}

function setInputEnabled(enabled) {
  els.chatInput.disabled = !enabled;
  els.sendBtn.disabled = !enabled;
  if (enabled) {
    els.chatInput.focus();
  }
}

// ---------- Chat Rendering ----------

function addMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;

  const sender = document.createElement("span");
  sender.className = "bubble-sender";
  sender.textContent = role === "assistant" ? "Intake Assistant" : (role === "user" ? "You" : "System Note");

  const body = document.createElement("div");
  body.className = "bubble-content";
  body.textContent = content;

  bubble.appendChild(sender);
  bubble.appendChild(body);
  els.chatLog.appendChild(bubble);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function addSystemNote(content, isError = false) {
  const note = document.createElement("div");
  note.className = `chat-bubble system${isError ? " error" : ""}`;
  note.textContent = content;
  els.chatLog.appendChild(note);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function showTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "chat-bubble assistant typing-indicator-bubble";
  typing.id = "typing-indicator";
  typing.innerHTML = `
    <span class="bubble-sender">Intake Assistant</span>
    <div class="bubble-content" style="display: inline-flex; gap: 4px; padding: 10px 14px;">
      <span class="dot" style="width: 6px; height: 6px; border-radius: 50%; background: #605578; animation: pulse-dot 1s infinite 0.1s;"></span>
      <span class="dot" style="width: 6px; height: 6px; border-radius: 50%; background: #605578; animation: pulse-dot 1s infinite 0.2s;"></span>
      <span class="dot" style="width: 6px; height: 6px; border-radius: 50%; background: #605578; animation: pulse-dot 1s infinite 0.3s;"></span>
    </div>
  `;
  els.chatLog.appendChild(typing);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}

// ---------- Context-Aware Quick Suggestion Chips ----------

function updateQuickChips(state) {
  els.quickChipsWrapper.innerHTML = "";
  if (!state) return;

  const chips = [];
  const needsClarification = state.needs_clarification || {};

  if (Object.keys(needsClarification).length > 0) {
    const firstClarified = Object.keys(needsClarification)[0];
    if (firstClarified === "has_children") {
      chips.push("Actually, I do have children", "To clarify, I do not have children");
    } else if (firstClarified.includes("executor")) {
      chips.push("My executor is my brother James", "Confirm executor as Priya");
    }
  } else if (state.full_name && !state.home_address) {
    chips.push("10 Downing Street, London", "42 Park Lane, Manchester");
  } else if (state.home_address && state.covers_worldwide_assets === null) {
    chips.push("Yes, cover worldwide assets", "No, UK assets only");
  } else if (state.covers_worldwide_assets !== null && state.has_children === null) {
    chips.push("Yes, I have children", "No, I do not have children");
  } else if (state.has_children === true && (!state.children_names || state.children_names.length === 0)) {
    chips.push("Alice and Daniel", "Oliver and Sophia");
  } else if (state.has_children !== null && !state.executor?.name) {
    chips.push("My sister Priya", "My friend Marcus Bennett");
  } else if (state.executor?.name && !state.executor?.relationship) {
    chips.push("Sister", "Brother", "Spouse", "Close friend", "Solicitor");
  } else if (!state.gifts_addressed) {
    chips.push("No specific gifts", "My vintage watch to Tom", "Family heirlooms to Alice");
  } else if (!state.wishes_addressed) {
    chips.push("No additional wishes", "Play classical music at the memorial service");
  }

  chips.forEach((chipText) => {
    const chipBtn = document.createElement("button");
    chipBtn.type = "button";
    chipBtn.className = "quick-chip";
    chipBtn.textContent = chipText;
    chipBtn.addEventListener("click", () => {
      els.chatInput.value = chipText;
      els.chatForm.dispatchEvent(new Event("submit"));
    });
    els.quickChipsWrapper.appendChild(chipBtn);
  });
}

// ---------- Structured State Grid Rendering ----------

function formatFieldValue(val) {
  if (val === null || val === undefined || val === "") return null;
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "None";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function renderStateCards(state, recentlyUpdated = []) {
  els.stateCardsGrid.innerHTML = "";
  const flagged = state.needs_clarification || {};

  const valuesMap = {
    "full_name": state.full_name,
    "home_address": state.home_address,
    "covers_worldwide_assets": state.covers_worldwide_assets,
    "has_children": state.has_children,
    "children_names": state.children_names,
    "executor.name": state.executor?.name,
    "executor.relationship": state.executor?.relationship,
    "specific_gifts": state.specific_gifts,
    "additional_wishes": state.additional_wishes,
  };

  FIELD_METADATA.forEach((meta) => {
    const rawVal = valuesMap[meta.key];
    const isClarify = Boolean(flagged[meta.key]);
    const isUpdated = recentlyUpdated.includes(meta.key);

    let statusType = "pending";
    let statusText = "Pending ◯";

    if (isClarify) {
      statusType = "clarify";
      statusText = "Needs Clarification ⚠️";
    } else if (meta.key === "children_names") {
      if (state.has_children === false) {
        statusType = "confirmed";
        statusText = "N/A (No Children) ✓";
      } else if (Array.isArray(rawVal) && rawVal.length > 0) {
        statusType = "confirmed";
        statusText = "Confirmed ✓";
      }
    } else if (meta.key === "specific_gifts" && state.gifts_addressed) {
      statusType = "confirmed";
      statusText = "Confirmed ✓";
    } else if (meta.key === "additional_wishes" && state.wishes_addressed) {
      statusType = "confirmed";
      statusText = "Confirmed ✓";
    } else if (rawVal !== null && rawVal !== undefined && rawVal !== "") {
      statusType = "confirmed";
      statusText = "Confirmed ✓";
    }

    const card = document.createElement("div");
    card.className = `state-card ${isUpdated ? "highlight-update" : ""}`;

    const formattedVal = formatFieldValue(rawVal);
    let displayVal = formattedVal;
    if (!displayVal) {
      if (meta.key === "children_names" && state.has_children === false) {
        displayVal = "None (user confirmed no children)";
      } else if (meta.key === "specific_gifts" && state.gifts_addressed && (!rawVal || rawVal.length === 0)) {
        displayVal = "None specified";
      } else if (meta.key === "additional_wishes" && state.wishes_addressed && !rawVal) {
        displayVal = "None specified";
      }
    }

    card.innerHTML = `
      <div class="state-card-header">
        <span class="state-card-label">${meta.icon} ${meta.label}</span>
        <span class="state-pill ${statusType}">${statusText}</span>
      </div>
      <div class="state-card-value ${!displayVal ? "empty" : ""}">
        ${displayVal || "Not yet provided"}
      </div>
      ${isClarify ? `<div class="state-card-clarification-note">⚠️ ${flagged[meta.key]}</div>` : ""}
    `;

    els.stateCardsGrid.appendChild(card);
  });
}

function renderDocument(doc) {
  lastDocumentContent = doc;
  els.documentText.textContent = doc || "Draft document will appear here once intake begins.";
}

// ---------- Telemetry Rendering ----------

function updateTelemetry(data, state) {
  if (!data) return;
  els.telemetryProvider.textContent = data.llm_provider_used || "primary";
  els.telemetryRevision.textContent = String(data.revision || 0);
  els.telemetryComplete.textContent = data.core_complete ? "Yes (Draft authoritatively generated)" : "In Progress";
  
  els.telemetryApplied.textContent = (data.applied_fields && data.applied_fields.length)
    ? data.applied_fields.join(", ") : "None this turn";
    
  els.telemetryClarified.textContent = (data.clarifications && data.clarifications.length)
    ? data.clarifications.join(", ") : "None";

  els.telemetryRejected.textContent = (data.rejected_fields && data.rejected_fields.length)
    ? data.rejected_fields.map(r => `${r.field} (${r.reason})`).join(", ") : "None";

  if (state) {
    els.telemetryJsonRaw.textContent = JSON.stringify(state, null, 2);
  }
}

// ---------- Session Operations ----------

async function startSession() {
  setStatus("Connecting…", "connecting");
  setInputEnabled(false);
  els.chatLog.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/session`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sessionId = data.session_id;
    currentTurnCount = 0;

    addMessage("assistant", data.assistant_message);
    renderStateCards(data.state);
    updateProgress(data.progress);
    updateQuickChips(data.state);
    updateTelemetry({
      llm_provider_used: "ready",
      revision: data.revision,
      core_complete: data.progress?.is_core_complete,
      applied_fields: [],
      clarifications: [],
      rejected_fields: []
    }, data.state);

    // Fetch initial document
    const docRes = await fetch(`${API_BASE}/api/session/${sessionId}/document`);
    if (docRes.ok) {
      const docData = await docRes.json();
      renderDocument(docData.document);
    }

    // Health / Provider check
    const healthRes = await fetch(`${API_BASE}/api/health`);
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      const providerName = healthData.llm_provider || "mock";
      setStatus(`Connected (${providerName})`, "ready");
    } else {
      setStatus("Connected", "ready");
    }

    setInputEnabled(true);
  } catch (err) {
    setStatus("Backend Offline", "error");
    addSystemNote("Unable to connect to the backend server. Please make sure the FastAPI server is running on localhost:8000.", true);
  }
}

async function sendMessage(message) {
  if (!sessionId) return;
  addMessage("user", message);
  currentTurnCount++;
  els.turnCounter.textContent = `Turn #${currentTurnCount}`;
  setInputEnabled(false);
  showTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    removeTypingIndicator();

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      addSystemNote(`Request error: ${detail.detail || res.statusText}`, true);
      return;
    }

    const data = await res.json();
    addMessage("assistant", data.assistant_message);
    renderStateCards(data.state, data.applied_fields || []);
    renderDocument(data.document);
    updateProgress(data.progress);
    updateQuickChips(data.state);
    updateTelemetry(data, data.state);

    if (data.llm_provider_used === "mock_fallback") {
      setStatus("Degraded Mode (Mock Fallback)", "fallback");
    }

    if (data.core_complete && currentTurnCount > 1 && !data.state.wishes_addressed) {
      addSystemNote("✨ All core required fields are now confirmed! You can provide specific gifts, additional wishes, or any corrections.");
    }
  } catch (err) {
    removeTypingIndicator();
    addSystemNote("Network communication error. Please retry your message.", true);
  } finally {
    setInputEnabled(true);
  }
}

async function resetSession() {
  if (!sessionId) return;
  const confirmed = confirm("Are you sure you want to discard this intake session and start fresh? All in-memory state will be cleared.");
  if (!confirmed) return;

  try {
    await fetch(`${API_BASE}/api/session/${sessionId}/reset`, { method: "POST" });
  } catch (err) {
    // proceed anyway
  }
  startSession();
}

// ---------- Event Listeners ----------

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = els.chatInput.value.trim();
  if (!val || !sessionId) return;
  els.chatInput.value = "";
  sendMessage(val);
});

els.tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.tabBtns.forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    const targetTab = btn.dataset.tab;
    els.tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== `panel-${targetTab}`;
      panel.classList.toggle("active", panel.id === `panel-${targetTab}`);
    });
  });
});

els.copyDocBtn.addEventListener("click", async () => {
  if (!lastDocumentContent) return;
  try {
    await navigator.clipboard.writeText(lastDocumentContent);
    els.copyBtnText.textContent = "Copied! ✓";
    setTimeout(() => {
      els.copyBtnText.textContent = "Copy Text";
    }, 2000);
  } catch (err) {
    alert("Unable to copy to clipboard automatically.");
  }
});

els.downloadDocBtn.addEventListener("click", () => {
  if (!lastDocumentContent) return;
  const blob = new Blob([lastDocumentContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Personal_Wishes_Draft_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

els.resetBtn.addEventListener("click", resetSession);

els.archModalBtn.addEventListener("click", () => {
  els.archModal.hidden = false;
});

els.closeArchModalBtn.addEventListener("click", () => {
  els.archModal.hidden = true;
});

els.closeModalFooterBtn.addEventListener("click", () => {
  els.archModal.hidden = true;
});

els.archModal.addEventListener("click", (e) => {
  if (e.target === els.archModal) {
    els.archModal.hidden = true;
  }
});

// Initialize on page load
renderStateCards({ executor: {} });
startSession();

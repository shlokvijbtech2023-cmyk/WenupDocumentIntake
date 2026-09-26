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

  // 3x3 Tile Controls & Finish Options
  toggleFlipAllBtn: document.getElementById("toggle-flip-all-btn"),
  toggleFlipText: document.getElementById("toggle-flip-text"),
  stateFinishBtn: document.getElementById("state-finish-btn"),
  headerFinishBtn: document.getElementById("header-finish-btn"),
  tilesCompleteBanner: document.getElementById("tiles-complete-banner"),
  bannerViewDocBtn: document.getElementById("banner-view-doc-btn"),
  
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
  { key: "full_name", tileIndex: 1, label: "Full Name", icon: "👤", desc: "Testator's legal full name", image: "/field_tiles/1.png" },
  { key: "home_address", tileIndex: 2, label: "Home Address", icon: "🏠", desc: "Residential address", image: "/field_tiles/2.png" },
  { key: "covers_worldwide_assets", tileIndex: 3, label: "Worldwide Assets", icon: "🌍", desc: "Scope of asset coverage", image: "/field_tiles/3.png" },
  { key: "has_children", tileIndex: 4, label: "Has Children", icon: "👶", desc: "Parental status", image: "/field_tiles/4.png" },
  { key: "children_names", tileIndex: 5, label: "Children's Names", icon: "👥", desc: "Named beneficiaries (if applicable)", image: "/field_tiles/5.png" },
  { key: "executor.name", tileIndex: 6, label: "Executor Name", icon: "⚖️", desc: "Appointed legal representative", image: "/field_tiles/6.png" },
  { key: "executor.relationship", tileIndex: 7, label: "Executor Relationship", icon: "🤝", desc: "Relationship to testator", image: "/field_tiles/7.png" },
  { key: "specific_gifts", tileIndex: 8, label: "Specific Gifts", icon: "🎁", desc: "Designated personal bequests", image: "/field_tiles/8.png" },
  { key: "additional_wishes", tileIndex: 9, label: "Additional Wishes", icon: "📝", desc: "Funeral or personal wishes", image: "/field_tiles/9.png" },
];

let sessionId = null;
let currentTurnCount = 0;
let lastDocumentContent = "";
let latestState = null;
let latestProgress = null;

// Track individual card flip preferences (overrides auto)
const manualFlippedCards = new Map(); // key -> boolean
let globalForceFlipMode = null; // null (auto) | true (all art) | false (all data)

// ---------- Status & Progress Utilities ----------

function setStatus(label, kind = "ready") {
  els.statusLabel.textContent = label;
  els.status.className = `status-pill ${kind}`;
}

function updateProgress(progress) {
  if (!progress) return;
  latestProgress = progress;
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

  // Show "Finish Document" option whenever at least 4 core fields are filled or core is complete
  const canFinish = is_core_complete || completed_core_fields >= 4;
  if (els.stateFinishBtn) els.stateFinishBtn.style.display = canFinish ? "inline-flex" : "none";
  if (els.headerFinishBtn) els.headerFinishBtn.style.display = canFinish ? "inline-flex" : "none";
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
  } else if (!state.full_name) {
    chips.push("Sarah Wilson", "David Miller");
  } else if (!state.home_address) {
    chips.push("10 Downing Street, London", "42 Park Lane, Manchester");
  } else if (state.covers_worldwide_assets === null) {
    chips.push("Yes, cover worldwide assets", "No, UK assets only");
  } else if (state.has_children === null) {
    chips.push("Yes, I have children", "No, I do not have children");
  } else if (state.has_children === true && (!state.children_names || state.children_names.length === 0)) {
    chips.push("Alice and Daniel", "Oliver and Sophia");
  } else if (!state.executor?.name) {
    chips.push("My sister Priya", "My friend Marcus Bennett");
  } else if (!state.executor?.relationship) {
    chips.push("Sister", "Brother", "Spouse", "Close friend", "Solicitor");
  } else if (!state.gifts_addressed) {
    chips.push("No specific gifts", "My vintage watch to Tom", "Family heirlooms to Alice");
  } else if (!state.wishes_addressed) {
    chips.push("No additional wishes (Finish)", "Play classical music at the memorial service", "✨ Finish Document Now");
  }

  // If core fields are done or nearly done, always provide a finish option
  if (state.full_name && state.home_address && state.executor?.name && !chips.some(c => c.includes("Finish"))) {
    chips.push("✨ Finish Document Now");
  }

  chips.forEach((chipText) => {
    const chipBtn = document.createElement("button");
    chipBtn.type = "button";
    chipBtn.className = `quick-chip ${chipText.includes("Finish") ? "finish-chip" : ""}`;
    chipBtn.textContent = chipText;
    chipBtn.addEventListener("click", () => {
      if (chipText.includes("Finish Document Now") || chipText.includes("Finish)")) {
        finishDocumentNow();
      } else {
        els.chatInput.value = chipText;
        els.chatForm.dispatchEvent(new Event("submit"));
      }
    });
    els.quickChipsWrapper.appendChild(chipBtn);
  });
}

// ---------- Structured State Grid & 3D Card Flip Rendering ----------

function formatFieldValue(val) {
  if (val === null || val === undefined || val === "") return null;
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "None";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function isFieldConfirmed(metaKey, rawVal, state, flagged) {
  if (flagged[metaKey]) return false;
  if (metaKey === "children_names") {
    return state.has_children === false || (Array.isArray(rawVal) && rawVal.length > 0);
  }
  if (metaKey === "specific_gifts") {
    return Boolean(state.gifts_addressed || (Array.isArray(rawVal) && rawVal.length > 0));
  }
  if (metaKey === "additional_wishes") {
    return Boolean(state.wishes_addressed || rawVal);
  }
  return rawVal !== null && rawVal !== undefined && rawVal !== "";
}

function renderStateCards(state, recentlyUpdated = []) {
  if (!state) return;
  latestState = state;
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

  let totalConfirmedCount = 0;

  FIELD_METADATA.forEach((meta) => {
    const rawVal = valuesMap[meta.key];
    const isClarify = Boolean(flagged[meta.key]);
    const isUpdated = recentlyUpdated.includes(meta.key);
    const confirmed = isFieldConfirmed(meta.key, rawVal, state, flagged);
    if (confirmed) totalConfirmedCount++;

    let statusType = "pending";
    let statusText = "Pending ◯";

    if (isClarify) {
      statusType = "clarify";
      statusText = "Needs Clarification ⚠️";
    } else if (meta.key === "children_names" && state.has_children === false) {
      statusType = "confirmed";
      statusText = "N/A (No Children) ✓";
    } else if (confirmed) {
      statusType = "confirmed";
      statusText = "Confirmed ✓";
    }

    const formattedVal = formatFieldValue(rawVal);
    let displayVal = formattedVal;
    if (!displayVal) {
      if (meta.key === "children_names" && state.has_children === false) {
        displayVal = "None (No children)";
      } else if (meta.key === "specific_gifts" && state.gifts_addressed) {
        displayVal = "None specified";
      } else if (meta.key === "additional_wishes" && state.wishes_addressed) {
        displayVal = "None specified";
      }
    }

    // Determine whether card is flipped to back face (showing artwork tile)
    let shouldBeFlipped = false;
    if (globalForceFlipMode !== null) {
      shouldBeFlipped = globalForceFlipMode;
    } else if (manualFlippedCards.has(meta.key)) {
      shouldBeFlipped = manualFlippedCards.get(meta.key);
    } else {
      // Auto flip once answered/confirmed!
      shouldBeFlipped = confirmed;
    }

    const cardContainer = document.createElement("div");
    cardContainer.className = `state-card-flip-container ${shouldBeFlipped ? "is-flipped" : ""} ${isUpdated ? "highlight-update" : ""}`;
    cardContainer.dataset.fieldKey = meta.key;
    cardContainer.dataset.tileIndex = meta.tileIndex;
    cardContainer.title = shouldBeFlipped ? "Click to view field data" : "Click to view illustrated tile artwork";

    cardContainer.innerHTML = `
      <div class="state-card-inner">
        <!-- FRONT FACE: Structured Field Data -->
        <div class="state-card-face state-card-front">
          <div class="state-card-header">
            <span class="state-card-label">
              <span class="tile-number-badge">#${meta.tileIndex}</span>
              ${meta.icon} ${meta.label}
            </span>
            <span class="state-pill ${statusType}">${statusText}</span>
          </div>
          <div class="state-card-value ${!displayVal ? "empty" : ""}">
            ${displayVal || "Not yet provided"}
          </div>
          ${isClarify ? `<div class="state-card-clarification-note">⚠️ ${flagged[meta.key]}</div>` : ""}
          <div class="state-card-footer">
            <span class="flip-hint-btn" aria-hidden="true">🖼️ View Tile #${meta.tileIndex}</span>
          </div>
        </div>

        <!-- BACK FACE: Illustrated Field Tile Artwork -->
        <div class="state-card-face state-card-back">
          <div class="tile-image-wrapper">
            <img src="${meta.image}" alt="Field Tile #${meta.tileIndex} - ${meta.label}" class="tile-art-img" loading="lazy" />
            <div class="tile-image-overlay">
              <div class="tile-overlay-top">
                <span class="tile-art-badge">Tile #${meta.tileIndex} • ${meta.label}</span>
                <span class="tile-status-icon" title="Confirmed">${confirmed ? "✓" : "◯"}</span>
              </div>
              <div class="tile-overlay-bottom">
                <span class="tile-overlay-label">${meta.label}</span>
                <div class="tile-overlay-value">${displayVal || "Pending entry…"}</div>
              </div>
            </div>
            <span class="tile-flip-back-tag">📋 Tap for details</span>
          </div>
        </div>
      </div>
    `;

    // Click on card toggles individual flip
    cardContainer.addEventListener("click", () => {
      const isCurrentlyFlipped = cardContainer.classList.contains("is-flipped");
      const nextFlipped = !isCurrentlyFlipped;
      cardContainer.classList.toggle("is-flipped", nextFlipped);
      manualFlippedCards.set(meta.key, nextFlipped);
    });

    els.stateCardsGrid.appendChild(cardContainer);
  });

  // Check if all 9 fields are confirmed/addressed
  const allFilled = totalConfirmedCount === 9 || (state.is_core_complete && state.gifts_addressed && state.wishes_addressed);
  if (els.tilesCompleteBanner) {
    els.tilesCompleteBanner.style.display = allFilled ? "flex" : "none";
  }

  // Update toggle flip all button label
  if (els.toggleFlipText) {
    if (globalForceFlipMode === true) {
      els.toggleFlipText.textContent = "Flip All to Data";
      els.toggleFlipAllBtn.classList.add("active");
    } else if (globalForceFlipMode === false) {
      els.toggleFlipText.textContent = "Flip All to Art";
      els.toggleFlipAllBtn.classList.remove("active");
    } else {
      els.toggleFlipText.textContent = totalConfirmedCount >= 5 ? "Flip All to Data" : "Flip All to Art";
    }
  }
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

async function finishDocumentNow() {
  if (!sessionId) return;
  
  // If additional wishes or gifts are not yet addressed, send a finalization message
  if (latestState && !latestState.wishes_addressed) {
    await sendMessage("No additional wishes. Please finalize and generate the draft document.");
  }

  // Force all 9 cards to flip to Art mode
  globalForceFlipMode = true;
  manualFlippedCards.clear();
  if (latestState) {
    renderStateCards(latestState);
  }

  // Switch to Draft Document Tab
  const docTabBtn = document.getElementById("tab-doc-btn");
  if (docTabBtn) {
    docTabBtn.click();
  }

  addSystemNote("✨ Document finalized! All confirmed fields are now compiled into your draft Personal Wishes Document.");
}

// ---------- Event Listeners ----------

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = els.chatInput.value.trim();
  if (!val || !sessionId) return;
  els.chatInput.value = "";
  sendMessage(val);
});

if (els.toggleFlipAllBtn) {
  els.toggleFlipAllBtn.addEventListener("click", () => {
    if (globalForceFlipMode === true) {
      globalForceFlipMode = false;
    } else {
      globalForceFlipMode = true;
    }
    manualFlippedCards.clear();
    if (latestState) {
      renderStateCards(latestState);
    }
  });
}

if (els.stateFinishBtn) {
  els.stateFinishBtn.addEventListener("click", finishDocumentNow);
}

if (els.headerFinishBtn) {
  els.headerFinishBtn.addEventListener("click", finishDocumentNow);
}

if (els.bannerViewDocBtn) {
  els.bannerViewDocBtn.addEventListener("click", () => {
    const docTabBtn = document.getElementById("tab-doc-btn");
    if (docTabBtn) docTabBtn.click();
  });
}

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

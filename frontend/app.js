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
  documentFormattedView: document.getElementById("document-formatted-view"),
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
  // Landing Splash Screen
  landingScreen: document.getElementById("landing-screen"),
  landingGetStartedBtn: document.getElementById("landing-get-started-btn"),

  // Tab 1 Chat Completion Card & Buttons
  chatCompleteCard: document.getElementById("chat-complete-card"),
  chatDownloadPdfBtn: document.getElementById("chat-download-pdf-btn"),
  chatViewDocBtn: document.getElementById("chat-view-doc-btn"),

  // 3x3 Tile Controls & Finish Options
  stateFinishBtn: document.getElementById("state-finish-btn"),
  headerFinishBtn: document.getElementById("header-finish-btn"),
  tilesCompleteBanner: document.getElementById("tiles-complete-banner"),
  bannerDownloadPdfBtn: document.getElementById("banner-download-pdf-btn"),
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

// Field metadata: Tiles 1 to 8 point to 10.webp (with 10.png fallback), Tile 9 points to 11.webp
const FIELD_METADATA = [
  { key: "full_name", tileIndex: 1, label: "Full Name", icon: "👤", desc: "Testator's legal full name", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "home_address", tileIndex: 2, label: "Home Address", icon: "🏠", desc: "Residential address", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "covers_worldwide_assets", tileIndex: 3, label: "Worldwide Assets", icon: "🌍", desc: "Scope of asset coverage", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "has_children", tileIndex: 4, label: "Has Children", icon: "👶", desc: "Parental status", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "children_names", tileIndex: 5, label: "Children's Names", icon: "👥", desc: "Named beneficiaries (if applicable)", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "executor.name", tileIndex: 6, label: "Executor Name", icon: "⚖️", desc: "Appointed legal representative", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "executor.relationship", tileIndex: 7, label: "Executor Relationship", icon: "🤝", desc: "Relationship to testator", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "specific_gifts", tileIndex: 8, label: "Specific Gifts", icon: "🎁", desc: "Designated personal bequests", image: "field_tiles/10.webp", fallbackImage: "field_tiles/10.png" },
  { key: "additional_wishes", tileIndex: 9, label: "Additional Wishes", icon: "📝", desc: "Funeral or personal wishes", image: "field_tiles/11.webp", fallbackImage: "field_tiles/11.png" },
];

let sessionId = null;
let currentTurnCount = 0;
let lastDocumentContent = "";
let latestState = null;
let latestProgress = null;
let activeEditingField = null; // Key of field currently in human edit mode

// Track individual card flip preferences (overrides auto)
const manualFlippedCards = new Map(); // key -> boolean
let globalForceFlipMode = null; // null (auto) | true (all art) | false (all data)

// ---------- Status & Progress Utilities ----------

function setStatus(label, kind = "ready") {
  if (els.statusLabel) els.statusLabel.textContent = label;
  if (els.status) els.status.className = `status-pill ${kind}`;
}

function updateProgress(progress) {
  if (!progress) return;
  latestProgress = progress;
  const { completed_core_fields, total_core_fields, percentage, is_core_complete } = progress;
  if (els.progressCount) els.progressCount.textContent = `${completed_core_fields} / ${total_core_fields} core fields (${percentage}%)`;
  if (els.progressFill) els.progressFill.style.width = `${percentage}%`;
  
  if (is_core_complete) {
    if (els.progressFill) els.progressFill.classList.add("complete");
    if (els.docStatusBadge) {
      els.docStatusBadge.textContent = "Ready ✓";
      els.docStatusBadge.classList.add("complete");
    }
  } else {
    if (els.progressFill) els.progressFill.classList.remove("complete");
    if (els.docStatusBadge) {
      els.docStatusBadge.textContent = "Draft";
      els.docStatusBadge.classList.remove("complete");
    }
  }

  // Show "Finish Document" option whenever at least 4 core fields are filled or core is complete
  const canFinish = is_core_complete || completed_core_fields >= 4;
  if (els.stateFinishBtn) els.stateFinishBtn.style.display = canFinish ? "inline-flex" : "none";
  if (els.headerFinishBtn) els.headerFinishBtn.style.display = canFinish ? "inline-flex" : "none";
}

function setInputEnabled(enabled) {
  if (els.chatInput) els.chatInput.disabled = !enabled;
  if (els.sendBtn) els.sendBtn.disabled = !enabled;
  if (enabled && els.chatInput && (!els.landingScreen || els.landingScreen.classList.contains("landing-hidden"))) {
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
  if (!els.quickChipsWrapper) return;
  els.quickChipsWrapper.innerHTML = "";
  if (!state) return;

  const chips = [];
  const needsClarification = state.needs_clarification || {};

  if (Object.keys(needsClarification).length > 0) {
    const firstClarified = Object.keys(needsClarification)[0];
    if (firstClarified === "has_children") {
      chips.push("Actually, I do have children", "To clarify, I do not have children");
    } else if (firstClarified === "covers_worldwide_assets") {
      chips.push("Worldwide assets", "UK assets only");
    } else if (firstClarified.includes("executor.relationship")) {
      chips.push("Brother", "Sister", "Spouse", "Son", "Daughter", "Friend", "Solicitor");
    }
  } else if (!state.full_name) {
    // Let user enter their legal name
  } else if (!state.home_address) {
    // Let user enter their address
  } else if (state.covers_worldwide_assets === null) {
    chips.push("Yes, cover worldwide assets", "No, UK assets only");
  } else if (state.has_children === null) {
    chips.push("Yes, I have children", "No, I do not have children");
  } else if (state.has_children === true && (!state.children_names || state.children_names.length === 0)) {
    chips.push("None");
  } else if (!state.executor?.name) {
    // User provides executor name
  } else if (!state.executor?.relationship) {
    chips.push("Brother", "Sister", "Spouse", "Son", "Daughter", "Friend", "Solicitor");
  } else if (!state.gifts_addressed) {
    chips.push("No specific gifts", "Skip specific gifts");
  } else if (!state.wishes_addressed) {
    chips.push("No additional wishes", "Skip additional wishes", "✨ Download PDF & Finish");
  }

  // If core fields are done, offer quick action chips
  const isCoreDone = state.full_name && state.home_address && (state.has_children === false || (state.children_names && state.children_names.length > 0)) && state.executor?.name && state.executor?.relationship;
  if (isCoreDone && !chips.some(c => c.includes("Download") || c.includes("Finish"))) {
    chips.push("📥 Download PDF", "✨ Finish Document");
  }

  chips.forEach((chipText) => {
    const chipBtn = document.createElement("button");
    chipBtn.type = "button";
    chipBtn.className = `quick-chip ${chipText.includes("Finish") || chipText.includes("Download") ? "finish-chip" : ""}`;
    chipBtn.textContent = chipText;
    chipBtn.addEventListener("click", () => {
      if (chipText.includes("Download PDF")) {
        downloadDocumentAsPdf();
      } else if (chipText.includes("Finish")) {
        finishDocumentNow();
      } else {
        els.chatInput.value = chipText;
        els.chatForm.dispatchEvent(new Event("submit"));
      }
    });
    els.quickChipsWrapper.appendChild(chipBtn);
  });
}

// ---------- Structured State Grid & Human-in-the-Loop Direct Editing ----------

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

async function saveFieldDirectly(fieldKey, newValue) {
  if (!sessionId) {
    addSystemNote("⚠️ Please wait for session initialization before editing.", true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: fieldKey, value: newValue }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    activeEditingField = null;
    latestState = data.state;
    renderStateCards(data.state, [fieldKey]);
    renderDocument(data.document);
    updateProgress(data.progress);
    updateQuickChips(data.state);
    updateTelemetry({
      llm_provider_used: "human-edit (direct intervention)",
      revision: data.revision,
      core_complete: data.core_complete,
      applied_fields: [fieldKey],
      clarifications: [],
      rejected_fields: [],
    }, data.state);

    const fieldMeta = FIELD_METADATA.find(m => m.key === fieldKey);
    const label = fieldMeta ? fieldMeta.label : fieldKey;
    addSystemNote(`✏️ Updated ${label}: "${formatFieldValue(newValue) || 'Saved'}"`);
  } catch (err) {
    console.error("Failed to save edited field:", err);
    addSystemNote(`⚠️ Failed to update field: ${err.message}`, true);
  }
}

function renderStateCards(state, recentlyUpdated = []) {
  if (!state) return;
  latestState = state;
  if (!els.stateCardsGrid) return;
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

  // Check how many of the 9 fields are confirmed
  let totalConfirmedCount = 0;
  FIELD_METADATA.forEach((meta) => {
    const rawVal = valuesMap[meta.key];
    if (isFieldConfirmed(meta.key, rawVal, state, flagged)) {
      totalConfirmedCount++;
    }
  });

  const allNineFilled = totalConfirmedCount === 9 || (
    Boolean(state.full_name) &&
    Boolean(state.home_address) &&
    state.covers_worldwide_assets !== null &&
    state.has_children !== null &&
    (state.has_children === false || (Array.isArray(state.children_names) && state.children_names.length > 0)) &&
    Boolean(state.executor?.name) &&
    Boolean(state.executor?.relationship) &&
    Boolean(state.gifts_addressed || (Array.isArray(state.specific_gifts) && state.specific_gifts.length > 0)) &&
    Boolean(state.wishes_addressed || state.additional_wishes)
  );

  FIELD_METADATA.forEach((meta) => {
    const rawVal = valuesMap[meta.key];
    const isClarify = Boolean(flagged[meta.key]);
    const isUpdated = recentlyUpdated.includes(meta.key);
    const confirmed = isFieldConfirmed(meta.key, rawVal, state, flagged);
    const isEditing = activeEditingField === meta.key;

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

    // Determine whether card is flipped to back face (showing illustrated artwork tile)
    // ONLY flip at the end when all 9 tiles turn from pending to completed (or when finalized)
    let shouldBeFlipped = false;
    if (isEditing) {
      shouldBeFlipped = false; // Always show front face when editing
    } else if (globalForceFlipMode !== null) {
      shouldBeFlipped = globalForceFlipMode;
    } else {
      // Flip all cards ONLY when all 9 fields are fully completed
      shouldBeFlipped = allNineFilled;
    }

    const cardContainer = document.createElement("div");
    cardContainer.className = `state-card-flip-container ${shouldBeFlipped ? "is-flipped" : ""} ${isUpdated ? "highlight-update" : ""}`;
    cardContainer.dataset.fieldKey = meta.key;
    cardContainer.dataset.tileIndex = meta.tileIndex;

    // Construct Front Face Content (either view mode or edit mode)
    let frontBodyHtml = "";
    if (isEditing) {
      if (meta.key === "covers_worldwide_assets" || meta.key === "has_children") {
        frontBodyHtml = `
          <div class="state-card-edit-container">
            <select class="tile-edit-select" id="tile-input-${meta.tileIndex}">
              <option value="true" ${rawVal === true ? "selected" : ""}>Yes</option>
              <option value="false" ${rawVal === false ? "selected" : ""}>No</option>
            </select>
            <div class="tile-edit-actions-row">
              <button type="button" class="tile-save-btn" id="tile-save-${meta.tileIndex}">Save ✓</button>
              <button type="button" class="tile-cancel-btn" id="tile-cancel-${meta.tileIndex}">Cancel ✕</button>
            </div>
          </div>
        `;
      } else if (meta.key === "additional_wishes") {
        frontBodyHtml = `
          <div class="state-card-edit-container">
            <textarea class="tile-edit-textarea" id="tile-input-${meta.tileIndex}" rows="2" placeholder="Enter personal wishes...">${rawVal || ""}</textarea>
            <div class="tile-edit-actions-row">
              <button type="button" class="tile-save-btn" id="tile-save-${meta.tileIndex}">Save ✓</button>
              <button type="button" class="tile-cancel-btn" id="tile-cancel-${meta.tileIndex}">Cancel ✕</button>
            </div>
          </div>
        `;
      } else if (meta.key === "children_names" || meta.key === "specific_gifts") {
        const listStr = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal || "");
        frontBodyHtml = `
          <div class="state-card-edit-container">
            <input type="text" class="tile-edit-input" id="tile-input-${meta.tileIndex}" value="${listStr}" placeholder="e.g. Item 1, Item 2" />
            <div class="tile-edit-actions-row">
              <button type="button" class="tile-save-btn" id="tile-save-${meta.tileIndex}">Save ✓</button>
              <button type="button" class="tile-cancel-btn" id="tile-cancel-${meta.tileIndex}">Cancel ✕</button>
            </div>
          </div>
        `;
      } else {
        frontBodyHtml = `
          <div class="state-card-edit-container">
            <input type="text" class="tile-edit-input" id="tile-input-${meta.tileIndex}" value="${rawVal || ""}" placeholder="Enter ${meta.label}..." />
            <div class="tile-edit-actions-row">
              <button type="button" class="tile-save-btn" id="tile-save-${meta.tileIndex}">Save ✓</button>
              <button type="button" class="tile-cancel-btn" id="tile-cancel-${meta.tileIndex}">Cancel ✕</button>
            </div>
          </div>
        `;
      }
    } else {
      frontBodyHtml = `
        <div class="state-card-body">
          <div class="state-card-value ${!displayVal ? "empty" : ""}" id="tile-val-click-${meta.tileIndex}">
            ${displayVal || "Not yet provided"}
          </div>
          ${isClarify ? `<div class="state-card-clarification-note">⚠️ ${flagged[meta.key]}</div>` : ""}
        </div>
        <div class="state-card-footer">
          <button type="button" class="tile-edit-btn" id="tile-edit-btn-${meta.tileIndex}" title="Edit ${meta.label}">✏️ Edit</button>
        </div>
      `;
    }

    cardContainer.innerHTML = `
      <div class="state-card-inner">
        <!-- FRONT FACE: Structured Field Data & Single Direct Edit Control -->
        <div class="state-card-face state-card-front">
          <div class="state-card-header">
            <span class="state-card-label">
              <span class="tile-number-badge">#${meta.tileIndex}</span>
              <span class="tile-label-text">${meta.icon} ${meta.label}</span>
            </span>
            <span class="state-pill ${statusType}">${statusText}</span>
          </div>
          ${frontBodyHtml}
        </div>

        <!-- BACK FACE: Illustrated Field Tile Artwork (10.webp for 1-8, 11.webp for 9 with PNG fallback) -->
        <div class="state-card-face state-card-back">
          <div class="tile-image-wrapper">
            <picture>
              <source srcset="${meta.image}" type="image/webp" />
              <img src="${meta.fallbackImage || meta.image}" alt="Field Tile #${meta.tileIndex} - ${meta.label}" class="tile-art-img" loading="lazy" decoding="async" />
            </picture>
          </div>
        </div>
      </div>
    `;

    // Event Wiring for Edit Mode
    if (isEditing) {
      const inputEl = cardContainer.querySelector(`#tile-input-${meta.tileIndex}`);
      const saveBtn = cardContainer.querySelector(`#tile-save-${meta.tileIndex}`);
      const cancelBtn = cardContainer.querySelector(`#tile-cancel-${meta.tileIndex}`);

      if (inputEl) {
        setTimeout(() => inputEl.focus(), 50);
        inputEl.addEventListener("click", (e) => e.stopPropagation());
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey && meta.key !== "additional_wishes") {
            e.preventDefault();
            if (saveBtn) saveBtn.click();
          } else if (e.key === "Escape") {
            if (cancelBtn) cancelBtn.click();
          }
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          let newVal = inputEl ? inputEl.value : "";
          if (meta.key === "covers_worldwide_assets" || meta.key === "has_children") {
            newVal = newVal === "true";
          }
          saveFieldDirectly(meta.key, newVal);
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          activeEditingField = null;
          renderStateCards(latestState);
        });
      }
    } else {
      // Wire single Edit button on front face
      const editBtn = cardContainer.querySelector(`#tile-edit-btn-${meta.tileIndex}`);
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          activeEditingField = meta.key;
          renderStateCards(latestState);
        });
      }
    }

    els.stateCardsGrid.appendChild(cardContainer);
  });

  // Reveal Tab 1 & Tab 2 Completion cards when all 9 fields are done
  if (els.chatCompleteCard) {
    els.chatCompleteCard.style.display = (allNineFilled || totalConfirmedCount >= 7) ? "flex" : "none";
  }
  if (els.tilesCompleteBanner) {
    els.tilesCompleteBanner.style.display = allNineFilled ? "flex" : "none";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDocument(doc) {
  lastDocumentContent = doc;
  if (els.documentText) {
    els.documentText.textContent = doc || "Draft document will appear here once intake begins.";
  }
  if (!els.documentFormattedView) return;

  if (!doc || doc.trim() === "" || (!latestState?.full_name && !latestState?.home_address)) {
    els.documentFormattedView.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; color: #7B6E96;">
        <div style="font-size: 32px; margin-bottom: 12px;">📜</div>
        <h3 style="font-family: var(--font-serif); font-size: 18px; color: #2D006B; margin-bottom: 6px;">Draft Personal Wishes Document</h3>
        <p style="font-size: 13.5px; max-width: 420px; margin: 0 auto; line-height: 1.5;">
          Your document will draft automatically in real time with formal legal formatting as you answer questions in the intake chat.
        </p>
      </div>
    `;
    return;
  }

  const state = latestState || {};
  const testatorName = state.full_name || "[Not yet provided]";
  const homeAddress = state.home_address || "[Not yet provided]";
  const formattedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // Section 1: Declaration & Domicile
  const sec1 = `I, <strong>${escapeHtml(testatorName)}</strong>, residing at <strong>${escapeHtml(homeAddress)}</strong>, being of sound mind and memory, do hereby set forth my wishes and testamentary instructions regarding the disposition of my estate, personal effects, and testamentary arrangements.`;

  // Section 2: Worldwide Scope
  let sec2 = "";
  if (state.covers_worldwide_assets === true) {
    sec2 = "This instrument is intended to govern and cover all my assets worldwide, across all national and international jurisdictions.";
  } else if (state.covers_worldwide_assets === false) {
    sec2 = "This instrument is strictly limited to assets held within my home jurisdiction and does not cover foreign assets.";
  } else {
    sec2 = "<span style='color: #8C7B1E; font-style: italic;'>[Whether this document covers worldwide assets has not yet been confirmed.]</span>";
  }

  // Section 3: Children / Beneficiaries
  let sec3 = "";
  if (state.has_children === true) {
    if (state.children_names && state.children_names.length > 0) {
      sec3 = `I declare that I have the following child(ren): <strong>${escapeHtml(state.children_names.join(", "))}</strong>.`;
    } else {
      sec3 = "I confirm that I have children, but their individual legal names have not yet been specified.";
    }
  } else if (state.has_children === false) {
    sec3 = "I confirm that I have no children.";
  } else {
    sec3 = "<span style='color: #8C7B1E; font-style: italic;'>[Whether I have children has not yet been confirmed.]</span>";
  }

  // Section 4: Executor
  let sec4 = "";
  const execName = state.executor?.name || "[Not yet provided]";
  const execRel = state.executor?.relationship;
  if (execRel) {
    sec4 = `I appoint <strong>${escapeHtml(execName)}</strong> (${escapeHtml(execRel)}) as the sole legal executor and personal representative of this instrument.`;
  } else {
    sec4 = `I appoint <strong>${escapeHtml(execName)}</strong> as the executor of this instrument. <span style='color: #8C7B1E; font-style: italic;'>[Relationship to testator not yet confirmed.]</span>`;
  }

  // Section 5: Specific Gifts
  let sec5Html = "";
  if (state.specific_gifts && state.specific_gifts.length > 0) {
    const items = state.specific_gifts.map(g => `<li>${escapeHtml(g)}</li>`).join("");
    sec5Html = `
      <div class="doc-gifts-box">
        <ul class="doc-gifts-list">
          ${items}
        </ul>
      </div>
    `;
  } else if (state.gifts_addressed) {
    sec5Html = "<p class='doc-section-text' style='color: #554A6B; font-style: italic;'>No specific testamentary gifts or bequests specified.</p>";
  } else {
    sec5Html = "<p class='doc-section-text' style='color: #8C7B1E; font-style: italic;'>[Specific gifts have not yet been addressed.]</p>";
  }

  // Section 6: Additional Wishes
  let sec6Html = "";
  if (state.additional_wishes) {
    sec6Html = `<p class="doc-section-text">${escapeHtml(state.additional_wishes)}</p>`;
  } else if (state.wishes_addressed) {
    sec6Html = "<p class='doc-section-text' style='color: #554A6B; font-style: italic;'>No additional funeral, testamentary, or personal wishes specified.</p>";
  } else {
    sec6Html = "<p class='doc-section-text' style='color: #8C7B1E; font-style: italic;'>[Additional wishes have not yet been addressed.]</p>";
  }

  // Section 7: Clarifications if any
  let sec7Html = "";
  if (state.needs_clarification && Object.keys(state.needs_clarification).length > 0) {
    const items = Object.entries(state.needs_clarification)
      .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
      .join("");
    sec7Html = `
      <div class="doc-clarifications-alert">
        <div class="doc-clarifications-title">⚠️ Outstanding Items Requiring Clarification</div>
        <ul class="doc-clarifications-list">
          ${items}
        </ul>
      </div>
    `;
  }

  els.documentFormattedView.innerHTML = `
    <header class="doc-legal-header">
      <div class="doc-legal-brand-row">
        <span class="doc-brand-tag">Wenup<span class="dot"></span></span>
        <span class="doc-category-badge">Legal Intake Instrument</span>
      </div>
      <h2 class="doc-main-title">Personal Wishes Draft Document</h2>
      <div class="doc-sub-date">Prepared on ${formattedDate} • Confidential Working Draft</div>

      <div class="doc-meta-card">
        <div class="doc-meta-item">
          <span class="doc-meta-label">Testator</span>
          <span class="doc-meta-value">${escapeHtml(testatorName)}</span>
        </div>
        <div class="doc-meta-item">
          <span class="doc-meta-label">Residence</span>
          <span class="doc-meta-value" style="font-size: 12px; font-weight: 500;">${escapeHtml(homeAddress)}</span>
        </div>
        <div class="doc-meta-item">
          <span class="doc-meta-label">Review Status</span>
          <span class="doc-meta-value" style="color: #116832;">Draft for Solicitor Review</span>
        </div>
      </div>

      <div class="doc-notice-banner">
        <strong>DEMONSTRATION ONLY:</strong> This fictional document was drafted via the Wenup Conversational Intake Assistant for testing and review purposes. It does not constitute formal legal advice.
      </div>
    </header>

    <main class="doc-legal-body">
      <!-- Section 1: Declaration -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">1.0</span>
          <h3 class="doc-section-title">Declaration &amp; Testamentary Domicile</h3>
          <span class="doc-section-line"></span>
        </div>
        <p class="doc-section-text">${sec1}</p>
      </section>

      <!-- Section 2: Jurisdiction Scope -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">2.0</span>
          <h3 class="doc-section-title">Scope of Testamentary Jurisdiction</h3>
          <span class="doc-section-line"></span>
        </div>
        <p class="doc-section-text">${sec2}</p>
      </section>

      <!-- Section 3: Beneficiaries & Children -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">3.0</span>
          <h3 class="doc-section-title">Family &amp; Beneficiaries</h3>
          <span class="doc-section-line"></span>
        </div>
        <p class="doc-section-text">${sec3}</p>
      </section>

      <!-- Section 4: Executor -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">4.0</span>
          <h3 class="doc-section-title">Appointment of Executor &amp; Fiduciary</h3>
          <span class="doc-section-line"></span>
        </div>
        <p class="doc-section-text">${sec4}</p>
      </section>

      <!-- Section 5: Specific Gifts -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">5.0</span>
          <h3 class="doc-section-title">Specific Gifts &amp; Bequests</h3>
          <span class="doc-section-line"></span>
        </div>
        ${sec5Html}
      </section>

      <!-- Section 6: Additional Wishes -->
      <section class="doc-section">
        <div class="doc-section-header">
          <span class="doc-section-number">6.0</span>
          <h3 class="doc-section-title">Personal &amp; Funeral Wishes</h3>
          <span class="doc-section-line"></span>
        </div>
        ${sec6Html}
      </section>

      ${sec7Html}

      <!-- Attestation & Signature Execution Block -->
      <section class="doc-attestation-block">
        <h3 class="doc-attestation-title">Attestation &amp; Formal Execution</h3>
        <p class="doc-attestation-clause">
          IN WITNESS WHEREOF, the Testator has executed this draft Personal Wishes Document on the date indicated below, confirming that this instrument accurately embodies their testamentary intentions for formal solicitor review.
        </p>

        <div class="doc-testator-sign-grid">
          <div class="doc-sign-line-wrap">
            <div class="doc-sign-line"></div>
            <span class="doc-sign-label">Signature of Testator (${escapeHtml(testatorName)})</span>
          </div>
          <div class="doc-sign-line-wrap">
            <div class="doc-sign-line"></div>
            <span class="doc-sign-label">Date</span>
          </div>
        </div>

        <div class="doc-witnesses-grid">
          <div class="doc-witness-box">
            <span class="doc-witness-title">First Witness Attestation</span>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Signature</span>
              <div class="doc-witness-field-line"></div>
            </div>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Full Name &amp; Occupation</span>
              <div class="doc-witness-field-line"></div>
            </div>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Residential Address</span>
              <div class="doc-witness-field-line"></div>
            </div>
          </div>

          <div class="doc-witness-box">
            <span class="doc-witness-title">Second Witness Attestation</span>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Signature</span>
              <div class="doc-witness-field-line"></div>
            </div>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Full Name &amp; Occupation</span>
              <div class="doc-witness-field-line"></div>
            </div>
            <div class="doc-witness-field">
              <span class="doc-witness-field-label">Residential Address</span>
              <div class="doc-witness-field-line"></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}

// ---------- Formal Legal PDF Document Generator with Precision Borders ----------

function downloadDocumentAsPdf() {
  if (!lastDocumentContent) {
    addSystemNote("⚠️ Please start your intake interview first to generate draft document content.", true);
    return;
  }

  const testatorName = latestState?.full_name || "Draft";
  const safeName = testatorName.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Personal_Wishes_Document_${safeName}.pdf`;

  // 1. Generate via jsPDF
  const jsPdfClass = window.jspdf?.jsPDF || window.jsPDF || (typeof jsPDF !== "undefined" ? jsPDF : null);

  if (jsPdfClass) {
    try {
      const doc = new jsPdfClass({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 44;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Function to draw formal legal borders on current page
      function drawFormalPageFrame(pageNum, totalNum) {
        // Outer formal border line
        doc.setDrawColor(45, 0, 107);
        doc.setLineWidth(1.2);
        doc.rect(24, 24, pageWidth - 48, pageHeight - 48);

        // Inner subtle border line
        doc.setDrawColor(215, 205, 235);
        doc.setLineWidth(0.6);
        doc.rect(28, 28, pageWidth - 56, pageHeight - 56);

        // Footer dividing line & page numbering
        doc.setDrawColor(220, 215, 235);
        doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(130, 120, 150);
        doc.text("CONFIDENTIAL & PRIVILEGED • DRAFT PERSONAL WISHES DOCUMENT", margin, pageHeight - 22);
        doc.text(`Page ${pageNum} of ${totalNum}`, pageWidth - margin, pageHeight - 22, { align: "right" });
      }

      // ----------------- Page 1 Header -----------------
      // Brand Header Banner (Deep Wenup Purple #2D006B)
      doc.setFillColor(45, 0, 107);
      doc.rect(28, 28, pageWidth - 56, 46, "F");

      // Brand Wordmark
      doc.setTextColor(226, 248, 50); // #E2F832 Lime
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Wenup", margin, 58);

      // Header Subtitle
      doc.setTextColor(245, 240, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text("Personal Wishes Document • Confidential Draft", pageWidth - margin, 58, { align: "right" });

      y = 92;

      // Main Document Title
      doc.setTextColor(36, 0, 87);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PERSONAL WISHES DRAFT DOCUMENT", margin, y);
      y += 18;

      // Formal Metadata Box
      doc.setFillColor(248, 246, 252);
      doc.setDrawColor(215, 205, 235);
      doc.setLineWidth(0.6);
      doc.roundedRect(margin, y, contentWidth, 32, 3, 3, "FD");

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 0, 107);
      doc.text("Testator:", margin + 10, y + 14);
      doc.text("Date Generated:", margin + 10, y + 26);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 50, 80);
      doc.text(testatorName, margin + 60, y + 14);
      doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), margin + 90, y + 26);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 0, 107);
      doc.text("Status:", pageWidth - margin - 150, y + 14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(17, 104, 50);
      doc.text("Draft for Legal Review", pageWidth - margin - 110, y + 14);

      y += 42;

      // Legal Disclaimer Notice Card
      doc.setFillColor(254, 246, 236);
      doc.setDrawColor(250, 215, 160);
      doc.setLineWidth(0.6);
      doc.roundedRect(margin, y, contentWidth, 34, 3, 3, "FD");

      doc.setTextColor(167, 78, 6);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("DEMONSTRATION ONLY — NOT FORMAL LEGAL ADVICE", margin + 10, y + 13);
      doc.setFont("helvetica", "normal");
      doc.text("This draft was compiled via the Wenup Conversational Intake Assistant. It must be formally reviewed by a qualified solicitor.", margin + 10, y + 24);

      y += 46;

      // ----------------- Content Parsing & Section Divider Lines -----------------
      doc.setTextColor(30, 20, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setLineHeightFactor(1.4);

      const rawLines = lastDocumentContent.split("\n");

      for (let i = 0; i < rawLines.length; i++) {
        const rawLine = rawLines[i].trim();

        if (!rawLine) {
          y += 6;
          continue;
        }

        // Page overflow check
        if (y > pageHeight - 80) {
          doc.addPage();
          y = margin + 20;
        }

        // Skip title & disclaimer lines rendered natively above
        if (rawLine.startsWith("PERSONAL WISHES DOCUMENT") || rawLine.startsWith("Prepared:")) {
          continue;
        }
        if (rawLine.startsWith("This is a FICTIONAL document") || rawLine.startsWith("IMPORTANT LEGAL DISCLAIMER")) {
          continue;
        }

        // Section Headers (Uppercase words without colons)
        if (rawLine === rawLine.toUpperCase() && rawLine.length > 3 && !rawLine.includes(":") && !rawLine.startsWith("[")) {
          y += 10;
          if (y > pageHeight - 80) {
            doc.addPage();
            y = margin + 20;
          }

          // Draw subtle section separator rule
          doc.setDrawColor(215, 205, 235);
          doc.setLineWidth(0.75);
          doc.line(margin, y, pageWidth - margin, y);
          y += 14;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(45, 0, 107);
          doc.setFontSize(10.5);
          doc.text(rawLine, margin, y);
          y += 14;

          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 20, 50);
          doc.setFontSize(9.5);
        } else {
          // Wrapped body text
          const splitLines = doc.splitTextToSize(rawLine, contentWidth);
          for (let s = 0; s < splitLines.length; s++) {
            if (y > pageHeight - 80) {
              doc.addPage();
              y = margin + 20;
            }
            doc.text(splitLines[s], margin, y);
            y += 13.5;
          }
        }
      }

      // ----------------- Execution & Signatures Section -----------------
      y += 14;
      if (y > pageHeight - 140) {
        doc.addPage();
        y = margin + 20;
      }

      doc.setDrawColor(215, 205, 235);
      doc.setLineWidth(0.75);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 0, 107);
      doc.setFontSize(10.5);
      doc.text("FORMAL EXECUTION & ATTESTATION", margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 70, 100);
      doc.setFontSize(8.5);
      doc.text("Signed by the Testator in the presence of the undersigned witnesses present at the same time:", margin, y);
      y += 24;

      // Testator signature line
      doc.setDrawColor(160, 150, 185);
      doc.setLineWidth(0.75);
      doc.line(margin, y, margin + 190, y);
      doc.line(pageWidth - margin - 150, y, pageWidth - margin, y);
      y += 12;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 0, 107);
      doc.text("Signature of Testator (" + testatorName + ")", margin, y);
      doc.text("Date", pageWidth - margin - 150, y);

      y += 24;
      if (y > pageHeight - 90) {
        doc.addPage();
        y = margin + 20;
      }

      // Witness Boxes
      const boxW = (contentWidth - 20) / 2;
      doc.setDrawColor(215, 205, 235);
      doc.roundedRect(margin, y, boxW, 44, 2, 2);
      doc.roundedRect(margin + boxW + 20, y, boxW, 44, 2, 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(45, 0, 107);
      doc.text("FIRST WITNESS", margin + 8, y + 12);
      doc.text("SECOND WITNESS", margin + boxW + 28, y + 12);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(110, 100, 130);
      doc.text("Signature / Name / Occupation / Address", margin + 8, y + 32);
      doc.text("Signature / Name / Occupation / Address", margin + boxW + 28, y + 32);

      // Draw all page frames
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFormalPageFrame(p, totalPages);
      }

      doc.save(fileName);

      // Dual fallback via Blob URL trigger
      try {
        const blob = doc.output("blob");
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      } catch (blobErr) {
        // Handled by doc.save
      }

      addSystemNote(`📥 PDF document downloaded: ${fileName}`);
      return;
    } catch (err) {
      console.warn("jsPDF export error, falling back to print view", err);
    }
  }

  // 2. Fallback: Styled Browser Print / Save-as-PDF window
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${fileName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif; max-width: 780px; margin: 30px auto; padding: 24px; color: #1c0044; line-height: 1.6; }
          .header { background: #2D006B; color: #fff; padding: 18px 24px; border-radius: 8px; margin-bottom: 24px; }
          .brand { font-size: 24px; font-weight: bold; color: #E2F832; }
          .disclaimer { background: #FEF6EC; border: 1px solid #FAD7A0; padding: 12px; font-size: 12px; margin: 16px 0; border-radius: 6px; color: #a74e06; }
          pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; background: #faf8f5; padding: 20px; border-radius: 8px; border: 1px solid #e4dafa; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">Wenup</div>
          <div>Personal Wishes Document (Draft)</div>
        </div>
        <div class="disclaimer"><strong>Demonstration Only:</strong> This document is generated for demonstration purposes and is not formal legal advice.</div>
        <pre>${lastDocumentContent}</pre>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}

// ---------- Telemetry Rendering ----------

function updateTelemetry(data, state) {
  if (!data) return;
  if (els.telemetryProvider) els.telemetryProvider.textContent = data.llm_provider_used || "primary";
  if (els.telemetryRevision) els.telemetryRevision.textContent = String(data.revision || 0);
  if (els.telemetryComplete) els.telemetryComplete.textContent = data.core_complete ? "Yes (Draft authoritatively generated)" : "In Progress";
  
  if (els.telemetryApplied) {
    els.telemetryApplied.textContent = (data.applied_fields && data.applied_fields.length)
      ? data.applied_fields.join(", ") : "None this turn";
  }
  if (els.telemetryClarified) {
    els.telemetryClarified.textContent = (data.clarifications && data.clarifications.length)
      ? data.clarifications.join(", ") : "None";
  }
  if (els.telemetryRejected) {
    els.telemetryRejected.textContent = (data.rejected_fields && data.rejected_fields.length)
      ? JSON.stringify(data.rejected_fields) : "None (All updates passed validation)";
  }

  if (els.telemetryJsonRaw) {
    const rawPayload = {
      llm_provider: data.llm_provider_used,
      turn_number: currentTurnCount,
      applied_fields: data.applied_fields || [],
      clarifications: data.clarifications || [],
      rejected_fields: data.rejected_fields || [],
      canonical_state: state || {},
      progress: latestProgress || {},
    };
    els.telemetryJsonRaw.textContent = JSON.stringify(rawPayload, null, 2);
  }
}

// ---------- API Network Client & Session Lifecycle ----------

async function startSession() {
  setStatus("Connecting…", "connecting");
  setInputEnabled(false);
  els.chatLog.innerHTML = "";
  manualFlippedCards.clear();
  globalForceFlipMode = null;
  activeEditingField = null;
  currentTurnCount = 0;
  if (els.chatCompleteCard) els.chatCompleteCard.style.display = "none";
  if (els.tilesCompleteBanner) els.tilesCompleteBanner.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    sessionId = data.session_id;
    currentTurnCount = 1;
    if (els.turnCounter) els.turnCounter.textContent = `Turn 01`;
    setStatus("Connected", "ready");

    addMessage("assistant", data.assistant_message);
    updateProgress(data.progress);
    renderStateCards(data.state);
    updateQuickChips(data.state);

    if (data.document) {
      renderDocument(data.document);
    } else {
      const docRes = await fetch(`${API_BASE}/api/session/${sessionId}/document`);
      if (docRes.ok) {
        const docData = await docRes.json();
        renderDocument(docData.document);
      }
    }
  } catch (err) {
    console.error("Session initialization failed:", err);
    setStatus("Offline Mode", "offline");
    addSystemNote("⚠️ Could not reach FastAPI backend at " + (API_BASE || window.location.origin) + ". Retrying…", true);
  } finally {
    setInputEnabled(true);
  }
}

async function sendMessage(text) {
  if (!sessionId || !text) return;

  addMessage("user", text);
  currentTurnCount++;
  if (els.turnCounter) els.turnCounter.textContent = `Turn ${String(currentTurnCount).padStart(2, "0")}`;
  setStatus("Extracting & Validating…", "busy");
  setInputEnabled(false);
  showTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    removeTypingIndicator();

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    setStatus("Connected", "ready");

    addMessage("assistant", data.assistant_message);
    renderStateCards(data.state, data.applied_fields || []);
    renderDocument(data.document);
    updateProgress(data.progress);
    updateTelemetry(data, data.state);
    updateQuickChips(data.state);

    if (data.clarifications && data.clarifications.length > 0) {
      addSystemNote(`⚠️ Need follow-up: ${data.clarifications.join("; ")}`);
    }
  } catch (err) {
    removeTypingIndicator();
    console.error("Failed to post message:", err);
    setStatus("Error", "offline");
    addSystemNote(`⚠️ Error processing message: ${err.message}`, true);
  } finally {
    setInputEnabled(true);
  }
}

async function finishDocumentNow() {
  if (!sessionId) return;
  
  if (latestState && !latestState.wishes_addressed) {
    await sendMessage("No additional wishes. Please finalize and generate the draft document.");
  }

  // Force all 9 cards to flip to Art mode
  globalForceFlipMode = true;
  manualFlippedCards.clear();
  activeEditingField = null;
  if (latestState) {
    renderStateCards(latestState);
  }

  // Reveal Tab 1 complete card
  if (els.chatCompleteCard) els.chatCompleteCard.style.display = "flex";

  addSystemNote("✨ Document finalized! All 9 confirmed fields are compiled into your draft Personal Wishes Document.");
}

// ---------- Event Listeners ----------

if (els.chatForm) {
  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = els.chatInput.value.trim();
    if (!val || !sessionId) return;
    els.chatInput.value = "";
    sendMessage(val);
  });
}

if (els.stateFinishBtn) {
  els.stateFinishBtn.addEventListener("click", finishDocumentNow);
}

if (els.headerFinishBtn) {
  els.headerFinishBtn.addEventListener("click", finishDocumentNow);
}

// Landing Splash Screen Transition
if (els.landingGetStartedBtn) {
  els.landingGetStartedBtn.addEventListener("click", () => {
    if (els.landingScreen) {
      els.landingScreen.classList.add("landing-hidden");
      setTimeout(() => {
        els.landingScreen.style.display = "none";
        if (els.chatInput) els.chatInput.focus();
      }, 400);
    }
  });
}

// Tab 1 Download PDF & View Doc
if (els.chatDownloadPdfBtn) {
  els.chatDownloadPdfBtn.addEventListener("click", downloadDocumentAsPdf);
}

if (els.chatViewDocBtn) {
  els.chatViewDocBtn.addEventListener("click", () => {
    const docTabBtn = document.getElementById("tab-doc-btn");
    if (docTabBtn) docTabBtn.click();
  });
}

// Tab 2 Banner Download PDF & View Doc
if (els.bannerDownloadPdfBtn) {
  els.bannerDownloadPdfBtn.addEventListener("click", downloadDocumentAsPdf);
}

if (els.bannerViewDocBtn) {
  els.bannerViewDocBtn.addEventListener("click", () => {
    const docTabBtn = document.getElementById("tab-doc-btn");
    if (docTabBtn) docTabBtn.click();
  });
}

// Tab Switching
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

// Copy Text Button
if (els.copyDocBtn) {
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
}

// Download PDF Button (Tab 2)
if (els.downloadDocBtn) {
  els.downloadDocBtn.addEventListener("click", downloadDocumentAsPdf);
}

// Reset Session Button
async function resetSession() {
  const oldSid = sessionId;
  sessionId = null;
  latestState = null;
  lastDocumentContent = "";
  manualFlippedCards.clear();
  globalForceFlipMode = null;
  activeEditingField = null;
  if (els.chatCompleteCard) els.chatCompleteCard.style.display = "none";
  if (els.tilesCompleteBanner) els.tilesCompleteBanner.style.display = "none";

  if (oldSid) {
    try {
      await fetch(`${API_BASE}/api/session/${oldSid}/reset`, { method: "POST" });
    } catch (err) {
      console.warn("Session reset network notification error:", err);
    }
  }

  await startSession();
  addSystemNote("✨ Started over with a fresh intake session.");
}

if (els.resetBtn) {
  els.resetBtn.addEventListener("click", resetSession);
}

// Architecture Modal
if (els.archModalBtn) {
  els.archModalBtn.addEventListener("click", () => {
    if (els.archModal) els.archModal.hidden = false;
  });
}

if (els.closeArchModalBtn) {
  els.closeArchModalBtn.addEventListener("click", () => {
    if (els.archModal) els.archModal.hidden = true;
  });
}

if (els.closeModalFooterBtn) {
  els.closeModalFooterBtn.addEventListener("click", () => {
    if (els.archModal) els.archModal.hidden = true;
  });
}

if (els.archModal) {
  els.archModal.addEventListener("click", (e) => {
    if (e.target === els.archModal) {
      els.archModal.hidden = true;
    }
  });
}

// Initialize on page load
renderStateCards({ executor: {} });
startSession();

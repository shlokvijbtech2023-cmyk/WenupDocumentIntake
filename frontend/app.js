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

  // Tab 1 Chat Completion Card & Buttons
  chatCompleteCard: document.getElementById("chat-complete-card"),
  chatDownloadPdfBtn: document.getElementById("chat-download-pdf-btn"),
  chatViewDocBtn: document.getElementById("chat-view-doc-btn"),

  // 3x3 Tile Controls & Finish Options
  toggleFlipAllBtn: document.getElementById("toggle-flip-all-btn"),
  toggleFlipText: document.getElementById("toggle-flip-text"),
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
  if (enabled && els.chatInput) {
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

// ---------- Context-Aware Quick Suggestion Chips (Clean & Generic) ----------

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
    // No random fake names -- user provides their own name
  } else if (!state.home_address) {
    // No random fake addresses -- user provides their own address
  } else if (state.covers_worldwide_assets === null) {
    chips.push("Yes, cover worldwide assets", "No, UK assets only");
  } else if (state.has_children === null) {
    chips.push("Yes, I have children", "No, I do not have children");
  } else if (state.has_children === true && (!state.children_names || state.children_names.length === 0)) {
    chips.push("None");
  } else if (!state.executor?.name) {
    // No random fake executor names -- user provides their executor's name
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
    let shouldBeFlipped = false;
    if (globalForceFlipMode !== null) {
      shouldBeFlipped = globalForceFlipMode;
    } else if (manualFlippedCards.has(meta.key)) {
      shouldBeFlipped = manualFlippedCards.get(meta.key);
    } else {
      // When all 9 fields are completed, ALL 9 turn to show their cards 1 - 9!
      // Or auto flip once individually confirmed
      shouldBeFlipped = allNineFilled || confirmed;
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

        <!-- BACK FACE: Illustrated Field Tile Artwork (1 - 9) -->
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

  // Reveal Tab 1 & Tab 2 Completion cards when all 9 fields are done
  if (els.chatCompleteCard) {
    els.chatCompleteCard.style.display = (allNineFilled || totalConfirmedCount >= 7) ? "flex" : "none";
  }
  if (els.tilesCompleteBanner) {
    els.tilesCompleteBanner.style.display = allNineFilled ? "flex" : "none";
  }

  // Update toggle flip all button label
  if (els.toggleFlipText) {
    if (globalForceFlipMode === true || allNineFilled) {
      els.toggleFlipText.textContent = "Flip All to Data";
      if (els.toggleFlipAllBtn) els.toggleFlipAllBtn.classList.add("active");
    } else if (globalForceFlipMode === false) {
      els.toggleFlipText.textContent = "Flip All to Art";
      if (els.toggleFlipAllBtn) els.toggleFlipAllBtn.classList.remove("active");
    } else {
      els.toggleFlipText.textContent = totalConfirmedCount >= 5 ? "Flip All to Data" : "Flip All to Art";
    }
  }
}

function renderDocument(doc) {
  lastDocumentContent = doc;
  if (els.documentText) {
    els.documentText.textContent = doc || "Draft document will appear here once intake begins.";
  }
}

// ---------- Professional PDF Document Generator ----------

function downloadDocumentAsPdf() {
  if (!lastDocumentContent) {
    addSystemNote("⚠️ Please start your intake interview first to generate draft document content.", true);
    return;
  }

  const testatorName = latestState?.full_name || "Draft";
  const safeName = testatorName.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Personal_Wishes_Document_${safeName}.pdf`;

  // 1. Generate via jsPDF if available
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 44;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header Banner (Wenup Brand Purple #2D006B)
      doc.setFillColor(45, 0, 107);
      doc.rect(0, 0, pageWidth, 56, "F");

      // Brand Wordmark
      doc.setTextColor(226, 248, 50); // #E2F832 Lime
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Wenup", margin, 36);

      // Header Subtitle
      doc.setTextColor(245, 240, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text("Personal Wishes Document • Confidential Draft", pageWidth - margin, 36, { align: "right" });

      y = 82;

      // Document Title
      doc.setTextColor(36, 0, 87);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PERSONAL WISHES DOCUMENT", margin, y);
      y += 18;

      // Metadata line
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(95, 85, 119);
      doc.text(`Testator: ${testatorName} | Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, margin, y);
      y += 16;

      // Legal Disclaimer Card
      doc.setFillColor(254, 246, 236); // #FEF6EC
      doc.setDrawColor(250, 215, 160); // #FAD7A0
      doc.roundedRect(margin, y, contentWidth, 36, 4, 4, "FD");

      doc.setTextColor(167, 78, 6);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("DEMONSTRATION ONLY — NOT LEGAL ADVICE", margin + 10, y + 13);
      doc.setFont("helvetica", "normal");
      doc.text("This draft was compiled by the Wenup Conversational Intake Assistant. It must be reviewed by a qualified solicitor before formal execution.", margin + 10, y + 25);

      y += 50;

      // Content formatting from raw document string
      doc.setTextColor(30, 20, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setLineHeightFactor(1.4);

      const rawLines = lastDocumentContent.split("\n");

      for (let i = 0; i < rawLines.length; i++) {
        const rawLine = rawLines[i].trim();

        if (!rawLine) {
          y += 8;
          continue;
        }

        // Page break check
        if (y > pageHeight - 65) {
          doc.addPage();
          y = margin + 20;
        }

        // Skip title & disclaimer lines that we rendered natively in header
        if (rawLine.startsWith("PERSONAL WISHES DOCUMENT") || rawLine.startsWith("Prepared:")) {
          continue;
        }
        if (rawLine.startsWith("This is a FICTIONAL document")) {
          continue;
        }

        // Section Headers (Uppercase words without colons)
        if (rawLine === rawLine.toUpperCase() && rawLine.length > 3 && !rawLine.includes(":") && !rawLine.startsWith("[")) {
          y += 6;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(45, 0, 107);
          doc.setFontSize(11);
          doc.text(rawLine, margin, y);
          y += 14;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 20, 50);
          doc.setFontSize(10);
        } else {
          // Wrapped body text
          const splitLines = doc.splitTextToSize(rawLine, contentWidth);
          for (let s = 0; s < splitLines.length; s++) {
            if (y > pageHeight - 65) {
              doc.addPage();
              y = margin + 20;
            }
            doc.text(splitLines[s], margin, y);
            y += 14;
          }
        }
      }

      // Add Execution & Signatures Section
      y += 12;
      if (y > pageHeight - 110) {
        doc.addPage();
        y = margin + 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 0, 107);
      doc.setFontSize(11);
      doc.text("EXECUTION & SIGNATURES", margin, y);
      y += 18;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(95, 85, 119);
      doc.setFontSize(9);
      doc.text("Signed by the Testator in the presence of witnesses:", margin, y);
      y += 24;

      doc.setDrawColor(180, 170, 205);
      doc.line(margin, y, margin + 200, y);
      doc.line(pageWidth - margin - 200, y, pageWidth - margin, y);
      y += 12;
      doc.text("Testator Signature", margin, y);
      doc.text("Date", pageWidth - margin - 200, y);

      // Number pages in footer
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(132, 123, 155);
        doc.text(`Wenup Document Intake Assistant • Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 22, { align: "center" });
      }

      doc.save(fileName);
      addSystemNote(`📥 PDF downloaded successfully: ${fileName}`);
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
          pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; background: #faf8f5; padding: 20px; border-radius: 8px; }
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

    const docRes = await fetch(`${API_BASE}/api/session/${sessionId}/document`);
    if (docRes.ok) {
      const docData = await docRes.json();
      renderDocument(docData.document);
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
  if (latestState) {
    renderStateCards(latestState);
  }

  // Reveal Tab 1 complete card
  if (els.chatCompleteCard) els.chatCompleteCard.style.display = "flex";

  addSystemNote("✨ Document finalized! All 9 confirmed fields are now compiled into your draft Personal Wishes Document.");
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

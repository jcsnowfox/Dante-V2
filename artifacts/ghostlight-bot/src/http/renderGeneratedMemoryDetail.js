function truncateText(value = "", maxLength = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function renderRelatedMemorySummary(memory, helpers) {
  const { escapeHtml } = helpers;

  if (!memory) {
    return "";
  }

  return [
    "<article class=\"related-memory-card\">",
    "<div class=\"related-memory-card-topline\">",
    `<h3>${escapeHtml(memory.title || "Untitled memory")}</h3>`,
    "<div class=\"memory-chip-row\">",
    `<span class="badge type">${escapeHtml(memory.memoryType || "memory")}</span>`,
    `<span class="badge domain">${escapeHtml(memory.domain || "general")}</span>`,
    "</div>",
    "</div>",
    `<p>${escapeHtml(truncateText(memory.content || ""))}</p>`,
    "</article>",
  ].join("");
}

function renderCurrentMemoryCard(memory, helpers) {
  const { escapeHtml } = helpers;

  if (!memory) {
    return "<p class=\"empty-state\">No linked live memory found.</p>";
  }

  return [
    "<article class=\"generated-memory-current-card\">",
    `<h3>${escapeHtml(memory.title || "Untitled memory")}</h3>`,
    "<div class=\"memory-chip-row\">",
    `<span class="badge type">${escapeHtml(memory.memoryType || "memory")}</span>`,
    `<span class="badge domain">${escapeHtml(memory.domain || "general")}</span>`,
    `<span class="badge sensitivity">${escapeHtml(memory.sensitivity || "low")}</span>`,
    "</div>",
    `<p>${escapeHtml(memory.content || "")}</p>`,
    "</article>",
  ].join("");
}

function renderExcerptMemoryCard(memory, helpers, maxLength = 200) {
  const { escapeHtml } = helpers;

  if (!memory) {
    return "<p class=\"empty-state\">No linked live memory found.</p>";
  }

  return [
    "<article class=\"generated-memory-current-card\">",
    `<h3>${escapeHtml(memory.title || "Untitled memory")}</h3>`,
    "<div class=\"memory-chip-row\">",
    `<span class="badge type">${escapeHtml(memory.memoryType || "memory")}</span>`,
    `<span class="badge domain">${escapeHtml(memory.domain || "general")}</span>`,
    `<span class="badge sensitivity">${escapeHtml(memory.sensitivity || "low")}</span>`,
    "</div>",
    `<p>${escapeHtml(truncateText(memory.content || "", maxLength))}</p>`,
    "</article>",
  ].join("");
}

function renderEditableMemoryFields({ item, helpers }) {
  const {
    escapeHtml,
    renderOptions,
    supportedMemoryDomains,
    supportedMemoryTypes,
    supportedSensitivityLevels,
  } = helpers;

  return [
    "<div class=\"generated-memory-editor\">",
    "<div class=\"memory-field-block\">",
    `<label for="title">Title</label><input id="title" name="title" type="text" value="${escapeHtml(item.title)}">`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="content">Memory</label><textarea id="content" name="content">${escapeHtml(item.content)}</textarea>`,
    "</div>",
    "<div class=\"generated-memory-meta-grid\">",
    "<div class=\"memory-field-block\">",
    `<label for="memoryType">Type</label><select id="memoryType" name="memoryType">${renderOptions(supportedMemoryTypes, item.memoryType)}</select>`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="sensitivity">Sensitivity</label><select id="sensitivity" name="sensitivity">${renderOptions(supportedSensitivityLevels, item.sensitivity)}</select>`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="domain">Category</label><select id="domain" name="domain">${renderOptions(supportedMemoryDomains, item.domain)}</select>`,
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

function renderSignedReason({ reason = "", noteSignature = "", helpers }) {
  const { escapeHtml } = helpers;
  const safeReason = String(reason || "").trim();

  if (!safeReason) {
    return "";
  }

  return [
    "<div class=\"generated-memory-reason\">",
    `<p>${escapeHtml(safeReason)}</p>`,
    `<span>&ndash; ${escapeHtml(noteSignature || "Ghostlight")}</span>`,
    "</div>",
  ].join("");
}

function formatReadableDate(value = "") {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatUsageCount(value, fallback = "0") {
  const count = Number(value);

  if (!Number.isFinite(count)) {
    return fallback;
  }

  return String(Math.max(0, Math.trunc(count)));
}

function formatQuietReason(value = "") {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "never_used_old_enough") return "Never surfaced";
  if (normalized === "not_used_recently") return "Not surfaced recently";
  if (normalized === "resolved_not_used_90_days") return "Resolved and quiet";
  return "Quiet memory";
}

function renderArchiveStats({ item, targetMemory, helpers }) {
  const { escapeHtml } = helpers;
  const payload = item.sourcePayload || {};
  const useCount30d = payload.useCount30d;
  const useCountLifetime = payload.useCount ?? targetMemory?.useCount ?? 0;
  const lastUsedAt = targetMemory?.lastUsedAt || "";
  const lastUpdatedAt = targetMemory?.updatedAt || "";
  const recentUseText = useCount30d === null || useCount30d === undefined
    ? "Recent use not recorded"
    : `Used ${formatUsageCount(useCount30d)} ${Number(useCount30d) === 1 ? "time" : "times"} in the last 30 days`;
  const lifetimeCount = formatUsageCount(useCountLifetime);
  const lifetimeUseText = `${lifetimeCount} lifetime ${Number(lifetimeCount) === 1 ? "use" : "uses"}`;
  const lastRecalledText = lastUsedAt
    ? `Last recalled ${formatReadableDate(lastUsedAt)}`
    : "Never recalled";
  const lastEditedText = lastUpdatedAt
    ? `Last edited ${formatReadableDate(lastUpdatedAt)}`
    : "Last edited unknown";

  return [
    "<section class=\"generated-memory-activity\">",
    "<h3>Memory Activity</h3>",
    "<p>",
    [
      recentUseText,
      lifetimeUseText,
      lastRecalledText,
      lastEditedText,
      formatQuietReason(payload.quietReason),
    ].map((part) => escapeHtml(part)).join(" <span aria-hidden=\"true\">&middot;</span> "),
    "</p>",
    "</section>",
  ].join("");
}

function renderMemoriesBeingMerged({ targetMemory = null, relatedMemories = [], helpers }) {
  const memoriesById = new Map();

  [targetMemory, ...relatedMemories].forEach((memory) => {
    if (memory?.memoryId && !memoriesById.has(memory.memoryId)) {
      memoriesById.set(memory.memoryId, memory);
    }
  });
  const memories = Array.from(memoriesById.values());

  if (!memories.length) {
    return "";
  }

  return [
    "<section class=\"existing-similar-memories\">",
    "<h3>Memories Being Combined</h3>",
    "<div class=\"related-memory-card-grid\">",
    ...memories.map((memory) => renderExcerptMemoryCard(memory, helpers)),
    "</div>",
    "</section>",
  ].join("");
}

function renderEditableSplitMemory(memory = {}, index, helpers) {
  const {
    escapeHtml,
    renderOptions,
    supportedMemoryDomains,
  } = helpers;
  const domainOptions = supportedMemoryDomains.filter((domain) => domain !== "timeline");
  const typeOptions = ["anchor", "canon", "resolved", "roleplay"];
  const sensitivityOptions = ["low", "medium", "high"];

  return [
    "<article class=\"generated-memory-split-card\">",
    `<h3>${escapeHtml(`Memory ${index + 1}`)}</h3>`,
    "<div class=\"generated-memory-editor\">",
    "<div class=\"memory-field-block\">",
    `<label for="splitTitle_${index}">Title</label>`,
    `<input id="splitTitle_${index}" name="splitTitle_${index}" type="text" value="${escapeHtml(memory.title || "")}">`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="splitContent_${index}">Memory</label>`,
    `<textarea id="splitContent_${index}" name="splitContent_${index}">${escapeHtml(memory.content || "")}</textarea>`,
    "</div>",
    "<div class=\"generated-memory-meta-grid\">",
    "<div class=\"memory-field-block\">",
    `<label for="splitMemoryType_${index}">Type</label>`,
    `<select id="splitMemoryType_${index}" name="splitMemoryType_${index}">${renderOptions(typeOptions, memory.memoryType || "canon")}</select>`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="splitSensitivity_${index}">Sensitivity</label>`,
    `<select id="splitSensitivity_${index}" name="splitSensitivity_${index}">${renderOptions(sensitivityOptions, memory.sensitivity || "low")}</select>`,
    "</div>",
    "<div class=\"memory-field-block\">",
    `<label for="splitDomain_${index}">Category</label>`,
    `<select id="splitDomain_${index}" name="splitDomain_${index}">${renderOptions(domainOptions, memory.domain || "general")}</select>`,
    "</div>",
    "</div>",
    "</div>",
    "</article>",
  ].join("");
}

function renderQueueReviewBar({ queueState = {}, helpers }) {
  const { escapeHtml } = helpers;

  if (!queueState?.enabled) {
    return "";
  }

  const total = Number(queueState.total || 0);
  const position = Number(queueState.position || 0);
  const label = total > 0 && position > 0
    ? `Suggestion ${position} of ${total}`
    : "Reviewing suggestions one by one";

  return [
    "<div class=\"generated-memory-queue-bar\">",
    `<span>${escapeHtml(label)}</span>`,
    `<a class="toolbar-button secondary" href="${escapeHtml(queueState.exitHref || "/admin/memory/review")}">Exit Queue</a>`,
    "</div>",
  ].join("");
}

function renderQueueHiddenFields({ queueState = {}, helpers }) {
  const { escapeHtml } = helpers;

  if (!queueState?.enabled) {
    return "";
  }

  const filters = queueState.filters || {};

  return [
    "<input type=\"hidden\" name=\"queue\" value=\"1\">",
    `<input type="hidden" name="queueStatus" value="${escapeHtml(filters.status || "needs_review")}">`,
    `<input type="hidden" name="queueSource" value="${escapeHtml(filters.source || "")}">`,
    `<input type="hidden" name="queueAction" value="${escapeHtml(filters.action || "")}">`,
    `<input type="hidden" name="queueMemoryType" value="${escapeHtml(filters.memoryType || "")}">`,
    `<input type="hidden" name="queueStep" value="${escapeHtml(String(queueState.position || 1))}">`,
    `<input type="hidden" name="queueTotal" value="${escapeHtml(String(queueState.total || ""))}">`,
    `<input type="hidden" name="queueReturnTo" value="${escapeHtml(queueState.exitHref || "/admin/memory/review")}">`,
  ].join("");
}

function renderGeneratedMemoryDetailPage({ item, targetMemory = null, relatedMemories = [], personaName = "Ghostlight", queueState = null, message = "", error = "", theme = "light", themeLinks = null, shellOnly = false, helpers }) {
  const {
    escapeHtml,
    buildAdminLocation,
    withThemeField,
    renderLayout,
  } = helpers;
  const curatorAction = String(item.sourcePayload?.action || "").trim().toLowerCase();
  const isMergeSuggestion = curatorAction === "merge_existing";
  const isSplitSuggestion = curatorAction === "split_existing";
  const isArchiveSuggestion = curatorAction === "archive_existing";
  const isUpdateSuggestion = curatorAction === "update_existing";
  const isResolveSuggestion = curatorAction === "resolve_existing";
  const isCreateSuggestion = !isMergeSuggestion
    && !isSplitSuggestion
    && !isArchiveSuggestion
    && !isUpdateSuggestion
    && !isResolveSuggestion;
  const curatorReason = String(item.sourcePayload?.reason || "").trim();
  const noteSignature = String(personaName || "").trim() || "Ghostlight";
  const relatedForSummary = relatedMemories.filter((memory) => memory.memoryId !== targetMemory?.memoryId);
  const proposedSplitMemories = Array.isArray(item.sourcePayload?.proposedMemories)
    ? item.sourcePayload.proposedMemories
    : [];
  const reviewHeading = isCreateSuggestion
    ? "Review Suggested Memory"
    : isUpdateSuggestion
      ? "Review Suggested Update"
      : isResolveSuggestion
        ? "Review Suggested Resolve"
      : isArchiveSuggestion
        ? "Archive Quiet Memory"
        : isMergeSuggestion
          ? "Review Suggested Merge"
          : isSplitSuggestion
            ? "Review Suggested Split"
          : "Review Memory";
  const reviewHelp = isSplitSuggestion
    ? "Your AI thinks this memory may be doing too many jobs. Review the proposed smaller memories, edit anything that feels off, then decide what happens next."
    : isMergeSuggestion
      ? "Your AI thinks these saved memories may be doing the same job. Review the proposed combined memory, edit anything that feels off, then decide what happens next."
      : isArchiveSuggestion
        ? "This memory hasn't been used much recently. Archive it to keep active recall cleaner, or reject the suggestion if it still matters."
        : isResolveSuggestion
          ? "Your AI thinks this active memory may now be past context. Compare the current version with the resolved version, edit anything that feels off, then decide what happens next."
        : isUpdateSuggestion
          ? "Your AI thinks this saved memory may need updating. Compare the current version with the suggestion, edit anything that feels off, then decide what happens next."
        : isCreateSuggestion
          ? "Your AI thinks this may be worth keeping. Review it, edit anything that feels off, then decide what happens next."
          : "Review a recently created memory and make any changes you want before saving it.";
  const body = [
    "<section class=\"lite-panel\">",
    renderQueueReviewBar({ queueState, helpers }),
    `<div class="panel-header"><div><h2>${escapeHtml(reviewHeading)}</h2><p>${escapeHtml(reviewHelp)}</p></div></div>`,
    "<form method=\"post\" action=\"/admin/actions/review\">",
    withThemeField(theme),
    `<input type="hidden" name="generatedMemoryId" value="${escapeHtml(item.generatedMemoryId)}">`,
    `<input type="hidden" name="returnTo" value="${escapeHtml(queueState?.exitHref || buildAdminLocation({ path: "/admin/memory/review", theme }))}">`,
    renderQueueHiddenFields({ queueState, helpers }),
    isArchiveSuggestion
      ? [
        renderCurrentMemoryCard(targetMemory, helpers),
        renderSignedReason({ reason: curatorReason, noteSignature, helpers }),
        renderArchiveStats({ item, targetMemory, helpers }),
      ].join("")
      : isMergeSuggestion
        ? [
          "<section class=\"generated-memory-comparison-panel\">",
          "<h3>Proposed Merged Memory</h3>",
          renderEditableMemoryFields({ item, helpers }),
          "</section>",
          renderSignedReason({ reason: curatorReason, noteSignature, helpers }),
          renderMemoriesBeingMerged({ targetMemory, relatedMemories, helpers }),
        ].join("")
      : isSplitSuggestion
        ? [
          "<section class=\"generated-memory-comparison-panel\">",
          "<h3>Current Memory</h3>",
          renderCurrentMemoryCard(targetMemory, helpers),
          "</section>",
          renderSignedReason({ reason: curatorReason, noteSignature, helpers }),
          "<section class=\"generated-memory-split-list\">",
          "<h3>Proposed Replacement Memories</h3>",
          `<input type="hidden" name="splitCount" value="${escapeHtml(String(proposedSplitMemories.length))}">`,
          ...proposedSplitMemories.map((memory, index) => renderEditableSplitMemory(memory, index, helpers)),
          "<p class=\"meta\">Saving this will create the proposed memories and archive the original.</p>",
          "</section>",
        ].join("")
        : isUpdateSuggestion || isResolveSuggestion
          ? [
            "<div class=\"generated-memory-comparison-grid\">",
            "<section class=\"generated-memory-comparison-panel\">",
            "<h3>Current Saved Memory</h3>",
            renderCurrentMemoryCard(targetMemory, helpers),
            "</section>",
            "<section class=\"generated-memory-comparison-panel\">",
            `<h3>${isResolveSuggestion ? "Resolved Version" : "Suggested Update"}</h3>`,
            renderEditableMemoryFields({ item, helpers }),
            "</section>",
            "</div>",
          ].join("")
        : [
          renderEditableMemoryFields({ item, helpers }),
        ].join(""),
    isCreateSuggestion || isUpdateSuggestion || isResolveSuggestion
      ? renderSignedReason({ reason: curatorReason, noteSignature, helpers })
      : "",
    "<div class=\"toolbar generated-memory-actions\">",
    `<button type="submit" name="status" value="approved">${isSplitSuggestion ? "Split Memory" : isMergeSuggestion ? "Merge Memories" : isArchiveSuggestion ? "Archive Memory" : isResolveSuggestion ? "Resolve Memory" : isUpdateSuggestion ? "Save Update" : "Save Memory"}</button>`,
    `<button type="submit" name="status" value="rejected" class="warn">${isArchiveSuggestion ? "Keep Memory" : isMergeSuggestion ? "Keep Originals" : isSplitSuggestion ? "Keep Original" : isResolveSuggestion ? "Keep Current" : "Reject"}</button>`,
    isCreateSuggestion || isUpdateSuggestion || isResolveSuggestion || isArchiveSuggestion || isMergeSuggestion || isSplitSuggestion ? "" : "<button type=\"submit\" name=\"status\" value=\"archived\" class=\"secondary\">Archive</button>",
    "<button type=\"submit\" name=\"status\" value=\"proposed\" class=\"secondary\">Save For Later</button>",
    "</div>",
    "</form>",
    isCreateSuggestion && relatedForSummary.length
      ? [
        "<section class=\"existing-similar-memories\">",
        "<h3>Similar Memories Already Saved</h3>",
        "<div class=\"related-memory-card-grid\">",
        ...relatedForSummary.slice(0, 3).map((memory) => renderRelatedMemorySummary(memory, helpers)),
        "</div>",
        "</section>",
      ].join("")
      : "",
    "</section>",
  ].join("");

  if (shellOnly) {
    return body;
  }

  return renderLayout({
    title: `Review ${item.title}`,
    body,
    message,
    error,
    theme,
    themeLinks,
  });
}

module.exports = {
  renderGeneratedMemoryDetailPage,
};

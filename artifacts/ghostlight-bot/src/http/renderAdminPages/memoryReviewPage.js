const {
  getReviewActionKey,
  getReviewSourceKey,
} = require("../memoryReviewQueue");

function formatReviewSourceLabel(item = {}) {
  const sourceKey = getReviewSourceKey(item);

  if (sourceKey === "curator") return "Curator";
  if (sourceKey === "requested") return "Requested";
  if (sourceKey === "import") return "Import";
  if (sourceKey === "weekly") return "Weekly";
  if (sourceKey === "daily") return "Daily";
  return "Other";
}

function formatReviewActionLabel(item = {}) {
  const actionKey = getReviewActionKey(item);

  if (actionKey === "update") return "Update";
  if (actionKey === "resolve") return "Resolve";
  if (actionKey === "merge") return "Merge";
  if (actionKey === "split") return "Split";
  if (actionKey === "archive") return "Archive";
  return "Create";
}

function formatReviewMemoryTypeLabel(value = "") {
  const memoryType = String(value || "").trim().toLowerCase();

  if (memoryType === "timeline_daily") return "Daily";
  if (memoryType === "timeline_weekly") return "Weekly";
  return memoryType || "memory";
}

function formatReviewStatusLabel(value = "") {
  const status = String(value || "").trim().toLowerCase();

  if (status === "proposed") return "Needs review";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "archived") return "Saved for later";
  return status || "Needs review";
}

function formatReviewCardStatusLabel(item = {}) {
  if (Array.isArray(item.reviewFlags) && item.reviewFlags.includes("recently_generated")) {
    return "Recently made";
  }

  return formatReviewStatusLabel(item.status);
}

function formatReviewCardDate(value = "") {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function renderMemoryReviewPage({ items = [], filters = {}, page = 1, pageSize = 10, totalItems = 0, theme = "light", helpers }) {
  const { escapeHtml, buildAdminLocation } = helpers;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const statusOptions = [
    { value: "needs_review", label: "Needs review" },
    { value: "recently_generated", label: "Recently made" },
    { value: "handled", label: "Handled" },
    { value: "archived", label: "Saved for later" },
    { value: "all", label: "Everything" },
  ];
  const actionOptions = [
    { value: "", label: "All actions" },
    { value: "create", label: "Create" },
    { value: "update", label: "Update" },
    { value: "resolve", label: "Resolve" },
    { value: "merge", label: "Merge" },
    { value: "split", label: "Split" },
    { value: "archive", label: "Archive" },
  ];
  const buildReviewExtra = (extra = {}) => ({
    status: filters.status || "",
    action: filters.action || "",
    page,
    ...extra,
  });
  const reviewReturnHref = buildAdminLocation({
    path: "/admin/memory/review",
    theme,
    extra: buildReviewExtra(),
  });
  const queueExtra = buildReviewExtra({
    queue: "1",
    queueStep: "1",
    queueTotal: String(totalItems || items.length),
    page: "",
  });
  const queueStartHref = items[0]
    ? buildAdminLocation({
      path: `/admin/generated/${encodeURIComponent(items[0].generatedMemoryId)}`,
      theme,
      extra: {
        ...queueExtra,
        returnTo: reviewReturnHref,
      },
    })
    : "";
  const cards = items.map((item) => {
    const detailHref = buildAdminLocation({
      path: `/admin/generated/${encodeURIComponent(item.generatedMemoryId)}`,
      theme,
      extra: {
        returnTo: reviewReturnHref,
      },
    });
    const reason = String(item.sourcePayload?.reason || "").trim();
    const displayReason = reason || "A memory suggestion is ready for review.";

    return [
      `<a class="review-card" href="${escapeHtml(detailHref)}">`,
      "<div class=\"review-card-topline\">",
      `<span class="badge type review-card-action">${escapeHtml(formatReviewActionLabel(item))}</span>`,
      `<time class="review-card-date" datetime="${escapeHtml(item.updatedAt || item.referenceDate || "")}">${escapeHtml(formatReviewCardDate(item.updatedAt || item.referenceDate || ""))}</time>`,
      "</div>",
      `<h3 class="review-card-title">${escapeHtml(item.title || "Untitled memory")}</h3>`,
      `<p class="review-card-note">${escapeHtml(displayReason.slice(0, 260))}</p>`,
      "<div class=\"review-card-footer\">",
      "<div class=\"review-card-tags\">",
      `<span class="badge">${escapeHtml(formatReviewSourceLabel(item))}</span>`,
      `<span class="badge domain">${escapeHtml(formatReviewMemoryTypeLabel(item.memoryType))}</span>`,
      `<span class="badge">${escapeHtml(formatReviewCardStatusLabel(item))}</span>`,
      "</div>",
      "</div>",
      "</a>",
    ].join("");
  }).join("");

  return [
    "<section class=\"memory-section\">",
    "<section class=\"lite-toolbar stack memory-toolbar-shell memory-review-shell\">",
    "<div class=\"toolbar-row filters\">",
    `<form method="get" action="${escapeHtml(buildAdminLocation({ path: "/admin/memory/review" }))}" class="toolbar-group memory-toolbar-group memory-toolbar-group-filters">`,
    `<input type="hidden" name="theme" value="${escapeHtml(theme)}">`,
    `<div class="toolbar-field select"><select id="reviewStatus" name="status">${statusOptions.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === (filters.status || "needs_review") ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>`,
    `<div class="toolbar-field select"><select id="reviewAction" name="action">${actionOptions.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === (filters.action || "") ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>`,
    "<button type=\"submit\" class=\"toolbar-button secondary\">Filter</button>",
    "</form>",
    queueStartHref
      ? `<a class="toolbar-button secondary" href="${escapeHtml(queueStartHref)}">Review One by One</a>`
      : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Review One by One</span>",
    "</div>",
    "<div class=\"form-spacer compact\"></div>",
    "</section>",
    "<section class=\"memory-review-card-section\">",
    cards ? `<div class="review-card-grid">${cards}</div>` : "<p class=\"empty-state review-card-empty\">No review items found.</p>",
    "</section>",
    "<section class=\"lite-toolbar\" style=\"border-bottom:none;padding:1rem 1.6rem 0\">",
    "<div class=\"toolbar-row pagination\"><div class=\"toolbar-group\">",
    previousPage
      ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/memory/review", theme, extra: buildReviewExtra({ page: previousPage }) }))}">Previous</a>`
      : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Previous</span>",
    `<span class="meta">Page ${escapeHtml(String(page))} of ${escapeHtml(String(totalPages))}</span>`,
    nextPage
      ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/memory/review", theme, extra: buildReviewExtra({ page: nextPage }) }))}">Next</a>`
      : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Next</span>",
    "</div></div></section>",
    "</section>",
  ].join("");
}

module.exports = {
  renderMemoryReviewPage,
};

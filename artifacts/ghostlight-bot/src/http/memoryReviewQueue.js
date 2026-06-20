const {
  buildAdminLocation,
  buildReturnLocation,
} = require("./adminUiHelpers");

function isReviewQueueItem(item, status = "proposed") {
  const selectedStatus = String(status || "needs_review").trim().toLowerCase();

  if (selectedStatus === "needs_review") {
    return item?.status === "proposed"
      || (Array.isArray(item?.reviewFlags) && item.reviewFlags.includes("recently_generated"));
  }

  if (selectedStatus === "recently_generated") {
    return Array.isArray(item?.reviewFlags) && item.reviewFlags.includes("recently_generated");
  }

  if (selectedStatus === "handled") {
    return item?.status === "approved" || item?.status === "rejected";
  }

  if (selectedStatus === "all") {
    return true;
  }

  return item?.status === selectedStatus;
}

function getReviewSourceKey(item = {}) {
  const sourceKind = String(item.sourceKind || "").trim().toLowerCase();

  if (sourceKind === "memory_curator") return "curator";
  if (sourceKind === "memory_save_request") return "requested";
  if (sourceKind === "manual_import" || sourceKind === "closed_thread") return "import";
  if (sourceKind === "ghostlight_summary_queue" || item.memoryType === "timeline_weekly") return "weekly";
  if (sourceKind === "ghostlight_conversation" || item.memoryType === "timeline_daily") return "daily";
  return "other";
}

function getReviewActionKey(item = {}) {
  const action = String(item.sourcePayload?.action || "").trim().toLowerCase();

  if (action === "update_existing") return "update";
  if (action === "resolve_existing") return "resolve";
  if (action === "merge_existing") return "merge";
  if (action === "split_existing") return "split";
  if (action === "archive_existing") return "archive";
  return "create";
}

function itemMatchesReviewFilters(item = {}, filters = {}) {
  const status = String(filters.status || "needs_review").trim().toLowerCase();
  const memoryType = String(filters.memoryType || "").trim().toLowerCase();
  const source = String(filters.source || "").trim().toLowerCase();
  const action = String(filters.action || "").trim().toLowerCase();

  if (!isReviewQueueItem(item, status)) {
    return false;
  }

  if (memoryType && item.memoryType !== memoryType) {
    return false;
  }

  if (source && getReviewSourceKey(item) !== source) {
    return false;
  }

  if (action && getReviewActionKey(item) !== action) {
    return false;
  }

  return true;
}

function getReviewQueueFiltersFromFields(fields = {}) {
  return {
    status: String(fields.queueStatus || "needs_review").trim().toLowerCase(),
    source: String(fields.queueSource || "").trim().toLowerCase(),
    action: String(fields.queueAction || "").trim().toLowerCase(),
    memoryType: String(fields.queueMemoryType || "").trim().toLowerCase(),
  };
}

async function buildNextReviewQueueLocation({
  generatedMemories,
  userScope,
  currentGeneratedMemoryId,
  fields = {},
  theme,
  message = "",
  error = "",
}) {
  if (String(fields.queue || "") !== "1") {
    return "";
  }

  const filters = getReviewQueueFiltersFromFields(fields);
  const queueStep = Number.parseInt(String(fields.queueStep || "1"), 10);
  const queueTotal = Number.parseInt(String(fields.queueTotal || ""), 10);
  const nextQueueStep = Number.isFinite(queueStep) && queueStep > 0 ? queueStep + 1 : 2;
  const exitHref = String(fields.queueReturnTo || fields.returnTo || "").trim()
    || buildAdminLocation({
      path: "/admin/memory/review",
      theme,
      extra: filters,
    });
  const allGeneratedItems = await generatedMemories.listGeneratedMemories({
    status: ["proposed", "approved", "rejected", "archived"].includes(filters.status) ? filters.status : undefined,
    userScope,
    limit: 500,
  });
  const nextItem = allGeneratedItems
    .filter((candidate) => candidate.generatedMemoryId !== currentGeneratedMemoryId)
    .find((candidate) => itemMatchesReviewFilters(candidate, filters));

  if (!nextItem) {
    return buildReturnLocation({
      returnTo: exitHref,
      fallbackPath: "/admin/memory/review",
      message: message ? `${message}. Review queue complete.` : "Review queue complete.",
      error,
      theme,
    });
  }

  return buildReturnLocation({
    returnTo: buildAdminLocation({
      path: `/admin/generated/${encodeURIComponent(nextItem.generatedMemoryId)}`,
      theme,
      extra: {
        queue: "1",
        ...filters,
        queueStep: nextQueueStep,
        queueTotal: Number.isFinite(queueTotal) && queueTotal > 0 ? queueTotal : "",
        returnTo: exitHref,
      },
    }),
    fallbackPath: "/admin/memory/review",
    message,
    error,
    theme,
  });
}

module.exports = {
  buildNextReviewQueueLocation,
  getReviewActionKey,
  getReviewQueueFiltersFromFields,
  getReviewSourceKey,
  isReviewQueueItem,
  itemMatchesReviewFilters,
};

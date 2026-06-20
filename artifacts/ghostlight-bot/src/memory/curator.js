const {
  getLlmClient,
  hasLlmApiKey,
  resolveChatModel,
  resolveSummaryModel,
} = require("../llm/client");
const { isSupportedMemoryDomain } = require("./domains");
const {
  ATTENTION_DISCOVERY_LANES,
  ATTENTION_LANE_CAPS,
  ATTENTION_PROJECT_DOMAINS,
  ATTENTION_SCAN_KIND,
  CURATOR_CANDIDATE_LANES,
  CURATOR_DISCOVERY_LANES,
  CURATOR_LANE_CAPS,
} = require("./curatorLanes");
const {
  buildAdjudicationPrompt,
  buildAttentionAdjudicationPrompt,
  buildAttentionCandidateExtractionPrompt,
  buildCandidateExtractionPrompt,
} = require("./curatorPrompts");
const {
  buildRelatedMemoryIndex,
  findDuplicateCandidateMemory,
  findDuplicateRelatedMemory,
  getTokenOverlapScore,
  isNearIdenticalUpdateSuggestion,
} = require("./dedupeHelpers");
const {
  safeJsonParse,
  stableUuid,
} = require("./curatorUtils");

const CURATOR_ACTIONS = Object.freeze([
  "create_memory",
  "update_existing",
  "resolve_existing",
]);

const CURATOR_MEMORY_TYPES = Object.freeze([
  "anchor",
  "canon",
  "resolved",
]);

const CURATOR_CONFIDENCE_LEVELS = Object.freeze([
  "low",
  "medium",
  "high",
]);

const CURATOR_MEMORY_VALUE_LEVELS = Object.freeze([
  "low",
  "medium",
  "high",
]);

const CURATOR_CONTINUITY_TYPES = Object.freeze([
  "preference",
  "person",
  "project",
  "place",
  "routine",
  "pattern",
  "stressor",
  "resolved_change",
  "anchor_context",
  "relationship_context",
  "system",
  "other",
]);

const CURATOR_CHANGE_SIGNALS = Object.freeze([
  "new",
  "changed",
  "resolved",
  "reinforced",
  "possible_duplicate",
]);

const CURATOR_BLOCKED_DOMAINS = Object.freeze([
  "lore",
  "timeline",
]);

const DEFAULT_CURATOR_LIMIT = 5;
const MAX_CURATOR_LIMIT = 5;
const DEFAULT_ATTENTION_LIMIT = 2;
const MAX_ATTENTION_LIMIT = 2;
const DEFAULT_CURATOR_CANDIDATE_LIMIT = 6;
const MAX_CURATOR_CANDIDATE_LIMIT = 6;
const DEFAULT_CURATOR_ADJUDICATION_LIMIT = 6;
const MAX_CURATOR_ADJUDICATION_LIMIT = 6;
const CURATOR_STAGE_TWO_MODEL_MODES = ["summary", "chat"];
const CURATOR_SOURCE_KIND = "memory_curator";

function clampCuratorLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_CURATOR_LIMIT), 10) || DEFAULT_CURATOR_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_CURATOR_LIMIT));
}

function clampAttentionLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_ATTENTION_LIMIT), 10) || DEFAULT_ATTENTION_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_ATTENTION_LIMIT));
}

function getCandidateLimit(stagedLimit = DEFAULT_CURATOR_LIMIT) {
  const parsed = Number.parseInt(String(stagedLimit || DEFAULT_CURATOR_LIMIT), 10) || DEFAULT_CURATOR_LIMIT;
  return Math.max(parsed, Math.min(parsed + 1, MAX_CURATOR_CANDIDATE_LIMIT));
}

function getAdjudicationLimit(stagedLimit = DEFAULT_CURATOR_LIMIT) {
  const parsed = Number.parseInt(String(stagedLimit || DEFAULT_CURATOR_LIMIT), 10) || DEFAULT_CURATOR_LIMIT;
  return Math.max(parsed, Math.min(parsed + 1, MAX_CURATOR_ADJUDICATION_LIMIT));
}

function getAttentionCandidateLimit(stagedLimit = DEFAULT_ATTENTION_LIMIT) {
  const parsed = Number.parseInt(String(stagedLimit || DEFAULT_ATTENTION_LIMIT), 10) || DEFAULT_ATTENTION_LIMIT;
  return Math.max(parsed, Math.min(parsed * 3, 6));
}

function getAttentionAdjudicationLimit(candidateLimit = getAttentionCandidateLimit(DEFAULT_ATTENTION_LIMIT)) {
  const parsed = Number.parseInt(String(candidateLimit || DEFAULT_ATTENTION_LIMIT), 10) || DEFAULT_ATTENTION_LIMIT;
  return Math.max(DEFAULT_ATTENTION_LIMIT, Math.min(parsed, 6));
}

function normalizeCuratorStageTwoModelMode(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "_");

  if (CURATOR_STAGE_TWO_MODEL_MODES.includes(normalized)) {
    return normalized;
  }

  if (["intelligent", "smart"].includes(normalized)) {
    return "chat";
  }

  return "summary";
}

function getCuratorStageTwoModelMode(config = {}) {
  return normalizeCuratorStageTwoModelMode(config.memoryCurator?.stageTwoModelMode);
}

function getCuratorStageTwoModel(config = {}) {
  return getCuratorStageTwoModelMode(config) === "chat"
    ? resolveChatModel(config)
    : resolveSummaryModel(config);
}

function getCuratorStageTwoCapability(config = {}) {
  return getCuratorStageTwoModelMode(config) === "chat" ? "chat" : "summary";
}

function isMediumOrHigh(value, allowedValues) {
  return allowedValues.includes(value) && value !== "low";
}

function normalizeLookbackHours(value) {
  const parsed = Number.parseInt(String(value || "24"), 10);

  if ([24, 72, 168].includes(parsed)) {
    return parsed;
  }

  return 24;
}

function normalizeAttentionLookbackHours(value) {
  const parsed = Number.parseInt(String(value || "6"), 10);

  if ([4, 6, 12].includes(parsed)) {
    return parsed;
  }

  return 6;
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getLookbackWindow({
  lookbackHours = 24,
  now = new Date(),
  normalizeLookback = normalizeLookbackHours,
} = {}) {
  const normalizedLookbackHours = normalizeLookback(lookbackHours);
  const end = new Date(now);
  const start = new Date(end.getTime() - normalizedLookbackHours * 60 * 60 * 1000);

  return {
    lookbackHours: normalizedLookbackHours,
    start,
    end,
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

function normalizeChannelIds(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function getEventMetadata(event = {}) {
  return event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? event.metadata
    : {};
}

function eventMatchesCuratorChannelScope(event = {}, channelIds = []) {
  const allowed = new Set(normalizeChannelIds(channelIds));

  if (!allowed.size) {
    return false;
  }

  const metadata = getEventMetadata(event);
  const candidates = [
    event.channel_id,
    event.thread_id,
    metadata.parentChannelId,
    metadata.channelId,
    metadata.threadId,
  ].map((item) => String(item || "").trim()).filter(Boolean);

  return candidates.some((candidate) => allowed.has(candidate));
}

function filterCuratorSourceEvents(events = [], { channelIds = [], since, until } = {}) {
  const startTime = since ? new Date(since).getTime() : null;
  const endTime = until ? new Date(until).getTime() : null;

  return events.filter((event) => {
    if (["summary_daily", "summary_weekly"].includes(event.event_type)) {
      return false;
    }

    const createdTime = new Date(event.created_at).getTime();

    if (Number.isNaN(createdTime)) {
      return false;
    }

    if (startTime !== null && createdTime < startTime) {
      return false;
    }

    if (endTime !== null && createdTime > endTime) {
      return false;
    }

    return eventMatchesCuratorChannelScope(event, channelIds);
  });
}

function getCuratorPromptNames(config = {}) {
  return {
    userName: String(config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user").trim() || "the user",
    personaName: String(config.chat?.promptBlocks?.personaName || "Ghostlight").trim() || "Ghostlight",
    primaryUserId: String(config.chat?.userId || "").trim(),
  };
}

function getCuratorEventAuthorLabel(event = {}, {
  userName = "",
  personaName = "",
  primaryUserId = "",
} = {}) {
  const role = String(event.role || "").trim().toLowerCase();
  const authorId = String(event.author_id || event.authorId || "").trim();

  if (role === "assistant") {
    return personaName || event.author_name || event.role || "assistant";
  }

  if (role === "user" && (!primaryUserId || authorId === primaryUserId)) {
    return userName || event.author_name || event.role || "user";
  }

  return event.author_name || event.role || "unknown";
}

function buildCuratorEventLine(event = {}, options = {}) {
  const metadata = getEventMetadata(event);
  const label = metadata.threadName || metadata.channelName || event.conversation_id || "unknown";
  const author = getCuratorEventAuthorLabel(event, options);
  const speakerRole = event.role || "unknown";
  const timestamp = new Date(event.created_at).toISOString();
  const eventType = event.event_type || "message";
  const content = String(event.content_text || "").trim();

  return [
    `Event ID: ${event.id}`,
    `Time: ${timestamp}`,
    `Conversation: ${label}`,
    `Author: ${author}`,
    `Speaker role: ${speakerRole}`,
    `Type: ${eventType}`,
    `Text: ${content || "[empty]"}`,
  ].join("\n");
}

function formatCuratorSourceEvents(events = [], options = {}) {
  return events.map((event, index) => [
    `Source Event ${index + 1}`,
    buildCuratorEventLine(event, options),
  ].join("\n")).join("\n\n---\n\n");
}

function compactMemoryForPrompt(memory = {}) {
  return {
    memoryId: memory.memoryId,
    title: memory.title,
    content: memory.content,
    memoryType: memory.memoryType,
    domain: memory.domain,
    sensitivity: memory.sensitivity,
    referenceDate: memory.referenceDate || null,
  };
}

function normalizeLane(value, fallback = "other") {
  const lane = String(value || "").trim().toLowerCase();
  const normalized = lane.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (CURATOR_CANDIDATE_LANES.includes(normalized)) {
    return normalized;
  }

  return CURATOR_CANDIDATE_LANES.includes(fallback) ? fallback : "other";
}

function inferLaneFromCandidate({ continuityType = "other", changeSignal = "new" } = {}) {
  if (changeSignal === "resolved") return "resolved_context";
  if (changeSignal === "changed") return "changed_context";
  if (changeSignal === "reinforced") return "reinforced_context";

  if (["project", "system"].includes(continuityType)) return "project_work_system";
  if (["preference"].includes(continuityType)) return "preferences";
  if (["person", "place"].includes(continuityType)) return "people_places";
  if (["routine"].includes(continuityType)) return "routines_care";
  if (["anchor_context", "relationship_context"].includes(continuityType)) return "relationship_context";
  if (["pattern", "stressor"].includes(continuityType)) return "personal_context";

  return "new_durable_context";
}

function inferLaneFromSuggestion(suggestion = {}) {
  if (suggestion.action === "resolve_existing") return "resolved_context";
  if (suggestion.action === "update_existing") return "changed_context";

  if (ATTENTION_PROJECT_DOMAINS.has(suggestion.domain)) return "project_work_system";
  if (["preferences", "leisure"].includes(suggestion.domain)) return "preferences";
  if (["people", "places"].includes(suggestion.domain)) return "people_places";
  if (["rituals", "dynamic"].includes(suggestion.domain)) return "rituals_dynamic";
  if (["routines", "health"].includes(suggestion.domain)) return "routines_care";
  if (["patterns", "stressors", "identity"].includes(suggestion.domain)) return "personal_context";

  return "new_durable_context";
}

function normalizeCandidate(raw = {}) {
  const subject = String(raw.subject || "").trim().slice(0, 120);
  const query = String(raw.query || raw.subject || "").trim().slice(0, 240);
  const memoryValue = String(raw.memoryValue || raw.memory_value || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "").trim().toLowerCase();
  const continuityType = String(raw.continuityType || raw.continuity_type || "other").trim().toLowerCase();
  const changeSignal = String(raw.changeSignal || raw.change_signal || "").trim().toLowerCase();
  const evidenceExcerpt = Array.isArray(raw.evidenceExcerpt || raw.evidence_excerpt)
    ? (raw.evidenceExcerpt || raw.evidence_excerpt)
      .map((item) => String(item || "").trim().slice(0, 700))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const sourceEventIds = Array.isArray(raw.sourceEventIds)
    ? raw.sourceEventIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  if (!subject || !query) {
    return null;
  }

  if (!isMediumOrHigh(memoryValue, CURATOR_MEMORY_VALUE_LEVELS)) {
    return null;
  }

  if (!isMediumOrHigh(confidence, CURATOR_CONFIDENCE_LEVELS)) {
    return null;
  }

  const normalizedContinuityType = CURATOR_CONTINUITY_TYPES.includes(continuityType) ? continuityType : "other";
  const normalizedChangeSignal = CURATOR_CHANGE_SIGNALS.includes(changeSignal) ? changeSignal : "new";
  const lane = normalizeLane(raw.lane || raw.path, inferLaneFromCandidate({
    continuityType: normalizedContinuityType,
    changeSignal: normalizedChangeSignal,
  }));

  return {
    subject,
    query,
    lane,
    memoryValue,
    confidence,
    continuityType: normalizedContinuityType,
    changeSignal: normalizedChangeSignal,
    reason: String(raw.reason || "").trim().slice(0, 500),
    evidence: String(raw.evidence || "").trim().slice(0, 500),
    evidenceExcerpt,
    sourceEventIds,
  };
}

function attachCandidateScanLane(candidate, laneDefinition = null) {
  if (!candidate || !laneDefinition?.key) {
    return candidate;
  }

  return {
    ...candidate,
    scanLane: laneDefinition.key,
  };
}

function candidateMatchesDiscoveryLane(candidate, laneDefinition = null) {
  if (!candidate) {
    return false;
  }

  if (laneDefinition?.key === "short_anchor_candidates") {
    const isAnchorCandidate = candidate.continuityType === "anchor_context";
    const isSharedDynamicCandidate = ["relationship_context", "other"].includes(candidate.continuityType)
      && ["relationship_context", "rituals_dynamic"].includes(candidate.lane);

    return candidate.confidence === "high"
      && isMediumOrHigh(candidate.memoryValue, CURATOR_MEMORY_VALUE_LEVELS)
      && (isAnchorCandidate || isSharedDynamicCandidate);
  }

  return true;
}

function normalizeSuggestion(raw = {}) {
  const action = String(raw.action || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "").trim().toLowerCase();
  const memoryType = String(raw.memoryType || raw.memory_type || "").trim().toLowerCase();
  const domain = String(raw.domain || "").trim().toLowerCase();
  const sensitivity = String(raw.sensitivity || "low").trim().toLowerCase();
  const title = String(raw.title || "").trim();
  const content = String(raw.content || raw.text || "").trim();
  const targetMemoryId = String(raw.targetMemoryId || raw.target_memory_id || "").trim();
  const relatedMemoryIds = Array.isArray(raw.relatedMemoryIds)
    ? raw.relatedMemoryIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const sourceEventIds = Array.isArray(raw.sourceEventIds)
    ? raw.sourceEventIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  if (!CURATOR_ACTIONS.includes(action)) {
    return null;
  }

  if (!isMediumOrHigh(confidence, CURATOR_CONFIDENCE_LEVELS)) {
    return null;
  }

  if (!CURATOR_MEMORY_TYPES.includes(memoryType)) {
    return null;
  }

  if (!isSupportedMemoryDomain(domain)) {
    return null;
  }

  if (CURATOR_BLOCKED_DOMAINS.includes(domain)) {
    return null;
  }

  if (!["low", "medium", "high"].includes(sensitivity)) {
    return null;
  }

  if (!title || !content) {
    return null;
  }

  if (["update_existing", "resolve_existing"].includes(action) && !targetMemoryId) {
    return null;
  }

  if (memoryType === "anchor" && confidence !== "high") {
    return null;
  }

  return {
    action,
    lane: normalizeLane(raw.lane || raw.path, inferLaneFromSuggestion({ action, domain })),
    confidence,
    targetMemoryId,
    title,
    content,
    memoryType: action === "resolve_existing" ? "resolved" : memoryType,
    domain,
    sensitivity,
    reason: String(raw.reason || "").trim().slice(0, 800),
    evidence: String(raw.evidence || "").trim().slice(0, 800),
    sourceEventIds,
    relatedMemoryIds,
    duplicateCandidates: Array.isArray(raw.duplicateCandidates) ? raw.duplicateCandidates : [],
  };
}

function filterCuratorSuggestionsAgainstRelatedMemories(suggestions = [], relatedMemoriesBySubject = {}) {
  const relatedMemoryIndex = buildRelatedMemoryIndex(relatedMemoriesBySubject);

  return suggestions.filter((suggestion) => {
    const targetMemory = suggestion.targetMemoryId
      ? relatedMemoryIndex.get(String(suggestion.targetMemoryId))
      : null;

    if (suggestion.action === "resolve_existing" && targetMemory?.memoryType !== "canon") {
      return false;
    }

    if (isNearIdenticalUpdateSuggestion(suggestion, targetMemory)) {
      return false;
    }

    if (suggestion.action === "create_memory" && findDuplicateRelatedMemory(suggestion, relatedMemoryIndex)) {
      return false;
    }

    return true;
  });
}

function getRejectedItemAction(item = {}) {
  const action = String(item.sourcePayload?.action || "").trim().toLowerCase();
  return CURATOR_ACTIONS.includes(action) ? action : "create_memory";
}

function getRejectedItemReviewedAt(item = {}) {
  return item.reviewedAt || item.updatedAt || item.createdAt || null;
}

function itemIsInsideRejectedRetentionWindow(item = {}, { retentionDays = 30, now = new Date() } = {}) {
  const days = Number.parseInt(String(retentionDays || "").trim(), 10);

  if (!Number.isFinite(days) || days < 1) {
    return false;
  }

  const reviewedAt = getRejectedItemReviewedAt(item);

  if (!reviewedAt) {
    return true;
  }

  const reviewedDate = new Date(reviewedAt);
  const referenceDate = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(reviewedDate.getTime()) || Number.isNaN(referenceDate.getTime())) {
    return true;
  }

  return reviewedDate.getTime() >= referenceDate.getTime() - days * 24 * 60 * 60 * 1000;
}

function getSuggestionText(value = {}) {
  return `${value.title || ""} ${value.content || ""}`.trim();
}

function compactRejectedItemForTrace(item = {}, match = {}) {
  return {
    generatedMemoryId: item.generatedMemoryId || item.stagedMemoryId || "",
    title: item.title || "",
    action: getRejectedItemAction(item),
    targetMemoryId: item.sourcePayload?.targetMemoryId || null,
    reviewedAt: getRejectedItemReviewedAt(item),
    matchKind: match.matchKind || "",
    overlapScore: match.overlapScore ?? null,
    contentOverlapScore: match.contentOverlapScore ?? null,
  };
}

function findRecentlyRejectedSuggestionMatch(suggestion = {}, rejectedItems = []) {
  const action = suggestion.action || "create_memory";
  const sameActionItems = rejectedItems.filter((item) => getRejectedItemAction(item) === action);

  if (!sameActionItems.length) {
    return null;
  }

  if (action === "create_memory") {
    const rejectedMemoryIndex = new Map(sameActionItems.map((item) => [
      String(item.generatedMemoryId || item.stagedMemoryId || ""),
      {
        memoryId: item.generatedMemoryId || item.stagedMemoryId || "",
        title: item.title || "",
        content: item.content || "",
        memoryType: item.memoryType || "",
        domain: item.domain || "",
        sensitivity: item.sensitivity || "",
      },
    ]).filter(([id]) => id));
    const duplicate = findDuplicateRelatedMemory({
      ...suggestion,
      relatedMemoryIds: [],
    }, rejectedMemoryIndex);

    if (duplicate) {
      return {
        item: sameActionItems.find((item) => (item.generatedMemoryId || item.stagedMemoryId) === duplicate.memoryId),
        matchKind: "rejected_create_duplicate",
        overlapScore: duplicate.overlapScore,
      };
    }

    return null;
  }

  const targetMemoryId = String(suggestion.targetMemoryId || "").trim();

  if (!targetMemoryId) {
    return null;
  }

  for (const item of sameActionItems) {
    const rejectedTargetMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();

    if (rejectedTargetMemoryId !== targetMemoryId) {
      continue;
    }

    const overlapScore = getTokenOverlapScore(getSuggestionText(suggestion), getSuggestionText(item));
    const contentOverlapScore = getTokenOverlapScore(suggestion.content || "", item.content || "");

    if (overlapScore >= 0.82 || contentOverlapScore >= 0.55) {
      return {
        item,
        matchKind: "rejected_same_target_duplicate",
        overlapScore,
        contentOverlapScore,
      };
    }
  }

  return null;
}

function filterCuratorSuggestionsAgainstRejectedItems(suggestions = [], rejectedItems = []) {
  const matches = [];
  const filteredSuggestions = suggestions.filter((suggestion) => {
    const match = findRecentlyRejectedSuggestionMatch(suggestion, rejectedItems);

    if (!match?.item) {
      return true;
    }

    matches.push({
      suggestion: {
        title: suggestion.title,
        action: suggestion.action,
        targetMemoryId: suggestion.targetMemoryId || null,
      },
      rejectedItem: compactRejectedItemForTrace(match.item, match),
    });
    return false;
  });

  return {
    suggestions: filteredSuggestions,
    rejectedDuplicateCount: matches.length,
    matches,
  };
}

async function loadRecentRejectedGeneratedMemories({
  generatedMemories,
  config,
  now = new Date(),
  limit = 500,
} = {}) {
  if (typeof generatedMemories?.listGeneratedMemories !== "function") {
    return [];
  }

  const retentionDays = config.memory?.reviewRejectedRetentionDays || 30;
  const items = await generatedMemories.listGeneratedMemories({
    status: "rejected",
    userScope: config.memory?.userScope,
    limit,
  });

  return items.filter((item) => itemIsInsideRejectedRetentionWindow(item, {
    retentionDays,
    now,
  }));
}

function filterAttentionCandidatesAgainstRelatedMemories(candidates = [], relatedMemoriesBySubject = {}) {
  let duplicateCount = 0;
  const filteredCandidates = candidates.filter((candidate) => {
    const relatedMemories = relatedMemoriesBySubject[candidate.subject] || [];
    const duplicate = findDuplicateCandidateMemory(candidate, relatedMemories, { strict: true });

    if (duplicate) {
      duplicateCount += 1;
      return false;
    }

    return true;
  });

  return {
    candidates: filteredCandidates,
    duplicateCount,
  };
}

function pickRelatedMemoriesForCandidates(candidates = [], relatedMemoriesBySubject = {}) {
  const picked = {};

  for (const candidate of candidates) {
    picked[candidate.subject] = relatedMemoriesBySubject[candidate.subject] || [];
  }

  return picked;
}

function getResponseOutputText(response = {}) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const parts = [];

  for (const output of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      } else if (typeof content?.output_text === "string") {
        parts.push(content.output_text);
      } else if (typeof content === "string") {
        parts.push(content);
      }
    }
  }

  return parts.join("\n");
}

function buildJsonRepairPrompt(rawText) {
  return [
    "Repair the raw model output into one strict JSON object for Ghostlight's memory curator.",
    "Return JSON only. Do not include markdown, commentary, code fences, or explanations.",
    "Use double quotes for all keys and strings. Remove trailing commas. Preserve any recoverable candidates or suggestions.",
    "If there is no recoverable candidate or suggestion data, return {\"candidates\":[],\"suggestions\":[]}.",
    "",
    "Raw model output:",
    String(rawText || "").slice(0, 12000),
  ].join("\n");
}

async function callJsonModel({ config, client, input, model = resolveSummaryModel(config) }) {
  const response = await client.responses.create({
    model,
    input,
  });
  const text = getResponseOutputText(response).trim();
  const parsed = safeJsonParse(text);

  if (!parsed || typeof parsed !== "object") {
    const repairResponse = await client.responses.create({
      model,
      input: buildJsonRepairPrompt(text),
    });
    const repaired = safeJsonParse(getResponseOutputText(repairResponse).trim());

    if (!repaired || typeof repaired !== "object") {
      throw new Error("Memory curator model returned invalid JSON after repair.");
    }

    return repaired;
  }

  return parsed;
}

async function extractCuratorCandidates({
  config,
  client,
  sourceText,
  limit = DEFAULT_CURATOR_LIMIT,
  laneDefinition = null,
}) {
  const input = buildCandidateExtractionPrompt({
    config,
    sourceText,
    limit,
    laneDefinition,
  });
  const parsed = await callJsonModel({
    config,
    client,
    input,
  });
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = rawCandidates
    .map(normalizeCandidate)
    .filter((candidate) => candidateMatchesDiscoveryLane(candidate, laneDefinition))
    .map((candidate) => attachCandidateScanLane(candidate, laneDefinition))
    .filter(Boolean)
    .slice(0, limit);

  return candidates;
}

async function extractAttentionCandidates({
  config,
  client,
  sourceText,
  limit = DEFAULT_CURATOR_LIMIT,
  laneDefinition = null,
}) {
  const input = buildAttentionCandidateExtractionPrompt({
    config,
    sourceText,
    limit,
    laneDefinition,
  });
  const parsed = await callJsonModel({
    config,
    client,
    input,
  });
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = rawCandidates
    .map(normalizeCandidate)
    .filter((candidate) => candidateMatchesDiscoveryLane(candidate, laneDefinition))
    .map((candidate) => attachCandidateScanLane(candidate, laneDefinition))
    .filter(Boolean)
    .slice(0, limit);

  return candidates;
}

function getLaneCandidateLimit(totalLimit, laneCount) {
  const parsedTotal = Number.parseInt(String(totalLimit || DEFAULT_CURATOR_CANDIDATE_LIMIT), 10)
    || DEFAULT_CURATOR_CANDIDATE_LIMIT;
  const parsedLaneCount = Math.max(1, Number.parseInt(String(laneCount || 1), 10) || 1);

  return Math.max(1, Math.ceil(parsedTotal / parsedLaneCount));
}

function buildCandidateIdentity(candidate = {}) {
  return [
    String(candidate.subject || "").trim().toLowerCase(),
    String(candidate.query || "").trim().toLowerCase(),
  ].join("|");
}

function buildCandidateSimilarityText(candidate = {}) {
  return [
    candidate.subject,
    candidate.query,
    candidate.evidence,
    ...(Array.isArray(candidate.evidenceExcerpt) ? candidate.evidenceExcerpt : []),
  ].filter(Boolean).join(" ");
}

function isSimilarCandidate(left = {}, right = {}) {
  const leftSubject = String(left.subject || "").trim();
  const rightSubject = String(right.subject || "").trim();
  const leftQuery = String(left.query || "").trim();
  const rightQuery = String(right.query || "").trim();

  return getTokenOverlapScore(leftSubject, rightSubject) >= 0.75
    || getTokenOverlapScore(leftQuery, rightQuery) >= 0.68
    || getTokenOverlapScore(buildCandidateSimilarityText(left), buildCandidateSimilarityText(right)) >= 0.72;
}

function mergeCandidateResults(candidateGroups = [], limit = DEFAULT_CURATOR_CANDIDATE_LIMIT) {
  const seen = new Set();
  const merged = [];

  for (const candidates of candidateGroups) {
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const identity = buildCandidateIdentity(candidate);

      if (!identity || seen.has(identity)) {
        continue;
      }

      const similarCandidate = merged.find((existing) => isSimilarCandidate(candidate, existing));

      if (similarCandidate) {
        continue;
      }

      seen.add(identity);
      merged.push(candidate);

      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}

async function extractCuratorCandidatesByLanes({
  config,
  client,
  sourceText,
  limit = DEFAULT_CURATOR_CANDIDATE_LIMIT,
}) {
  const laneLimit = getLaneCandidateLimit(limit, CURATOR_DISCOVERY_LANES.length);
  const candidateGroups = [];

  for (const laneDefinition of CURATOR_DISCOVERY_LANES) {
    candidateGroups.push(await extractCuratorCandidates({
      config,
      client,
      sourceText,
      limit: laneLimit,
      laneDefinition,
    }));
  }

  return mergeCandidateResults(candidateGroups, limit);
}

async function extractAttentionCandidatesByLanes({
  config,
  client,
  sourceText,
  limit = DEFAULT_CURATOR_CANDIDATE_LIMIT,
}) {
  const laneLimit = getLaneCandidateLimit(limit, ATTENTION_DISCOVERY_LANES.length);
  const candidateGroups = [];

  for (const laneDefinition of ATTENTION_DISCOVERY_LANES) {
    candidateGroups.push(await extractAttentionCandidates({
      config,
      client,
      sourceText,
      limit: laneLimit,
      laneDefinition,
    }));
  }

  return mergeCandidateResults(candidateGroups, limit);
}

async function adjudicateCuratorSuggestions({
  config,
  client,
  candidates,
  relatedMemoriesBySubject,
  limit = DEFAULT_CURATOR_LIMIT,
  model = getCuratorStageTwoModel(config),
}) {
  const input = buildAdjudicationPrompt({
    config,
    candidates,
    relatedMemoriesBySubject,
    limit,
  });
  const parsed = await callJsonModel({
    config,
    client,
    model,
    input,
  });
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = rawSuggestions
    .map(normalizeSuggestion)
    .filter(Boolean)
    .slice(0, limit);

  return suggestions;
}

function normalizeAttentionSuggestion(raw = {}) {
  const suggestion = normalizeSuggestion(raw);

  if (!suggestion) {
    return null;
  }

  if (suggestion.action !== "create_memory") {
    return null;
  }

  if (!["anchor", "canon"].includes(suggestion.memoryType)) {
    return null;
  }

  if (ATTENTION_PROJECT_DOMAINS.has(suggestion.domain)) {
    return null;
  }

  return {
    ...suggestion,
    scanKind: ATTENTION_SCAN_KIND,
    targetMemoryId: "",
  };
}

async function adjudicateAttentionSuggestions({
  config,
  client,
  candidates,
  relatedMemoriesBySubject,
  limit = DEFAULT_CURATOR_LIMIT,
  model = getCuratorStageTwoModel(config),
}) {
  const input = buildAttentionAdjudicationPrompt({
    config,
    candidates,
    relatedMemoriesBySubject,
    limit,
  });
  const parsed = await callJsonModel({
    config,
    client,
    model,
    input,
  });
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = rawSuggestions
    .map(normalizeAttentionSuggestion)
    .filter(Boolean)
    .slice(0, limit);

  return suggestions;
}

function limitAttentionSuggestionBalance(suggestions = []) {
  return applySuggestionLaneCaps(suggestions, ATTENTION_LANE_CAPS);
}

function applySuggestionLaneCaps(suggestions = [], laneCaps = {}) {
  const counts = new Map();

  return suggestions.filter((suggestion) => {
    const lane = normalizeLane(suggestion.lane, inferLaneFromSuggestion(suggestion));
    const currentCount = counts.get(lane) || 0;
    const cap = Number.isFinite(laneCaps[lane]) ? laneCaps[lane] : Infinity;

    if (currentCount >= cap) {
      return false;
    }

    counts.set(lane, currentCount + 1);
    return true;
  });
}

function buildCuratorReviewFlags(suggestion) {
  const flags = ["memory_curator"];

  if (suggestion.scanKind === ATTENTION_SCAN_KIND) {
    flags.push("attention_scan");
  }

  if (suggestion.action === "update_existing") {
    flags.push("updates_existing");
  }

  if (suggestion.action === "resolve_existing") {
    flags.push("resolves_existing");
  }

  if (suggestion.confidence === "medium") {
    flags.push("medium_confidence");
  }

  return flags;
}

function buildCuratorDedupeKey(suggestion) {
  const target = suggestion.targetMemoryId || suggestion.title.toLowerCase();
  return `${suggestion.action}:${target}`;
}

function buildCuratorGeneratedRecord({
  suggestion,
  groupingKey,
  sourceRef,
  userScope,
  referenceDate,
  sourcePayload,
}) {
  const dedupeKey = buildCuratorDedupeKey(suggestion);

  return {
    generated_memory_id: stableUuid(`${CURATOR_SOURCE_KIND}:${groupingKey}:${dedupeKey}`),
    staged_memory_id: stableUuid(`${CURATOR_SOURCE_KIND}:${groupingKey}:${dedupeKey}`),
    source_kind: CURATOR_SOURCE_KIND,
    source_ref: sourceRef,
    grouping_key: groupingKey,
    dedupeKey,
    title: suggestion.title,
    content: suggestion.content,
    memory_type: suggestion.memoryType,
    domain: suggestion.domain,
    sensitivity: suggestion.sensitivity,
    status: "proposed",
    review_flags: buildCuratorReviewFlags(suggestion),
    source_payload: {
      ...sourcePayload,
      action: suggestion.action,
      lane: suggestion.lane,
      confidence: suggestion.confidence,
      targetMemoryId: suggestion.targetMemoryId || null,
      relatedMemoryIds: suggestion.relatedMemoryIds,
      reason: suggestion.reason,
      evidence: suggestion.evidence,
      sourceEventIds: suggestion.sourceEventIds,
      duplicateCandidates: suggestion.duplicateCandidates,
    },
    user_scope: userScope,
    reference_date: referenceDate,
  };
}

async function loadCuratorSourceEvents({
  conversations,
  config,
  lookbackHours = 24,
  now = new Date(),
  limit = 500,
  normalizeLookback = normalizeLookbackHours,
}) {
  const channelIds = normalizeChannelIds(config.memory?.dailySummaryChannelIds);
  const window = getLookbackWindow({ lookbackHours, now, normalizeLookback });

  if (!channelIds.length) {
    return {
      ...window,
      channelIds,
      events: [],
      skippedReason: "no_ltm_channels",
    };
  }

  const events = await conversations.listRecentEventsByDateRange({
    startDate: window.startDate,
    endDate: window.endDate,
    includeSummaries: false,
    limit,
  });
  const filteredEvents = filterCuratorSourceEvents(events, {
    channelIds,
    since: window.start,
    until: window.end,
  });

  return {
    ...window,
    channelIds,
    events: filteredEvents,
    skippedReason: filteredEvents.length ? "" : "no_events",
  };
}

async function runMemoryCurator({
  config,
  conversations,
  generatedMemories,
  memory,
  client: providedClient = null,
  stageTwoClient: providedStageTwoClient = null,
  lookbackHours = 24,
  now = new Date(),
  limit = DEFAULT_CURATOR_LIMIT,
}) {
  const normalizedLimit = clampCuratorLimit(limit);
  const candidateLimit = getCandidateLimit(normalizedLimit);
  const adjudicationLimit = getAdjudicationLimit(normalizedLimit);
  const source = await loadCuratorSourceEvents({
    conversations,
    config,
    lookbackHours,
    now,
  });

  if (!source.events.length) {
    return {
      skipped: true,
      reason: source.skippedReason,
      stagedCount: 0,
      sourceEventCount: 0,
      stagedItems: [],
      source,
    };
  }

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to run the memory curator.");
  }

  const stageTwoCapability = getCuratorStageTwoCapability(config);

  if (!hasLlmApiKey(config, stageTwoCapability)) {
    throw new Error("An LLM API key is required to run memory curator adjudication.");
  }

  const client = providedClient || getLlmClient(config, "summary");
  const stageTwoClient = providedStageTwoClient || (
    stageTwoCapability === "summary" ? client : getLlmClient(config, stageTwoCapability)
  );
  const stageTwoModel = getCuratorStageTwoModel(config);
  const sourceText = formatCuratorSourceEvents(source.events, getCuratorPromptNames(config));
  const candidates = await extractCuratorCandidatesByLanes({
    config,
    client,
    sourceText,
    limit: candidateLimit,
  });

  if (!candidates.length) {
    return {
      skipped: false,
      stagedCount: 0,
      sourceEventCount: source.events.length,
      candidateCount: 0,
      stagedItems: [],
      source,
    };
  }

  const relatedMemoriesBySubject = {};

  for (const candidate of candidates) {
    const related = memory?.lookup
      ? await memory.lookup({
        query: candidate.query,
        userScope: config.memory.userScope,
        memoryTypes: ["anchor", "canon", "resolved", "roleplay"],
        memorySensitivity: "high",
        limit: 5,
        caller: "memory_curator",
        touch: false,
      })
      : [];

    relatedMemoriesBySubject[candidate.subject] = related.map(compactMemoryForPrompt);
  }

  const adjudicatedSuggestions = await adjudicateCuratorSuggestions({
    config,
    client: stageTwoClient,
    candidates,
    relatedMemoriesBySubject,
    limit: adjudicationLimit,
    model: stageTwoModel,
  });
  const relatedFilteredSuggestions = filterCuratorSuggestionsAgainstRelatedMemories(
    adjudicatedSuggestions,
    relatedMemoriesBySubject,
  );
  const recentRejectedItems = await loadRecentRejectedGeneratedMemories({
    generatedMemories,
    config,
    now,
  });
  const rejectedFilteredSuggestions = filterCuratorSuggestionsAgainstRejectedItems(
    relatedFilteredSuggestions,
    recentRejectedItems,
  );
  const suggestions = applySuggestionLaneCaps(rejectedFilteredSuggestions.suggestions, CURATOR_LANE_CAPS);
  const sourceRef = `memory_curator:${source.start.toISOString()}:${source.end.toISOString()}`;
  const groupingKey = `curator:${source.start.toISOString()}:${source.end.toISOString()}`;
  const sourcePayload = {
    lookbackHours: source.lookbackHours,
    startAt: source.start.toISOString(),
    endAt: source.end.toISOString(),
    sourceEventCount: source.events.length,
    sourceConversationIds: Array.from(new Set(source.events.map((event) => event.conversation_id).filter(Boolean))),
    sourceChannelIds: source.channelIds,
  };
  const referenceDate = source.endDate;
  const stagedItems = [];

  for (const suggestion of suggestions.slice(0, normalizedLimit)) {
    const record = buildCuratorGeneratedRecord({
      suggestion,
      groupingKey,
      sourceRef,
      userScope: config.memory.userScope,
      referenceDate,
      sourcePayload,
    });

    stagedItems.push(await generatedMemories.upsertGeneratedMemory(record));
  }

  return {
    skipped: false,
    stagedCount: stagedItems.length,
    sourceEventCount: source.events.length,
    candidateCount: candidates.length,
    suggestionCount: suggestions.length,
    stagedItems,
    source,
  };
}

async function runMemoryAttentionScan({
  config,
  conversations,
  generatedMemories,
  memory,
  client: providedClient = null,
  stageTwoClient: providedStageTwoClient = null,
  lookbackHours = 6,
  now = new Date(),
  limit = DEFAULT_ATTENTION_LIMIT,
}) {
  const normalizedLimit = clampAttentionLimit(limit);
  const candidateLimit = getAttentionCandidateLimit(normalizedLimit);
  const adjudicationLimit = getAttentionAdjudicationLimit(candidateLimit);
  const source = await loadCuratorSourceEvents({
    conversations,
    config,
    lookbackHours,
    now,
    normalizeLookback: normalizeAttentionLookbackHours,
  });

  if (!source.events.length) {
    return {
      skipped: true,
      reason: source.skippedReason,
      stagedCount: 0,
      sourceEventCount: 0,
      stagedItems: [],
      source,
    };
  }

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to run the recent attention scan.");
  }

  const stageTwoCapability = getCuratorStageTwoCapability(config);

  if (!hasLlmApiKey(config, stageTwoCapability)) {
    throw new Error("An LLM API key is required to run recent attention adjudication.");
  }

  const client = providedClient || getLlmClient(config, "summary");
  const stageTwoClient = providedStageTwoClient || (
    stageTwoCapability === "summary" ? client : getLlmClient(config, stageTwoCapability)
  );
  const stageTwoModel = getCuratorStageTwoModel(config);
  const sourceText = formatCuratorSourceEvents(source.events, getCuratorPromptNames(config));
  const candidates = await extractAttentionCandidatesByLanes({
    config,
    client,
    sourceText,
    limit: candidateLimit,
  });

  if (!candidates.length) {
    return {
      skipped: false,
      stagedCount: 0,
      sourceEventCount: source.events.length,
      candidateCount: 0,
      stagedItems: [],
      source,
    };
  }

  const relatedMemoriesBySubject = {};

  for (const candidate of candidates) {
    const related = memory?.lookup
      ? await memory.lookup({
        query: candidate.query,
        userScope: config.memory.userScope,
        memoryTypes: ["anchor", "canon", "resolved", "roleplay"],
        memorySensitivity: "high",
        limit: 5,
        caller: "memory_curator_attention",
        touch: false,
      })
      : [];

    relatedMemoriesBySubject[candidate.subject] = related.map(compactMemoryForPrompt);
  }

  const {
    candidates: adjudicationCandidates,
    duplicateCount: duplicatePrunedCandidateCount,
  } = filterAttentionCandidatesAgainstRelatedMemories(candidates, relatedMemoriesBySubject);
  const adjudicationRelatedMemoriesBySubject = pickRelatedMemoriesForCandidates(
    adjudicationCandidates,
    relatedMemoriesBySubject,
  );

  if (!adjudicationCandidates.length) {
    return {
      skipped: false,
      stagedCount: 0,
      sourceEventCount: source.events.length,
      candidateCount: candidates.length,
      adjudicationCandidateCount: 0,
      duplicatePrunedCandidateCount,
      stagedItems: [],
      source,
    };
  }

  const adjudicatedSuggestions = await adjudicateAttentionSuggestions({
    config,
    client: stageTwoClient,
    candidates: adjudicationCandidates,
    relatedMemoriesBySubject: adjudicationRelatedMemoriesBySubject,
    limit: adjudicationLimit,
    model: stageTwoModel,
  });
  const relatedFilteredSuggestions = filterCuratorSuggestionsAgainstRelatedMemories(
    adjudicatedSuggestions,
    adjudicationRelatedMemoriesBySubject,
  );
  const recentRejectedItems = await loadRecentRejectedGeneratedMemories({
    generatedMemories,
    config,
    now,
  });
  const rejectedFilteredSuggestions = filterCuratorSuggestionsAgainstRejectedItems(
    relatedFilteredSuggestions,
    recentRejectedItems,
  );
  const suggestions = limitAttentionSuggestionBalance(rejectedFilteredSuggestions.suggestions);
  const sourceRef = `memory_curator_attention:${source.start.toISOString()}:${source.end.toISOString()}`;
  const groupingKey = `curator:attention:${source.start.toISOString()}:${source.end.toISOString()}`;
  const sourcePayload = {
    scanKind: ATTENTION_SCAN_KIND,
    lookbackHours: source.lookbackHours,
    startAt: source.start.toISOString(),
    endAt: source.end.toISOString(),
    sourceEventCount: source.events.length,
    sourceConversationIds: Array.from(new Set(source.events.map((event) => event.conversation_id).filter(Boolean))),
    sourceChannelIds: source.channelIds,
  };
  const referenceDate = source.endDate;
  const stagedItems = [];

  for (const suggestion of suggestions.slice(0, normalizedLimit)) {
    const record = buildCuratorGeneratedRecord({
      suggestion,
      groupingKey,
      sourceRef,
      userScope: config.memory.userScope,
      referenceDate,
      sourcePayload,
    });

    stagedItems.push(await generatedMemories.upsertGeneratedMemory(record));
  }

  return {
    skipped: false,
    stagedCount: stagedItems.length,
    sourceEventCount: source.events.length,
    candidateCount: candidates.length,
    adjudicationCandidateCount: adjudicationCandidates.length,
    duplicatePrunedCandidateCount,
    suggestionCount: suggestions.length,
    stagedItems,
    source,
  };
}

module.exports = {
  ATTENTION_SCAN_KIND,
  ATTENTION_DISCOVERY_LANES,
  CURATOR_ACTIONS,
  CURATOR_CHANGE_SIGNALS,
  CURATOR_CONFIDENCE_LEVELS,
  CURATOR_CONTINUITY_TYPES,
  CURATOR_DISCOVERY_LANES,
  DEFAULT_CURATOR_CANDIDATE_LIMIT,
  DEFAULT_CURATOR_ADJUDICATION_LIMIT,
  CURATOR_MEMORY_TYPES,
  CURATOR_MEMORY_VALUE_LEVELS,
  CURATOR_SOURCE_KIND,
  DEFAULT_CURATOR_LIMIT,
  MAX_CURATOR_ADJUDICATION_LIMIT,
  MAX_CURATOR_CANDIDATE_LIMIT,
  MAX_CURATOR_LIMIT,
  normalizeAttentionLookbackHours,
  normalizeLookbackHours,
  getLookbackWindow,
  eventMatchesCuratorChannelScope,
  filterCuratorSourceEvents,
  formatCuratorSourceEvents,
  normalizeCandidate,
  normalizeSuggestion,
  applySuggestionLaneCaps,
  filterCuratorSuggestionsAgainstRejectedItems,
  filterCuratorSuggestionsAgainstRelatedMemories,
  findRecentlyRejectedSuggestionMatch,
  getTokenOverlapScore,
  isNearIdenticalUpdateSuggestion,
  limitAttentionSuggestionBalance,
  loadCuratorSourceEvents,
  buildCuratorGeneratedRecord,
  buildCuratorReviewFlags,
  runMemoryAttentionScan,
  runMemoryCurator,
};

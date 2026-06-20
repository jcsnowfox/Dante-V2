const { getLlmClient, hasLlmApiKey, resolveSummaryModel } = require("../llm/client");
const {
  buildMaintenanceReasonGuidance,
  getMaintenancePromptContext,
} = require("./curatorMaintenancePrompts");
const {
  safeJsonParse,
  stableUuid,
} = require("./curatorUtils");

const QUIET_SOURCE_KIND = "memory_curator";
const QUIET_GROUPING_KEY = "curator:quiet";
const QUIET_ACTION = "archive_existing";
const DEFAULT_QUIET_LIMIT = 5;
const MAX_QUIET_LIMIT = 5;
const DEFAULT_QUIET_CANDIDATE_LIMIT = 15;
const MAX_QUIET_CANDIDATE_LIMIT = 15;
const NEVER_USED_MIN_AGE_DAYS = 14;
const STALE_USED_MIN_AGE_DAYS = 30;
const STALE_LAST_USED_DAYS = 14;
const RESOLVED_UNUSED_MIN_DAYS = 90;
const EXCLUDED_MEMORY_TYPES = new Set(["timeline_daily", "timeline_weekly"]);
const EXCLUDED_DOMAINS = new Set(["timeline"]);

function clampLimit(value, max = MAX_QUIET_LIMIT, fallback = DEFAULT_QUIET_LIMIT) {
  const parsed = Number.parseInt(String(value || fallback), 10) || fallback;
  return Math.max(1, Math.min(parsed, max));
}

function getAgeDays(value, now = new Date()) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const reference = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((reference.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function getQuietMemoryReason(memory = {}, now = new Date()) {
  const memoryType = String(memory.memoryType || "").trim().toLowerCase();
  const domain = String(memory.domain || "").trim().toLowerCase();

  if (EXCLUDED_MEMORY_TYPES.has(memoryType) || EXCLUDED_DOMAINS.has(domain)) {
    return null;
  }

  const updatedAgeDays = getAgeDays(memory.updatedAt || memory.createdAt || memory.referenceDate, now);
  const createdAgeDays = getAgeDays(memory.createdAt || memory.referenceDate, now);
  const lastUsedAgeDays = getAgeDays(memory.lastUsedAt, now);
  const useCount = Number(memory.useCount || 0);

  if (memoryType === "resolved") {
    if (
      updatedAgeDays !== null
      && updatedAgeDays >= RESOLVED_UNUSED_MIN_DAYS
      && (
        !memory.lastUsedAt
        || (lastUsedAgeDays !== null && lastUsedAgeDays >= RESOLVED_UNUSED_MIN_DAYS)
      )
    ) {
      return {
        quietReason: "resolved_not_used_90_days",
        updatedAgeDays,
        createdAgeDays,
        lastUsedAgeDays,
        useCount,
      };
    }

    return null;
  }

  if (updatedAgeDays !== null && updatedAgeDays >= NEVER_USED_MIN_AGE_DAYS && useCount <= 0 && !memory.lastUsedAt) {
    return {
      quietReason: "never_used_old_enough",
      updatedAgeDays,
      createdAgeDays,
      lastUsedAgeDays,
      useCount,
    };
  }

  if (
    updatedAgeDays !== null
    && updatedAgeDays >= STALE_USED_MIN_AGE_DAYS
    && (
      !memory.lastUsedAt
      || (lastUsedAgeDays !== null && lastUsedAgeDays >= STALE_LAST_USED_DAYS)
    )
  ) {
    return {
      quietReason: "not_used_recently",
      updatedAgeDays,
      createdAgeDays,
      lastUsedAgeDays,
      useCount,
    };
  }

  return null;
}

function selectQuietMemoryCandidates(memories = [], {
  now = new Date(),
  limit = DEFAULT_QUIET_CANDIDATE_LIMIT,
} = {}) {
  return memories
    .map((memory) => {
      const quiet = getQuietMemoryReason(memory, now);

      return quiet ? { ...memory, quiet } : null;
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftNeverUsed = left.quiet.quietReason === "never_used_old_enough" ? 1 : 0;
      const rightNeverUsed = right.quiet.quietReason === "never_used_old_enough" ? 1 : 0;

      if (leftNeverUsed !== rightNeverUsed) {
        return rightNeverUsed - leftNeverUsed;
      }

      return (right.quiet.updatedAgeDays || 0) - (left.quiet.updatedAgeDays || 0);
    })
    .slice(0, clampLimit(limit, MAX_QUIET_CANDIDATE_LIMIT, DEFAULT_QUIET_CANDIDATE_LIMIT));
}

function compactMemoryForQuietPrompt(memory = {}) {
  return {
    memoryId: memory.memoryId,
    title: memory.title,
    content: memory.content,
    memoryType: memory.memoryType,
    domain: memory.domain,
    sensitivity: memory.sensitivity,
    referenceDate: memory.referenceDate || null,
    createdAt: memory.createdAt || null,
    updatedAt: memory.updatedAt || null,
    useCount: Number(memory.useCount || 0),
    lastUsedAt: memory.lastUsedAt || null,
    quietReason: memory.quiet?.quietReason || "",
    updatedAgeDays: memory.quiet?.updatedAgeDays ?? null,
    createdAgeDays: memory.quiet?.createdAgeDays ?? null,
    lastUsedAgeDays: memory.quiet?.lastUsedAgeDays ?? null,
    useCount30d: memory.quiet?.useCount30d ?? null,
  };
}

function buildQuietPrompt({ config, candidates = [], limit = DEFAULT_QUIET_LIMIT }) {
  const {
    personaName,
    userName,
    personaContext,
    sharedMemoryKnowledge,
  } = getMaintenancePromptContext(config);

  return [
    `You are ${personaName}, reviewing rarely surfaced long-term memories for ${userName}.`,
    `Use your persona and relationship context to make this feel like ${personaName} is maintaining continuity with ${userName}, not like a detached admin report.`,
    "Return JSON only.",
    "",
    "Persona and relationship context:",
    personaContext,
    "",
    sharedMemoryKnowledge,
    "",
    "Task:",
    "Decide whether any quiet memories should be archived after user review.",
    "Underuse is a signal, not proof. Do not suggest archiving important stable facts, identity context, relationship context, health context, access needs, active projects, or anything that may simply be rare but important.",
    "",
    "A good archive suggestion is a memory that appears stale, too narrow, temporary, redundant, over-specific, no longer useful, or unlikely to help future conversations.",
    "Prefer no suggestion over a risky archive.",
    "Do not suggest rewrites or splits in this scan. This lane only stages archive_existing suggestions.",
    "",
    "For each archive suggestion:",
    "- targetMemoryId is the quiet memory being considered",
    "- reason should explain why this may be safe to archive",
    "- evidence should mention the usage signal and the content issue",
    "- use medium confidence unless the memory is obviously low-value or stale",
    "",
    buildMaintenanceReasonGuidance({ userName, personaName, actionLabel: "archive suggestion" }),
    "",
    `Return at most ${limit} archive suggestions.`,
    "",
    "JSON shape:",
    "{\"suggestions\":[{\"action\":\"archive_existing\",\"confidence\":\"medium|high\",\"targetMemoryId\":\"uuid\",\"reason\":\"why this quiet memory may be safe to archive\",\"evidence\":\"usage signal and content issue\"}]}",
    "",
    "Quiet memory candidates:",
    JSON.stringify({
      candidates: candidates.map(compactMemoryForQuietPrompt),
    }, null, 2),
  ].join("\n");
}

async function callJsonModel({ config, client, input }) {
  const response = await client.responses.create({
    model: resolveSummaryModel(config),
    input,
  });
  const parsed = safeJsonParse(response.output_text?.trim());

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Memory quiet scan model returned invalid JSON.");
  }

  return parsed;
}

function normalizeQuietSuggestion(raw = {}, memoryById = new Map()) {
  const action = String(raw.action || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "").trim().toLowerCase();
  const targetMemoryId = String(raw.targetMemoryId || raw.target_memory_id || "").trim();
  const targetMemory = memoryById.get(targetMemoryId);

  if (action !== QUIET_ACTION || !["medium", "high"].includes(confidence) || !targetMemory) {
    return null;
  }

  return {
    action,
    confidence,
    targetMemoryId,
    title: `Archive quiet memory: ${targetMemory.title || "Untitled memory"}`,
    content: `Review whether "${targetMemory.title || targetMemoryId}" should be archived because it is rarely surfaced.`,
    memoryType: targetMemory.memoryType,
    domain: targetMemory.domain,
    sensitivity: targetMemory.sensitivity,
    reason: String(raw.reason || "").trim().slice(0, 800),
    evidence: String(raw.evidence || "").trim().slice(0, 800),
    quiet: targetMemory.quiet || null,
  };
}

function buildQuietDedupeKey(suggestion) {
  return `${QUIET_ACTION}:${suggestion.targetMemoryId}`;
}

function buildQuietGeneratedRecord({
  suggestion,
  userScope,
  referenceDate,
  sourceRef,
  sourcePayload,
}) {
  const dedupeKey = buildQuietDedupeKey(suggestion);

  return {
    generated_memory_id: stableUuid(`${QUIET_SOURCE_KIND}:${QUIET_GROUPING_KEY}:${dedupeKey}`),
    staged_memory_id: stableUuid(`${QUIET_SOURCE_KIND}:${QUIET_GROUPING_KEY}:${dedupeKey}`),
    source_kind: QUIET_SOURCE_KIND,
    source_ref: sourceRef,
    grouping_key: QUIET_GROUPING_KEY,
    dedupeKey,
    title: suggestion.title,
    content: suggestion.content,
    memory_type: suggestion.memoryType,
    domain: suggestion.domain,
    sensitivity: suggestion.sensitivity,
    status: "proposed",
    review_flags: [
      "memory_curator",
      "quiet_memory",
      "archive_existing",
      ...(suggestion.confidence === "medium" ? ["medium_confidence"] : []),
    ],
    source_payload: {
      ...sourcePayload,
      action: QUIET_ACTION,
      confidence: suggestion.confidence,
      targetMemoryId: suggestion.targetMemoryId,
      relatedMemoryIds: [],
      reason: suggestion.reason,
      evidence: suggestion.evidence,
      quietReason: suggestion.quiet?.quietReason || "",
      updatedAgeDays: suggestion.quiet?.updatedAgeDays ?? null,
      createdAgeDays: suggestion.quiet?.createdAgeDays ?? null,
      lastUsedAgeDays: suggestion.quiet?.lastUsedAgeDays ?? null,
      useCount30d: suggestion.quiet?.useCount30d ?? null,
      useCount: suggestion.quiet?.useCount ?? null,
    },
    user_scope: userScope,
    reference_date: referenceDate,
  };
}

async function adjudicateQuietCandidates({
  config,
  client,
  candidates,
  memoryById,
  limit = DEFAULT_QUIET_LIMIT,
}) {
  const parsed = await callJsonModel({
    config,
    client,
    input: buildQuietPrompt({ config, candidates, limit }),
  });

  return (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map((suggestion) => normalizeQuietSuggestion(suggestion, memoryById))
    .filter(Boolean)
    .slice(0, limit);
}

async function runMemoryQuietScan({
  config,
  memoryStore,
  generatedMemories,
  client: providedClient = null,
  now = new Date(),
  limit = DEFAULT_QUIET_LIMIT,
  candidateLimit = DEFAULT_QUIET_CANDIDATE_LIMIT,
}) {
  const normalizedLimit = clampLimit(limit);
  const normalizedCandidateLimit = clampLimit(candidateLimit, MAX_QUIET_CANDIDATE_LIMIT, DEFAULT_QUIET_CANDIDATE_LIMIT);
  const userScope = config.memory?.userScope || "default";

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to run the memory quiet scan.");
  }

  const activeMemories = await memoryStore.listMemories({
    userScope,
    activeOnly: true,
    limit: 1000,
  });
  let candidates = selectQuietMemoryCandidates(activeMemories, {
    now,
    limit: normalizedCandidateLimit,
  });

  if (!candidates.length) {
    return {
      skipped: false,
      sourceMemoryCount: activeMemories.length,
      candidateCount: 0,
      suggestionCount: 0,
      stagedCount: 0,
      stagedItems: [],
    };
  }

  if (typeof memoryStore.countMemoryUsage === "function") {
    const since30d = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();
    const usageRows = await memoryStore.countMemoryUsage({
      memoryIds: candidates.map((memory) => memory.memoryId),
      userScope,
      since: since30d,
    });
    const useCount30dById = new Map(
      (Array.isArray(usageRows) ? usageRows : [])
        .map((row) => [String(row.memoryId || "").trim(), Number(row.count || 0)]),
    );

    candidates = candidates.map((memory) => ({
      ...memory,
      quiet: {
        ...memory.quiet,
        useCount30d: useCount30dById.get(memory.memoryId) || 0,
      },
    }));
  }

  const memoryById = new Map(candidates.map((memory) => [memory.memoryId, memory]));
  const client = providedClient || getLlmClient(config, "summary");
  const suggestions = await adjudicateQuietCandidates({
    config,
    client,
    candidates,
    memoryById,
    limit: normalizedLimit,
  });
  const existingItems = typeof generatedMemories.listGeneratedMemories === "function"
    ? await generatedMemories.listGeneratedMemories({
      userScope,
      groupingKey: QUIET_GROUPING_KEY,
      limit: 500,
    })
    : [];
  const existingDedupeKeys = new Set(existingItems.map((item) => item.dedupeKey).filter(Boolean));
  const sourceRef = `memory_curator_quiet:${now.toISOString()}`;
  const referenceDate = now.toISOString().slice(0, 10);
  const sourcePayload = {
    scanKind: "quiet_memory_scan",
    sourceMemoryCount: activeMemories.length,
    candidateCount: candidates.length,
    neverUsedMinAgeDays: NEVER_USED_MIN_AGE_DAYS,
    staleUsedMinAgeDays: STALE_USED_MIN_AGE_DAYS,
    staleLastUsedDays: STALE_LAST_USED_DAYS,
    resolvedUnusedMinDays: RESOLVED_UNUSED_MIN_DAYS,
  };
  const stagedItems = [];

  for (const suggestion of suggestions) {
    const dedupeKey = buildQuietDedupeKey(suggestion);

    if (existingDedupeKeys.has(dedupeKey)) {
      continue;
    }

    const record = buildQuietGeneratedRecord({
      suggestion,
      userScope,
      referenceDate,
      sourceRef,
      sourcePayload,
    });

    stagedItems.push(await generatedMemories.upsertGeneratedMemory(record));
    existingDedupeKeys.add(dedupeKey);

    if (stagedItems.length >= normalizedLimit) {
      break;
    }
  }

  return {
    skipped: false,
    sourceMemoryCount: activeMemories.length,
    candidateCount: candidates.length,
    suggestionCount: suggestions.length,
    stagedCount: stagedItems.length,
    stagedItems,
  };
}

module.exports = {
  QUIET_ACTION,
  QUIET_GROUPING_KEY,
  buildQuietDedupeKey,
  buildQuietGeneratedRecord,
  buildQuietPrompt,
  getQuietMemoryReason,
  normalizeQuietSuggestion,
  runMemoryQuietScan,
  selectQuietMemoryCandidates,
};

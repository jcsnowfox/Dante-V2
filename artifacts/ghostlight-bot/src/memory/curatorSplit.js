const { getLlmClient, hasLlmApiKey, resolveSummaryModel } = require("../llm/client");
const { isSupportedMemoryDomain } = require("./domains");
const {
  buildMaintenanceReasonGuidance,
  getMaintenancePromptContext,
} = require("./curatorMaintenancePrompts");
const {
  safeJsonParse,
  stableUuid,
} = require("./curatorUtils");

const SPLIT_SOURCE_KIND = "memory_curator";
const SPLIT_GROUPING_KEY = "curator:split";
const SPLIT_ACTION = "split_existing";
const DEFAULT_SPLIT_LIMIT = 5;
const MAX_SPLIT_LIMIT = 5;
const DEFAULT_SPLIT_CANDIDATE_LIMIT = 10;
const MAX_SPLIT_CANDIDATE_LIMIT = 10;
const DEFAULT_LONG_MEMORY_MIN_LENGTH = 600;
const EXCLUDED_MEMORY_TYPES = new Set(["timeline_daily", "timeline_weekly"]);
const EXCLUDED_DOMAINS = new Set(["timeline"]);

function clampLimit(value, max = MAX_SPLIT_LIMIT, fallback = DEFAULT_SPLIT_LIMIT) {
  const parsed = Number.parseInt(String(value || fallback), 10) || fallback;
  return Math.max(1, Math.min(parsed, max));
}

function isEligibleSplitMemory(memory = {}, minLength = DEFAULT_LONG_MEMORY_MIN_LENGTH) {
  const memoryType = String(memory.memoryType || "").trim().toLowerCase();
  const domain = String(memory.domain || "").trim().toLowerCase();
  const content = String(memory.content || "").trim();

  return content.length >= minLength
    && !EXCLUDED_MEMORY_TYPES.has(memoryType)
    && !EXCLUDED_DOMAINS.has(domain);
}

function selectLongMemoryCandidates(memories = [], {
  limit = DEFAULT_SPLIT_CANDIDATE_LIMIT,
  minLength = DEFAULT_LONG_MEMORY_MIN_LENGTH,
} = {}) {
  return memories
    .filter((memory) => isEligibleSplitMemory(memory, minLength))
    .sort((left, right) => String(right.content || "").length - String(left.content || "").length)
    .slice(0, clampLimit(limit, MAX_SPLIT_CANDIDATE_LIMIT, DEFAULT_SPLIT_CANDIDATE_LIMIT));
}

function compactMemoryForSplitPrompt(memory = {}) {
  return {
    memoryId: memory.memoryId,
    title: memory.title,
    content: memory.content,
    contentLength: String(memory.content || "").length,
    memoryType: memory.memoryType,
    domain: memory.domain,
    sensitivity: memory.sensitivity,
    referenceDate: memory.referenceDate || null,
    useCount: Number(memory.useCount || 0),
    lastUsedAt: memory.lastUsedAt || null,
  };
}

function buildSplitPrompt({ config, candidates = [], limit = DEFAULT_SPLIT_LIMIT }) {
  const {
    personaName,
    userName,
    personaContext,
    sharedMemoryKnowledge,
  } = getMaintenancePromptContext(config);

  return [
    `You are ${personaName}, reviewing long live memories for ${userName}.`,
    `Use your persona and relationship context to make this feel like ${personaName} is maintaining continuity with ${userName}, not like a detached admin report.`,
    "Return JSON only.",
    "",
    "Persona and relationship context:",
    personaContext,
    "",
    sharedMemoryKnowledge,
    "",
    "Task:",
    "Decide whether any long memories should be split into smaller, cleaner memories for future retrieval.",
    "This V1 only stages split suggestions for review. Do not suggest a split unless the long memory is trying to do multiple distinct retrieval jobs.",
    "",
    "A good split separates distinct subjects, functions, or retrieval jobs, such as factual background, emotional meaning, relationship context, project details, preferences, boundaries, recurring patterns, or resolved outcomes.",
    "Do not split a long memory that is long but coherent, or one where the extra context is necessary for the same retrieval job.",
    "Do not lose context. Each proposed split memory must make sense alone without the original memory.",
    "Prefer no suggestion over a split that makes the user's memory library more fragmented or harder to search.",
    "",
    "For each split suggestion:",
    "- targetMemoryId is the long memory being split",
    "- proposedMemories must contain 2 to 4 replacement memories",
    "- each proposed memory should have one subject and enough standalone context",
    "- preserve important names, dates, people, projects, outcomes, and emotional or boundary context",
    "- keep proposed memory content compact, usually 2-3 sentences",
    "- use only anchor, canon, resolved, or roleplay memory types",
    "- use supported domains; do not use timeline in this scan",
    "- use the same or more protective sensitivity as the original when uncertain",
    "",
    buildMaintenanceReasonGuidance({ userName, personaName, actionLabel: "split suggestion" }),
    "",
    `Return at most ${limit} split suggestions.`,
    "",
    "JSON shape:",
    "{\"suggestions\":[{\"action\":\"split_existing\",\"confidence\":\"medium|high\",\"targetMemoryId\":\"uuid\",\"reason\":\"why this split is worth reviewing\",\"evidence\":\"brief explanation\",\"proposedMemories\":[{\"title\":\"title\",\"content\":\"content\",\"memoryType\":\"anchor|canon|resolved|roleplay\",\"domain\":\"domain\",\"sensitivity\":\"low|medium|high\"}]}]}",
    "",
    "Long memory candidates:",
    JSON.stringify({
      candidates: candidates.map(compactMemoryForSplitPrompt),
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
    throw new Error("Memory split scan model returned invalid JSON.");
  }

  return parsed;
}

function normalizeProposedMemory(raw = {}, fallback = {}) {
  const title = String(raw.title || "").trim();
  const content = String(raw.content || raw.text || "").trim();
  const memoryType = String(raw.memoryType || raw.memory_type || fallback.memoryType || "").trim().toLowerCase();
  const domain = String(raw.domain || fallback.domain || "").trim().toLowerCase();
  const sensitivity = String(raw.sensitivity || fallback.sensitivity || "").trim().toLowerCase();

  if (!title || !content || !["anchor", "canon", "resolved", "roleplay"].includes(memoryType)) {
    return null;
  }

  if (!isSupportedMemoryDomain(domain) || domain === "timeline") {
    return null;
  }

  if (!["low", "medium", "high"].includes(sensitivity)) {
    return null;
  }

  return {
    title,
    content,
    memoryType,
    domain,
    sensitivity,
  };
}

function normalizeSplitSuggestion(raw = {}, memoryById = new Map()) {
  const action = String(raw.action || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "").trim().toLowerCase();
  const targetMemoryId = String(raw.targetMemoryId || raw.target_memory_id || "").trim();
  const targetMemory = memoryById.get(targetMemoryId);

  if (action !== SPLIT_ACTION || !["medium", "high"].includes(confidence) || !targetMemory) {
    return null;
  }

  const proposedMemories = Array.isArray(raw.proposedMemories || raw.proposed_memories)
    ? (raw.proposedMemories || raw.proposed_memories)
      .map((item) => normalizeProposedMemory(item, targetMemory))
      .filter(Boolean)
      .slice(0, 4)
    : [];

  if (proposedMemories.length < 2) {
    return null;
  }

  return {
    action,
    confidence,
    targetMemoryId,
    title: `Split: ${targetMemory.title || "Long memory"}`,
    content: `Review proposed split memories for "${targetMemory.title || targetMemoryId}".`,
    memoryType: targetMemory.memoryType,
    domain: targetMemory.domain,
    sensitivity: targetMemory.sensitivity,
    reason: String(raw.reason || "").trim().slice(0, 800),
    evidence: String(raw.evidence || "").trim().slice(0, 800),
    proposedMemories,
  };
}

function buildSplitDedupeKey(suggestion) {
  return `${SPLIT_ACTION}:${suggestion.targetMemoryId}`;
}

function buildSplitGeneratedRecord({
  suggestion,
  userScope,
  referenceDate,
  sourceRef,
  sourcePayload,
}) {
  const dedupeKey = buildSplitDedupeKey(suggestion);

  return {
    generated_memory_id: stableUuid(`${SPLIT_SOURCE_KIND}:${SPLIT_GROUPING_KEY}:${dedupeKey}`),
    staged_memory_id: stableUuid(`${SPLIT_SOURCE_KIND}:${SPLIT_GROUPING_KEY}:${dedupeKey}`),
    source_kind: SPLIT_SOURCE_KIND,
    source_ref: sourceRef,
    grouping_key: SPLIT_GROUPING_KEY,
    dedupeKey,
    title: suggestion.title,
    content: suggestion.content,
    memory_type: suggestion.memoryType,
    domain: suggestion.domain,
    sensitivity: suggestion.sensitivity,
    status: "proposed",
    review_flags: [
      "memory_curator",
      "split_existing",
      ...(suggestion.confidence === "medium" ? ["medium_confidence"] : []),
    ],
    source_payload: {
      ...sourcePayload,
      action: SPLIT_ACTION,
      confidence: suggestion.confidence,
      targetMemoryId: suggestion.targetMemoryId,
      relatedMemoryIds: [],
      reason: suggestion.reason,
      evidence: suggestion.evidence,
      proposedMemories: suggestion.proposedMemories,
    },
    user_scope: userScope,
    reference_date: referenceDate,
  };
}

async function adjudicateSplitCandidates({
  config,
  client,
  candidates,
  memoryById,
  limit = DEFAULT_SPLIT_LIMIT,
}) {
  const parsed = await callJsonModel({
    config,
    client,
    input: buildSplitPrompt({ config, candidates, limit }),
  });

  return (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map((suggestion) => normalizeSplitSuggestion(suggestion, memoryById))
    .filter(Boolean)
    .slice(0, limit);
}

async function runMemorySplitScan({
  config,
  memoryStore,
  generatedMemories,
  client: providedClient = null,
  now = new Date(),
  limit = DEFAULT_SPLIT_LIMIT,
  candidateLimit = DEFAULT_SPLIT_CANDIDATE_LIMIT,
  minLength = DEFAULT_LONG_MEMORY_MIN_LENGTH,
}) {
  const normalizedLimit = clampLimit(limit);
  const normalizedCandidateLimit = clampLimit(candidateLimit, MAX_SPLIT_CANDIDATE_LIMIT, DEFAULT_SPLIT_CANDIDATE_LIMIT);
  const userScope = config.memory?.userScope || "default";

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to run the memory split scan.");
  }

  const activeMemories = await memoryStore.listMemories({
    userScope,
    activeOnly: true,
    limit: 1000,
  });
  const candidates = selectLongMemoryCandidates(activeMemories, {
    limit: normalizedCandidateLimit,
    minLength,
  });

  if (!candidates.length) {
    return {
      skipped: false,
      sourceMemoryCount: activeMemories.length,
      candidateCount: 0,
      stagedCount: 0,
      stagedItems: [],
    };
  }

  const memoryById = new Map(candidates.map((memory) => [memory.memoryId, memory]));
  const client = providedClient || getLlmClient(config, "summary");
  const suggestions = await adjudicateSplitCandidates({
    config,
    client,
    candidates,
    memoryById,
    limit: normalizedLimit,
  });
  const existingItems = typeof generatedMemories.listGeneratedMemories === "function"
    ? await generatedMemories.listGeneratedMemories({
      userScope,
      groupingKey: SPLIT_GROUPING_KEY,
      limit: 500,
    })
    : [];
  const existingDedupeKeys = new Set(existingItems.map((item) => item.dedupeKey).filter(Boolean));
  const sourceRef = `memory_curator_split:${now.toISOString()}`;
  const referenceDate = now.toISOString().slice(0, 10);
  const sourcePayload = {
    scanKind: "long_memory_split_scan",
    sourceMemoryCount: activeMemories.length,
    candidateCount: candidates.length,
    minLength,
  };
  const stagedItems = [];

  for (const suggestion of suggestions) {
    const dedupeKey = buildSplitDedupeKey(suggestion);

    if (existingDedupeKeys.has(dedupeKey)) {
      continue;
    }

    const record = buildSplitGeneratedRecord({
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
  DEFAULT_LONG_MEMORY_MIN_LENGTH,
  SPLIT_ACTION,
  SPLIT_GROUPING_KEY,
  buildSplitDedupeKey,
  buildSplitGeneratedRecord,
  buildSplitPrompt,
  normalizeSplitSuggestion,
  runMemorySplitScan,
  selectLongMemoryCandidates,
};

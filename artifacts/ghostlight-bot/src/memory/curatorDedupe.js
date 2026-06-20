const { getLlmClient, hasLlmApiKey, resolveSummaryModel } = require("../llm/client");
const { isSupportedMemoryDomain } = require("./domains");
const {
  cosineSimilarity,
  getNearDuplicateTokenOverlap,
  getSharedDuplicateTokenCount,
  getTokenOverlapScore,
  isFiniteNumber,
} = require("./dedupeHelpers");
const { getPoints } = require("./qdrantClient");
const {
  buildMaintenanceReasonGuidance,
  getMaintenancePromptContext,
} = require("./curatorMaintenancePrompts");
const {
  safeJsonParse,
  stableUuid,
} = require("./curatorUtils");

const DEDUPE_SOURCE_KIND = "memory_curator";
const DEDUPE_GROUPING_KEY = "curator:dedupe";
const DEDUPE_ACTION = "merge_existing";
const DEFAULT_DEDUPE_LIMIT = 5;
const MAX_DEDUPE_LIMIT = 5;
const DEFAULT_PAIR_LIMIT = 24;
const MAX_PAIR_LIMIT = 24;
const MIN_DUPLICATE_SIMILARITY = 0.86;
const MIN_LEXICAL_DUPLICATE_SCORE = 0.54;
const EXCLUDED_MEMORY_TYPES = new Set(["timeline_daily", "timeline_weekly"]);
const EXCLUDED_DOMAINS = new Set(["timeline"]);

function clampLimit(value, max = MAX_DEDUPE_LIMIT) {
  const parsed = Number.parseInt(String(value || DEFAULT_DEDUPE_LIMIT), 10) || DEFAULT_DEDUPE_LIMIT;
  return Math.max(1, Math.min(parsed, max));
}

function isEligibleDedupeMemory(memory = {}) {
  const memoryType = String(memory.memoryType || "").trim().toLowerCase();
  const domain = String(memory.domain || "").trim().toLowerCase();

  return !EXCLUDED_MEMORY_TYPES.has(memoryType) && !EXCLUDED_DOMAINS.has(domain);
}

function compactMemoryForDedupePrompt(memory = {}) {
  return {
    memoryId: memory.memoryId,
    title: memory.title,
    content: memory.content,
    memoryType: memory.memoryType,
    domain: memory.domain,
    sensitivity: memory.sensitivity,
    referenceDate: memory.referenceDate || null,
    useCount: Number(memory.useCount || 0),
    lastUsedAt: memory.lastUsedAt || null,
  };
}

function buildVectorIndex(points = []) {
  const index = new Map();

  for (const point of points) {
    const memoryId = String(point?.payload?.memory_id || point?.id || "").trim();
    const vector = Array.isArray(point?.vector) ? point.vector.map(Number) : [];

    if (memoryId && vector.length >= 2 && vector.every(isFiniteNumber)) {
      index.set(memoryId, vector);
    }
  }

  return index;
}

function getMemoryPairText(memory = {}) {
  return `${memory.title || ""} ${memory.content || ""}`.trim();
}

function scorePotentialDuplicatePair(left = {}, right = {}) {
  const leftText = getMemoryPairText(left);
  const rightText = getMemoryPairText(right);
  const titleOverlapScore = getTokenOverlapScore(left.title || "", right.title || "");
  const contentOverlapScore = getTokenOverlapScore(left.content || "", right.content || "");
  const fullTextOverlapScore = getTokenOverlapScore(leftText, rightText);
  const sharedContentTokenCount = getSharedDuplicateTokenCount(left.content || "", right.content || "");
  const sharedFullTokenCount = getSharedDuplicateTokenCount(leftText, rightText);
  const leftTitleInRight = getNearDuplicateTokenOverlap(left.title || "", rightText);
  const rightTitleInLeft = getNearDuplicateTokenOverlap(right.title || "", leftText);
  const nearTitleTokenCount = Math.max(leftTitleInRight.count, rightTitleInLeft.count);
  const nearTitleOverlapScore = Math.max(leftTitleInRight.score, rightTitleInLeft.score);
  let lexicalScore = 0;
  let matchKind = "";

  if (fullTextOverlapScore >= 0.62 && sharedFullTokenCount >= 8) {
    lexicalScore = fullTextOverlapScore;
    matchKind = "full_text_overlap";
  } else if (contentOverlapScore >= 0.48 && sharedContentTokenCount >= 8) {
    lexicalScore = Math.max(contentOverlapScore, 0.58);
    matchKind = "content_overlap";
  } else if (titleOverlapScore >= 0.72 && sharedFullTokenCount >= 5) {
    lexicalScore = Math.max(titleOverlapScore, 0.56);
    matchKind = "title_overlap";
  } else if (nearTitleTokenCount >= 2 && sharedFullTokenCount >= 5) {
    lexicalScore = Math.max(nearTitleOverlapScore, 0.56);
    matchKind = "named_subject_overlap";
  }

  return {
    lexicalScore,
    matchKind,
    titleOverlapScore,
    contentOverlapScore,
    fullTextOverlapScore,
    sharedContentTokenCount,
    sharedFullTokenCount,
    nearTitleTokenCount,
    nearTitleOverlapScore,
  };
}

function findPotentialDuplicatePairs(memories = [], vectorIndex = new Map(), { limit = DEFAULT_PAIR_LIMIT } = {}) {
  const pairs = [];

  for (let leftIndex = 0; leftIndex < memories.length; leftIndex += 1) {
    const left = memories[leftIndex];
    const leftVector = vectorIndex.get(left.memoryId);

    for (let rightIndex = leftIndex + 1; rightIndex < memories.length; rightIndex += 1) {
      const right = memories[rightIndex];
      const rightVector = vectorIndex.get(right.memoryId);
      const vectorScore = leftVector && rightVector
        ? cosineSimilarity(leftVector, rightVector)
        : null;
      const lexical = scorePotentialDuplicatePair(left, right);
      const score = Math.max(vectorScore || 0, lexical.lexicalScore);

      if ((vectorScore !== null && vectorScore >= MIN_DUPLICATE_SIMILARITY) || lexical.lexicalScore >= MIN_LEXICAL_DUPLICATE_SCORE) {
        pairs.push({
          left,
          right,
          score,
          vectorScore,
          lexicalScore: lexical.lexicalScore,
          matchKind: vectorScore >= MIN_DUPLICATE_SIMILARITY ? "vector_similarity" : lexical.matchKind,
        });
      }
    }
  }

  return pairs
    .sort((left, right) => right.score - left.score)
    .slice(0, clampLimit(limit, MAX_PAIR_LIMIT));
}

function buildDedupePrompt({ config, pairs = [], limit = DEFAULT_DEDUPE_LIMIT }) {
  const {
    personaName,
    userName,
    personaContext,
    sharedMemoryKnowledge,
  } = getMaintenancePromptContext(config);

  return [
    `You are ${personaName}, reviewing live long-term memories for possible duplicates for ${userName}.`,
    `Use your persona and relationship context to make this feel like ${personaName} is maintaining continuity with ${userName}, not like a detached admin report.`,
    "Return JSON only.",
    "",
    "Persona and relationship context:",
    personaContext,
    "",
    sharedMemoryKnowledge,
    "",
    "Task:",
    "Decide whether any candidate memory pairs are true duplicates that should be merged by the user after review.",
    "Do not suggest edits for memories that are merely related.",
    "",
    "A true duplicate means the memories substantially perform the same retrieval job and would be clearer as one memory.",
    "Do not merge memories just because they share a topic. Keep them separate if they preserve different facts, different emotional meaning, different time periods, different people, or different retrieval jobs.",
    "Do not merge broad context with a useful atomic sub-memory unless the smaller memory is genuinely redundant.",
    "Prefer no suggestion over a risky merge.",
    "",
    "For each merge suggestion:",
    "- choose one primaryMemoryId to preserve, usually the clearer, older, more complete, or more-used memory",
    "- put the other memory IDs in duplicateMemoryIds",
    "- write a proposed merged title/content that preserves all useful non-duplicated context",
    "- keep the memory atomic, factual, compact, and useful if retrieved alone",
    "- use the safest/highest sensitivity among merged memories",
    "- keep memoryType/domain aligned with the primary memory unless the pair clearly supports a better shared value",
    "",
    buildMaintenanceReasonGuidance({ userName, personaName, actionLabel: "merge suggestion" }),
    "",
    `Return at most ${limit} merge suggestions.`,
    "",
    "JSON shape:",
    "{\"suggestions\":[{\"action\":\"merge_existing\",\"confidence\":\"medium|high\",\"primaryMemoryId\":\"uuid\",\"duplicateMemoryIds\":[\"uuid\"],\"title\":\"merged title\",\"content\":\"merged content\",\"memoryType\":\"anchor|canon|resolved\",\"domain\":\"domain\",\"sensitivity\":\"low|medium|high\",\"reason\":\"why this merge is worth reviewing\",\"evidence\":\"brief comparison\"}]}",
    "",
    "Candidate pairs:",
    JSON.stringify({
      pairs: pairs.map((pair) => ({
        score: Number(pair.score.toFixed(4)),
        vectorScore: typeof pair.vectorScore === "number" ? Number(pair.vectorScore.toFixed(4)) : null,
        lexicalScore: typeof pair.lexicalScore === "number" ? Number(pair.lexicalScore.toFixed(4)) : null,
        matchKind: pair.matchKind || "",
        memories: [
          compactMemoryForDedupePrompt(pair.left),
          compactMemoryForDedupePrompt(pair.right),
        ],
      })),
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
    throw new Error("Memory duplicate scan model returned invalid JSON.");
  }

  return parsed;
}

function normalizeMergeSuggestion(raw = {}, memoryById = new Map()) {
  const action = String(raw.action || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "").trim().toLowerCase();
  const primaryMemoryId = String(raw.primaryMemoryId || raw.primary_memory_id || "").trim();
  const duplicateMemoryIds = Array.isArray(raw.duplicateMemoryIds || raw.duplicate_memory_ids)
    ? (raw.duplicateMemoryIds || raw.duplicate_memory_ids).map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const title = String(raw.title || "").trim();
  const content = String(raw.content || "").trim();
  const memoryType = String(raw.memoryType || raw.memory_type || "").trim().toLowerCase();
  const domain = String(raw.domain || "").trim().toLowerCase();
  const sensitivity = String(raw.sensitivity || "").trim().toLowerCase();

  if (action !== DEDUPE_ACTION || !["medium", "high"].includes(confidence)) {
    return null;
  }

  if (!primaryMemoryId || !memoryById.has(primaryMemoryId) || !duplicateMemoryIds.length) {
    return null;
  }

  if (!duplicateMemoryIds.every((id) => memoryById.has(id)) || duplicateMemoryIds.includes(primaryMemoryId)) {
    return null;
  }

  if (!title || !content || !["anchor", "canon", "resolved"].includes(memoryType)) {
    return null;
  }

  if (!["low", "medium", "high"].includes(sensitivity)) {
    return null;
  }

  if (!isSupportedMemoryDomain(domain)) {
    return null;
  }

  return {
    action,
    confidence,
    primaryMemoryId,
    duplicateMemoryIds,
    targetMemoryId: primaryMemoryId,
    relatedMemoryIds: duplicateMemoryIds,
    title,
    content,
    memoryType,
    domain: domain || memoryById.get(primaryMemoryId)?.domain || "general",
    sensitivity,
    reason: String(raw.reason || "").trim().slice(0, 800),
    evidence: String(raw.evidence || "").trim().slice(0, 800),
  };
}

function buildDedupeKey(suggestion) {
  const ids = [suggestion.primaryMemoryId, ...suggestion.duplicateMemoryIds].sort();
  return `${DEDUPE_ACTION}:${ids.join(":")}`;
}

function buildDedupeGeneratedRecord({
  suggestion,
  userScope,
  referenceDate,
  sourceRef,
  sourcePayload,
}) {
  const dedupeKey = buildDedupeKey(suggestion);

  return {
    generated_memory_id: stableUuid(`${DEDUPE_SOURCE_KIND}:${DEDUPE_GROUPING_KEY}:${dedupeKey}`),
    staged_memory_id: stableUuid(`${DEDUPE_SOURCE_KIND}:${DEDUPE_GROUPING_KEY}:${dedupeKey}`),
    source_kind: DEDUPE_SOURCE_KIND,
    source_ref: sourceRef,
    grouping_key: DEDUPE_GROUPING_KEY,
    dedupeKey,
    title: suggestion.title,
    content: suggestion.content,
    memory_type: suggestion.memoryType,
    domain: suggestion.domain,
    sensitivity: suggestion.sensitivity,
    status: "proposed",
    review_flags: [
      "memory_curator",
      "merge_existing",
      ...(suggestion.confidence === "medium" ? ["medium_confidence"] : []),
    ],
    source_payload: {
      ...sourcePayload,
      action: DEDUPE_ACTION,
      confidence: suggestion.confidence,
      targetMemoryId: suggestion.primaryMemoryId,
      relatedMemoryIds: suggestion.duplicateMemoryIds,
      reason: suggestion.reason,
      evidence: suggestion.evidence,
      duplicateCandidates: [suggestion.primaryMemoryId, ...suggestion.duplicateMemoryIds],
    },
    user_scope: userScope,
    reference_date: referenceDate,
  };
}

async function adjudicateDuplicatePairs({
  config,
  client,
  pairs,
  memoryById,
  limit = DEFAULT_DEDUPE_LIMIT,
}) {
  const parsed = await callJsonModel({
    config,
    client,
    input: buildDedupePrompt({ config, pairs, limit }),
  });

  return (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map((suggestion) => normalizeMergeSuggestion(suggestion, memoryById))
    .filter(Boolean)
    .slice(0, limit);
}

async function runMemoryDuplicateScan({
  config,
  memoryStore,
  generatedMemories,
  client: providedClient = null,
  getPointsFn = getPoints,
  now = new Date(),
  limit = DEFAULT_DEDUPE_LIMIT,
  pairLimit = DEFAULT_PAIR_LIMIT,
}) {
  const normalizedLimit = clampLimit(limit);
  const normalizedPairLimit = clampLimit(pairLimit, MAX_PAIR_LIMIT);
  const userScope = config.memory?.userScope || "default";

  if (!config.qdrant?.url) {
    throw new Error("Memory duplicate scan requires Qdrant memory vectors.");
  }

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to run the memory duplicate scan.");
  }

  const activeMemories = await memoryStore.listMemories({
    userScope,
    activeOnly: true,
    limit: 1000,
  });
  const eligibleMemories = activeMemories.filter(isEligibleDedupeMemory);

  if (eligibleMemories.length < 2) {
    return {
      skipped: true,
      reason: "not_enough_memories",
      sourceMemoryCount: eligibleMemories.length,
      candidatePairCount: 0,
      stagedCount: 0,
      stagedItems: [],
    };
  }

  const points = await getPointsFn({
    config,
    ids: eligibleMemories.map((memory) => memory.memoryId),
    withVector: true,
  });
  const vectorIndex = buildVectorIndex(points);
  const candidatePairs = findPotentialDuplicatePairs(eligibleMemories, vectorIndex, {
    limit: normalizedPairLimit,
  });

  if (!candidatePairs.length) {
    return {
      skipped: false,
      sourceMemoryCount: eligibleMemories.length,
      candidatePairCount: 0,
      stagedCount: 0,
      stagedItems: [],
    };
  }

  const memoryById = new Map(eligibleMemories.map((memory) => [memory.memoryId, memory]));
  const client = providedClient || getLlmClient(config, "summary");
  const suggestions = await adjudicateDuplicatePairs({
    config,
    client,
    pairs: candidatePairs,
    memoryById,
    limit: normalizedLimit,
  });
  const existingItems = typeof generatedMemories.listGeneratedMemories === "function"
    ? await generatedMemories.listGeneratedMemories({
      userScope,
      groupingKey: DEDUPE_GROUPING_KEY,
      limit: 500,
    })
    : [];
  const existingDedupeKeys = new Set(existingItems.map((item) => item.dedupeKey).filter(Boolean));
  const sourceRef = `memory_curator_dedupe:${now.toISOString()}`;
  const referenceDate = now.toISOString().slice(0, 10);
  const sourcePayload = {
    scanKind: "duplicate_scan",
    sourceMemoryCount: eligibleMemories.length,
    candidatePairCount: candidatePairs.length,
    minSimilarity: MIN_DUPLICATE_SIMILARITY,
    minLexicalScore: MIN_LEXICAL_DUPLICATE_SCORE,
  };
  const stagedItems = [];

  for (const suggestion of suggestions) {
    const dedupeKey = buildDedupeKey(suggestion);

    if (existingDedupeKeys.has(dedupeKey)) {
      continue;
    }

    const record = buildDedupeGeneratedRecord({
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
    sourceMemoryCount: eligibleMemories.length,
    candidatePairCount: candidatePairs.length,
    suggestionCount: suggestions.length,
    stagedCount: stagedItems.length,
    stagedItems,
  };
}

module.exports = {
  DEDUPE_ACTION,
  DEDUPE_GROUPING_KEY,
  MIN_DUPLICATE_SIMILARITY,
  MIN_LEXICAL_DUPLICATE_SCORE,
  buildDedupeGeneratedRecord,
  buildDedupeKey,
  buildDedupePrompt,
  cosineSimilarity,
  findPotentialDuplicatePairs,
  normalizeMergeSuggestion,
  runMemoryDuplicateScan,
};

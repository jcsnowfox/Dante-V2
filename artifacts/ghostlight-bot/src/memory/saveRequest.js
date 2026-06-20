const {
  getLlmClient,
  hasLlmApiKey,
  resolveSummaryModel,
} = require("../llm/client");
const { SUPPORTED_MEMORY_TYPES } = require("../storage");
const { isSupportedMemoryDomain } = require("./domains");
const { buildCuratorPersonaContext, getCuratorAllowedDomains } = require("./curatorPrompts");
const {
  buildDomainGuidance,
  buildSensitivityGuidance,
  buildSharedMemorySystemKnowledge,
} = require("./curatorPromptBlocks");
const { safeJsonParse, stableUuid } = require("./curatorUtils");
const { canSyncMemories, syncMemoryToQdrant } = require("./syncMemories");

const MEMORY_SAVE_SOURCE_KIND = "memory_save_request";
const MEMORY_SAVE_ACTIONS = Object.freeze([
  "create_memory",
  "too_weak_no_action",
  "music_tool_no_action",
]);
const REQUEST_MEMORY_TYPES = Object.freeze(["anchor", "canon", "resolved"]);
const REQUEST_SENSITIVITY_LEVELS = Object.freeze(["low", "medium", "high"]);
const REQUEST_CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);

function compactText(value = "", maxLength = 1200) {
  const text = String(value || "").trim().replace(/\s+/g, " ");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatRecentHistoryForMemorySave(
  recentHistory = [],
  {
    limit = 8,
    userName = "",
    personaName = "",
  } = {},
) {
  return (Array.isArray(recentHistory) ? recentHistory : [])
    .slice(-limit)
    .map((item, index) => {
      const metadata = item?.metadata || {};
      const role = item?.role || (item?.isBot ? "assistant" : "user");
      const speaker = role === "assistant"
        ? (personaName || item?.authorName || item?.author?.username || "assistant")
        : role === "user"
          ? (userName || item?.authorName || item?.author?.username || "user")
          : (item?.authorName || item?.author?.username || role || "unknown");
      const createdAt = item?.createdAt || item?.created_at || item?.timestamp || "";
      const content = compactText(item?.content || item?.text || "", 900);
      const generatedImageNote = Number(metadata.generatedImageCount || 0) > 0
        ? `\nGenerated image note: assistant turn included ${Number(metadata.generatedImageCount)} generated image${Number(metadata.generatedImageCount) === 1 ? "" : "s"}.`
        : "";

      return [
        `Recent turn ${index + 1}:`,
        createdAt ? `Time: ${createdAt}` : "",
        `Speaker: ${speaker}`,
        `Speaker role: ${role}`,
        `Text: ${content || "[empty]"}`,
        generatedImageNote,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");
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

function normalizeRelatedMemoryIds(raw = [], relatedMemories = []) {
  const knownIds = new Set(relatedMemories.map((memory) => String(memory.memoryId || "").trim()).filter(Boolean));

  return (Array.isArray(raw) ? raw : [])
    .map((id) => String(id || "").trim())
    .filter((id) => id && (!knownIds.size || knownIds.has(id)));
}

function normalizeRequestedMemoryDraft(raw = {}, relatedMemories = []) {
  const action = String(raw.action || "").trim().toLowerCase();
  const confidence = String(raw.confidence || "medium").trim().toLowerCase();
  const memoryType = String(raw.memoryType || raw.memory_type || "canon").trim().toLowerCase();
  const domain = String(raw.domain || "general").trim().toLowerCase();
  const sensitivity = String(raw.sensitivity || "low").trim().toLowerCase();
  const title = String(raw.title || "").trim();
  const content = String(raw.content || raw.text || "").trim();

  if (!MEMORY_SAVE_ACTIONS.includes(action)) {
    return null;
  }

  if (!REQUEST_CONFIDENCE_LEVELS.includes(confidence)) {
    return null;
  }

  if (action !== "create_memory") {
    return {
      action,
      confidence,
      reason: String(raw.reason || "").trim().slice(0, 800),
      evidence: String(raw.evidence || "").trim().slice(0, 800),
      relatedMemoryIds: normalizeRelatedMemoryIds(raw.relatedMemoryIds, relatedMemories),
    };
  }

  if (!REQUEST_MEMORY_TYPES.includes(memoryType) || !SUPPORTED_MEMORY_TYPES.includes(memoryType)) {
    return null;
  }

  if (memoryType === "anchor" && confidence !== "high") {
    return null;
  }

  if (!isSupportedMemoryDomain(domain) || ["timeline", "lore"].includes(domain)) {
    return null;
  }

  if (!REQUEST_SENSITIVITY_LEVELS.includes(sensitivity)) {
    return null;
  }

  if (!title || !content) {
    return null;
  }

  return {
    action,
    confidence,
    title: title.slice(0, 180),
    content: content.slice(0, 1600),
    memoryType,
    domain,
    sensitivity,
    reason: String(raw.reason || "").trim().slice(0, 800),
    evidence: String(raw.evidence || "").trim().slice(0, 800),
    relatedMemoryIds: normalizeRelatedMemoryIds(raw.relatedMemoryIds, relatedMemories),
  };
}

function buildMemorySaveRequestPrompt({
  config,
  subject,
  requestContext,
  recentContextText,
  currentUserText,
  currentUserName,
  relatedMemories = [],
}) {
  const personaName = String(config.chat?.promptBlocks?.personaName || "Ghostlight").trim() || "Ghostlight";
  const userName = String(config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user").trim() || "the user";
  const personaContext = buildCuratorPersonaContext(config);
  const allowedDomains = getCuratorAllowedDomains();

  return [
    `You are ${personaName}, handling an explicit memory-save request from ${userName}.`,
    `${userName} has asked you to remember something from the current conversation. Draft one durable memory when the request is clear and grounded.`,
    "Return JSON only.",
    "",
    "Persona context:",
    personaContext,
    "",
    buildSharedMemorySystemKnowledge({ userName, personaName }),
    "",
    buildDomainGuidance({ userName }),
    "",
    buildSensitivityGuidance({ userName }),
    "",
    "Memory Save Request Rules:",
    "- This is an explicit user request, so the save threshold is lower than passive curation, but the memory must still be durable and useful for future retrieval.",
    "- Create at most one memory.",
    "- Related live memories are context, not a veto. If the requested memory overlaps an existing memory, still create the memory, but make it specific, useful, and clearly differentiated where possible.",
    "- If the request adds a narrower subject under a broader existing memory, create the narrower memory instead of refusing it.",
    "- Use too_weak_no_action only if the request is genuinely unclear, unsupported by the provided conversation context, or impossible to turn into a coherent memory.",
    "- Use music_tool_no_action if the request is specifically a note about an individual song, track, or album that belongs in the music preference/note tool instead of durable general memory.",
    "- General artist, genre, playlist, music-taste, or listening-context preferences may be saved here when they are not about one specific track note.",
    "- Do not create timeline_daily, timeline_weekly, lore, or roleplay memories.",
    "- Allowed memory types: anchor, canon, resolved.",
    `- Use canon for ${userName}'s durable context. Use anchor only for rare high-confidence context about you or your persona clearly supported by ${userName}. Use resolved only for past closed context that should remain background.`,
    "- Domains must be one of: " + allowedDomains.join(", ") + ".",
    "- Memory content should usually be 2-3 compact sentences and must make sense if retrieved alone later.",
    "- Put the most retrieval-relevant information near the front.",
    "- Preserve names, places, projects, dates, relationships, and outcomes when they matter.",
    "- Do not invent facts beyond the request and recent context.",
    `- Refer to ${userName} as "${userName}" in proposed memory titles and content; do not use Discord display names unless that is the configured user name.`,
    `- If the conversation transcript uses nicknames, handles, pet names, or Discord display names for ${userName}, treat them as speaker labels only. Do not write those labels into the saved memory unless ${userName} explicitly asked for that name to be remembered.`,
    `- The reason field is user-facing: write a brief note to ${userName} using "you" and "your", in ${personaName}'s natural tone.`,
    "- The evidence field should stay brief and factual.",
    "",
    "JSON shape:",
    "{\"action\":\"create_memory|too_weak_no_action|music_tool_no_action\",\"confidence\":\"low|medium|high\",\"title\":\"proposed title\",\"content\":\"proposed content\",\"memoryType\":\"anchor|canon|resolved\",\"domain\":\"supported domain\",\"sensitivity\":\"low|medium|high\",\"reason\":\"brief user-facing reason\",\"evidence\":\"brief factual evidence\",\"relatedMemoryIds\":[\"uuid\"]}",
    "",
    "User request:",
    JSON.stringify({
      subject,
      requestContext,
      currentUserText,
      currentUserName: userName,
    }, null, 2),
    "",
    "Recent conversation context:",
    recentContextText || "No recent context provided.",
    "",
    "Related live memories:",
    JSON.stringify(relatedMemories.map(compactMemoryForPrompt), null, 2),
  ].join("\n");
}

async function callMemorySaveModel({ config, input, client = null }) {
  const llmClient = client || getLlmClient(config, "summary");
  const response = await llmClient.responses.create({
    model: resolveSummaryModel(config),
    input,
  });
  const parsed = safeJsonParse(response.output_text?.trim());

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Memory save request model returned invalid JSON.");
  }

  return parsed;
}

async function lookupRelatedMemories({
  memory,
  query,
  userScope,
}) {
  if (!memory?.lookup || !query) {
    return [];
  }

  if (typeof memory.canLookup === "function" && !memory.canLookup()) {
    return [];
  }

  if (typeof memory.canLookup === "boolean" && !memory.canLookup) {
    return [];
  }

  return memory.lookup({
    query,
    userScope,
    memoryTypes: ["anchor", "canon", "resolved", "roleplay"],
    memorySensitivity: "high",
    limit: 3,
    excludeMemoryIds: [],
    caller: "remember_this_tool",
    touch: false,
  });
}

function buildRequestedMemoryReviewRecord({
  draft,
  liveMemory,
  userScope,
  sourceMessageId = "",
  conversationId = "",
  channelId = "",
  subject,
  requestContext,
  currentUserText,
  relatedMemories,
}) {
  const createdAt = new Date().toISOString();
  const groupingKey = sourceMessageId
    ? `memory_save_request:${sourceMessageId}`
    : `memory_save_request:${createdAt}`;
  const dedupeKey = `create_memory:${liveMemory.memoryId}`;
  const id = stableUuid(`${MEMORY_SAVE_SOURCE_KIND}:${groupingKey}:${dedupeKey}`);

  return {
    generated_memory_id: id,
    staged_memory_id: id,
    source_kind: MEMORY_SAVE_SOURCE_KIND,
    source_ref: groupingKey,
    grouping_key: groupingKey,
    dedupeKey,
    title: draft.title,
    content: draft.content,
    memory_type: draft.memoryType,
    domain: draft.domain,
    sensitivity: draft.sensitivity,
    status: "proposed",
    review_flags: ["recently_generated", "memory_save_request"],
    source_payload: {
      action: "create_memory",
      scanKind: "memory_save_request",
      userRequested: true,
      confidence: draft.confidence,
      reason: draft.reason,
      evidence: draft.evidence,
      requestSubject: subject,
      requestContext,
      currentUserText,
      sourceMessageId: sourceMessageId || null,
      conversationId: conversationId || null,
      channelId: channelId || null,
      relatedMemoryIds: draft.relatedMemoryIds,
      relatedMemoryTitles: relatedMemories
        .filter((memory) => draft.relatedMemoryIds.includes(memory.memoryId))
        .map((memory) => memory.title),
    },
    promoted_memory_id: liveMemory.memoryId,
    user_scope: userScope,
    reference_date: new Date().toISOString().slice(0, 10),
  };
}

async function saveRequestedMemory({
  config,
  logger = null,
  memory = null,
  memoryStore = null,
  generatedMemories = null,
  subject = "",
  requestContext = "",
  recentHistory = [],
  currentUserText = "",
  currentUserName = "",
  sourceMessageId = "",
  conversationId = "",
  channelId = "",
  client = null,
} = {}) {
  const normalizedSubject = compactText(subject, 500);
  const normalizedContext = compactText(requestContext, 1200);
  const normalizedCurrentUserText = compactText(currentUserText, 1200);
  const userScope = String(config.memory?.userScope || "").trim() || "default";

  if (!normalizedSubject && !normalizedContext && !normalizedCurrentUserText) {
    return {
      ok: false,
      saved: false,
      skipped: true,
      reason: "empty_request",
      message: "A clear memory-save request is required.",
    };
  }

  if (!memoryStore?.upsertMemory || !generatedMemories?.upsertGeneratedMemory) {
    return {
      ok: false,
      saved: false,
      skipped: true,
      reason: "memory_backend_unavailable",
      message: "Memory saving is unavailable because the memory database is not configured.",
    };
  }

  if (!hasLlmApiKey(config, "summary")) {
    return {
      ok: false,
      saved: false,
      skipped: true,
      reason: "summary_model_unavailable",
      message: "Memory saving is unavailable because the summary model is not configured.",
    };
  }

  const lookupQuery = compactText([
    normalizedSubject,
    normalizedContext,
    normalizedCurrentUserText,
  ].filter(Boolean).join(" "), 240);
  const relatedMemories = await lookupRelatedMemories({
    memory,
    query: lookupQuery,
    userScope,
  });
  const recentContextText = formatRecentHistoryForMemorySave(recentHistory, {
    userName: String(config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user").trim() || "the user",
    personaName: String(config.chat?.promptBlocks?.personaName || "Ghostlight").trim() || "Ghostlight",
  });
  const rawDraft = await callMemorySaveModel({
    config,
    client,
    input: buildMemorySaveRequestPrompt({
      config,
      subject: normalizedSubject,
      requestContext: normalizedContext,
      recentContextText,
      currentUserText: normalizedCurrentUserText,
      currentUserName,
      relatedMemories,
    }),
  });
  const draft = normalizeRequestedMemoryDraft(rawDraft, relatedMemories);

  if (!draft) {
    return {
      ok: false,
      saved: false,
      skipped: true,
      reason: "invalid_model_output",
      message: "Memory saving skipped because the draft was not valid.",
      relatedMemoryCount: relatedMemories.length,
    };
  }

  if (draft.action !== "create_memory") {
    return {
      ok: true,
      saved: false,
      skipped: true,
      reason: draft.action,
      message: draft.reason || "Memory saving skipped.",
      relatedMemoryIds: draft.relatedMemoryIds,
      relatedMemoryCount: relatedMemories.length,
    };
  }

  const liveMemory = await memoryStore.upsertMemory({
    title: draft.title,
    content: draft.content,
    memory_type: draft.memoryType,
    domain: draft.domain,
    sensitivity: draft.sensitivity,
    source: MEMORY_SAVE_SOURCE_KIND,
    reference_date: new Date().toISOString().slice(0, 10),
  }, {
    userScope,
  });
  let syncWarning = "";

  if (canSyncMemories(config)) {
    try {
      await syncMemoryToQdrant({ config, memory: liveMemory });
    } catch (error) {
      syncWarning = error?.message || String(error);
      logger?.warn?.("[memory] Requested memory saved but Qdrant sync failed", {
        memoryId: liveMemory.memoryId,
        error: syncWarning,
      });
    }
  }

  const reviewRecord = buildRequestedMemoryReviewRecord({
    draft,
    liveMemory,
    userScope,
    sourceMessageId,
    conversationId,
    channelId,
    subject: normalizedSubject,
    requestContext: normalizedContext,
    currentUserText: normalizedCurrentUserText,
    relatedMemories,
  });
  const reviewItem = await generatedMemories.upsertGeneratedMemory(reviewRecord);

  return {
    ok: true,
    saved: true,
    skipped: false,
    memoryId: liveMemory.memoryId,
    generatedMemoryId: reviewItem.generatedMemoryId,
    title: liveMemory.title,
    memoryType: liveMemory.memoryType,
    domain: liveMemory.domain,
    sensitivity: liveMemory.sensitivity,
    reason: draft.reason,
    relatedMemoryIds: draft.relatedMemoryIds,
    relatedMemoryCount: relatedMemories.length,
    syncWarning,
  };
}

module.exports = {
  MEMORY_SAVE_SOURCE_KIND,
  buildMemorySaveRequestPrompt,
  formatRecentHistoryForMemorySave,
  normalizeRequestedMemoryDraft,
  saveRequestedMemory,
};

const { saveRequestedMemory } = require("../memory/saveRequest");
const { normalizeIanaTimezone } = require("../config/timezones");
const { safeJsonParse } = require("./toolUtils");

const DEFAULT_CONVERSATION_RETRIEVAL_HOURS = 48;
const DEFAULT_CONVERSATION_ARCHIVE_RETRIEVAL_HOURS = 720;
const MAX_CONVERSATION_RETRIEVAL_HOURS = 720;
const DEFAULT_CONVERSATION_RETRIEVAL_LIMIT = 6;
const DEFAULT_CONVERSATION_RETRIEVAL_FALLBACK_LIMIT = 4;
const MAX_CONVERSATION_RETRIEVAL_LIMIT = 12;
const DEFAULT_MEMORY_LOOKUP_LIMIT = 3;
const MAX_MEMORY_LOOKUP_LIMIT = 3;
const MEMORY_LOOKUP_QUERY_LIMIT = 240;
const MEMORY_SAVE_SUBJECT_LIMIT = 500;
const MEMORY_SAVE_CONTEXT_LIMIT = 1200;
const CONVERSATION_RETRIEVAL_CONTENT_LIMIT = 320;
const MONTH_NAME_ALIASES = Object.freeze([
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
]);
const RETRIEVAL_QUERY_STOPWORDS = new Set([
  "can",
  "channel",
  "check",
  "conversation",
  "context",
  "could",
  "recent",
  "recently",
  "said",
  "say",
  "tell",
  "that",
  "the",
  "what",
  "where",
  "which",
  "you",
]);

function normalizeRetrievalAccess(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["off", "shared_safe_only", "personal_only", "global"].includes(normalized) ? normalized : "off";
}

function normalizeRetrievalSource(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["off", "shared_safe", "personal"].includes(normalized) ? normalized : "off";
}

function canAccessRetrievalSource(access, source) {
  const normalizedAccess = normalizeRetrievalAccess(access);
  const normalizedSource = normalizeRetrievalSource(source);

  if (normalizedAccess === "off" || normalizedSource === "off") {
    return false;
  }

  if (normalizedAccess === "global") {
    return true;
  }

  if (normalizedAccess === "shared_safe_only") {
    return normalizedSource === "shared_safe";
  }

  if (normalizedAccess === "personal_only") {
    return normalizedSource === "personal";
  }

  return false;
}

function normalizeRetrievalQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

function normalizeMemoryLookupQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MEMORY_LOOKUP_QUERY_LIMIT);
}

function normalizeMemoryLookupLimit(value) {
  return Math.max(
    1,
    Math.min(
      Number.parseInt(String(value || DEFAULT_MEMORY_LOOKUP_LIMIT), 10) || DEFAULT_MEMORY_LOOKUP_LIMIT,
      MAX_MEMORY_LOOKUP_LIMIT,
    ),
  );
}

function normalizeMemorySaveText(value, limit) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function hasExplicitMemorySaveIntent(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return false;
  }

  const patterns = [
    /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:remember|save|note|keep)\b/,
    /\b(?:please\s+)?(?:remember|save|note|keep)\s+(?:this|that|it|down|in memory|as a memory)\b/,
    /\b(?:please\s+)?(?:remember|save|note|keep)\s+that\b/,
    /\b(?:please\s+)?(?:do\s+not|don['’]?t)\s+forget\s+(?:this|that|it)\b/,
    /\b(?:please\s+)?(?:do\s+not|don['’]?t)\s+forget\s+that\b/,
    /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:not\s+forget|make\s+a\s+note\s+of)\b/,
    /\b(?:make|create|save|add)\s+(?:a\s+)?memory\s+(?:about|for|that|of|saying|where)\b/,
    /\b(?:add|save|log|write)\s+(?:this|that|it|.+?)\s+(?:as|to|in|into)\s+(?:a\s+)?(?:memory|memories|memory bank|long[- ]term memory)\b/,
    /\b(?:add|put|store)\s+(?:this|that|it|.+?)\s+(?:to|in|as)\s+(?:your\s+)?(?:memory|memories|memory bank|long[- ]term memory)\b/,
    /\b(?:keep|bear)\s+in\s+mind\s+that\b/,
    /\b(?:this|that)\s+should\s+be\s+(?:a\s+)?memory\b/,
    /\bi(?:'d| would)?\s+like\s+you\s+to\s+(?:remember|save|note|keep)\b/,
    /\bi\s+(?:want|need)\s+you\s+to\s+(?:remember|save|note|keep)\b/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function hasExplicitCurrentMemorySaveRequest(context = {}) {
  return hasExplicitMemorySaveIntent(context.currentUserText || "");
}

function normalizeMemoryIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeRetrievalMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "recent" || normalized === "archive") {
    return normalized;
  }

  return "search";
}

function normalizeRetrievalSpeaker(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["user", "assistant"].includes(normalized) ? normalized : "any";
}

function normalizeRetrievalSourceFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["shared_safe", "personal"].includes(normalized) ? normalized : "";
}

function inferRetrievalSourceFilter({ args = {}, context = {}, query = "" } = {}) {
  const explicit = normalizeRetrievalSourceFilter(args.source || args.sourceFilter || args.retrievalSource);

  if (explicit) {
    return explicit;
  }

  const text = [
    query,
    context.currentUserText,
  ].map((item) => String(item || "").toLowerCase()).join("\n");

  if (/\b(?:shared\s+server|other\s+server|external\s+server)\b/.test(text)) {
    return "shared_safe";
  }

  if (/\b(?:personal|daily\s+thread|daily\s+threads|private)\b/.test(text)) {
    return "personal";
  }

  return "";
}

function normalizeRetrievalTerm(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

  if (normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenizeRetrievalQuery(query) {
  return Array.from(new Set(
    String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(normalizeRetrievalTerm)
      .filter((term) => term.length >= 3 && !RETRIEVAL_QUERY_STOPWORDS.has(term)),
  ));
}

function buildRetrievalContentSearchText(event = {}) {
  return String(event.content_text || "").toLowerCase();
}

function getRetrievalMatchStrength({ matchedTermCount = 0, queryTermCount = 0, exactPhraseMatched = false } = {}) {
  if (exactPhraseMatched) {
    return "exact_phrase";
  }

  if (queryTermCount > 0 && matchedTermCount === queryTermCount) {
    return "all_terms";
  }

  if (matchedTermCount > 0) {
    return "partial_terms";
  }

  return "none";
}

function analyzeRetrievalEventMatch(event = {}, queryTerms = [], query = "") {
  if (!queryTerms.length) {
    return {
      score: 1,
      matchStrength: "none",
    };
  }

  const searchText = buildRetrievalContentSearchText(event);
  const exactPhrase = normalizeRetrievalQuery(query).toLowerCase();
  let score = 0;
  let matchedTermCount = 0;
  const exactPhraseMatched = Boolean(exactPhrase && searchText.includes(exactPhrase));

  if (exactPhraseMatched) {
    score += 100;
  }

  for (const term of queryTerms) {
    if (!term) {
      continue;
    }

    if (searchText.includes(term)) {
      matchedTermCount += 1;
      score += 5;
    }
  }

  if (matchedTermCount === queryTerms.length) {
    score += 20;
  }

  return {
    score,
    matchStrength: getRetrievalMatchStrength({
      matchedTermCount,
      queryTermCount: queryTerms.length,
      exactPhraseMatched,
    }),
  };
}

function getRetrievalResultMatch({ queryTerms = [], fallbackUsed = false, selectedSnippets = [] } = {}) {
  if (!queryTerms.length) {
    return "no_query";
  }

  if (fallbackUsed) {
    return "fallback_context";
  }

  return selectedSnippets.length ? "direct_match" : "no_results";
}

function compareRetrievalMatchStrength(left = "none", right = "none") {
  const rank = {
    none: 0,
    partial_terms: 1,
    all_terms: 2,
    exact_phrase: 3,
  };

  return (rank[left] || 0) - (rank[right] || 0);
}

function getRetrievalSnippetGroupKey(item = {}) {
  const snippet = item.snippet || {};
  return snippet.conversationId || snippet.threadId || snippet.channelId || "unknown";
}

function compareRetrievalItemsByRankThenNewest(left = {}, right = {}) {
  if (right.queryScore !== left.queryScore) {
    return right.queryScore - left.queryScore;
  }

  return new Date(right.snippet?.timestamp || 0).getTime() - new Date(left.snippet?.timestamp || 0).getTime();
}

function compareRetrievalItemsByOldest(left = {}, right = {}) {
  return new Date(left.snippet?.timestamp || 0).getTime() - new Date(right.snippet?.timestamp || 0).getTime();
}

function pickEvenlySpacedRetrievalItems(items = [], limit = 0) {
  const ordered = [...items].sort(compareRetrievalItemsByOldest);

  if (limit <= 0 || !ordered.length) {
    return [];
  }

  if (ordered.length <= limit) {
    return ordered;
  }

  if (limit === 1) {
    return [ordered[ordered.length - 1]];
  }

  const selected = [];
  const selectedIndexes = new Set();

  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (ordered.length - 1)) / (limit - 1));

    if (!selectedIndexes.has(sourceIndex)) {
      selectedIndexes.add(sourceIndex);
      selected.push(ordered[sourceIndex]);
    }
  }

  for (let index = 0; selected.length < limit && index < ordered.length; index += 1) {
    if (!selectedIndexes.has(index)) {
      selectedIndexes.add(index);
      selected.push(ordered[index]);
    }
  }

  return selected.sort(compareRetrievalItemsByOldest);
}

function shouldDiversifyRetrievalSelection({ selectedPool = [], selectedLimit = 0, queryTerms = [], fallbackUsed = false } = {}) {
  if (!selectedLimit || selectedPool.length <= selectedLimit || (!fallbackUsed && queryTerms.length > 0)) {
    return false;
  }

  const groupCounts = new Map();

  for (const item of selectedPool) {
    const key = getRetrievalSnippetGroupKey(item);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }

  return [...groupCounts.values()].some((count) => count > selectedLimit);
}

function selectRetrievalItems(selectedPool = [], selectedLimit = 0, options = {}) {
  if (!shouldDiversifyRetrievalSelection({ selectedPool, selectedLimit, ...options })) {
    return [...selectedPool]
      .sort(compareRetrievalItemsByRankThenNewest)
      .slice(0, selectedLimit);
  }

  const groupedItems = new Map();

  for (const item of selectedPool) {
    const key = getRetrievalSnippetGroupKey(item);
    groupedItems.set(key, [...(groupedItems.get(key) || []), item]);
  }

  const groupSelections = [...groupedItems.entries()]
    .map(([key, items]) => ({
      key,
      latestTimestamp: Math.max(...items.map((item) => new Date(item.snippet?.timestamp || 0).getTime())),
      items: pickEvenlySpacedRetrievalItems(items, Math.min(items.length, selectedLimit)),
      cursor: 0,
    }))
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp);

  const selected = [];

  while (selected.length < selectedLimit) {
    let added = false;

    for (const group of groupSelections) {
      if (selected.length >= selectedLimit) {
        break;
      }

      if (group.cursor < group.items.length) {
        selected.push(group.items[group.cursor]);
        group.cursor += 1;
        added = true;
      }
    }

    if (!added) {
      break;
    }
  }

  return selected;
}

function normalizeRetrievalLimit(value) {
  return Math.max(
    1,
    Math.min(
      Number.parseInt(String(value || DEFAULT_CONVERSATION_RETRIEVAL_LIMIT), 10) || DEFAULT_CONVERSATION_RETRIEVAL_LIMIT,
      MAX_CONVERSATION_RETRIEVAL_LIMIT,
    ),
  );
}

function normalizeRetrievalHours(value, mode = "search") {
  const defaultHours = mode === "archive"
    ? DEFAULT_CONVERSATION_ARCHIVE_RETRIEVAL_HOURS
    : DEFAULT_CONVERSATION_RETRIEVAL_HOURS;

  return Math.max(
    1,
    Math.min(
      Number.parseInt(String(value || defaultHours), 10) || defaultHours,
      MAX_CONVERSATION_RETRIEVAL_HOURS,
    ),
  );
}

function normalizeDateKey(value) {
  const normalized = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return "";
  }

  return normalized;
}

function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countDateRangeDays(dateStart, dateEnd) {
  const start = new Date(`${dateStart}T00:00:00.000Z`);
  const end = new Date(`${dateEnd}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDateQueryPhrases(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const monthAliases = MONTH_NAME_ALIASES[month - 1] || [];
  const dayText = String(day);
  const paddedDay = dayText.padStart(2, "0");
  const ordinalDay = `${dayText}${day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th"}`;
  const numericMonth = String(month);
  const paddedMonth = numericMonth.padStart(2, "0");
  const phrases = new Set([
    dateKey,
    `${dayText}/${numericMonth}/${year}`,
    `${paddedDay}/${paddedMonth}/${year}`,
    `${dayText}-${numericMonth}-${year}`,
    `${paddedDay}-${paddedMonth}-${year}`,
  ]);

  for (const monthName of monthAliases) {
    phrases.add(`${dayText} ${monthName}`);
    phrases.add(`${paddedDay} ${monthName}`);
    phrases.add(`${ordinalDay} ${monthName}`);
    phrases.add(`${monthName} ${dayText}`);
    phrases.add(`${monthName} ${paddedDay}`);
    phrases.add(`${monthName} ${ordinalDay}`);
    phrases.add(`${dayText} ${monthName} ${year}`);
    phrases.add(`${ordinalDay} ${monthName} ${year}`);
    phrases.add(`${monthName} ${dayText} ${year}`);
    phrases.add(`${monthName} ${ordinalDay} ${year}`);
  }

  return [...phrases].sort((left, right) => right.length - left.length);
}

function stripMatchingDateTermsFromQuery(query, dateRange = null) {
  let normalized = String(query || "").trim();

  if (!normalized || !dateRange?.dateStart || !dateRange?.dateEnd) {
    return normalized;
  }

  const dayCount = Math.min(countDateRangeDays(dateRange.dateStart, dateRange.dateEnd), 31);

  for (let index = 0; index < dayCount; index += 1) {
    const dateKey = addDaysToDateKey(dateRange.dateStart, index);

    for (const phrase of buildDateQueryPhrases(dateKey)) {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}(?=$|[^a-z0-9])`, "gi");
      normalized = normalized.replace(pattern, "$1");
    }
  }

  return normalized
    .replace(/\b(?:on|at|in|from|about|around|the|date|day)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return asUtc - date.getTime();
}

function zonedDateKeyStartToUtc(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utc = new Date(localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone));

  // Re-check once in case the first estimate crossed a DST boundary.
  utc = new Date(localAsUtc - getTimeZoneOffsetMs(utc, timeZone));
  return utc;
}

function buildRetrievalDateRange({ args = {}, context = {}, config = {} } = {}) {
  const dateStart = normalizeDateKey(args.dateStart || args.startDate);

  if (!dateStart) {
    return null;
  }

  const explicitDateEnd = normalizeDateKey(args.dateEnd || args.endDate);
  const dateEnd = explicitDateEnd && explicitDateEnd > dateStart
    ? explicitDateEnd
    : addDaysToDateKey(dateStart, 1);
  const timeZone = normalizeIanaTimezone(
    args.timezone || args.timeZone || context.timezone || config.chat?.timezone || "UTC",
  );

  return {
    dateStart,
    dateEnd,
    timezone: timeZone,
    since: zonedDateKeyStartToUtc(dateStart, timeZone),
    until: zonedDateKeyStartToUtc(dateEnd, timeZone),
  };
}

function getVisibleContextMessageIds(context = {}) {
  return Array.from(new Set([
    context.sourceMessageId,
    ...(Array.isArray(context.recentHistory) ? context.recentHistory.map((item) => item?.id) : []),
  ].map((item) => String(item || "").trim()).filter(Boolean)));
}

function compactSnippetText(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= CONVERSATION_RETRIEVAL_CONTENT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, CONVERSATION_RETRIEVAL_CONTENT_LIMIT - 1).trimEnd()}…`;
}

function getConversationLabelFromEvent(event = {}) {
  const metadata = event.metadata || {};
  return metadata.threadName || metadata.channelName || event.conversation_id || "unknown";
}

function getRetrievalEventModeLookup(event = {}) {
  const metadata = event.metadata || {};
  const threadId = String(event.thread_id || "").trim();
  const channelId = String(event.channel_id || "").trim();
  const metadataParentChannelId = String(metadata.parentChannelId || "").trim();
  const sourceChannelId = threadId || channelId;
  const parentChannelId = metadataParentChannelId || (threadId && channelId && channelId !== threadId ? channelId : "");

  return {
    sourceChannelId,
    parentChannelId,
  };
}

async function resolveRetrievalSourceMode({
  event = {},
  channelModes,
  context = {},
  modeCache,
}) {
  const metadata = event.metadata || {};
  const storedModeKey = String(metadata.mode || metadata.modeKey || "").trim();

  if (storedModeKey && typeof channelModes.resolveModeByKey === "function") {
    const storedModeCacheKey = `mode:${storedModeKey}`;

    if (!modeCache.has(storedModeCacheKey)) {
      modeCache.set(storedModeCacheKey, await channelModes.resolveModeByKey(storedModeKey));
    }

    const storedMode = modeCache.get(storedModeCacheKey);

    if (storedMode) {
      return {
        mode: storedMode,
        resolvedBy: "stored_event_mode",
      };
    }
  }

  const lookup = getRetrievalEventModeLookup(event);
  const modeCacheKey = `${event.guild_id || ""}:${lookup.sourceChannelId || ""}:${lookup.parentChannelId || ""}`;

  if (!modeCache.has(modeCacheKey)) {
    modeCache.set(modeCacheKey, await channelModes.resolveModeForChannel({
      guildId: event.guild_id || context.guildId || "",
      channelId: lookup.sourceChannelId,
      parentChannelId: lookup.parentChannelId,
    }));
  }

  return {
    mode: modeCache.get(modeCacheKey),
    resolvedBy: "channel_mode",
  };
}

function getRetrievalScopeRelation(event = {}, context = {}) {
  const currentConversationId = String(context.conversationId || "").trim();
  return currentConversationId && event.conversation_id === currentConversationId
    ? "same_conversation"
    : "other_conversation";
}

function buildRetrievalDisplayLabel({ scopeRelation, label, channelName, threadName }) {
  if (scopeRelation === "same_conversation") {
    return "this conversation";
  }

  const normalizedThreadName = String(threadName || "").trim();
  const normalizedChannelName = String(channelName || "").trim();
  const normalizedLabel = String(label || "").trim();

  if (normalizedThreadName) {
    return normalizedChannelName
      ? `Discord thread: ${normalizedThreadName} in #${normalizedChannelName}`
      : `Discord thread: ${normalizedThreadName}`;
  }

  if (normalizedChannelName) {
    return `Discord channel: ${normalizedChannelName}`;
  }

  return normalizedLabel
    ? `Discord conversation: ${normalizedLabel}`
    : "Discord conversation";
}

function mapRetrievalEventToSnippet(event = {}, sourceMode = null, context = {}, matchStrength = "none") {
  const metadata = event.metadata || {};
  const lookup = getRetrievalEventModeLookup(event);
  const channelName = metadata.threadName
    ? (metadata.parentChannelName || metadata.channelName || "")
    : (metadata.channelName || "");
  const label = getConversationLabelFromEvent(event);
  const threadName = metadata.threadName || "";
  const scopeRelation = getRetrievalScopeRelation(event, context);

  return {
    conversationId: event.conversation_id,
    channelId: event.channel_id,
    threadId: event.thread_id || null,
    parentChannelId: lookup.parentChannelId || null,
    label,
    channelName,
    threadName,
    sourceMode: sourceMode?.name || sourceMode?.modeKey || "",
    retrievalSource: sourceMode?.retrievalSource || "off",
    scopeRelation,
    displayLabel: buildRetrievalDisplayLabel({
      scopeRelation,
      label,
      channelName,
      threadName,
    }),
    timestamp: new Date(event.created_at).toISOString(),
    authorName: event.author_name || event.role || "unknown",
    role: event.role,
    matchStrength,
    content: compactSnippetText(event.content_text),
  };
}

function groupRetrievalSnippets(snippets = []) {
  const groupsByConversation = new Map();

  for (const snippet of snippets) {
    const key = snippet.conversationId || snippet.threadId || snippet.channelId || "unknown";
    const existing = groupsByConversation.get(key) || {
      conversationId: snippet.conversationId,
      label: snippet.label,
      channelId: snippet.channelId,
      threadId: snippet.threadId,
      parentChannelId: snippet.parentChannelId,
      channelName: snippet.channelName,
      threadName: snippet.threadName,
      sourceMode: snippet.sourceMode,
      retrievalSource: snippet.retrievalSource,
      scopeRelation: snippet.scopeRelation,
      displayLabel: snippet.displayLabel,
      matchStrength: snippet.matchStrength || "none",
      latestTimestamp: snippet.timestamp,
      snippets: [],
    };

    existing.snippets.push({
      timestamp: snippet.timestamp,
      authorName: snippet.authorName,
      role: snippet.role,
      scopeRelation: snippet.scopeRelation,
      displayLabel: snippet.displayLabel,
      matchStrength: snippet.matchStrength || "none",
      content: snippet.content,
    });

    if (compareRetrievalMatchStrength(snippet.matchStrength, existing.matchStrength) > 0) {
      existing.matchStrength = snippet.matchStrength;
    }

    if (new Date(snippet.timestamp).getTime() > new Date(existing.latestTimestamp).getTime()) {
      existing.latestTimestamp = snippet.timestamp;
    }

    groupsByConversation.set(key, existing);
  }

  return [...groupsByConversation.values()]
    .sort((left, right) => new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime());
}

function isConversationRetrievalEnabled(config = {}) {
  return Boolean(config.conversationRetrieval?.enabled);
}

function isMemoryLookupEnabled(config = {}) {
  return Boolean(config.memoryLookup?.enabled);
}

function isMemorySaveEnabled(config = {}) {
  return true;
}

function isConfiguredMemoryUserTurn(config = {}, context = {}) {
  const configuredUserId = String(config.chat?.userId || "").trim();

  if (!configuredUserId) {
    return true;
  }

  const currentUserId = String(
    context.currentUserId
      || context.currentMessage?.author?.id
      || "",
  ).trim();

  return Boolean(currentUserId && currentUserId === configuredUserId);
}

function canUseMemoryLookup(memory = null) {
  if (!memory?.lookup) {
    return false;
  }

  if (typeof memory.canLookup === "function") {
    return Boolean(memory.canLookup());
  }

  return Boolean(memory.canLookup);
}

function createMemoryLookupTool({ config = {}, memory = null, logger = null }) {
  if (!memory?.lookup) {
    return null;
  }

  return {
    name: "search_memories",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return isMemoryLookupEnabled(config) && ["chat", "scheduled", "heartbeat"].includes(surface) && canUseMemoryLookup(memory);
    },
    definition: {
      type: "function",
      name: "search_memories",
      description: [
        "Search long-term memory when context is missing or the user refers to past people, projects, preferences, decisions, or details.",
        "Use a short plain-language query for the thing you want to find.",
        "Search one topic at a time; do not combine alternatives with OR.",
        "Treat returned memories as helpful context, not certain proof.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short, specific query for one memory topic.",
          },
          limit: {
            type: "integer",
            description: "Maximum memories to return. Defaults to 3 and is capped at 3.",
            minimum: 1,
            maximum: MAX_MEMORY_LOOKUP_LIMIT,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const query = normalizeMemoryLookupQuery(args.query);
      const limit = normalizeMemoryLookupLimit(args.limit);
      const excludeMemoryIds = normalizeMemoryIdList(context.memoryContextIds || context.initialMemoryIds);

      if (!isMemoryLookupEnabled(config)) {
        return {
          ok: false,
          error: "Memory lookup is off for this Ghostlight instance.",
          memories: [],
        };
      }

      if (!canUseMemoryLookup(memory)) {
        return {
          ok: false,
          error: "Memory lookup is unavailable because the memory backend is not configured.",
          memories: [],
        };
      }

      if (!query) {
        return {
          ok: false,
          error: "A focused memory search query is required.",
          query,
          limit,
          returnedMemoryCount: 0,
          excludedAlreadyInContextCount: excludeMemoryIds.length,
          memories: [],
        };
      }

      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const mode = context.mode || {};
      const memories = await memory.lookup({
        query,
        userScope,
        memoryTypes: mode.memoryTypes,
        memorySensitivity: mode.memorySensitivity,
        limit,
        excludeMemoryIds,
        caller: "search_memories_tool",
        touch: false,
      });

      logger?.debug?.("[tools] search_memories completed", {
        query,
        limit,
        returnedMemoryCount: memories.length,
        excludedAlreadyInContextCount: excludeMemoryIds.length,
        mode: mode.name || mode.modeKey || "unknown",
        memoryTypes: mode.memoryTypes || [],
        memorySensitivity: mode.memorySensitivity || "",
      });

      return {
        ok: true,
        query,
        limit,
        returnedMemoryCount: memories.length,
        excludedAlreadyInContextCount: excludeMemoryIds.length,
        memories: memories.map((item) => ({
          memoryId: item.memoryId,
          title: item.title,
          content: item.content,
          memoryType: item.memoryType,
          domain: item.domain,
          sensitivity: item.sensitivity,
          referenceDate: item.referenceDate,
          score: item.score,
          weightedScore: item.weightedScore,
        })),
      };
    },
  };
}

function createMemorySaveTool({
  config = {},
  memory = null,
  memoryStore = null,
  generatedMemories = null,
  logger = null,
  saveRequestedMemoryFn = saveRequestedMemory,
}) {
  return {
    name: "remember_this",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();

      return isMemorySaveEnabled(config)
        && surface === "chat"
        && isConfiguredMemoryUserTurn(config, context)
        && hasExplicitCurrentMemorySaveRequest(context)
        && Boolean(memoryStore?.upsertMemory)
        && Boolean(generatedMemories?.upsertGeneratedMemory);
    },
    definition: {
      type: "function",
      name: "remember_this",
      description: [
        "Save a durable memory only when the current user message explicitly asks you to remember, save, note, or keep something.",
        "Pass the subject and any brief context needed. The backend drafts the memory, chooses metadata, checks for duplicates, saves it, and sends it to Review.",
        "Do not use this for passive observations. For individual song or track notes, use the music preference tool when available.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "What the user explicitly wants remembered.",
          },
          context: {
            type: "string",
            description: "Optional brief context needed to draft the memory accurately.",
          },
        },
        required: ["subject"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const subject = normalizeMemorySaveText(args.subject, MEMORY_SAVE_SUBJECT_LIMIT);
      const requestContext = normalizeMemorySaveText(args.context, MEMORY_SAVE_CONTEXT_LIMIT);

      if (!isMemorySaveEnabled(config)) {
        return {
          ok: false,
          saved: false,
          error: "Memory save requests are off for this Ghostlight instance.",
        };
      }

      if (!isConfiguredMemoryUserTurn(config, context)) {
        return {
          ok: false,
          saved: false,
          error: "Memory save requests are only available for the configured primary user.",
        };
      }

      if (!hasExplicitCurrentMemorySaveRequest(context)) {
        return {
          ok: true,
          saved: false,
          skipped: true,
          reason: "no_explicit_current_turn_request",
          message: "Memory saving skipped because the current user message did not ask to save anything.",
        };
      }

      if (!subject && !requestContext) {
        return {
          ok: false,
          saved: false,
          error: "A clear memory-save subject is required.",
        };
      }

      const result = await saveRequestedMemoryFn({
        config,
        logger,
        memory,
        memoryStore,
        generatedMemories,
        subject,
        requestContext,
        recentHistory: context.recentHistory || [],
        currentUserText: context.currentUserText || "",
        currentUserName: context.currentUserName || context.currentMessage?.member?.displayName || context.currentMessage?.author?.globalName || context.currentMessage?.author?.username || "",
        sourceMessageId: context.sourceMessageId || context.currentMessage?.id || "",
        conversationId: context.conversationId || "",
        channelId: context.channelId || context.currentMessage?.channelId || "",
      });

      logger?.info?.("[tools] remember_this completed", {
        saved: Boolean(result.saved),
        skipped: Boolean(result.skipped),
        reason: result.reason || "",
        memoryId: result.memoryId || "",
        generatedMemoryId: result.generatedMemoryId || "",
      });

      if (!result.ok) {
        return {
          ok: false,
          saved: false,
          error: result.message || "Memory save request failed.",
          reason: result.reason || "",
        };
      }

      if (!result.saved) {
        return {
          ok: true,
          saved: false,
          skipped: true,
          reason: result.reason || "",
          message: result.message || "No new memory was saved.",
          relatedMemoryIds: result.relatedMemoryIds || [],
        };
      }

      return {
        ok: true,
        saved: true,
        memoryId: result.memoryId,
        generatedMemoryId: result.generatedMemoryId,
        title: result.title,
        memoryType: result.memoryType,
        domain: result.domain,
        sensitivity: result.sensitivity,
        message: result.syncWarning
          ? "Memory saved and added to Review, but memory search sync reported a warning."
          : "Memory saved and added to Review.",
        syncWarning: result.syncWarning || "",
      };
    },
  };
}

function createConversationRetrievalTool({ config = {}, conversations = null, channelModes = null, logger = null }) {
  if (!conversations?.listRecentConversationSnippets || !channelModes?.resolveModeForChannel) {
    return null;
  }

  return {
    name: "search_recent_conversations",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      const access = normalizeRetrievalAccess(context.mode?.retrievalAccess || context.retrievalAccess);
      return isConversationRetrievalEnabled(config) && ["chat", "scheduled", "heartbeat"].includes(surface) && access !== "off";
    },
    definition: {
      type: "function",
      name: "search_recent_conversations",
      description: [
        "Search snippets from opted-in channels and threads outside the current visible conversation window.",
        "Use when the user asks about something recently or previously said, written, started, opened, asked, discussed, or where you left off.",
        "Use mode='recent' for broad catch-up, continuity, vibe, or ongoing behaviour.",
        "Use mode='search' for a specific phrase, name, concrete topic, object, event, or find/mention question.",
        "Use mode='archive' only when the user explicitly refers to older context, last week, yesterday in a long thread, earlier in this thread, or another longer-range lookup.",
        "When the user gives a specific day or date range, set dateStart and optional dateEnd; date ranges override sinceHours.",
        "For date-bounded searches, keep query concise and specific, such as a place, name, object, project, or exact phrase; avoid broad paraphrases unless the user asks for a general day recap.",
        "Do not turn descriptive vibe words into search keywords unless the user asks to find that exact word or phrase.",
        "If the user names a scope like shared server, other server, daily thread, personal, or private context, set source to the matching source type. Do not substitute a different source type.",
        "This is recent conversation lookup, not web search or durable memory.",
        "Results include labels, timestamps, speakers, and permission scope. Same-channel results may appear only when they are older than the current visible context window.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["search", "recent", "archive"],
            description: "Use 'recent' for broad catch-up or continuity. Use 'search' for a specific phrase, name, topic, object, event, or find/mention question. Use 'archive' for explicit older or same-thread retrieval beyond the visible context window.",
          },
          query: {
            type: "string",
            description: "Optional short search text. Used when mode is 'search' or 'archive'. Prefer concise specific anchors over broad paraphrases.",
          },
          source: {
            type: "string",
            enum: ["shared_safe", "personal"],
            description: "Optional source scope to restrict results. Use 'shared_safe' when the user asks about the shared/other server; use 'personal' for daily threads, personal, or private contexts. Omit when no source scope is requested.",
          },
          speaker: {
            type: "string",
            enum: ["any", "user", "assistant"],
            description: "Optional speaker-side filter. Use 'user' for what the user said, 'assistant' for what Ghostlight said, and omit or use 'any' otherwise.",
          },
          sinceHours: {
            type: "integer",
            description: "How many recent hours to search when dateStart is not provided. Defaults to 48, or 720 in archive mode, and is capped at 720.",
            minimum: 1,
            maximum: MAX_CONVERSATION_RETRIEVAL_HOURS,
          },
          dateStart: {
            type: "string",
            description: "Optional local start date as YYYY-MM-DD. Use for exact day/date-range references like '24 May'. When provided, this overrides sinceHours.",
          },
          dateEnd: {
            type: "string",
            description: "Optional exclusive local end date as YYYY-MM-DD. Omit for a single local day.",
          },
          timezone: {
            type: "string",
            description: "Optional IANA timezone for dateStart/dateEnd. Defaults to the Ghostlight chat timezone.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of snippets to return. Defaults to 6 and is capped at 12.",
            minimum: 1,
            maximum: MAX_CONVERSATION_RETRIEVAL_LIMIT,
          },
        },
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const access = normalizeRetrievalAccess(context.mode?.retrievalAccess || context.retrievalAccess);

      if (!isConversationRetrievalEnabled(config)) {
        return {
          ok: false,
          error: "Recent conversation awareness is off for this Ghostlight instance.",
          conversations: [],
        };
      }

      if (access === "off") {
        return {
          ok: false,
          error: "Conversation retrieval is off for the current channel mode.",
          conversations: [],
        };
      }

      const retrievalMode = normalizeRetrievalMode(args.mode);
      const limit = normalizeRetrievalLimit(args.limit);
      const sinceHours = normalizeRetrievalHours(args.sinceHours, retrievalMode);
      const rawQuery = retrievalMode === "recent" ? "" : normalizeRetrievalQuery(args.query);
      const dateRange = buildRetrievalDateRange({ args, context, config });
      const query = dateRange ? stripMatchingDateTermsFromQuery(rawQuery, dateRange) : rawQuery;
      const sourceFilter = inferRetrievalSourceFilter({ args, context, query });
      const speakerFilter = normalizeRetrievalSpeaker(args.speaker);
      const since = dateRange?.since || new Date(Date.now() - (sinceHours * 60 * 60 * 1000));
      const currentConversationId = String(context.conversationId || "").trim();
      const currentChannelId = String(context.channelId || "").trim();
      const visibleContextMessageIds = getVisibleContextMessageIds(context);
      const visibleContextMessageIdSet = new Set(visibleContextMessageIds);
      const visibleHistoryLimit = Number.parseInt(String(context.mode?.historyLimit ?? context.historyLimit ?? ""), 10) || 0;
      const queryTerms = tokenizeRetrievalQuery(query);
      const modeCache = new Map();
      const queryLimit = Math.max(limit * 8, 24) + Math.max(visibleContextMessageIds.length, visibleHistoryLimit);
      const loadCandidateEvents = (storageQuery = "") => conversations.listRecentConversationSnippets({
        guildId: "",
        since,
        until: dateRange?.until || null,
        query: storageQuery,
        limit: queryLimit,
      });
      const processCandidateEvents = async (candidateEvents) => {
        const permittedSnippets = [];
        let skippedVisibleContextCount = 0;
        let sameConversationCandidateCount = 0;
        let sameChannelCandidateCount = 0;
        let skippedSourcePermissionCount = 0;
        let skippedSpeakerFilterCount = 0;
        const sourceModeResolutionCounts = {};

        for (const event of candidateEvents) {
          if (visibleContextMessageIdSet.has(String(event.discord_message_id || "").trim())) {
            skippedVisibleContextCount += 1;
            continue;
          }

          const isSameConversation = currentConversationId && event.conversation_id === currentConversationId;
          const isSameChannel = currentChannelId && (event.channel_id === currentChannelId || event.thread_id === currentChannelId);

          if (isSameConversation) {
            sameConversationCandidateCount += 1;
          }

          if (isSameChannel) {
            sameChannelCandidateCount += 1;
          }

          if (speakerFilter !== "any" && event.role !== speakerFilter) {
            skippedSpeakerFilterCount += 1;
            continue;
          }

          const match = analyzeRetrievalEventMatch(event, queryTerms, query);
          const sourceModeResolution = await resolveRetrievalSourceMode({
            event,
            channelModes,
            context,
            modeCache,
          });
          const sourceMode = sourceModeResolution.mode;
          sourceModeResolutionCounts[sourceModeResolution.resolvedBy] = (sourceModeResolutionCounts[sourceModeResolution.resolvedBy] || 0) + 1;

          const sourceModeRetrievalSource = normalizeRetrievalSource(sourceMode?.retrievalSource);

          if (sourceFilter && sourceModeRetrievalSource !== sourceFilter) {
            skippedSourcePermissionCount += 1;
            continue;
          }

          if (!sourceMode || !canAccessRetrievalSource(access, sourceModeRetrievalSource)) {
            skippedSourcePermissionCount += 1;
            continue;
          }

          permittedSnippets.push({
            queryScore: match.score,
            snippet: mapRetrievalEventToSnippet(event, sourceMode, context, match.matchStrength),
          });
        }

        return {
          candidateEvents,
          permittedSnippets,
          skippedVisibleContextCount,
          sameConversationCandidateCount,
          sameChannelCandidateCount,
          skippedSourcePermissionCount,
          skippedSpeakerFilterCount,
          sourceModeResolutionCounts,
        };
      };

      let candidateBatch = await processCandidateEvents(await loadCandidateEvents(queryTerms.length ? query : ""));
      let permittedSnippets = candidateBatch.permittedSnippets;

      let matchingSnippets = queryTerms.length
        ? permittedSnippets.filter((item) => item.queryScore > 0)
        : permittedSnippets;
      let fallbackUsed = queryTerms.length > 0 && matchingSnippets.length === 0 && permittedSnippets.length > 0;

      if (queryTerms.length > 0 && matchingSnippets.length === 0 && permittedSnippets.length === 0) {
        candidateBatch = await processCandidateEvents(await loadCandidateEvents(""));
        permittedSnippets = candidateBatch.permittedSnippets;
        matchingSnippets = permittedSnippets.filter((item) => item.queryScore > 0);
        fallbackUsed = matchingSnippets.length === 0 && permittedSnippets.length > 0;
      }

      const selectedPool = fallbackUsed ? permittedSnippets : matchingSnippets;
      const selectedLimit = fallbackUsed
        ? Math.min(limit, DEFAULT_CONVERSATION_RETRIEVAL_FALLBACK_LIMIT)
        : limit;
      const selectionDiversified = shouldDiversifyRetrievalSelection({
        selectedPool,
        selectedLimit,
        queryTerms,
        fallbackUsed,
      });
      const selectedSnippets = selectRetrievalItems(selectedPool, selectedLimit, {
        queryTerms,
        fallbackUsed,
      })
        .map((item) => item.snippet)
        .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
      const groupedConversations = groupRetrievalSnippets(selectedSnippets);
      const matchedQuery = !queryTerms.length || (!fallbackUsed && selectedSnippets.length > 0);
      const resultMatch = getRetrievalResultMatch({ queryTerms, fallbackUsed, selectedSnippets });

      logger?.debug?.("[tools] search_recent_conversations completed", {
        access,
        mode: retrievalMode,
        query: query || null,
        sourceFilter: sourceFilter || null,
        queryTerms,
        speakerFilter,
        matchedQuery,
        fallbackUsed,
        sinceHours,
        dateRange: dateRange
          ? {
            dateStart: dateRange.dateStart,
            dateEnd: dateRange.dateEnd,
            timezone: dateRange.timezone,
          }
          : null,
        limit,
        visibleHistoryLimit,
        visibleContextMessageCount: visibleContextMessageIds.length,
        candidateCount: candidateBatch.candidateEvents.length,
        permittedSnippetCount: permittedSnippets.length,
        skippedVisibleContextCount: candidateBatch.skippedVisibleContextCount,
        sameConversationCandidateCount: candidateBatch.sameConversationCandidateCount,
        sameChannelCandidateCount: candidateBatch.sameChannelCandidateCount,
        skippedSpeakerFilterCount: candidateBatch.skippedSpeakerFilterCount,
        skippedSourcePermissionCount: candidateBatch.skippedSourcePermissionCount,
        sourceModeResolutionCounts: candidateBatch.sourceModeResolutionCounts,
        returnedSnippetCount: selectedSnippets.length,
        returnedConversationCount: groupedConversations.length,
        selectionDiversified,
        resultMatch,
      });

      return {
        ok: true,
        mode: retrievalMode,
        scopeNote: "These snippets are from permitted conversation history outside the current visible context window. Same-channel snippets, when present, are older than that live context window.",
        query,
        sourceFilter,
        speakerFilter,
        matchedQuery,
        fallbackUsed,
        resultMatch,
        fallbackReason: fallbackUsed ? "No permitted snippets matched the query terms, so the latest permitted recent snippets were returned instead." : "",
        sinceHours,
        dateRange: dateRange
          ? {
            dateStart: dateRange.dateStart,
            dateEnd: dateRange.dateEnd,
            timezone: dateRange.timezone,
          }
          : null,
        limit,
        visibleHistoryLimit,
        skippedVisibleContextCount: candidateBatch.skippedVisibleContextCount,
        returnedSnippetCount: selectedSnippets.length,
        selectionDiversified,
        conversations: groupedConversations,
      };
    },
  };
}

module.exports = {
  canAccessRetrievalSource,
  createMemoryLookupTool,
  createMemorySaveTool,
  createConversationRetrievalTool,
};

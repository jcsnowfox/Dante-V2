const { embedTexts } = require("../embeddings");
const { annotateMemoryStageError } = require("../errorStage");
const { searchPoints } = require("../qdrantClient");

const MEMORY_TYPE_CAPS = Object.freeze({
  anchor: 2,
  canon: 5,
  roleplay: 3,
  resolved: 1,
  timeline_daily: 2,
  timeline_weekly: 1,
});

const MEMORY_TYPE_OUTPUT_PRIORITY = Object.freeze({
  anchor: 1,
  canon: 2,
  roleplay: 3,
  timeline_weekly: 4,
  timeline_daily: 5,
  resolved: 6,
});

const RELATIVE_SCORE_WINDOW = 0.15;

const MEMORY_TYPE_DECAY = Object.freeze({
  timeline_daily: {
    dailyPenalty: 0.008,
    maxPenalty: 0.12,
  },
  timeline_weekly: {
    dailyPenalty: 0.004,
    maxPenalty: 0.15,
  },
});

const QUERY_LAYER_LIMITS = Object.freeze({
  primary: 14,
  continuity: 10,
});

const MEMORY_RETRIEVAL_LANES = Object.freeze({
  durable: ["anchor", "canon", "resolved"],
  continuity: ["timeline_daily", "timeline_weekly"],
  roleplay: ["roleplay"],
});

const MODE_MEMORY_TYPE_ALIASES = Object.freeze({
  timeline: ["timeline_daily", "timeline_weekly"],
});

const SENSITIVITY_ORDER = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});

const QUERY_LANE_LIMITS = Object.freeze({
  durable: {
    primary: 6,
    continuity: 6,
  },
  continuity: {
    primary: 4,
    continuity: 4,
  },
});

const QUERY_LAYER_WEIGHT_BONUS = Object.freeze({
  durable: {
    primary: 0.12,
    continuity: 0,
  },
  continuity: {
    primary: 0,
    continuity: 0,
  },
});

const RETRIEVAL_LANE_ORDER = Object.freeze([
  "durable",
  "continuity",
  "roleplay",
]);

function summarizeMemoryHit(hit) {
  const payload = hit.payload || {};
  const summary = {
    memoryId: payload.memory_id,
    title: payload.title,
    memoryType: payload.memory_type,
    domain: payload.domain,
    importance: payload.importance,
    score: Number(hit.score || 0),
    layerBonus: Number(hit.layerBonus || 0),
    weightedScore: Number(hit.weightedScore || 0),
  };

  if (hit.retrievalLayer) {
    summary.retrievalLayer = hit.retrievalLayer;
  }

  if (hit.retrievalLane) {
    summary.retrievalLane = hit.retrievalLane;
  }

  if (typeof hit.decayPenalty === "number" && hit.decayPenalty > 0) {
    summary.decayPenalty = hit.decayPenalty;
  }

  if (payload.reference_date) {
    summary.referenceDate = payload.reference_date;
  }

  return summary;
}

function formatMemoryDebugEntry(entry = {}) {
  const parts = [
    entry.title || "Untitled",
    entry.memoryType || "memory",
  ];

  if (entry.domain) {
    parts.push(entry.domain);
  }

  const score = Number(entry.weightedScore || 0);
  parts.push(score.toFixed(3));

  return parts.join(" · ");
}

function summarizeSelectedMemoryTypes(memories = []) {
  return memories.reduce((totals, memory) => {
    const memoryType = String(memory.memoryType || "").trim();

    if (!memoryType) {
      return totals;
    }

    totals[memoryType] = (totals[memoryType] || 0) + 1;
    return totals;
  }, {});
}

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function calculateDecayPenalty({ memoryType, referenceDate, now = new Date() }) {
  const decay = MEMORY_TYPE_DECAY[memoryType];

  if (!decay || !referenceDate) {
    return 0;
  }

  const reference = toDateOnly(referenceDate);
  const current = toDateOnly(now);

  if (!reference || !current) {
    return 0;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daysOld = Math.max(0, Math.floor((current.getTime() - reference.getTime()) / millisecondsPerDay));

  return Math.min(daysOld * decay.dailyPenalty, decay.maxPenalty);
}

function rerankMemoryHit(hit, options = {}) {
  const payload = hit.payload || {};
  const decayPenalty = calculateDecayPenalty({
    memoryType: payload.memory_type,
    referenceDate: payload.reference_date,
    now: options.now,
  });

  return {
    ...hit,
    decayPenalty,
    layerBonus: Number(options.layerBonus || 0),
    weightedScore: Number(hit.score || 0) - decayPenalty + Number(options.layerBonus || 0),
  };
}

function normalizeQueryLayers(query) {
  if (typeof query === "string") {
    return {
      primary: query,
      continuity: "",
    };
  }

  return {
    primary: String(query?.primary || "").trim(),
    continuity: String(query?.continuity || "").trim(),
  };
}

function buildTimelineDailyCutoffDate(windowDays, now = new Date()) {
  const normalizedWindowDays = Number(windowDays);

  if (!Number.isFinite(normalizedWindowDays) || normalizedWindowDays <= 0) {
    return "";
  }

  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - normalizedWindowDays);
  return cutoff.toISOString().slice(0, 10);
}

function filterTimelineDailyWindowHits(hits = [], { timelineDailyWindowDays = 0, now = new Date() } = {}) {
  const cutoffDate = buildTimelineDailyCutoffDate(timelineDailyWindowDays, now);

  if (!cutoffDate) {
    return hits;
  }

  return hits.filter((hit) => {
    const payload = hit.payload || {};

    if (payload.memory_type !== "timeline_daily") {
      return true;
    }

    const referenceDate = String(payload.reference_date || "").slice(0, 10);
    return Boolean(referenceDate) && referenceDate >= cutoffDate;
  });
}

async function searchMemoryLayer({
  config,
  query,
  layer,
  lane,
  userScope,
  modeConfig,
  now,
  deps = {},
}) {
  if (!query) {
    return [];
  }

  const embedTextsFn = deps.embedTexts || embedTexts;
  const searchPointsFn = deps.searchPoints || searchPoints;
  let vector;

  try {
    [vector] = await embedTextsFn({
      config,
      inputs: [query],
    });
  } catch (error) {
    throw annotateMemoryStageError(error, `memory retrieval embeddings (${lane}/${layer})`);
  }

  let hits;

  try {
    hits = await searchPointsFn({
      config,
      vector,
      limit: QUERY_LANE_LIMITS[lane]?.[layer] || QUERY_LAYER_LIMITS[layer] || QUERY_LAYER_LIMITS.primary,
      filter: buildMemorySearchFilter({
        userScope,
        memoryTypes: MEMORY_RETRIEVAL_LANES[lane],
        memorySensitivity: modeConfig?.memorySensitivity,
        timelineDailyWindowDays: config.memory?.timelineDailyWindowDays ?? 14,
        now,
      }),
    });
  } catch (error) {
    throw annotateMemoryStageError(error, `memory retrieval qdrant searchPoints (${lane}/${layer})`);
  }

  const windowedHits = filterTimelineDailyWindowHits(hits, {
    timelineDailyWindowDays: config.memory?.timelineDailyWindowDays ?? 14,
    now,
  });

  return windowedHits
    .map((hit) => ({
      ...rerankMemoryHit(hit, {
        layerBonus: QUERY_LAYER_WEIGHT_BONUS[lane]?.[layer] || 0,
      }),
      retrievalLayer: layer,
      retrievalLane: lane,
    }));
}

function mergeRankedHits(layerResults) {
  const mergedById = new Map();

  for (const hit of layerResults.flat()) {
    const memoryId = hit.payload?.memory_id;

    if (!memoryId) {
      continue;
    }

    const existing = mergedById.get(memoryId);

    if (!existing || Number(hit.weightedScore || 0) > Number(existing.weightedScore || 0)) {
      mergedById.set(memoryId, hit);
    }
  }

  return [...mergedById.values()].sort((left, right) => right.weightedScore - left.weightedScore);
}

function selectMemoriesByType(hits) {
  const counters = {
    anchor: 0,
    canon: 0,
    roleplay: 0,
    resolved: 0,
    timeline_daily: 0,
    timeline_weekly: 0,
  };

  const selected = [];

  for (const hit of hits) {
    const payload = hit.payload || {};
    const memoryType = payload.memory_type;

    if (!MEMORY_TYPE_CAPS[memoryType]) {
      continue;
    }

    if (counters[memoryType] >= MEMORY_TYPE_CAPS[memoryType]) {
      continue;
    }

    counters[memoryType] += 1;
    selected.push({
      memoryId: payload.memory_id,
      title: payload.title,
      content: payload.content,
      memoryType,
      domain: payload.domain,
      sensitivity: payload.sensitivity,
      importance: payload.importance,
      referenceDate: payload.reference_date,
      score: Number(hit.score || 0),
      layerBonus: Number(hit.layerBonus || 0),
      decayPenalty: Number(hit.decayPenalty || 0),
      weightedScore: hit.weightedScore,
      retrievalLayer: hit.retrievalLayer || null,
      retrievalLane: hit.retrievalLane || null,
    });
  }

  return selected.sort((left, right) => {
    const leftPriority = MEMORY_TYPE_OUTPUT_PRIORITY[left.memoryType] || 99;
    const rightPriority = MEMORY_TYPE_OUTPUT_PRIORITY[right.memoryType] || 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return Number(right.weightedScore || 0) - Number(left.weightedScore || 0);
  });
}

function filterHitsByRelativeScoreWindow(hits, { window = RELATIVE_SCORE_WINDOW } = {}) {
  const groups = new Map();

  for (const hit of hits) {
    const lane = String(hit.retrievalLane || "default");

    if (!groups.has(lane)) {
      groups.set(lane, []);
    }

    groups.get(lane).push(hit);
  }

  return [...groups.values()]
    .flatMap((groupHits) => {
      if (!groupHits.length) {
        return [];
      }

      const bestScore = Math.max(...groupHits.map((hit) => Number(hit.weightedScore ?? hit.score ?? 0)));

      return groupHits.filter((hit) => {
        const weightedScore = Number(hit.weightedScore ?? hit.score ?? 0);
        return weightedScore >= bestScore - window;
      });
    })
    .sort((left, right) => Number(right.weightedScore || 0) - Number(left.weightedScore || 0));
}

function normalizeModeConfig(mode = {}) {
  if (typeof mode === "string") {
    return {
      name: mode,
      memoryTypes: ["anchor", "canon", "resolved", "timeline"],
      memorySensitivity: "high",
    };
  }

  return {
    name: String(mode?.name || "default").trim() || "default",
    memoryTypes: Array.isArray(mode?.memoryTypes) && mode.memoryTypes.length
      ? mode.memoryTypes
      : ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: String(mode?.memorySensitivity || "high").trim().toLowerCase() || "high",
  };
}

function expandModeMemoryTypes(memoryTypes = []) {
  return [...new Set(memoryTypes.flatMap((memoryType) => {
    const normalized = String(memoryType || "").trim().toLowerCase();

    if (!normalized) {
      return [];
    }

    return MODE_MEMORY_TYPE_ALIASES[normalized] || [normalized];
  }))];
}

function resolveAllowedSensitivityLevels(maxSensitivity = "high") {
  const normalized = String(maxSensitivity || "high").trim().toLowerCase();
  const limit = SENSITIVITY_ORDER[normalized] || SENSITIVITY_ORDER.high;

  return Object.keys(SENSITIVITY_ORDER).filter((level) => SENSITIVITY_ORDER[level] <= limit);
}

function buildMemorySearchFilter({
  userScope,
  memoryTypes = [],
  memorySensitivity = "high",
  timelineDailyWindowDays = 0,
  excludeMemoryIds = [],
  now,
} = {}) {
  const must = [
    {
      key: "active",
      match: {
        value: true,
      },
    },
    {
      key: "user_scope",
      match: {
        value: userScope,
      },
    },
  ];

  const normalizedMemoryTypes = Array.isArray(memoryTypes)
    ? memoryTypes.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (normalizedMemoryTypes.length) {
    must.push({
      key: "memory_type",
      match: {
        any: normalizedMemoryTypes,
      },
    });
  }

  const allowedSensitivityLevels = resolveAllowedSensitivityLevels(memorySensitivity);

  if (allowedSensitivityLevels.length) {
    must.push({
      key: "sensitivity",
      match: {
        any: allowedSensitivityLevels,
      },
    });
  }

  if (normalizedMemoryTypes.length === 1 && normalizedMemoryTypes[0] === "timeline_daily") {
    const cutoffDate = buildTimelineDailyCutoffDate(timelineDailyWindowDays, now);

    if (cutoffDate) {
      must.push({
        key: "reference_date",
        range: {
          gte: cutoffDate,
        },
      });
    }
  }

  const normalizedExcludeMemoryIds = Array.isArray(excludeMemoryIds)
    ? Array.from(new Set(excludeMemoryIds.map((value) => String(value || "").trim()).filter(Boolean)))
    : [];
  const filter = { must };

  if (normalizedExcludeMemoryIds.length) {
    filter.must_not = [
      {
        key: "memory_id",
        match: {
          any: normalizedExcludeMemoryIds,
        },
      },
    ];
  }

  return filter;
}

function getRetrievalPlan(mode = "default") {
  const modeConfig = normalizeModeConfig(mode);
  const expandedMemoryTypes = expandModeMemoryTypes(modeConfig.memoryTypes);
  const includedLanes = RETRIEVAL_LANE_ORDER.filter((lane) => MEMORY_RETRIEVAL_LANES[lane]
    .some((memoryType) => expandedMemoryTypes.includes(memoryType)));

  return includedLanes.flatMap((lane) => [
    { lane, layer: "primary" },
    { lane, layer: "continuity" },
  ]);
}

function summarizeRetrievalStats(candidateHits = [], selectedMemories = []) {
  const scores = candidateHits
    .map((hit) => Number(hit.weightedScore ?? hit.score ?? 0))
    .filter((score) => Number.isFinite(score));
  const selectedTypeCounts = selectedMemories.reduce((counts, memory) => {
    const memoryType = String(memory.memoryType || "").trim();

    if (!memoryType) {
      return counts;
    }

    counts[memoryType] = (counts[memoryType] || 0) + 1;
    return counts;
  }, {});

  if (!scores.length) {
    return {
      candidateCount: 0,
      topScore: null,
      lowestScore: null,
      selectedCount: selectedMemories.length,
      selectedTypeCounts: {},
    };
  }

  return {
    candidateCount: candidateHits.length,
    topScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    selectedCount: selectedMemories.length,
    selectedTypeCounts,
  };
}

async function hydrateMemoriesFromStore({ memoryStore, memories, userScope }) {
  if (!memoryStore || !memories.length) {
    return memories;
  }

  const memoryRows = await memoryStore.getMemoriesByIds(
    memories.map((memory) => memory.memoryId),
    { userScope },
  );

  if (!memoryRows.length) {
    return memories;
  }

  const rowsById = new Map(memoryRows.map((row) => [row.memoryId, row]));

  return memories.map((memory) => {
    const row = rowsById.get(memory.memoryId);

    if (!row) {
      return memory;
    }

    return {
      ...memory,
      title: row.title,
      content: row.content,
      memoryType: row.memoryType,
      domain: row.domain,
      sensitivity: row.sensitivity,
      importance: row.importance,
      referenceDate: row.referenceDate,
      lastUsedAt: row.lastUsedAt,
      updatedAt: row.updatedAt,
      source: row.source,
      active: row.active,
    };
  });
}

async function markMemoriesUsed({ memoryStore, memories, userScope, usedAt = new Date().toISOString() }) {
  if (!memoryStore || !memories.length) {
    return 0;
  }

  return memoryStore.touchMemoriesByIds(
    memories.map((memory) => memory.memoryId),
    {
      userScope,
      usedAt,
    },
  );
}

function normalizeLookupLimit(value, defaultValue = 3, maxValue = 20) {
  const parsed = Number.parseInt(String(value || defaultValue), 10) || defaultValue;
  return Math.max(1, Math.min(parsed, maxValue));
}

function normalizeLookupMemoryTypes(memoryTypes = []) {
  const expanded = expandModeMemoryTypes(Array.isArray(memoryTypes) && memoryTypes.length
    ? memoryTypes
    : ["anchor", "canon", "resolved", "timeline"]);

  return expanded.filter((memoryType) => [
    "anchor",
    "canon",
    "resolved",
    "roleplay",
    "timeline_daily",
    "timeline_weekly",
  ].includes(memoryType));
}

async function lookupMemories({
  config,
  memoryStore,
  query,
  userScope,
  memoryTypes = [],
  memorySensitivity = "high",
  limit = 3,
  excludeMemoryIds = [],
  touch = false,
  caller = "unknown",
  now = new Date(),
  deps = {},
}) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedLimit = normalizeLookupLimit(limit);
  const normalizedUserScope = String(userScope || config.memory?.userScope || "").trim();
  const normalizedMemoryTypes = normalizeLookupMemoryTypes(memoryTypes);
  const normalizedExcludeMemoryIds = Array.from(new Set(
    (Array.isArray(excludeMemoryIds) ? excludeMemoryIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
  const embedTextsFn = deps.embedTexts || embedTexts;
  const searchPointsFn = deps.searchPoints || searchPoints;
  let vector;

  void caller;

  try {
    [vector] = await embedTextsFn({
      config,
      inputs: [normalizedQuery],
    });
  } catch (error) {
    throw annotateMemoryStageError(error, "memory lookup embeddings");
  }

  let hits;

  try {
    hits = await searchPointsFn({
      config,
      vector,
      limit: normalizedLimit,
      filter: buildMemorySearchFilter({
        userScope: normalizedUserScope,
        memoryTypes: normalizedMemoryTypes,
        memorySensitivity,
        timelineDailyWindowDays: config.memory?.timelineDailyWindowDays ?? 14,
        excludeMemoryIds: normalizedExcludeMemoryIds,
        now,
      }),
    });
  } catch (error) {
    throw annotateMemoryStageError(error, "memory lookup qdrant searchPoints");
  }

  const rankedHits = filterTimelineDailyWindowHits(hits, {
    timelineDailyWindowDays: config.memory?.timelineDailyWindowDays ?? 14,
    now,
  })
    .map((hit) => rerankMemoryHit(hit, { now }))
    .sort((left, right) => Number(right.weightedScore || 0) - Number(left.weightedScore || 0))
    .slice(0, normalizedLimit);

  const memories = rankedHits
    .map((hit) => {
      const payload = hit.payload || {};

      if (!payload.memory_id) {
        return null;
      }

      return {
        memoryId: payload.memory_id,
        title: payload.title,
        content: payload.content,
        memoryType: payload.memory_type,
        domain: payload.domain,
        sensitivity: payload.sensitivity,
        importance: payload.importance,
        referenceDate: payload.reference_date,
        score: Number(hit.score || 0),
        decayPenalty: Number(hit.decayPenalty || 0),
        weightedScore: Number(hit.weightedScore || hit.score || 0),
      };
    })
    .filter(Boolean);

  const hydrated = await hydrateMemoriesFromStore({
    memoryStore,
    memories,
    userScope: normalizedUserScope,
  });

  if (touch) {
    await markMemoriesUsed({
      memoryStore,
      memories: hydrated,
      userScope: normalizedUserScope,
    });
  }

  return hydrated;
}

function createQdrantMemoryProvider({ config, logger, memoryStore = null }) {
  return {
    canLookup: true,
    lookup(params = {}) {
      return lookupMemories({
        config,
        memoryStore,
        ...params,
      });
    },
    async retrieve({ query, mode }) {
      const queries = normalizeQueryLayers(query);

      if (!queries.primary && !queries.continuity) {
        return [];
      }

      const modeConfig = normalizeModeConfig(mode);
      const retrievalPlan = getRetrievalPlan(modeConfig);
      const layerSearches = retrievalPlan.map(({ lane, layer }) => ({
        lane,
        layer,
        search: searchMemoryLayer({
          config,
          query: queries[layer],
          layer,
          lane,
          userScope: config.memory.userScope,
          modeConfig,
          now: new Date(),
        }),
      }));
      const settledLayerResults = await Promise.allSettled(layerSearches.map((item) => item.search));
      const layerResults = settledLayerResults.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return [result.value];
        }

        const failedLayer = layerSearches[index];
        logger.warn("[memory] Qdrant memory layer failed; continuing with remaining layers", {
          lane: failedLayer?.lane || "",
          layer: failedLayer?.layer || "",
          error: result.reason?.message || String(result.reason),
          userScope: config.memory.userScope,
        });

        return [];
      });

      const rankedHits = mergeRankedHits(layerResults);
      const filteredHits = filterHitsByRelativeScoreWindow(rankedHits);

      const selectedMemories = selectMemoriesByType(filteredHits);
      const memories = await hydrateMemoriesFromStore({
        memoryStore,
        memories: selectedMemories,
        userScope: config.memory.userScope,
      });

      await markMemoriesUsed({
        memoryStore,
        memories,
        userScope: config.memory.userScope,
      });

      logger.debug?.("[memory] Retrieved Qdrant memories", {
        primaryQueryLength: queries.primary.length,
        continuityQueryLength: queries.continuity.length,
        candidateCount: rankedHits.length,
        filteredCount: filteredHits.length,
        selectedCount: memories.length,
        userScope: config.memory.userScope,
      });

      logger.debug("[memory] Memory search candidates", {
        primaryQuery: queries.primary.slice(0, 120),
        continuityQuery: queries.continuity.slice(0, 120),
        entries: rankedHits.map((hit) => formatMemoryDebugEntry(summarizeMemoryHit(hit))),
      });

      logger.debug("[memory] Memories selected for this reply", {
        entries: memories.map((memory) => formatMemoryDebugEntry({
          title: memory.title,
          memoryType: memory.memoryType,
          domain: memory.domain,
          weightedScore: memory.weightedScore || 0,
        })),
        totals: summarizeSelectedMemoryTypes(memories),
      });

      return memories;
    },
  };
}

module.exports = {
  MEMORY_TYPE_CAPS,
  RELATIVE_SCORE_WINDOW,
  normalizeQueryLayers,
  normalizeModeConfig,
  expandModeMemoryTypes,
  resolveAllowedSensitivityLevels,
  buildTimelineDailyCutoffDate,
  filterTimelineDailyWindowHits,
  searchMemoryLayer,
  mergeRankedHits,
  summarizeMemoryHit,
  formatMemoryDebugEntry,
  rerankMemoryHit,
  selectMemoriesByType,
  filterHitsByRelativeScoreWindow,
  buildMemorySearchFilter,
  getRetrievalPlan,
  summarizeRetrievalStats,
  summarizeSelectedMemoryTypes,
  hydrateMemoriesFromStore,
  markMemoriesUsed,
  normalizeLookupLimit,
  normalizeLookupMemoryTypes,
  lookupMemories,
  createQdrantMemoryProvider,
};

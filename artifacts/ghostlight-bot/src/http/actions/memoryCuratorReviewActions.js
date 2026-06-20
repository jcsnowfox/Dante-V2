const crypto = require("node:crypto");

const { DEDUPE_ACTION } = require("../../memory/curatorDedupe");
const { QUIET_ACTION } = require("../../memory/curatorQuiet");
const { SPLIT_ACTION } = require("../../memory/curatorSplit");
const { isSupportedMemoryDomain, normalizeDomainValue } = require("../../memory/domains");
const { canSyncMemories } = require("../../memory/syncMemories");
const { deletePoints } = require("../../memory/qdrantClient");
const {
  formatMemorySyncWarning,
  safeSyncMemoriesToQdrant,
  safeSyncMemoryToQdrant,
} = require("./memoryActionSync");

function getCuratorAction(item = {}) {
  return String(item.sourcePayload?.action || "").trim().toLowerCase();
}

function isCuratorItem(item = {}) {
  return item.sourceKind === "memory_curator"
    || (Array.isArray(item.reviewFlags) && item.reviewFlags.includes("memory_curator"));
}

function stableUuid(seed) {
  const hex = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function normalizeSplitMemoryType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["anchor", "canon", "resolved", "roleplay"].includes(normalized) ? normalized : "";
}

function normalizeSplitSensitivity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "";
}

function buildEditedSplitSourcePayload(sourcePayload = {}, fields = {}) {
  if (fields.splitCount === undefined) {
    return sourcePayload;
  }

  const splitCount = Math.max(0, Math.min(Number.parseInt(String(fields.splitCount || "0"), 10) || 0, 10));
  const proposedMemories = [];

  for (let index = 0; index < splitCount; index += 1) {
    const title = String(fields[`splitTitle_${index}`] || "").trim();
    const content = String(fields[`splitContent_${index}`] || "").trim();
    const memoryType = normalizeSplitMemoryType(fields[`splitMemoryType_${index}`]);
    const domain = normalizeDomainValue(fields[`splitDomain_${index}`]);
    const sensitivity = normalizeSplitSensitivity(fields[`splitSensitivity_${index}`]);

    if (!title && !content) {
      continue;
    }

    if (!title || !content || !memoryType || !domain || domain === "timeline" || !isSupportedMemoryDomain(domain) || !sensitivity) {
      throw new Error("Each proposed split memory needs a title, content, type, category, and sensitivity.");
    }

    proposedMemories.push({
      title,
      content,
      memoryType,
      domain,
      sensitivity,
    });
  }

  return {
    ...sourcePayload,
    proposedMemories,
  };
}

async function applyCuratorMemoryUpdate({
  item,
  memoryStore,
  config,
  logger,
}) {
  const action = getCuratorAction(item);
  const targetMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();

  if (!["update_existing", "resolve_existing"].includes(action)) {
    return {
      handled: false,
      item,
      syncWarning: "",
    };
  }

  if (!targetMemoryId) {
    throw new Error("Curator update/resolve suggestion is missing a target memory ID.");
  }

  const existing = await memoryStore.getMemoryById(targetMemoryId, {
    userScope: item.userScope,
  });

  if (!existing) {
    throw new Error("Curator target memory was not found.");
  }

  const savedMemory = await memoryStore.upsertMemory({
    memory_id: existing.memoryId,
    title: item.title,
    content: item.content,
    memory_type: action === "resolve_existing" ? "resolved" : item.memoryType,
    domain: item.domain,
    sensitivity: item.sensitivity,
    importance: existing.importance,
    source: existing.source,
    active: true,
    created_at: existing.createdAt,
    reference_date: item.referenceDate || existing.referenceDate,
  }, {
    userScope: item.userScope,
  });
  let syncWarning = "";

  if (canSyncMemories(config)) {
    const syncResult = await safeSyncMemoryToQdrant({
      config,
      memory: savedMemory,
      logger,
    });
    syncWarning = syncResult.errorMessage || "";
  }

  return {
    handled: true,
    savedMemory,
    syncWarning,
  };
}

async function applyCuratorSplitApproval({
  item,
  memoryStore,
  config,
  logger,
}) {
  const action = getCuratorAction(item);

  if (action !== SPLIT_ACTION) {
    return {
      handled: false,
      item,
      syncWarning: "",
    };
  }

  const targetMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();
  const proposedMemories = Array.isArray(item.sourcePayload?.proposedMemories)
    ? item.sourcePayload.proposedMemories
    : [];

  if (!targetMemoryId) {
    throw new Error("Curator split suggestion is missing a target memory ID.");
  }

  if (proposedMemories.length < 2) {
    throw new Error("Curator split suggestion needs at least two proposed memories.");
  }

  const existing = await memoryStore.getMemoryById(targetMemoryId, {
    userScope: item.userScope,
  });

  if (!existing) {
    throw new Error("Curator split target memory was not found.");
  }

  const savedMemories = [];

  for (const [index, proposed] of proposedMemories.entries()) {
    const memoryId = stableUuid(`${item.generatedMemoryId}:split:${targetMemoryId}:${index}`);
    const savedMemory = await memoryStore.upsertMemory({
      memory_id: memoryId,
      title: proposed.title,
      content: proposed.content,
      memory_type: proposed.memoryType,
      domain: proposed.domain,
      sensitivity: proposed.sensitivity,
      importance: existing.importance,
      source: `generated_${item.sourceKind}`,
      active: true,
      reference_date: item.referenceDate || existing.referenceDate,
    }, {
      userScope: item.userScope,
    });

    savedMemories.push(savedMemory);
  }

  await memoryStore.upsertMemory({
    memory_id: existing.memoryId,
    title: existing.title,
    content: existing.content,
    memory_type: existing.memoryType,
    domain: existing.domain,
    sensitivity: existing.sensitivity,
    importance: existing.importance,
    source: existing.source,
    active: false,
    created_at: existing.createdAt,
    reference_date: existing.referenceDate,
    last_used_at: existing.lastUsedAt,
  }, {
    userScope: item.userScope,
  });

  let syncWarning = "";

  if (canSyncMemories(config)) {
    try {
      await deletePoints({
        config,
        ids: [existing.memoryId],
      });
    } catch (error) {
      logger?.warn?.("[memory] Failed to remove split source memory from Qdrant", {
        memoryId: existing.memoryId,
        error: error?.message || String(error),
      });
      syncWarning = formatMemorySyncWarning(error);
    }

    const syncResult = await safeSyncMemoriesToQdrant({
      config,
      memories: savedMemories,
      logger,
    });
    syncWarning = syncWarning || syncResult.errorMessage || "";
  }

  return {
    handled: true,
    savedMemories,
    archivedMemory: existing,
    syncWarning,
  };
}

async function applyCuratorMergeApproval({
  item,
  memoryStore,
  config,
  logger,
}) {
  const action = getCuratorAction(item);

  if (action !== DEDUPE_ACTION) {
    return {
      handled: false,
      item,
      syncWarning: "",
    };
  }

  const primaryMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();
  const duplicateMemoryIds = Array.from(new Set(
    (Array.isArray(item.sourcePayload?.relatedMemoryIds) ? item.sourcePayload.relatedMemoryIds : [])
      .map((id) => String(id || "").trim())
      .filter((id) => id && id !== primaryMemoryId),
  ));

  if (!primaryMemoryId) {
    throw new Error("Curator merge suggestion is missing a primary memory ID.");
  }

  if (!duplicateMemoryIds.length) {
    throw new Error("Curator merge suggestion needs at least one duplicate memory.");
  }

  const primaryMemory = await memoryStore.getMemoryById(primaryMemoryId, {
    userScope: item.userScope,
  });

  if (!primaryMemory) {
    throw new Error("Curator merge primary memory was not found.");
  }

  const duplicateMemories = [];

  for (const duplicateMemoryId of duplicateMemoryIds) {
    const duplicateMemory = await memoryStore.getMemoryById(duplicateMemoryId, {
      userScope: item.userScope,
    });

    if (!duplicateMemory) {
      throw new Error("Curator merge duplicate memory was not found.");
    }

    duplicateMemories.push(duplicateMemory);
  }

  const savedMemory = await memoryStore.upsertMemory({
    memory_id: primaryMemory.memoryId,
    title: item.title,
    content: item.content,
    memory_type: item.memoryType,
    domain: item.domain,
    sensitivity: item.sensitivity,
    importance: primaryMemory.importance,
    source: primaryMemory.source,
    active: true,
    created_at: primaryMemory.createdAt,
    reference_date: item.referenceDate || primaryMemory.referenceDate,
    last_used_at: primaryMemory.lastUsedAt,
  }, {
    userScope: item.userScope,
  });

  for (const duplicateMemory of duplicateMemories) {
    await memoryStore.upsertMemory({
      memory_id: duplicateMemory.memoryId,
      title: duplicateMemory.title,
      content: duplicateMemory.content,
      memory_type: duplicateMemory.memoryType,
      domain: duplicateMemory.domain,
      sensitivity: duplicateMemory.sensitivity,
      importance: duplicateMemory.importance,
      source: duplicateMemory.source,
      active: false,
      created_at: duplicateMemory.createdAt,
      reference_date: duplicateMemory.referenceDate,
      last_used_at: duplicateMemory.lastUsedAt,
    }, {
      userScope: item.userScope,
    });
  }

  let syncWarning = "";

  if (canSyncMemories(config)) {
    try {
      await deletePoints({
        config,
        ids: duplicateMemories.map((memory) => memory.memoryId),
      });
    } catch (error) {
      logger?.warn?.("[memory] Failed to remove merged duplicate memories from Qdrant", {
        memoryIds: duplicateMemories.map((memory) => memory.memoryId),
        error: error?.message || String(error),
      });
      syncWarning = formatMemorySyncWarning(error);
    }

    const syncResult = await safeSyncMemoryToQdrant({
      config,
      memory: savedMemory,
      logger,
    });
    syncWarning = syncWarning || syncResult.errorMessage || "";
  }

  return {
    handled: true,
    savedMemory,
    archivedMemories: duplicateMemories,
    syncWarning,
  };
}

async function applyCuratorArchiveApproval({
  item,
  memoryStore,
  config,
  logger,
}) {
  const action = getCuratorAction(item);

  if (action !== QUIET_ACTION) {
    return {
      handled: false,
      item,
      syncWarning: "",
    };
  }

  const targetMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();

  if (!targetMemoryId) {
    throw new Error("Curator archive suggestion is missing a target memory ID.");
  }

  const existing = await memoryStore.getMemoryById(targetMemoryId, {
    userScope: item.userScope,
  });

  if (!existing) {
    throw new Error("Curator archive target memory was not found.");
  }

  const archivedMemory = await memoryStore.upsertMemory({
    memory_id: existing.memoryId,
    title: existing.title,
    content: existing.content,
    memory_type: existing.memoryType,
    domain: existing.domain,
    sensitivity: existing.sensitivity,
    importance: existing.importance,
    source: existing.source,
    active: false,
    created_at: existing.createdAt,
    reference_date: existing.referenceDate,
    last_used_at: existing.lastUsedAt,
  }, {
    userScope: item.userScope,
  });
  let syncWarning = "";

  if (canSyncMemories(config)) {
    try {
      await deletePoints({
        config,
        ids: [existing.memoryId],
      });
    } catch (error) {
      logger?.warn?.("[memory] Failed to remove archived quiet memory from Qdrant", {
        memoryId: existing.memoryId,
        error: error?.message || String(error),
      });
      syncWarning = formatMemorySyncWarning(error);
    }
  }

  return {
    handled: true,
    archivedMemory,
    syncWarning,
  };
}

async function touchQuietMemoryKeepDecision({
  item,
  memoryStore,
  now = new Date(),
}) {
  if (!isCuratorItem(item) || getCuratorAction(item) !== QUIET_ACTION) {
    return {
      touched: false,
    };
  }

  const targetMemoryId = String(item.sourcePayload?.targetMemoryId || "").trim();

  if (!targetMemoryId) {
    return {
      touched: false,
    };
  }

  const existing = await memoryStore.getMemoryById(targetMemoryId, {
    userScope: item.userScope,
  });

  if (!existing) {
    return {
      touched: false,
    };
  }

  const touchedMemory = await memoryStore.upsertMemory({
    memory_id: existing.memoryId,
    title: existing.title,
    content: existing.content,
    memory_type: existing.memoryType,
    domain: existing.domain,
    sensitivity: existing.sensitivity,
    importance: existing.importance,
    source: existing.source,
    active: existing.active,
    created_at: existing.createdAt,
    updated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    reference_date: existing.referenceDate,
    last_used_at: existing.lastUsedAt,
  }, {
    userScope: item.userScope,
  });

  return {
    touched: true,
    memory: touchedMemory,
  };
}

module.exports = {
  applyCuratorArchiveApproval,
  applyCuratorMemoryUpdate,
  applyCuratorMergeApproval,
  applyCuratorSplitApproval,
  buildEditedSplitSourcePayload,
  getCuratorAction,
  isCuratorItem,
  touchQuietMemoryKeepDecision,
};

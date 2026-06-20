const { normalizeRuntimeSettings } = require("../config/runtimeSettings");
const {
  normalizeAutomationRecord,
  normalizeProactiveActionRecord,
  normalizeJournalEntryRecord,
  SUPPORTED_TRIGGER_TYPES,
} = require("../storage");

const PROACTIVE_ACTION_PACK_TYPE = "proactive_action_pack";
const PROACTIVE_ACTION_PACK_VERSION = 1;
const CONVERSATION_EXPORT_COLUMNS = Object.freeze([
  "id",
  "created_at",
  "guild_id",
  "author_name",
  "source",
  "content_text",
  "channel_name",
  "thread_name",
  "input_types",
  "attachment_count",
]);

function stringifyCsvValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(value);

  if (!/[",\n\r]/u.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
}

function getConversationMetadataField(metadata, key, fallback = "") {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return fallback;
  }

  const value = metadata[key];

  if (Array.isArray(value)) {
    return value.join("|");
  }

  return value === undefined || value === null ? fallback : value;
}

function buildConversationEventsCsv({ events = [] } = {}) {
  const rows = events.map((event) => {
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata
      : {};

    return {
      id: event.id,
      created_at: event.created_at ? new Date(event.created_at).toISOString() : "",
      guild_id: event.guild_id,
      author_name: event.author_name,
      source: event.source,
      content_text: event.content_text,
      channel_name: getConversationMetadataField(metadata, "channelName"),
      thread_name: getConversationMetadataField(metadata, "threadName"),
      input_types: getConversationMetadataField(metadata, "inputTypes"),
      attachment_count: getConversationMetadataField(metadata, "attachmentCount", 0),
    };
  });

  return [
    CONVERSATION_EXPORT_COLUMNS.join(","),
    ...rows.map((row) => CONVERSATION_EXPORT_COLUMNS
      .map((column) => stringifyCsvValue(row[column]))
      .join(",")),
  ].join("\n");
}

function normalizeExportFilenamePart(value, fallback = "conversation") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return normalized || fallback;
}

function buildSortableConversationDatePrefix(value) {
  if (!value) {
    return "unknown-date-000000";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown-date-000000";
  }

  return date.toISOString()
    .replace(/\.\d{3}Z$/u, "")
    .replace("T", "-")
    .replace(/:/gu, "");
}

function buildConversationLogFilename({ conversation = {}, duplicateCount = 0 } = {}) {
  const datePrefix = buildSortableConversationDatePrefix(conversation.firstEventAt);
  const label = normalizeExportFilenamePart(
    conversation.label || conversation.threadName || conversation.channelName || conversation.conversationId,
  );
  const idSuffix = normalizeExportFilenamePart(conversation.conversationId, "unknown").slice(0, 24);
  const duplicateSuffix = duplicateCount > 0 ? `-${duplicateCount + 1}` : "";

  return `${datePrefix}-${label}-${idSuffix}${duplicateSuffix}.txt`;
}

function buildConversationLogIndexCsv({ entries = [] } = {}) {
  const columns = [
    "filename",
    "conversation_id",
    "label",
    "channel_name",
    "thread_name",
    "event_count",
    "message_event_count",
    "first_event_at",
    "last_event_at",
  ];

  return [
    columns.join(","),
    ...entries.map((entry) => columns
      .map((column) => stringifyCsvValue(entry[column]))
      .join(",")),
  ].join("\n");
}

function buildMemoryExportPayload({ config, memories = [] }) {
  return {
    exportedAt: new Date().toISOString(),
    product: "ghostlight",
    memoryCount: memories.length,
    memories: memories.map((memory) => ({
      memoryId: memory.memoryId,
      title: memory.title,
      content: memory.content,
      memoryType: memory.memoryType,
      domain: memory.domain,
      sensitivity: memory.sensitivity,
      source: memory.source,
      active: Boolean(memory.active),
      referenceDate: memory.referenceDate || null,
      createdAt: memory.createdAt || null,
      updatedAt: memory.updatedAt || null,
    })),
  };
}

function buildMemoryImportRecords({ fields, files }) {
  const uploadedFile = files.file || files.memoriesFile || (Array.isArray(files.files) ? files.files[0] : files.files);

  if (!uploadedFile?.content?.trim()) {
    throw new Error("Upload a Ghostlight memory export JSON file.");
  }

  let parsed;

  try {
    parsed = JSON.parse(uploadedFile.content);
  } catch (_error) {
    throw new Error("Memory import file must be valid JSON.");
  }

  const rawMemories = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.memories) ? parsed.memories : []);

  if (!rawMemories.length) {
    throw new Error("No memories were found in that import file.");
  }

  return rawMemories.map((memory) => ({
    memory_id: String(memory.memoryId || memory.memory_id || memory.id || "").trim() || undefined,
    title: String(memory.title || "").trim(),
    content: String(memory.content || memory.text || "").trim(),
    memory_type: String(memory.memoryType || memory.memory_type || "canon").trim().toLowerCase(),
    domain: String(memory.domain || "general").trim(),
    sensitivity: String(memory.sensitivity || "low").trim().toLowerCase(),
    source: String(memory.source || fields.importSource || "memory_import").trim() || "memory_import",
    active: memory.active !== false,
    reference_date: memory.referenceDate || memory.reference_date || "",
    created_at: memory.createdAt || memory.created_at || "",
    updated_at: memory.updatedAt || memory.updated_at || "",
  }));
}

function buildAppStateExportPayload({
  config,
  settings = {},
  automations = [],
  proactiveActions = [],
  journals = [],
  modeDefinitions = [],
  channelAssignments = [],
  heartbeatActions = [],
}) {
  const normalizedProactiveActions = proactiveActions.length
    ? proactiveActions
    : [
      ...automations.map((automation) => ({
        actionId: automation.automationId,
        triggerType: "scheduled",
        name: automation.label,
        actionType: automation.type === "daily_thread"
          ? "daily_thread"
          : automation.type === "journal"
            ? "journal"
            : "message",
        target: automation.channelId,
        prompt: automation.type === "daily_thread" ? (automation.threadStarterPrompt || automation.prompt || "") : automation.prompt,
        enabledTools: Array.isArray(automation.enabledTools) ? automation.enabledTools : [],
        enabled: Boolean(automation.enabled),
        scheduleMode: "daily",
        scheduleTime: automation.scheduleTime,
        scheduleDay: "monday",
        timezone: automation.timezone,
        mentionUser: Boolean(automation.mentionUser),
        threadTitleTemplate: automation.threadTitleTemplate || "",
        threadStarterPrompt: automation.threadStarterPrompt || automation.prompt || "",
        threadModeKey: automation.threadModeKey || "daily",
        lastRunAt: automation.lastRunAt || null,
        lastError: automation.lastError || "",
      })),
      ...heartbeatActions.map((action) => ({
        actionId: action.actionId,
        triggerType: "heartbeat",
        name: action.label,
        actionType: action.executorType === "start_thread"
          ? "thread"
          : action.executorType === "send_journal_prompt"
            ? "journal"
            : "message",
        target: action.targetChannelId || "",
        prompt: action.prompt || "",
        enabledTools: action.executorType === "send_gif" ? ["gif_search"] : [],
        enabled: Boolean(action.enabled),
        frequency: action.frequency || "normal",
        quietHoursAllowed: Boolean(action.quietHoursAllowed),
        mentionUser: Boolean(action.mentionUser),
        isBuiltin: Boolean(action.isBuiltin),
      })),
    ];

  return {
    exportedAt: new Date().toISOString(),
    product: "ghostlight",
    backupType: "app_state",
    userScope: config.memory?.userScope || "",
    guildId: config.discord?.guildId || "",
    settings: Object.entries(settings)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, value]) => ({ key, value })),
    proactiveActions: normalizedProactiveActions.map((action) => ({
      actionId: action.actionId,
      triggerType: action.triggerType,
      name: action.name,
      actionType: action.actionType,
      target: action.target,
      prompt: action.prompt || "",
      enabledTools: Array.isArray(action.enabledTools) ? action.enabledTools : [],
      enabled: Boolean(action.enabled),
      scheduleMode: action.scheduleMode || "daily",
      scheduleTime: action.scheduleTime || "09:00",
      scheduleDay: action.scheduleDay || "monday",
      timezone: action.timezone || config.chat?.timezone || "UTC",
      frequency: action.frequency || "normal",
      quietHoursAllowed: Boolean(action.quietHoursAllowed),
      mentionUser: Boolean(action.mentionUser),
      isBuiltin: Boolean(action.isBuiltin),
      threadTitleTemplate: action.threadTitleTemplate || "",
      threadStarterPrompt: action.threadStarterPrompt || "",
      threadModeKey: action.threadModeKey || "daily",
      lastRunAt: action.lastRunAt || null,
      lastError: action.lastError || "",
    })),
    automations: automations.map((automation) => ({
      automationId: automation.automationId,
      type: automation.type,
      label: automation.label,
      channelId: automation.channelId,
      scheduleTime: automation.scheduleTime,
      timezone: automation.timezone,
      prompt: automation.prompt,
      threadTitleTemplate: automation.threadTitleTemplate || "",
      threadStarterPrompt: automation.threadStarterPrompt || "",
      threadModeKey: automation.threadModeKey || "daily",
      enabled: Boolean(automation.enabled),
      mentionUser: Boolean(automation.mentionUser),
      userId: automation.userId || "",
      lastRunAt: automation.lastRunAt || null,
      lastError: automation.lastError || "",
    })),
    journals: journals.map((entry) => ({
      entryId: entry.entryId,
      automationId: entry.automationId || null,
      channelId: entry.channelId || null,
      guildId: entry.guildId || null,
      title: entry.title,
      content: entry.content,
      createdAt: entry.createdAt || null,
    })),
    channelModes: {
      definitions: modeDefinitions.map((definition) => ({
        modeKey: definition.modeKey,
        label: definition.label,
        instructions: definition.instructions || "",
        chatModel: definition.chatModel || "",
        memoryTypes: Array.isArray(definition.memoryTypes) ? definition.memoryTypes : [],
        memorySensitivity: definition.memorySensitivity || "high",
        includeTimeContext: definition.includeTimeContext || "inherit",
        retrievalSource: definition.retrievalSource || "off",
        retrievalAccess: definition.retrievalAccess || "off",
        heartbeatRole: definition.heartbeatRole || "",
        isBuiltin: Boolean(definition.isBuiltin),
      })),
      assignments: channelAssignments.map((assignment) => ({
        guildId: assignment.guildId,
        channelId: assignment.channelId,
        modeKey: assignment.modeKey,
      })),
    },
    heartbeat: {
      actions: heartbeatActions.map((action) => ({
        actionId: action.actionId,
        label: action.label,
        executorType: action.executorType,
        targetChannelId: action.targetChannelId || "",
        prompt: action.prompt || "",
        frequency: action.frequency || "normal",
        quietHoursAllowed: Boolean(action.quietHoursAllowed),
        mentionUser: Boolean(action.mentionUser),
        tags: Array.isArray(action.tags) ? action.tags : [],
        enabled: Boolean(action.enabled),
        isBuiltin: Boolean(action.isBuiltin),
      })),
    },
  };
}

function normalizePackMetadataField(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeShareableProactiveTarget(action = {}) {
  const target = String(action.target || "").trim();
  const triggerType = String(action.triggerType || "").trim().toLowerCase();

  if (target === "daily" || target === "{{todays_thread}}") {
    return "daily";
  }

  if (triggerType === "scheduled" || triggerType === "heartbeat") {
    return "";
  }

  return target;
}

function normalizeSelectedActionIds(value) {
  const raw = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ""
      ? []
      : [value];

  return Array.from(new Set(
    raw
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function buildProactiveActionPackPayload({
  actions = [],
  metadata = {},
}) {
  return {
    exportedAt: new Date().toISOString(),
    product: "ghostlight",
    packType: PROACTIVE_ACTION_PACK_TYPE,
    version: PROACTIVE_ACTION_PACK_VERSION,
    name: normalizePackMetadataField(metadata.name, "Ghostlight Action Pack"),
    description: normalizePackMetadataField(metadata.description),
    author: normalizePackMetadataField(metadata.author),
    actionCount: actions.length,
    actions: actions.map((action) => {
      const baseRecord = {
        triggerType: action.triggerType,
        name: action.name,
        actionType: action.actionType,
        target: normalizeShareableProactiveTarget(action),
        prompt: action.prompt || "",
        enabledTools: Array.isArray(action.enabledTools) ? action.enabledTools : [],
        enabled: Boolean(action.enabled),
        mentionUser: Boolean(action.mentionUser),
      };

      if (action.triggerType === "scheduled") {
        return {
          ...baseRecord,
          scheduleMode: action.scheduleMode || "daily",
          scheduleTime: action.scheduleTime || "09:00",
          scheduleDay: action.scheduleDay || "monday",
          timezone: action.timezone || "UTC",
        };
      }

      if (action.triggerType === "heartbeat") {
        return {
          ...baseRecord,
          frequency: action.frequency || "normal",
          quietHoursAllowed: Boolean(action.quietHoursAllowed),
        };
      }

      return baseRecord;
    }),
  };
}

function buildProactiveActionPackFilename({ metadata = {}, triggerType = "" } = {}) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const scope = String(triggerType || "actions").trim().toLowerCase() || "actions";
  const name = sanitizeExportPathSegment(metadata.name || "ghostlight-action-pack", "ghostlight-action-pack");
  return `${name}-${scope}-${dateStamp}.json`;
}

function buildProactiveActionImportSummary({ importedCount = 0, skippedWrongType = 0, skippedInvalid = 0, targetSelectionRequired = 0, triggerType = "" }) {
  const typeLabel = triggerType === "scheduled" ? "Schedules" : "Heartbeat";
  const parts = [`Imported ${importedCount} ${importedCount === 1 ? "action" : "actions"}.`];

  if (skippedWrongType) {
    parts.push(`${skippedWrongType} ${skippedWrongType === 1 ? "was" : "were"} skipped because ${skippedWrongType === 1 ? "it belongs" : "they belong"} on ${typeLabel === "Schedules" ? "Heartbeat" : "Schedules"}.`);
  }

  if (skippedInvalid) {
    parts.push(`${skippedInvalid} invalid ${skippedInvalid === 1 ? "action was" : "actions were"} skipped.`);
  }

  if (targetSelectionRequired) {
    parts.push(`${targetSelectionRequired} ${targetSelectionRequired === 1 ? "action needs" : "actions need"} a target set before ${targetSelectionRequired === 1 ? "it can" : "they can"} run.`);
  }

  return parts.join(" ");
}

function buildProactiveActionPackImportRecords({ files, config, triggerType }) {
  const uploadedFile = files.file || files.packFile || (Array.isArray(files.files) ? files.files[0] : files.files);

  if (!uploadedFile?.content?.trim()) {
    throw new Error("Upload a Ghostlight action pack JSON file.");
  }

  let parsed;

  try {
    parsed = JSON.parse(uploadedFile.content);
  } catch (_error) {
    throw new Error("Action pack file must be valid JSON.");
  }

  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];

  if (!rawActions.length) {
    throw new Error("No actions were found in that pack.");
  }

  const acceptedTriggerType = String(triggerType || "").trim().toLowerCase();

  if (!SUPPORTED_TRIGGER_TYPES.includes(acceptedTriggerType)) {
    throw new Error("Unsupported proactive pack import target.");
  }

  const importRecords = [];
  let skippedWrongType = 0;
  let skippedInvalid = 0;
  let targetSelectionRequired = 0;

  for (const action of rawActions) {
    if (!action || typeof action !== "object") {
      skippedInvalid += 1;
      continue;
    }

    const actionTriggerType = String(action.triggerType || "").trim().toLowerCase();

    if (actionTriggerType !== acceptedTriggerType) {
      skippedWrongType += 1;
      continue;
    }

    try {
      const normalized = normalizeProactiveActionRecord({
        triggerType: actionTriggerType,
        name: action.name,
        actionType: action.actionType,
        target: action.target,
        prompt: action.prompt || "",
        enabledTools: action.enabledTools || [],
        enabled: false,
        mentionUser: action.mentionUser,
        scheduleMode: action.scheduleMode || "daily",
        scheduleTime: action.scheduleTime || "09:00",
        scheduleDay: action.scheduleDay || "monday",
        timezone: action.timezone || config.chat?.timezone || "UTC",
        frequency: action.frequency || "normal",
        quietHoursAllowed: action.quietHoursAllowed,
      }, {
        userScope: config.memory?.userScope || "",
        timezone: config.chat?.timezone || "UTC",
      });

      if (actionTriggerType === "heartbeat" && !String(normalized.target || "").trim()) {
        targetSelectionRequired += 1;
      }

      importRecords.push(normalized);
    } catch (_error) {
      skippedInvalid += 1;
    }
  }

  if (!importRecords.length && !skippedWrongType && !skippedInvalid) {
    throw new Error("No importable actions were found in that pack.");
  }

  return {
    metadata: {
      name: normalizePackMetadataField(parsed?.name, "Ghostlight Action Pack"),
      description: normalizePackMetadataField(parsed?.description),
      author: normalizePackMetadataField(parsed?.author),
      version: Number(parsed?.version) || PROACTIVE_ACTION_PACK_VERSION,
      exportedAt: parsed?.exportedAt || null,
    },
    records: importRecords,
    skippedWrongType,
    skippedInvalid,
    targetSelectionRequired,
  };
}

function getExtensionForMimeType(mimeType = "") {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "png";
}

function sanitizeExportPathSegment(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildImageExportFilename(image) {
  const date = new Date(image.createdAt || "");
  const dateStamp = Number.isNaN(date.getTime())
    ? "unknown-date"
    : date.toISOString().slice(0, 10);
  const extension = getExtensionForMimeType(image.mimeType);
  return `${dateStamp}-${sanitizeExportPathSegment(image.imageId, "image")}.${extension}`;
}

function normalizeImportedSettingsEntries(rawSettings) {
  if (Array.isArray(rawSettings)) {
    return rawSettings
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        key: String(item.key || "").trim(),
        value: item.value,
      }))
      .filter((item) => item.key);
  }

  if (rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)) {
    return Object.entries(rawSettings)
      .map(([key, value]) => ({
        key: String(key || "").trim(),
        value,
      }))
      .filter((item) => item.key);
  }

  return [];
}

function buildAppStateImportRecords({ files, config }) {
  const uploadedFile = files.file || files.appStateFile || (Array.isArray(files.files) ? files.files[0] : files.files);

  if (!uploadedFile?.content?.trim()) {
    throw new Error("Upload a Ghostlight app data export JSON file.");
  }

  let parsed;

  try {
    parsed = JSON.parse(uploadedFile.content);
  } catch (_error) {
    throw new Error("App data import file must be valid JSON.");
  }

  const rawSettings = normalizeImportedSettingsEntries(parsed?.settings);
  const rawProactiveActions = Array.isArray(parsed?.proactiveActions) ? parsed.proactiveActions : [];
  const rawAutomations = Array.isArray(parsed?.automations) ? parsed.automations : [];
  const rawJournals = Array.isArray(parsed?.journals)
    ? parsed.journals
    : (Array.isArray(parsed?.journalEntries) ? parsed.journalEntries : []);
  const rawDefinitions = Array.isArray(parsed?.channelModes?.definitions) ? parsed.channelModes.definitions : [];
  const rawAssignments = Array.isArray(parsed?.channelModes?.assignments) ? parsed.channelModes.assignments : [];
  const rawHeartbeatActions = Array.isArray(parsed?.heartbeat?.actions) ? parsed.heartbeat.actions : [];

  if (!rawSettings.length && !rawProactiveActions.length && !rawAutomations.length && !rawJournals.length && !rawDefinitions.length && !rawAssignments.length && !rawHeartbeatActions.length) {
    throw new Error("No app data was found in that import file.");
  }

  const settings = normalizeRuntimeSettings(Object.fromEntries(
    rawSettings
      .filter((item) => item && typeof item === "object")
      .map((item) => [String(item.key || "").trim(), item.value]),
  ));

  const proactiveActions = rawProactiveActions
    .filter((action) => action && typeof action === "object")
    .map((action) => normalizeProactiveActionRecord({
      actionId: action.actionId || action.action_id,
      triggerType: action.triggerType || action.trigger_type,
      name: action.name || action.label,
      actionType: action.actionType || action.action_type,
      target: action.target,
      prompt: action.prompt || "",
      enabledTools: action.enabledTools || action.enabled_tools || [],
      enabled: action.enabled,
      scheduleMode: action.scheduleMode || action.schedule_mode || "daily",
      scheduleTime: action.scheduleTime || action.schedule_time || "09:00",
      scheduleDay: action.scheduleDay || action.schedule_day || "monday",
      timezone: action.timezone || config.chat?.timezone || "UTC",
      frequency: action.frequency || "normal",
      quietHoursAllowed: action.quietHoursAllowed ?? action.quiet_hours_allowed,
      mentionUser: action.mentionUser ?? action.mention_user,
      isBuiltin: action.isBuiltin ?? action.is_builtin,
      threadTitleTemplate: action.threadTitleTemplate || action.thread_title_template || "",
      threadStarterPrompt: action.threadStarterPrompt || action.thread_starter_prompt || "",
      threadModeKey: action.threadModeKey || action.thread_mode_key || "daily",
      lastRunAt: action.lastRunAt || action.last_run_at || "",
      lastError: action.lastError || action.last_error || "",
    }, {
      userScope: config.memory?.userScope || "",
      timezone: config.chat?.timezone || "UTC",
    }));

  const automations = rawAutomations.map((automation) => normalizeAutomationRecord({
    automationId: automation.automationId || automation.automation_id,
    type: automation.type,
    label: automation.label,
    channelId: automation.channelId || automation.channel_id,
    scheduleTime: automation.scheduleTime || automation.schedule_time,
    timezone: automation.timezone || config.chat?.timezone || "UTC",
    prompt: automation.prompt || "",
    threadTitleTemplate: automation.threadTitleTemplate || automation.thread_title_template || "",
    threadStarterPrompt: automation.threadStarterPrompt || automation.thread_starter_prompt || "",
    threadModeKey: automation.threadModeKey || automation.thread_mode_key || "daily",
    enabled: automation.enabled,
    mentionUser: automation.mentionUser ?? automation.mention_user,
    userId: automation.userId || automation.user_id || "",
    lastRunAt: automation.lastRunAt || automation.last_run_at || "",
    lastError: automation.lastError || automation.last_error || "",
  }, {
    userScope: config.memory?.userScope || "",
    timezone: config.chat?.timezone || "UTC",
  }));

  const journals = rawJournals.map((entry) => normalizeJournalEntryRecord({
    entryId: entry.entryId || entry.entry_id,
    automationId: entry.automationId || entry.automation_id,
    channelId: entry.channelId || entry.channel_id,
    guildId: entry.guildId || entry.guild_id || config.discord?.guildId || "",
    title: entry.title,
    content: entry.content,
    createdAt: entry.createdAt || entry.created_at,
  }, {
    userScope: config.memory?.userScope || "",
  }));

  const channelModeDefinitions = rawDefinitions
    .filter((definition) => definition && typeof definition === "object")
    .map((definition) => ({
      modeKey: definition.modeKey || definition.mode_key || definition.key,
      label: definition.label,
      instructions: definition.instructions || definition.promptBlock || definition.prompt_block || definition.prompt || "",
      chatModel: definition.chatModel || definition.chat_model || definition.model || "",
      memoryTypes: definition.memoryTypes || definition.memory_types || [],
      memorySensitivity: definition.memorySensitivity || definition.memory_sensitivity || "high",
      includeTimeContext: definition.includeTimeContext || definition.include_time_context || "inherit",
      retrievalSource: definition.retrievalSource || definition.retrieval_source || "off",
      retrievalAccess: definition.retrievalAccess || definition.retrieval_access || "off",
      heartbeatRole: definition.heartbeatRole || definition.heartbeat_role || "",
      isBuiltin: Boolean(definition.isBuiltin || definition.is_builtin),
    }));

  const channelModeAssignments = rawAssignments
    .filter((assignment) => assignment && typeof assignment === "object")
    .map((assignment) => ({
      guildId: String(assignment.guildId || assignment.guild_id || config.discord?.guildId || "").trim(),
      channelId: String(assignment.channelId || assignment.channel_id || "").trim(),
      modeKey: String(assignment.modeKey || assignment.mode_key || "").trim(),
    }))
    .filter((assignment) => assignment.guildId && assignment.channelId && assignment.modeKey);

  const heartbeatActions = rawHeartbeatActions
    .filter((action) => action && typeof action === "object")
    .map((action) => ({
      actionId: action.actionId || action.action_id,
      label: action.label,
      executorType: action.executorType || action.executor_type,
      targetChannelId: action.targetChannelId || action.target_channel_id || "",
      prompt: action.prompt || "",
      frequency: action.frequency || "normal",
      quietHoursAllowed: action.quietHoursAllowed ?? action.quiet_hours_allowed,
      mentionUser: action.mentionUser ?? action.mention_user,
      tags: action.tags || [],
      enabled: action.enabled,
      isBuiltin: Boolean(action.isBuiltin || action.is_builtin),
    }));

  return {
    settings,
    proactiveActions,
    automations,
    journals,
    channelModeDefinitions,
    channelModeAssignments,
    heartbeatActions,
  };
}

module.exports = {
  buildMemoryExportPayload,
  buildMemoryImportRecords,
  buildAppStateExportPayload,
  buildAppStateImportRecords,
  buildProactiveActionPackPayload,
  buildProactiveActionPackFilename,
  buildProactiveActionPackImportRecords,
  buildProactiveActionImportSummary,
  normalizeSelectedActionIds,
  buildImageExportFilename,
  buildConversationEventsCsv,
  buildConversationLogFilename,
  buildConversationLogIndexCsv,
  stringifyCsvValue,
  PROACTIVE_ACTION_PACK_TYPE,
  PROACTIVE_ACTION_PACK_VERSION,
};

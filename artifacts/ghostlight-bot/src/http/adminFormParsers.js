const crypto = require("node:crypto");
const { parseSummarySourceNote } = require("../memory/importSummarySources");
const {
  parseRuntimeSettingsForm,
  parseHeartbeatRuntimeSettingsForm,
} = require("./adminSettingsParsers");
const {
  SUPPORTED_PROACTIVE_TOOLS,
  SUPPORTED_SCHEDULE_DAYS,
} = require("../storage");

function buildImportRecordFromForm({ fields, files }) {
  const file = files.file || (Array.isArray(files.files) ? files.files[0] : files.files);

  if (file?.content?.trim()) {
    const hasFrontmatter = file.content.startsWith("---\n");
    const parsed = parseSummarySourceNote(file.content, file.filename || "upload.txt");

    return {
      ...parsed,
      label: hasFrontmatter
        ? (parsed.label || fields.sourceLabel || fields.conversationLabel || "Manual import")
        : (fields.sourceLabel || fields.conversationLabel || parsed.label || "Manual import"),
      date: parsed.date || fields.summaryDate || "",
      metadata: {
        ...parsed.metadata,
        conversationLabel: parsed.metadata?.conversationLabel || fields.conversationLabel || "",
        sourceLabel: parsed.metadata?.sourceLabel || fields.sourceLabel || "",
      },
    };
  }

  const text = String(fields.text || "").trim();

  if (!text) {
    throw new Error("Provide either pasted text or an uploaded .md/.txt file.");
  }

  return {
    sourceId: crypto.randomUUID(),
    label: fields.sourceLabel || fields.conversationLabel || "Manual import",
    text,
    date: fields.summaryDate || "",
    metadata: {
      conversationLabel: fields.conversationLabel || "",
      sourceLabel: fields.sourceLabel || "",
    },
    sourcePath: "admin-form",
  };
}

function buildWeeklyImportSourcesFromForm({ fields, files }) {
  const uploadedFiles = files.files
    ? (Array.isArray(files.files) ? files.files : [files.files])
    : [];

  if (uploadedFiles.length) {
    return uploadedFiles
      .filter((file) => file?.content?.trim())
      .map((file) => {
        const parsed = parseSummarySourceNote(file.content, file.filename || "upload.txt");
        const hasFrontmatter = file.content.startsWith("---\n");

        return {
          ...parsed,
          label: hasFrontmatter
            ? (parsed.label || fields.sourceLabel || "Weekly import")
            : (fields.sourceLabel || parsed.label || "Weekly import"),
          metadata: {
            ...parsed.metadata,
            sourceLabel: parsed.metadata?.sourceLabel || fields.sourceLabel || "",
          },
        };
      });
  }

  const text = String(fields.weeklyText || fields.text || "").trim();

  if (!text) {
    throw new Error("Provide weekly source text or upload one or more .md/.txt files.");
  }

  return [{
    sourceId: crypto.randomUUID(),
    label: fields.sourceLabel || "Weekly import",
    text,
    date: "",
    metadata: {
      sourceLabel: fields.sourceLabel || "",
    },
    sourcePath: "admin-weekly-form",
  }];
}

function parseMemoryForm(fields) {
  return {
    memoryId: String(fields.memoryId || "").trim(),
    title: String(fields.title || "").trim(),
    content: String(fields.content || "").trim(),
    memoryType: String(fields.memoryType || "").trim().toLowerCase(),
    domain: String(fields.domain || "").trim(),
    sensitivity: String(fields.sensitivity || "").trim().toLowerCase(),
  };
}

function parseSettingsForm(fields) {
  return parseRuntimeSettingsForm(fields);
}

function parseAutomationForm(fields) {
  const enabledState = String(fields.enabledState || "").trim().toLowerCase();

  return {
    automationId: String(fields.automationId || "").trim(),
    type: String(fields.type || "").trim().toLowerCase(),
    label: String(fields.label || "").trim(),
    channel_id: String(fields.channelId || "").trim(),
    schedule_time: String(fields.scheduleTime || "").trim(),
    timezone: String(fields.timezone || "").trim(),
    prompt: String(fields.prompt || "").trim(),
    thread_title_template: String(fields.threadTitleTemplate || "").trim(),
    thread_starter_prompt: String(fields.threadStarterPrompt || "").trim(),
    thread_mode_key: String(fields.threadModeKey || "").trim(),
    enabled: enabledState
      ? enabledState === "enabled"
      : (fields.enabled === "on" || fields.enabled === "true" || fields.enabled === "1"),
    mention_user: fields.mentionUser === "on" || fields.mentionUser === "true" || fields.mentionUser === "1",
    user_id: String(fields.userId || "").trim(),
  };
}

function parseProactiveTools(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return Array.from(new Set(raw
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => SUPPORTED_PROACTIVE_TOOLS.includes(item))));
}

function parseProactiveActionForm(fields, { triggerType }) {
  const enabledTools = parseProactiveTools(fields.enabledTools);
  const enabledState = String(fields.enabledState || "").trim().toLowerCase();
  const scheduleMode = String(fields.scheduleMode || "daily").trim().toLowerCase();
  const scheduleDay = String(fields.scheduleDay || "monday").trim().toLowerCase();

  return {
    actionId: String(fields.actionId || "").trim(),
    triggerType,
    name: String(fields.name || "").trim(),
    actionType: String(fields.actionType || "message").trim().toLowerCase(),
    target: String(fields.target || "").trim(),
    prompt: String(fields.prompt || "").trim(),
    enabledTools,
    enabled: enabledState
      ? enabledState === "enabled"
      : (fields.enabled === "on" || fields.enabled === "true" || fields.enabled === "1"),
    mentionUser: fields.mentionUser === "on" || fields.mentionUser === "true" || fields.mentionUser === "1",
    scheduleMode,
    scheduleTime: String(fields.scheduleTime || "").trim(),
    scheduleDay: SUPPORTED_SCHEDULE_DAYS.includes(scheduleDay) ? scheduleDay : "monday",
    frequency: String(fields.frequency || "normal").trim().toLowerCase(),
    quietHoursAllowed: fields.quietHoursAllowed === "on" || fields.quietHoursAllowed === "true" || fields.quietHoursAllowed === "1",
  };
}

function parseDailyThreadSettingsForm(fields) {
  const relevantFields = [
    "dailyThreadEnabled",
    "dailyThreadChannelId",
    "dailyThreadScheduleTime",
    "dailyThreadTitleTemplate",
    "dailyThreadStarterPrompt",
    "enabledTools",
  ];

  if (!relevantFields.some((fieldName) => Object.prototype.hasOwnProperty.call(fields, fieldName))) {
    return null;
  }

  return {
    enabled: fields.dailyThreadEnabled === "on",
    channelId: String(fields.dailyThreadChannelId || "").trim(),
    scheduleTime: String(fields.dailyThreadScheduleTime || "").trim() || "09:00",
    threadTitleTemplate: String(fields.dailyThreadTitleTemplate || "").trim() || "MMM-DD [Day] - Daily Thread",
    threadStarterPrompt: String(fields.dailyThreadStarterPrompt || "").trim(),
    enabledTools: parseProactiveTools(fields.enabledTools),
  };
}

function parseHeartbeatSettingsForm(fields) {
  return parseHeartbeatRuntimeSettingsForm(fields);
}

function parseHeartbeatActionForm(fields) {
  const targetSelector = String(fields.targetSelector || "").trim();

  return {
    actionId: String(fields.actionId || "").trim(),
    targetChannelId: targetSelector,
    prompt: String(fields.prompt || "").trim(),
    frequency: String(fields.frequency || "").trim().toLowerCase(),
    mentionUser: fields.mentionUser === "true",
    quietHoursAllowed: fields.quietHoursAllowed === "true",
    enabled: fields.enabled === "true",
  };
}

function sortMemories(memories, sortKey = "updatedAt", sortDirection = "desc") {
  const directionMultiplier = sortDirection === "asc" ? 1 : -1;

  return [...memories].sort((left, right) => {
    let comparison = 0;

    if (sortKey === "title") {
      comparison = String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" });
    } else if (sortKey === "memoryType") {
      comparison = String(left.memoryType || "").localeCompare(String(right.memoryType || ""), undefined, { sensitivity: "base" });
    } else if (sortKey === "domain") {
      comparison = String(left.domain || "").localeCompare(String(right.domain || ""), undefined, { sensitivity: "base" });
    } else {
      const leftTime = Date.parse(left.updatedAt || "") || 0;
      const rightTime = Date.parse(right.updatedAt || "") || 0;
      comparison = leftTime - rightTime;
    }

    if (comparison === 0) {
      comparison = String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" });
    }

    return comparison * directionMultiplier;
  });
}

module.exports = {
  buildImportRecordFromForm,
  buildWeeklyImportSourcesFromForm,
  parseMemoryForm,
  parseSettingsForm,
  parseAutomationForm,
  parseProactiveActionForm,
  parseDailyThreadSettingsForm,
  parseHeartbeatSettingsForm,
  parseHeartbeatActionForm,
  sortMemories,
};

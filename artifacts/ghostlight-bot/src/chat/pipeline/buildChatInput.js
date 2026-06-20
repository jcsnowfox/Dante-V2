const { sanitizeStoredText, scrubProviderRefusalLines } = require("./providerRefusal");

function formatRecentHistory(recentHistory, options = {}) {
  if (!recentHistory.length) {
    return "None";
  }

  const renderHistoryText = options.buildHistoryText || buildHistoryText;

  return recentHistory
    .map((item, index) => `${index + 1}. ${renderHistoryText(item)}`)
    .join("\n");
}

function buildHistoryText(item) {
  const metadata = item.metadata || {};
  const baseAuthor = item.authorName || item.author?.username || item.role || "unknown";
  const heartbeatLabel = metadata.actionLabel || metadata.actionId || metadata.executorType || "Heartbeat action";
  const automationLabel = metadata.automationLabel || metadata.automationType || metadata.automationId || "scheduled automation";
  const content = sanitizeStoredText(String(item.content || item.text || "").trim());

  if (metadata.heartbeat) {
    return `Proactive action triggered: ${heartbeatLabel}\nFrom: ${baseAuthor}\nContent: ${content}`;
  }

  if (metadata.automationId || metadata.automationType) {
    return `Scheduled automation triggered: ${automationLabel}\nFrom: ${baseAuthor}\nContent: ${content}`;
  }

  return `${baseAuthor}: ${content}`;
}

function buildHistoryRole(item) {
  if (item.role === "user" || item.role === "assistant") {
    return item.role;
  }

  if (typeof item.isBot === "boolean") {
    return item.isBot ? "assistant" : "user";
  }

  return "user";
}

function buildStructuredHistoryText(item, options = {}) {
  const metadata = item.metadata || {};
  const content = sanitizeStoredText(String(item.content || item.text || "").trim());
  const authorName = String(item.authorName || item.author?.username || "").trim();
  const role = buildHistoryRole(item);

  if (metadata.heartbeat || metadata.automationId || metadata.automationType) {
    return buildHistoryText(item);
  }

  const speakerPrefix = options.includeSpeakerNames && role === "user" && authorName
    ? `${authorName}: `
    : "";

  return `${speakerPrefix}${content}`;
}

function buildHistoryMessages(recentHistory = [], options = {}) {
  return recentHistory
    .filter((item) => String(item.content || item.text || "").trim())
    .map((item) => ({
      role: buildHistoryRole(item),
      content: [
        {
          type: "input_text",
          text: buildStructuredHistoryText(item, options),
        },
      ],
    }));
}

function formatMemoryLine(memory, index) {
  if (typeof memory === "string") {
    return `${index + 1}. ${sanitizeStoredText(memory)}`;
  }

  const referenceDate = memory.referenceDate || memory.reference_date;
  const dateNote = referenceDate ? ` (date: ${referenceDate})` : "";
  const title = memory.title ? `${memory.title}: ` : "";
  const body = sanitizeStoredText(memory.content || memory.text || JSON.stringify(memory));
  return `${index + 1}.${dateNote} ${title}${body}`;
}

function formatMemorySection(label, items) {
  if (!items.length) {
    return `${label}:\nNone`;
  }

  return `${label}:\n${items.map((memory, index) => formatMemoryLine(memory, index)).join("\n")}`;
}

function formatMemories(memories) {
  if (!memories.length) {
    return [
      "Memories:\nNone",
      "Recent Memory:\nNone",
      "Long-term Memory:\nNone",
    ].join("\n\n");
  }

  const canonMemories = memories.filter((memory) => {
    const memoryType = typeof memory === "string" ? "" : (memory.memoryType || memory.memory_type || "");
    return ["anchor", "canon", "resolved"].includes(memoryType);
  });

  const recentMemories = memories.filter((memory) => {
    const memoryType = typeof memory === "string" ? "" : (memory.memoryType || memory.memory_type || "");
    return memoryType === "timeline_daily";
  });

  const longTermMemories = memories.filter((memory) => {
    const memoryType = typeof memory === "string" ? "" : (memory.memoryType || memory.memory_type || "");
    return memoryType === "timeline_weekly";
  });

  const roleplayMemories = memories.filter((memory) => {
    const memoryType = typeof memory === "string" ? "" : (memory.memoryType || memory.memory_type || "");
    return memoryType === "roleplay";
  });

  const sections = [
    formatMemorySection("Memories", canonMemories),
  ];

  if (roleplayMemories.length) {
    sections.push(formatMemorySection("Roleplay Context", roleplayMemories));
  }

  sections.push(formatMemorySection("Recent Memory", recentMemories));
  sections.push(formatMemorySection("Long-term Memory", longTermMemories));

  return sections.join("\n\n");
}

function formatTimestamp(value, timeZone = "UTC") {
  const date = new Date(value);

  return `${date.toISOString()} (${date.toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone,
  })})`;
}

function buildInternalContextText({
  contextSections = [],
  memories = [],
  totalToolCount = 0,
}) {
  const parts = [
    "Internal context for the next reply only.",
    "The user did not write or paste this context. Do not describe it as something the user said.",
  ];

  const sections = contextSections
    .filter((section) => section?.label && String(section.content || "").trim())
    .map((section) => `${section.label}:\n${scrubProviderRefusalLines(String(section.content).trim())}`);

  if (sections.length) {
    parts.push(...sections);
  }

  if (memories.length) {
    parts.push(`Relevant context for your response:\n${formatMemories(memories)}`);
  }

  parts.push(`Available tool count: ${totalToolCount}`);

  return parts.join("\n\n");
}

function buildCurrentInputMessage({ input, automation = null, includeSpeakerNames = false }) {
  const parts = [];
  const authorName = String(input.authorName || "").trim();
  const content = String(input.content || "").trim();

  if (automation) {
    parts.push("Automation trigger:");
  }

  parts.push(includeSpeakerNames && authorName ? `${authorName}: ${content}` : content);

  return {
    role: "user",
    content: [
      {
        type: "input_text",
        text: parts.join("\n\n"),
      },
    ],
  };
}

function buildChatInput({
  input,
  recentHistory = [],
  automation = null,
  includeTimeContext = true,
  includeSpeakerNames = false,
  timeZone = "UTC",
}) {
  return [
    ...buildHistoryMessages(recentHistory, {
      includeSpeakerNames,
    }),
    buildCurrentInputMessage({
      input: {
        ...input,
        includeTimeContext,
        timeZone,
      },
      automation,
      includeSpeakerNames,
    }),
  ];
}

module.exports = {
  buildChatInput,
  buildInternalContextText,
  buildHistoryText,
  formatMemories,
  formatRecentHistory,
  formatTimestamp,
};

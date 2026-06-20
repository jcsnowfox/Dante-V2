const { getLlmClient, hasLlmApiKey, resolveSummaryModel } = require("../llm/client");
const { SUPPORTED_MEMORY_DOMAINS } = require("../memory/domains");

function buildDailySummaryPrompt(eventsAsText, summaryDate, { personaName = "AI companion", userLabel = "Human user" } = {}) {
  return [
    `You are generating a daily timeline log from a chat transcript between ${personaName} (AI) and ${userLabel} (Human).`,
    "Create a compact, retrieval-friendly timeline log that supports factual recall, semantic search, and future continuity.",
    "Write with clarity, specificity, and strong signal density.",
    `Keep ${userLabel} as the primary subject of the summary, with ${personaName} included only where relevant to the user's day, context, or support.`,
    "Focus on concrete details that will be useful to retrieve later: people, projects, places, routines, decisions, stressors, preferences, notable events, emotional tone, and continuity context.",
    `This summary may later be used to extract memories in domains such as: ${SUPPORTED_MEMORY_DOMAINS.join(", ")}.`,
    "Favour details that are clearly supported by the transcript. Where something is uncertain or only loosely implied, simply leave it out.",
    "Write the Snapshot as 2-3 concise paragraphs, totalling roughly 100-200 words. Capture the overall shape of the day in plain, direct language.",
    "Prioritise the main activities, important conversations, notable projects, emotional tone, energy or context where relevant, and links between different threads of the day.",
    "Keep the writing concrete, compact, and easy to scan. Use the exact template below. Include the ISO date in the heading exactly as shown.",
    "Output only the completed timeline log.",
    "",
    "Template to output:",
    "",
    `## Snapshot — ${summaryDate}`,
    "<text>",
    "",
    "Conversation log:",
    eventsAsText,
  ].join("\n");
}

function buildDetailedDailySummaryPrompt(eventsAsText, summaryDate, { personaName = "AI companion", userLabel = "Human user" } = {}) {
  return [
    `You are generating a detailed continuity note from a daily chat transcript between ${personaName} (AI) and ${userLabel} (Human).`,
    "",
    "Your goal is to preserve the most useful texture and continuity from the day so a later weekly summary can be generated without needing the full raw transcript.",
    "This note is internal working material. It should be richer and more detailed than the short daily snapshot, but still grounded, concise, and readable.",
    "The human user's life, context, events, and needs are the primary subject of this summary.",
    "",
    "Rules:",
    "* Output ONLY the continuity note in the exact template below.",
    "* Keep it under about 900 words.",
    "* Use plain, direct language.",
    "* Stay faithful to the transcript. Do not invent details.",
    "* Keep the note general and useful for future continuity. Do not force it into rigid categories or a prescribed schema.",
    "* Capture specific threads, concerns, projects, shifts, and moments that seem likely to matter later.",
    "* It is fine to include emotional tone, uncertainty, interpersonal context, and repeated motifs where clearly supported.",
    "* Avoid poetic recap, generic life lessons, and empty abstraction.",
    "",
    "What to preserve:",
    "* the main threads of the day",
    "* meaningful practical movement or decisions",
    "* recurring concerns, relationships, or pressures",
    "* notable emotional or energy shifts",
    "* anything that feels likely to matter when understanding the week as a whole",
    "",
    "Template to output:",
    "",
    `## Continuity Note — ${summaryDate}`,
    "<text>",
    "",
    "Conversation log:",
    eventsAsText,
  ].join("\n");
}

function parseDailySummaryText(summaryText, summaryDate) {
  const trimmed = String(summaryText || "").trim();
  const headingPattern = new RegExp(`^##\\s+Snapshot\\s+[—-]\\s+${summaryDate}\\s*\\n?`, "i");
  const content = trimmed.replace(headingPattern, "").trim();

  if (!content) {
    throw new Error("Daily summary did not include usable snapshot content.");
  }

  return {
    title: `Snapshot — ${summaryDate}`,
    content,
    text: trimmed,
    domain: "timeline",
    sensitivity: "low",
    needsDomainReview: false,
  };
}

async function generateDailySummary({
  config,
  client: providedClient,
  transcript,
  summaryDate,
}) {
  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to generate a daily summary.");
  }

  const client = providedClient || getLlmClient(config, "summary");
  const response = await client.responses.create({
    model: resolveSummaryModel(config),
    input: buildDailySummaryPrompt(transcript, summaryDate, {
      personaName: config.chat?.promptBlocks?.personaName || "AI companion",
      userLabel: config.chat?.promptBlocks?.userName || config.memory?.userScope || "Human user",
    }),
  });

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("Summary model returned no text.");
  }

  return parseDailySummaryText(text, summaryDate);
}

function parseDetailedDailySummaryText(summaryText, summaryDate) {
  const trimmed = String(summaryText || "").trim();
  const headingPattern = new RegExp(`^##\\s+Continuity Note\\s+[—-]\\s+${summaryDate}\\s*\\n?`, "i");
  const content = trimmed.replace(headingPattern, "").trim();

  if (!content) {
    throw new Error("Detailed daily summary did not include usable continuity content.");
  }

  return {
    title: `Continuity Note — ${summaryDate}`,
    content,
    text: trimmed,
  };
}

async function generateDetailedDailySummary({
  config,
  client: providedClient,
  transcript,
  summaryDate,
}) {
  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to generate a detailed daily summary.");
  }

  const client = providedClient || getLlmClient(config, "summary");
  const response = await client.responses.create({
    model: resolveSummaryModel(config),
    input: buildDetailedDailySummaryPrompt(transcript, summaryDate, {
      personaName: config.chat?.promptBlocks?.personaName || "AI companion",
      userLabel: config.chat?.promptBlocks?.userName || config.memory?.userScope || "Human user",
    }),
  });

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("Detailed daily summary model returned no text.");
  }

  return parseDetailedDailySummaryText(text, summaryDate);
}

module.exports = {
  buildDailySummaryPrompt,
  buildDetailedDailySummaryPrompt,
  parseDailySummaryText,
  parseDetailedDailySummaryText,
  generateDailySummary,
  generateDetailedDailySummary,
};

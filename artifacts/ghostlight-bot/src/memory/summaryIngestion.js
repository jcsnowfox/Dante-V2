const crypto = require("node:crypto");
const { generateDailySummary } = require("../conversations/dailySummary");
const { generateWeeklySummary } = require("../conversations/summarizeWeekly");
const { isSupportedMemoryDomain } = require("./domains");

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

function createReviewFlags(item, extraFlags = []) {
  const flags = [];

  if (item.needsDomainReview || !isSupportedMemoryDomain(item.domain)) {
    flags.push("domain_review_required");
  }

  for (const flag of extraFlags) {
    if (flag && !flags.includes(flag)) {
      flags.push(flag);
    }
  }

  return flags;
}

function buildGeneratedMemoryRecords({ sourceKind, sourceRef, groupingKey, userScope, generated, sourcePayload, reviewFlags = [] }) {
  const referenceDate = sourcePayload?.summaryDate || null;
  const timelineDaily = {
    generated_memory_id: stableUuid(`${sourceKind}:${groupingKey}:timeline_daily`),
    staged_memory_id: stableUuid(`${sourceKind}:${groupingKey}:timeline_daily`),
    source_kind: sourceKind,
    source_ref: sourceRef,
    grouping_key: groupingKey,
    dedupeKey: "timeline_daily",
    title: generated.timelineDaily.title,
    content: generated.timelineDaily.content,
    memory_type: "timeline_daily",
    domain: isSupportedMemoryDomain(generated.timelineDaily.domain) ? generated.timelineDaily.domain : "timeline",
    sensitivity: generated.timelineDaily.sensitivity,
    status: "proposed",
    review_flags: createReviewFlags(generated.timelineDaily, reviewFlags),
    source_payload: sourcePayload,
    user_scope: userScope,
    reference_date: referenceDate,
  };

  return [timelineDaily];
}

function buildGeneratedWeeklyMemoryRecord({ sourceKind, sourceRef, groupingKey, userScope, generated, sourcePayload, reviewFlags = [] }) {
  const referenceDate = sourcePayload?.weekEndDate || sourcePayload?.endDate || null;

  return [{
    generated_memory_id: stableUuid(`${sourceKind}:${groupingKey}:timeline_weekly`),
    staged_memory_id: stableUuid(`${sourceKind}:${groupingKey}:timeline_weekly`),
    source_kind: sourceKind,
    source_ref: sourceRef,
    grouping_key: groupingKey,
    dedupeKey: "timeline_weekly",
    title: generated.timelineWeekly.title,
    content: generated.timelineWeekly.content,
    memory_type: "timeline_weekly",
    domain: isSupportedMemoryDomain(generated.timelineWeekly.domain) ? generated.timelineWeekly.domain : "timeline",
    sensitivity: generated.timelineWeekly.sensitivity,
    status: "proposed",
    review_flags: createReviewFlags(generated.timelineWeekly, reviewFlags),
    source_payload: sourcePayload,
    user_scope: userScope,
    reference_date: referenceDate,
  }];
}

async function generateSummaryArtifacts({
  config,
  client: providedClient,
  groupingLabel,
  sources,
}) {
  if (!sources.length) {
    throw new Error("At least one source is required to generate summary artifacts.");
  }

  const summaryDate = sources[0]?.date || null;

  if (!summaryDate) {
    throw new Error("A summary date is required to generate timeline_daily artifacts.");
  }

  const transcript = sources
    .map((source, index) => {
      const parts = [
        `Source ${index + 1}`,
        `Label: ${source.label}`,
      ];

      if (source.date) {
        parts.push(`Date: ${source.date}`);
      }

      if (source.metadata && Object.keys(source.metadata).length) {
        parts.push(`Metadata: ${JSON.stringify(source.metadata)}`);
      }

      parts.push(`Text:\n${source.text}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const generated = await generateDailySummary({
    config,
    client: providedClient,
    transcript: [
      `Grouping label: ${groupingLabel}`,
      "",
      transcript,
    ].join("\n"),
    summaryDate,
  });

  return {
    timelineDaily: {
      memoryType: "timeline_daily",
      title: generated.title,
      content: generated.content,
      domain: "timeline",
      sensitivity: "low",
      needsDomainReview: false,
    },
  };
}

async function generateWeeklyArtifacts({
  config,
  client: providedClient,
  groupingLabel,
  sources,
  startDate,
  endDate,
}) {
  if (!sources.length) {
    throw new Error("At least one source is required to generate weekly artifacts.");
  }

  if (!startDate || !endDate) {
    throw new Error("Both startDate and endDate are required to generate weekly artifacts.");
  }

  const transcript = sources
    .map((source, index) => {
      const parts = [
        `Source ${index + 1}`,
        `Label: ${source.label}`,
      ];

      if (source.date) {
        parts.push(`Date: ${source.date}`);
      }

      if (source.metadata && Object.keys(source.metadata).length) {
        parts.push(`Metadata: ${JSON.stringify(source.metadata)}`);
      }

      parts.push(`Text:\n${source.text}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const generated = await generateWeeklySummary({
    config,
    client: providedClient,
    transcript: [
      `Grouping label: ${groupingLabel}`,
      "",
      transcript,
    ].join("\n"),
    startDate,
    endDate,
  });

  return {
    timelineWeekly: {
      memoryType: "timeline_weekly",
      title: generated.title,
      content: generated.content,
      domain: "timeline",
      sensitivity: "low",
      needsDomainReview: false,
    },
  };
}

module.exports = {
  buildGeneratedMemoryRecords,
  buildGeneratedWeeklyMemoryRecord,
  generateSummaryArtifacts,
  generateWeeklyArtifacts,
  buildStagedMemoryRecords: buildGeneratedMemoryRecords,
  buildStagedWeeklyMemoryRecord: buildGeneratedWeeklyMemoryRecord,
};

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_RETENTION_DAYS = 7;
const TRACE_STAGES = [
  "user_message",
  "channel_adapter",
  "preprocessing",
  "attachment_handling",
  "intent_detection",
  "memory_retrieval",
  "journal_retrieval",
  "relationship_context",
  "world_time_context",
  "prompt_assembly",
  "llm_call",
  "tool_calls",
  "post_processing",
  "journal_memory_write",
  "response_delivery",
];
const SECRET_PATTERN = /(sk-[a-z0-9_-]+|xox[baprs]-[a-z0-9-]+|api[_-]?key\s*[:=]\s*\S+|access[_-]?token\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+)/gi;

function diagnosticsEnabled(env = process.env) {
  return String(env.GHOSTLIGHT_AI_DIAGNOSTICS_ENABLED || "false").trim().toLowerCase() === "true";
}

function debugPromptsEnabled(env = process.env) {
  return String(env.GHOSTLIGHT_AI_DIAGNOSTICS_DEBUG_PROMPTS || "false").trim().toLowerCase() === "true";
}

function getDiagnosticsPath(config = {}) {
  const configured = String(config.diagnostics?.aiPath || process.env.GHOSTLIGHT_AI_DIAGNOSTICS_PATH || "").trim();
  return configured || path.join(ROOT, "data", "diagnostics", "ai-diagnostics.json");
}

function maskSensitive(value) {
  if (value == null) return value;
  if (typeof value === "string") return value.replace(SECRET_PATTERN, "[masked-secret]");
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (/token|secret|apiKey|authorization|password/i.test(key)) return [key, "[masked-secret]"];
      return [key, maskSensitive(entry)];
    }));
  }
  return value;
}

function summarizeText(value, max = 220) {
  const text = maskSensitive(String(value || "").replace(/\s+/g, " ").trim());
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function estimateTokens(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 4);
}

function readDiagnostics(config = {}) {
  const file = getDiagnosticsPath(config);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_error) {
    return { traces: [], risks: [], promptBuilds: [], retrievals: [], companionEvents: [], metrics: [] };
  }
}

function writeDiagnostics(payload, config = {}) {
  const file = getDiagnosticsPath(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(maskSensitive(payload), null, 2));
}

function pruneDiagnostics(payload, { now = Date.now(), retentionDays = DEFAULT_RETENTION_DAYS } = {}) {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const recent = (item) => Date.parse(item.timestamp || item.startedAt || item.createdAt || "") >= cutoff;
  return {
    ...payload,
    traces: (payload.traces || []).filter(recent),
    risks: (payload.risks || []).filter(recent),
    promptBuilds: (payload.promptBuilds || []).filter(recent),
    retrievals: (payload.retrievals || []).filter(recent),
    companionEvents: (payload.companionEvents || []).filter(recent),
  };
}

function createTrace({ messageId = "", userId = "", companionId = "", channel = "", enabled = diagnosticsEnabled() } = {}) {
  const trace = {
    traceId: crypto.randomUUID(),
    enabled: Boolean(enabled),
    startedAt: new Date().toISOString(),
    messageId: summarizeText(messageId, 80),
    userId: summarizeText(userId, 80),
    companionId: summarizeText(companionId, 80),
    channel: summarizeText(channel, 80),
    stages: [],
    warnings: [],
    errors: [],
  };

  return {
    trace,
    addStage(stage, details = {}) {
      const normalizedStage = TRACE_STAGES.includes(stage) ? stage : "custom";
      trace.stages.push({
        stage: normalizedStage,
        status: details.status || "ok",
        durationMs: Number(details.durationMs || 0),
        inputSummary: summarizeText(details.inputSummary || ""),
        outputSummary: summarizeText(details.outputSummary || ""),
        tokenCount: Number(details.tokenCount || 0),
        costUsd: Number(details.costUsd || 0),
        memoryIds: Array.isArray(details.memoryIds) ? details.memoryIds.map((id) => summarizeText(id, 80)) : [],
        toolIds: Array.isArray(details.toolIds) ? details.toolIds.map((id) => summarizeText(id, 80)) : [],
        warnings: maskSensitive(details.warnings || []),
        errors: maskSensitive(details.errors || []),
        timestamp: new Date().toISOString(),
      });
      return trace;
    },
    finish(status = "ok") {
      trace.status = status;
      trace.finishedAt = new Date().toISOString();
      trace.durationMs = Date.parse(trace.finishedAt) - Date.parse(trace.startedAt);
      const missing = TRACE_STAGES.filter((stage) => !trace.stages.some((item) => item.stage === stage));
      if (missing.length) trace.warnings.push({ type: "missing_trace_stage", stages: missing });
      return trace;
    },
  };
}

function saveTrace(trace, config = {}) {
  if (!trace?.enabled) return { saved: false, reason: "diagnostics_disabled" };
  const payload = pruneDiagnostics(readDiagnostics(config));
  payload.traces.unshift(maskSensitive(trace));
  writeDiagnostics(payload, config);
  return { saved: true, traceId: trace.traceId };
}

function clearDiagnostics(config = {}) {
  writeDiagnostics({ traces: [], risks: [], promptBuilds: [], retrievals: [], companionEvents: [], metrics: [] }, config);
  return { cleared: true, path: getDiagnosticsPath(config) };
}

function recordRisk(risk, config = {}) {
  if (!diagnosticsEnabled()) return { saved: false, reason: "diagnostics_disabled" };
  const payload = pruneDiagnostics(readDiagnostics(config));
  const entry = maskSensitive({
    timestamp: new Date().toISOString(),
    companionId: risk.companionId || "unknown",
    userId: risk.userId || "unknown",
    channel: risk.channel || "unknown",
    sourceMessageId: risk.sourceMessageId || "",
    riskType: risk.riskType || "needs_review",
    severity: risk.severity || "low",
    explanation: summarizeText(risk.explanation || "Potential issue needs review."),
    relatedPromptSections: risk.relatedPromptSections || [],
    relatedRetrievedMemories: risk.relatedRetrievedMemories || [],
    suggestedFix: summarizeText(risk.suggestedFix || "Review trace and supporting context."),
  });
  payload.risks.unshift(entry);
  writeDiagnostics(payload, config);
  return { saved: true, risk: entry };
}

function scoreFromFindings(base, findings) {
  return Math.max(0, Math.min(100, base - findings.reduce((total, item) => total + (item.weight || 1), 0)));
}

async function buildMemoryHealth({ innerContext = {}, diagnostics = {} } = {}) {
  const userScope = innerContext.config?.memory?.userScope;
  let memories = [];
  let journals = [];
  const warnings = [];
  try {
    memories = innerContext.memoryStore?.listMemories
      ? await innerContext.memoryStore.listMemories({ userScope, limit: 5000, activeOnly: false })
      : [];
  } catch (error) {
    warnings.push(`Memory store unavailable: ${error.message}`);
  }
  try {
    journals = innerContext.journalStore?.listEntries
      ? await innerContext.journalStore.listEntries({ userScope, limit: 5000 })
      : [];
  } catch (_error) {
    journals = [];
  }

  const byType = {};
  const seen = new Map();
  const duplicates = [];
  const oversized = [];
  const lowQuality = [];
  const orphaned = [];
  const missingEmbeddings = [];
  for (const memory of memories) {
    const type = memory.memoryType || memory.type || "unknown";
    byType[type] = (byType[type] || 0) + 1;
    const text = String(memory.content || memory.summary || memory.text || "").trim();
    const signature = text.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 240);
    if (signature && seen.has(signature)) duplicates.push({ ids: [seen.get(signature), memory.id || memory.memoryId || "unknown"], summary: summarizeText(text) });
    else if (signature) seen.set(signature, memory.id || memory.memoryId || "unknown");
    if (!memory.companionId && !memory.userId && !memory.userScope && !memory.source) orphaned.push(memory.id || memory.memoryId || "unknown");
    if (!memory.embeddingId && !memory.qdrantPointId && !memory.vectorId) missingEmbeddings.push(memory.id || memory.memoryId || "unknown");
    if (estimateTokens(text) > 1200) oversized.push(memory.id || memory.memoryId || "unknown");
    if (text.length < 12 || /^(ok|yes|no|unknown|n\/a)$/i.test(text)) lowQuality.push(memory.id || memory.memoryId || "unknown");
  }
  const retrievals = diagnostics.retrievals || [];
  const retrievalLatency = average(retrievals.map((item) => item.durationMs));
  const hits = retrievals.filter((item) => Number(item.hitCount || 0) > 0).length;
  const findings = [
    { weight: Math.min(20, duplicates.length * 2) },
    { weight: Math.min(15, orphaned.length * 3) },
    { weight: Math.min(20, missingEmbeddings.length) },
    { weight: Math.min(10, oversized.length) },
    { weight: Math.min(10, lowQuality.length) },
  ];
  return {
    score: scoreFromFindings(100, findings),
    totalMemoryCount: memories.length,
    memoryCountByLayerType: byType,
    journalCount: journals.length,
    dreamCount: byType.dream || byType.dreams || 0,
    summaryCount: byType.summary || byType.summaries || 0,
    embeddingCount: memories.length - missingEmbeddings.length,
    duplicateMemories: duplicates.slice(0, 50),
    nearDuplicateMemories: [],
    orphanedMemories: orphaned.slice(0, 100),
    missingEmbeddings: missingEmbeddings.slice(0, 100),
    staleEmbeddings: [],
    oversizedMemoryEntries: oversized.slice(0, 100),
    emptyOrLowQualityMemories: lowQuality.slice(0, 100),
    retrievalLatencyMs: retrievalLatency,
    retrievalHitRate: retrievals.length ? hits / retrievals.length : null,
    topRetrievedMemoriesPerMessage: retrievals.slice(0, 20),
    retrievedButNotUsedInFinalPrompt: [],
    frequentlyRetrievedMemories: rankByFrequency(retrievals.flatMap((item) => item.memoryIds || [])).slice(0, 20),
    neverRetrievedMemories: [],
    semanticCoverageGaps: warnings.length ? ["Memory store was partially unavailable; coverage unknown."] : [],
    fragmentationRisk: duplicates.length + orphaned.length + lowQuality.length > 10 ? "High" : duplicates.length || orphaned.length ? "Medium" : "Low",
    warnings,
  };
}

function buildPromptHealth({ diagnostics = {}, config = {} } = {}) {
  const builds = diagnostics.promptBuilds || [];
  const latest = builds[0] || {};
  const previous = builds[1] || {};
  const sections = latest.sections || [];
  const repeated = findRepeatedSections(sections);
  const conflicts = findConflictMarkers(sections.map((section) => section.summary || section.name || "").join("\n"));
  const large = sections.filter((section) => Number(section.tokenCount || 0) > 1200);
  return {
    score: scoreFromFindings(100, [
      { weight: repeated.length * 4 },
      { weight: conflicts.length * 8 },
      { weight: large.length * 5 },
    ]),
    finalPromptTokenCount: latest.tokenCount || 0,
    systemPromptTokenCount: sumSectionTokens(sections, /system/i),
    personaTokenCount: sumSectionTokens(sections, /persona|companion/i),
    memoryContextTokenCount: sumSectionTokens(sections, /memory/i),
    relationshipContextTokenCount: sumSectionTokens(sections, /relationship|relational/i),
    toolInstructionTokenCount: sumSectionTokens(sections, /tool/i),
    repeatedInstructions: repeated,
    duplicatePromptBlocks: repeated,
    conflictingInstructions: conflicts,
    overlyLargePromptSections: large.map((section) => section.name || "unnamed"),
    promptGrowthOverTime: builds.slice(0, 20).map((build) => ({ timestamp: build.timestamp, tokenCount: build.tokenCount || 0 })),
    promptSizeByChannel: groupAverage(builds, "channel", "tokenCount"),
    promptSizeByCompanion: groupAverage(builds, "companionId", "tokenCount"),
    promptSizeByModel: groupAverage(builds, "model", "tokenCount"),
    contextCompressionEffectiveness: latest.compressionSavingsTokens || 0,
    missingRequiredContext: latest.missingRequiredContext || [],
    redundantMemoryInjection: repeated.filter((item) => /memory/i.test(item)),
    repeatedRelationshipState: repeated.filter((item) => /relationship|relational/i.test(item)),
    repeatedSafetyPersonaClauses: repeated.filter((item) => /safety|persona|system/i.test(item)),
    promptDiff: buildPromptDiff(previous, latest, config),
    rawPromptStorage: debugPromptsEnabled() ? "enabled-admin-only" : "disabled-summaries-only",
  };
}

function buildCompanionHealth({ diagnostics = {} } = {}) {
  const events = diagnostics.companionEvents || [];
  const traces = diagnostics.traces || [];
  const risks = diagnostics.risks || [];
  const errors = traces.filter((trace) => trace.status === "error" || trace.errors?.length).length;
  const fallbacks = events.filter((event) => event.type === "fallback").length;
  const refusals = events.filter((event) => event.type === "refusal").length;
  const empty = events.filter((event) => event.type === "empty_response").length;
  const toolCalls = traces.flatMap((trace) => trace.stages || []).filter((stage) => stage.stage === "tool_calls");
  const failedTools = toolCalls.filter((stage) => stage.status !== "ok").length;
  const repeatedPhraseMarkers = events.filter((event) => event.type === "repeated_phrase").length;
  return {
    score: scoreFromFindings(100, [
      { weight: errors * 5 },
      { weight: fallbacks * 3 },
      { weight: refusals * 2 },
      { weight: empty * 5 },
      { weight: failedTools * 4 },
      { weight: risks.length * 3 },
      { weight: repeatedPhraseMarkers * 2 },
    ]),
    inCharacterConsistency: events.length ? Math.max(0, 100 - repeatedPhraseMarkers * 2) : null,
    personaAdherence: "heuristic-ready",
    relationshipRuleAdherence: "heuristic-ready",
    responseLatencyMs: average(traces.map((trace) => trace.durationMs)),
    llmLatencyMs: averageStage(traces, "llm_call"),
    toolCallFrequency: traces.length ? toolCalls.length / traces.length : 0,
    toolCallFailureRate: toolCalls.length ? failedTools / toolCalls.length : 0,
    fallbackRate: events.length ? fallbacks / events.length : 0,
    emptyResponseRate: events.length ? empty / events.length : 0,
    refusalRate: events.length ? refusals / events.length : 0,
    errorRate: traces.length ? errors / traces.length : 0,
    hallucinationRiskMarkers: risks.length,
    contradictionMarkers: risks.filter((risk) => /contradiction/i.test(risk.riskType)).length,
    repeatedPhrases: repeatedPhraseMarkers,
    overApology: events.filter((event) => event.type === "over_apology").length,
    sycophancyRisk: events.filter((event) => event.type === "sycophancy_risk").length,
    toneDrift: events.filter((event) => event.type === "tone_drift").length,
    emotionalContinuityDrift: events.filter((event) => event.type === "emotional_drift").length,
    repairBehaviorQuality: "heuristic-ready",
    userCorrectionFrequency: events.filter((event) => event.type === "user_correction").length,
    regenerationFrequency: events.filter((event) => event.type === "regeneration").length,
    messagesRequiringManualIntervention: events.filter((event) => event.type === "manual_intervention").length,
  };
}

async function buildAiDiagnosticsReport({ innerContext = {} } = {}) {
  const diagnostics = pruneDiagnostics(readDiagnostics(innerContext.config));
  const memoryHealth = await buildMemoryHealth({ innerContext, diagnostics });
  const promptHealth = buildPromptHealth({ diagnostics, config: innerContext.config });
  const companionHealth = buildCompanionHealth({ diagnostics });
  const traces = diagnostics.traces || [];
  const overall = Math.round([memoryHealth.score, promptHealth.score, companionHealth.score].reduce((a, b) => a + b, 0) / 3);
  return {
    generatedAt: new Date().toISOString(),
    enabled: diagnosticsEnabled(),
    storage: { path: getDiagnosticsPath(innerContext.config), retentionDays: DEFAULT_RETENTION_DAYS, debugPrompts: debugPromptsEnabled() },
    overall: {
      score: overall,
      averageResponseLatencyMs: average(traces.map((trace) => trace.durationMs)),
      averageTokenUsage: average(traces.flatMap((trace) => (trace.stages || []).map((stage) => stage.tokenCount))),
      fallbackRate: companionHealth.fallbackRate,
      errorRate: companionHealth.errorRate,
      mostCommonWarning: mostCommon(traces.flatMap((trace) => trace.warnings || []).map((warning) => warning.type || warning)),
      highestRiskCompanion: mostCommon((diagnostics.risks || []).map((risk) => risk.companionId)),
      mostExpensiveChannel: mostCommon(traces.flatMap((trace) => (trace.stages || []).filter((stage) => stage.costUsd).map(() => trace.channel))),
    },
    memoryHealth,
    promptHealth,
    companionHealth,
    hallucinationErrorRisks: diagnostics.risks || [],
    contextFlow: {
      requiredStages: TRACE_STAGES,
      recentTraces: traces.slice(0, 50),
      failedTraces: traces.filter((trace) => trace.status === "error" || trace.errors?.length).slice(0, 50),
      slowestTraces: traces.slice().sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0)).slice(0, 20),
      mostExpensiveTraces: traces.slice().sort((a, b) => traceCost(b) - traceCost(a)).slice(0, 20),
      mostMemoryHeavyTraces: traces.slice().sort((a, b) => traceMemoryCount(b) - traceMemoryCount(a)).slice(0, 20),
      mostToolHeavyTraces: traces.slice().sort((a, b) => traceToolCount(b) - traceToolCount(a)).slice(0, 20),
    },
    privacy: {
      separateStorage: true,
      masksSecrets: true,
      storesRawPromptsByDefault: false,
      adminOnlyRoute: true,
    },
  };
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function rankByFrequency(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }));
}

function sumSectionTokens(sections, pattern) {
  return sections.filter((section) => pattern.test(section.name || "")).reduce((total, section) => total + Number(section.tokenCount || 0), 0);
}

function findRepeatedSections(sections) {
  const seen = new Set();
  const repeated = [];
  for (const section of sections) {
    const key = String(section.summary || section.name || "").toLowerCase().replace(/\W+/g, " ").trim();
    if (!key) continue;
    if (seen.has(key)) repeated.push(section.name || key.slice(0, 60));
    seen.add(key);
  }
  return repeated;
}

function findConflictMarkers(text) {
  const conflicts = [];
  const lower = String(text || "").toLowerCase();
  if (lower.includes("always") && lower.includes("never")) conflicts.push("contains always/never tension");
  if (lower.includes("do not use memory") && lower.includes("use memory")) conflicts.push("memory instruction conflict");
  if (lower.includes("be brief") && lower.includes("be detailed")) conflicts.push("brevity/detail conflict");
  return conflicts;
}

function buildPromptDiff(previous, latest) {
  const prevNames = new Set((previous.sections || []).map((section) => section.name));
  const nextNames = new Set((latest.sections || []).map((section) => section.name));
  return {
    previousPromptBuild: previous.id || previous.timestamp || null,
    currentPromptBuild: latest.id || latest.timestamp || null,
    addedSections: Array.from(nextNames).filter((name) => !prevNames.has(name)),
    removedSections: Array.from(prevNames).filter((name) => !nextNames.has(name)),
    tokenDelta: Number(latest.tokenCount || 0) - Number(previous.tokenCount || 0),
  };
}

function groupAverage(items, groupKey, valueKey) {
  const groups = new Map();
  for (const item of items) {
    const key = item[groupKey] || "unknown";
    const value = Number(item[valueKey] || 0);
    if (!Number.isFinite(value)) continue;
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return Object.fromEntries(Array.from(groups.entries()).map(([key, values]) => [key, average(values)]));
}

function averageStage(traces, stageName) {
  return average(traces.flatMap((trace) => (trace.stages || []).filter((stage) => stage.stage === stageName).map((stage) => stage.durationMs)));
}

function mostCommon(values) {
  const ranked = rankByFrequency(values);
  return ranked[0]?.id || null;
}

function traceCost(trace) {
  return (trace.stages || []).reduce((total, stage) => total + Number(stage.costUsd || 0), 0);
}

function traceMemoryCount(trace) {
  return (trace.stages || []).reduce((total, stage) => total + (stage.memoryIds || []).length, 0);
}

function traceToolCount(trace) {
  return (trace.stages || []).reduce((total, stage) => total + (stage.toolIds || []).length, 0);
}

module.exports = {
  TRACE_STAGES,
  buildAiDiagnosticsReport,
  buildMemoryHealth,
  buildPromptHealth,
  buildCompanionHealth,
  createTrace,
  saveTrace,
  recordRisk,
  clearDiagnostics,
  readDiagnostics,
  writeDiagnostics,
  maskSensitive,
  diagnosticsEnabled,
  getDiagnosticsPath,
};

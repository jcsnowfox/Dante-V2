const MAX_TRACE_EVENTS = 200;

const CANONICAL_PIPELINE_STAGES = Object.freeze([
  "channel_adapter",
  "companion_event",
  "identity_resolver",
  "user_resolver",
  "capability_resolver",
  "permission_resolver",
  "relationship_resolver",
  "world_time_resolver",
  "memory_retrieval",
  "journal_retrieval",
  "dream_retrieval",
  "schedule_context",
  "travel_context",
  "emotional_state",
  "prompt_assembly",
  "llm_provider",
  "tool_router",
  "post_processing",
  "memory_writer",
  "journal_writer",
  "diagnostics",
  "channel_adapter_response",
]);

let traceEvents = [];
let activeTrace = null;
let sequence = 0;

function nowIso() {
  return new Date().toISOString();
}

function textSize(value) {
  return String(value == null ? "" : value).length;
}

function safeId(value, fallback = "unknown") {
  const text = String(value || "").trim();
  return text || fallback;
}

function summarizeEvent(event = {}) {
  return {
    companionId: safeId(event.companionId),
    channel: safeId(event.channelType),
    eventType: safeId(event.eventType, "message"),
    privacyLevel: safeId(event.privacyLevel, "public"),
    messageSize: textSize(event.messageText),
    currentMessage: String(event.messageText || "").slice(0, 280),
  };
}

function emitCanonicalPipelineTrace(stage, event = {}, details = {}) {
  const at = Date.now();
  const previousAt = activeTrace?.lastAt || activeTrace?.startedAt || at;
  const traceEvent = {
    id: ++sequence,
    timestamp: nowIso(),
    stage,
    durationMs: Math.max(0, at - previousAt),
    totalDurationMs: activeTrace ? Math.max(0, at - activeTrace.startedAt) : 0,
    ...summarizeEvent(event),
    currentTool: details.tool || details.currentTool || "none",
    currentProvider: details.provider || details.currentProvider || "none",
    memoryCount: Number.isFinite(details.memoryCount) ? details.memoryCount : 0,
    promptSize: Number.isFinite(details.promptSize) ? details.promptSize : 0,
    diagnostics: details.diagnostics || details.reason || "",
  };

  if (!activeTrace) {
    activeTrace = { startedAt: at, lastAt: at, latest: traceEvent };
  } else {
    activeTrace.lastAt = at;
    activeTrace.latest = traceEvent;
  }

  traceEvents.push(traceEvent);
  if (traceEvents.length > MAX_TRACE_EVENTS) {
    traceEvents = traceEvents.slice(-MAX_TRACE_EVENTS);
  }
  return traceEvent;
}

function startCanonicalPipelineTrace(event = {}) {
  activeTrace = { startedAt: Date.now(), lastAt: Date.now(), latest: null };
  return emitCanonicalPipelineTrace("channel_adapter", event, { diagnostics: "canonical pipeline accepted event" });
}

function finishCanonicalPipelineTrace(event = {}, details = {}) {
  const trace = emitCanonicalPipelineTrace("channel_adapter_response", event, details);
  activeTrace = null;
  return trace;
}

function getCanonicalPipelineSnapshot() {
  const latest = traceEvents[traceEvents.length - 1] || null;
  return {
    stages: CANONICAL_PIPELINE_STAGES,
    active: Boolean(activeTrace),
    latest,
    events: traceEvents.slice(-50).reverse(),
  };
}

module.exports = {
  CANONICAL_PIPELINE_STAGES,
  emitCanonicalPipelineTrace,
  finishCanonicalPipelineTrace,
  getCanonicalPipelineSnapshot,
  startCanonicalPipelineTrace,
};

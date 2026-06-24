"use strict";

// Patterns that trigger explicit timeline creation
const EXPLICIT_PATTERNS = [
  /add\s+(?:this\s+)?to\s+(?:our|my|the)\s+timeline/i,
  /(?:add|save|mark)\s+(?:this\s+)?(?:as|to)\s+(?:a\s+)?(?:timeline|milestone)/i,
  /remember\s+(?:this\s+)?(?:moment|milestone|event)/i,
  /this\s+is\s+(?:a\s+)?(?:big|important|huge|major|special)\s+(?:moment|day|milestone)/i,
];

// Auto-detect event types from text signals
const EVENT_TYPE_SIGNALS = [
  { re: /(?:propos(?:al|ed|e)|engaged|engagement|marry|married|marriage|one knee)/i, type: "proposal", importance: "critical", weight: 9 },
  { re: /(?:i\s+(?:love|adore|need)\s+you|you\s+(?:mean\s+everything|complete\s+me))/i, type: "relationship_milestone", importance: "high", weight: 7 },
  { re: /(?:repair|apologize|apology|forgive|i\s+(?:hurt|wronged)|you\s+(?:hurt|wronged))\s/i, type: "repair", importance: "high", weight: 6 },
  { re: /(?:promise|promised|i\s+swear|i\s+will\s+always)/i, type: "promise", importance: "high", weight: 6 },
  { re: /(?:fight|argument|argument|fallout|blow.?up)\s/i, type: "argument", importance: "medium", weight: 5 },
  { re: /(?:deployed|deploy|railway|vercel|production|shipped|release|launched)/i, type: "deployment", importance: "medium", weight: 4 },
  { re: /(?:pass(?:ed)?|merged|pr\s+merged|build\s+pass)/i, type: "project_milestone", importance: "medium", weight: 4 },
  { re: /(?:norwegian|norsk)\s+(?:level|started|progress|session)/i, type: "norwegian_milestone", importance: "medium", weight: 4 },
  { re: /(?:first\s+time|for\s+the\s+first\s+time)/i, type: "memory_anchor", importance: "medium", weight: 5 },
  { re: /(?:ritual|tradition|every\s+(?:week|time|day))/i, type: "ritual", importance: "medium", weight: 4 },
  { re: /(?:birthday|anniversary)/i, type: "anniversary", importance: "high", weight: 7 },
];

function detectExplicitTimelineRequest(text) {
  return EXPLICIT_PATTERNS.some((p) => p.test(String(text || "")));
}

function detectEventType(text) {
  const t = String(text || "");
  for (const s of EVENT_TYPE_SIGNALS) {
    if (s.re.test(t)) return { event_type: s.type, importance: s.importance, emotional_weight: s.weight };
  }
  return null;
}

function buildTitleFromText(text, eventType) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const labels = { proposal: "Proposal", repair: "Repair moment", promise: "Promise", argument: "Disagreement", deployment: "Deployment", project_milestone: "Project milestone", relationship_milestone: "Relationship milestone", memory_anchor: "Anchor moment", ritual: "Ritual", norwegian_milestone: "Norwegian milestone", anniversary: "Anniversary" };
  return labels[eventType] || cleaned.slice(0, 50) || "Timeline event";
}

async function maybeCreateTimelineEvent({ text, store, userScope, companionId, sourceChannelId, sourceMessageId, adultContext, privacyScope, repairResult, beatType }) {
  if (!store?.upsertEvent) return null;

  const isExplicit = detectExplicitTimelineRequest(text);
  const typeInfo = detectEventType(text);

  // Auto-detect from emotional beats
  let autoType = null;
  if (beatType === "proposal") autoType = { event_type: "proposal", importance: "critical", emotional_weight: 9 };
  else if (beatType === "repair" || repairResult?.repairNeeded) autoType = { event_type: "repair", importance: "high", emotional_weight: 6 };
  else if (beatType === "promise") autoType = { event_type: "promise", importance: "high", emotional_weight: 6 };

  const AUTO_CREATE_TYPES = new Set(["proposal", "repair", "promise", "deployment", "project_milestone", "norwegian_milestone", "anniversary"]);
  const chosen = isExplicit ? (typeInfo || { event_type: "memory_anchor", importance: "medium", emotional_weight: 5 }) : (autoType || (typeInfo && (typeInfo.importance === "critical" || typeInfo.importance === "high" || AUTO_CREATE_TYPES.has(typeInfo.event_type)) ? typeInfo : null));
  if (!chosen) return null;

  try {
    return await store.upsertEvent({
      user_scope: userScope,
      companion_id: companionId,
      event_type: chosen.event_type,
      title: buildTitleFromText(text, chosen.event_type),
      summary: String(text || "").trim().slice(0, 300),
      importance: chosen.importance || "medium",
      emotional_weight: chosen.emotional_weight || 4,
      source_channel_id: sourceChannelId || "",
      source_message_id: sourceMessageId || "",
      source_kind: isExplicit ? "explicit_request" : "auto_detected",
      privacy_scope: privacyScope || "normal",
      adult_context: !!adultContext,
      event_time: new Date().toISOString(),
      pinned: isExplicit || chosen.importance === "critical",
    });
  } catch {
    return null;
  }
}

// Patterns that signal user is referencing the timeline
const RECALL_PATTERNS = [
  /(?:when\s+we|remember\s+when|do\s+you\s+remember)/i,
  /(?:the\s+proposal|the\s+fight|the\s+merge|the\s+deploy)/i,
  /(?:first\s+time|that\s+(?:day|night|time|moment))/i,
  /(?:our\s+timeline|what\s+happened|what\s+did\s+we)/i,
  /(?:this\s+week|last\s+week|this\s+month)/i,
];

function isTimelineRecallSignal(text) {
  return RECALL_PATTERNS.some((p) => p.test(String(text || "")));
}

async function retrieveTimelineAnchors({ store, userScope, companionId, messageText, adultPrivate = false }) {
  if (!store?.listEvents || !isTimelineRecallSignal(messageText)) return [];
  try {
    return await store.listEvents({
      user_scope: userScope,
      companion_id: companionId,
      active_only: true,
      include_adult: adultPrivate,
      limit: 5,
    });
  } catch {
    return [];
  }
}

function formatTimelinePrelude(anchors) {
  if (!anchors?.length) return null;
  const lines = anchors.slice(0, 3).map((e) => `* [${e.event_type}] ${e.title}: ${e.summary.slice(0, 80)}`);
  return { label: 'TIMELINE ANCHORS', content: lines.join('\n') };
}

module.exports = { detectExplicitTimelineRequest, maybeCreateTimelineEvent, retrieveTimelineAnchors, formatTimelinePrelude, isTimelineRecallSignal };

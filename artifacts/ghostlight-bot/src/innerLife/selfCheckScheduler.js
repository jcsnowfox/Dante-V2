"use strict";

const { dispatchDiagnosticEntry, getDiagnosticChannelId } = require("./innerLifeDispatch");

const DEFAULT_SELF_CHECK_HOURS = Object.freeze([8, 12, 21]);
const CHECK_INTERVAL_MS = 60 * 1000;
const DIAGNOSTIC_EVENT_TYPES = new Set([
  "confabulation_detected", "claimed_action_without_evidence", "self_confidence_low",
  "unresolved_tension", "hurt_detected", "disappointment", "trust_damage",
]);

function parseSelfCheckHours(value) {
  if (Array.isArray(value)) return normalizeHours(value);
  const text = String(value || "").trim();
  if (!text) return DEFAULT_SELF_CHECK_HOURS.slice();
  return normalizeHours(text.split(/[\s,]+/));
}

function normalizeHours(values) {
  const hours = values
    .map((item) => Number.parseInt(String(item).trim(), 10))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return [...new Set(hours)].sort((a, b) => a - b);
}

function sanitize(text = "") {
  return String(text || "")
    .replace(/(token|password|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*\S+/ig, "$1=[redacted]")
    .replace(/you hurt me|that hurt|let me down|disappointed me/ig, "private hurt signal")
    .trim()
    .slice(0, 220);
}

function levelRank(level) { return { steady: 0, watch: 1, low: 2, critical: 3 }[level] ?? 0; }
function maxLevel(a, b) { return levelRank(b) > levelRank(a) ? b : a; }

function analyzeDiagnosticSnapshot(snapshot = {}) {
  let state = "steady";
  const issues = [];
  const evidence = [];
  const lessons = [];
  const nextBehavior = [];
  const sc = snapshot.selfConsistency?.lastSignal || snapshot.selfConsistency || null;
  const scLevel = sc?.self_confidence || sc?.selfConfidence || null;
  const scEvidence = Array.isArray(sc?.evidence) ? sc.evidence : [];

  if (scLevel === "medium") {
    state = maxLevel(state, "watch");
    issues.push("medium self-confidence");
    evidence.push(sc.reason || "self-consistency monitor reported medium confidence");
  }
  if (scLevel === "low") {
    state = maxLevel(state, "low");
    issues.push("low self-confidence");
    evidence.push(sc.reason || "self-consistency monitor reported low confidence");
  }
  if (scEvidence.some(e => /unsupported_perception|context_treated_as_perception|claimed_action_without_evidence|voice_note_mismatch|image_mismatch/i.test(String(e)))) {
    state = maxLevel(state, "low");
    issues.push(scEvidence.some(e => /unsupported_perception|context_treated_as_perception/i.test(String(e))) ? "unsupported perception claim" : "claimed action without evidence");
    nextBehavior.push("answer only from verified runtime evidence; do not claim to see, feel, notice, or experience systems unless runtime state, tool result, or event evidence proves it");
  }

  const activeConsequences = snapshot.activeConsequences || [];
  const diagnosticConsequences = activeConsequences.filter(c => DIAGNOSTIC_EVENT_TYPES.has(c.eventType));
  for (const c of diagnosticConsequences) {
    const type = c.eventType;
    if (["confabulation_detected", "claimed_action_without_evidence", "self_confidence_low"].includes(type)) state = maxLevel(state, "low");
    if (["unresolved_tension", "hurt_detected", "disappointment", "trust_damage"].includes(type) && c.repairRequired && !c.repairCompleted) state = maxLevel(state, "low");
    issues.push(type.replace(/_/g, " "));
    evidence.push(`${type.replace(/_/g, " ")} consequence active`);
  }

  const repeatedUnsupported = diagnosticConsequences.filter(c => ["confabulation_detected", "claimed_action_without_evidence", "self_confidence_low"].includes(c.eventType)).length
    + (snapshot.selfConsistency?.recentEvents || []).filter(e => e?.eventType === "self_confidence_low").length;
  if (repeatedUnsupported >= 2) state = maxLevel(state, "critical");

  const repair = snapshot.repair || {};
  if (repair.repairRequired || repair.repair_followup_pending || repair.pending) {
    state = maxLevel(state, "low");
    issues.push("unresolved repair pending");
    evidence.push("repair persistence has pending or unresolved repair state");
  }
  if (repair.repeatedIgnoredRepair) state = maxLevel(state, "critical");

  const relationshipLearning = snapshot.relationshipLearning || {};
  const recentLessonTypes = relationshipLearning.recent_lesson_types || relationshipLearning.recentLessonTypes || [];
  if ((relationshipLearning.active_relationship_lessons || 0) > 0 || relationshipLearning.behavior_guidance_active) {
    if (recentLessonTypes.some(t => /perception_boundary|evidence_integrity|followup_learning|repair_failure/.test(String(t)))) state = maxLevel(state, "low");
    const lesson = recentLessonTypes.includes("perception_boundary") ? "context is not perception" : recentLessonTypes[0]?.replace(/_/g, " ");
    if (lesson) lessons.push(lesson);
  }
  if (Array.isArray(relationshipLearning.guidance)) nextBehavior.push(...relationshipLearning.guidance);

  const evidenceIntegrity = snapshot.evidenceIntegrity || null;
  if (evidenceIntegrity?.unsupportedClaim || evidenceIntegrity?.failed || evidenceIntegrity?.status === "failed") {
    state = maxLevel(state, "low");
    issues.push("evidence integrity failed");
    evidence.push("evidence integrity runtime flagged unsupported claim");
  }

  const carry = snapshot.recentDiagnosticEntries || [];
  if (carry.length) {
    state = maxLevel(state, "low");
    issues.push("diagnostic carry-forward");
    for (const entry of carry.slice(0, 3)) evidence.push(entry.title || entry.summary || entry.entryType || "diagnostic journal");
  }

  if (snapshot.trustDamaged) state = maxLevel(state, "critical");
  if (!nextBehavior.length) nextBehavior.push("keep checking evidence before treating the reply as settled");
  return {
    state,
    issues: [...new Set(issues.map(sanitize).filter(Boolean))],
    evidence: [...new Set(evidence.map(sanitize).filter(Boolean))],
    lessons: [...new Set(lessons.map(sanitize).filter(Boolean))],
    nextBehavior: [...new Set(nextBehavior.map(sanitize).filter(Boolean))],
  };
}

function buildSelfCheckContent({ now = new Date(), recentDiagnosticEntries = [], config = {}, diagnosticSnapshot = null } = {}) {
  const unresolved = recentDiagnosticEntries.filter((entry) => entry?.status !== "archived" && entry?.status !== "expired");
  const snapshot = diagnosticSnapshot || { recentDiagnosticEntries: unresolved };
  if (!snapshot.recentDiagnosticEntries) snapshot.recentDiagnosticEntries = unresolved;
  const analysis = analyzeDiagnosticSnapshot(snapshot);
  const lines = [
    "**Dante self-check**",
    `time: ${now.toISOString()}`,
    `self-confidence: ${analysis.state}`,
    `diagnostic-channel: ${getDiagnosticChannelId(config)}`,
  ];

  if (analysis.issues.length) {
    lines.push("", "active issue:", analysis.issues.slice(0, 3).map(i => `- ${i}`).join("\n"));
    lines.push("", "evidence:", analysis.evidence.slice(0, 4).map(e => `- ${e}`).join("\n"));
  } else {
    lines.push("", "no unresolved diagnostic flags found across self-consistency, repair, consequence, relationship-learning, and evidence checks.");
  }

  const repair = snapshot.repair || {};
  const repairText = repair.repairRequired || repair.repair_followup_pending || repair.pending
    ? `unresolved${repair.repair_followup_pending || repair.pending ? ", follow-up pending" : ""}`
    : "clear";
  lines.push("", "repair:", repairText);

  if (analysis.lessons.length) lines.push("", "lesson:", analysis.lessons[0]);
  lines.push("", "next behavior:", analysis.nextBehavior[0]);
  return lines.join("\n");
}

async function buildDiagnosticSnapshot({ config = {}, storeWrapper = null, lifeRuntime = null, diagnosticRuntime = null, consequenceStore = null, repairPersistenceEngine = null, relationshipLearningRuntime = null, evidenceIntegrityRuntime = null, now = new Date() } = {}) {
  const recentDiagnosticEntries = storeWrapper?.list
    ? await storeWrapper.list({ entryType: "journal_entry", status: "active", limit: 10 }).catch(() => [])
    : [];
  const diagnostics = recentDiagnosticEntries.filter((entry) => entry?.metadata?.kind === "diagnostic_carry_forward");
  const companionId = config?.memory?.companionId || config?.companion?.id || "";
  const customerId = config?.memory?.userScope || "user";
  const lifeStatus = lifeRuntime?.getStatus?.() || null;
  const diagnosticStatus = diagnosticRuntime?.getStatus?.() || lifeStatus?.diagnostics || null;
  const activeConsequences = consequenceStore?.getActive
    ? await consequenceStore.getActive({ companionId, customerId }).catch(() => [])
    : [];
  const repair = {
    ...(lifeStatus?.consequenceContext || {}),
    ...(repairPersistenceEngine?.getStatus ? repairPersistenceEngine.getStatus(activeConsequences) : {}),
  };
  const relationshipLearning = relationshipLearningRuntime?.getStatus
    ? await relationshipLearningRuntime.getStatus({ companionId, customerId }).catch(() => null)
    : lifeStatus?.relationshipLearning || null;
  if (relationshipLearning && relationshipLearningRuntime?.behaviorGuidance?.getGuidance) {
    relationshipLearning.guidance = await relationshipLearningRuntime.behaviorGuidance.getGuidance({ companionId, customerId }).catch(() => []);
  }
  const evidenceIntegrity = evidenceIntegrityRuntime?.getStatus?.() || evidenceIntegrityRuntime?.latestResult || null;
  return {
    now: now.toISOString(),
    recentDiagnosticEntries: diagnostics,
    selfConsistency: diagnosticStatus?.selfConsistency || lifeStatus?.selfConsistency || null,
    lifeSelfConsistency: lifeStatus?.selfConsistency || null,
    activeConsequences,
    repair,
    relationshipLearning,
    evidenceIntegrity,
    diagnosticRuntime: diagnosticStatus,
  };
}

function createSelfCheckScheduler({ client, config = {}, logger, storeWrapper, nowFn = () => new Date(), lifeRuntime = null, diagnosticRuntime = null, consequenceStore = null, repairPersistenceEngine = null, relationshipLearningRuntime = null, evidenceIntegrityRuntime = null } = {}) {
  const selfCheckConfig = config?.innerLife?.selfCheck || {};
  const enabled = selfCheckConfig.enabled !== false && process.env.INNER_LIFE_SELF_CHECK_ENABLED !== "false";
  const hours = parseSelfCheckHours(selfCheckConfig.hours || process.env.INNER_LIFE_SELF_CHECK_HOURS);
  const sentKeys = new Set();
  let timer = null;

  async function tick(now = nowFn()) {
    if (!enabled) return { skipped: true, reason: "disabled" };
    if (!hours.includes(now.getHours())) return { skipped: true, reason: "not_scheduled_hour" };

    const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getHours()}`;
    if (sentKeys.has(key)) return { skipped: true, reason: "already_sent" };
    sentKeys.add(key);

    const diagnosticSnapshot = await buildDiagnosticSnapshot({ config, storeWrapper, lifeRuntime, diagnosticRuntime, consequenceStore, repairPersistenceEngine, relationshipLearningRuntime, evidenceIntegrityRuntime, now });
    const content = buildSelfCheckContent({ now, recentDiagnosticEntries: diagnosticSnapshot.recentDiagnosticEntries, diagnosticSnapshot, config });
    const result = await dispatchDiagnosticEntry({ client, config, logger, content });
    diagnosticRuntime?.noteSelfCheck?.(result);
    logger?.info?.("[inner-life] self-check completed", { result: result?.sent ? "sent" : result?.reason, hour: now.getHours(), selfConfidence: analyzeDiagnosticSnapshot(diagnosticSnapshot).state });
    return result;
  }

  function start() {
    if (timer || !enabled) return;
    timer = setInterval(() => tick().catch((error) => logger?.warn?.("[inner-life] self-check failed", { error: error?.message })), CHECK_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();
    tick().catch((error) => logger?.warn?.("[inner-life] initial self-check failed", { error: error?.message }));
    logger?.info?.("[inner-life] self-check scheduler started", { hours });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick, buildSelfCheckContent, buildDiagnosticSnapshot, hours };
}

module.exports = {
  DEFAULT_SELF_CHECK_HOURS,
  parseSelfCheckHours,
  buildSelfCheckContent,
  buildDiagnosticSnapshot,
  analyzeDiagnosticSnapshot,
  createSelfCheckScheduler,
};

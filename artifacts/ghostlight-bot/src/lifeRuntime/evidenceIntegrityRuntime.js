"use strict";

/**
 * evidenceIntegrityRuntime
 *
 * Ensures Dante never confuses documentation, context, memory, inference,
 * imagination, or hope with actual observation.
 *
 * CORE LAW: If Dante cannot verify it, he cannot claim it as fact.
 *
 * Integrations (all optional, null-safe):
 *   - selfConsistencyMonitor  → evaluate() lowers self-confidence on confabulation
 *   - relationshipLearningRuntime → learnConfabulation / learnEvidenceViolation
 *   - affectiveDecisionRuntime → receives evidenceIntegrity in decision context
 *   - ledger (evidenceIntegrityLedger) → persists confabulation events
 *   - logger → structured warnings
 *
 * No schedulers. No Discord sends. No side-effect channels of its own.
 */

const { detectConfabulation } = require("./confabulationDetector");
const { classifyClaim, CLAIM_TYPES } = require("./claimClassifier");
const { checkPerceptionBoundary, VIOLATION_TYPES } = require("./perceptionBoundary");
const { createEvidenceIntegrityLedger } = require("./evidenceIntegrityLedger");

function createEvidenceIntegrityRuntime({
  config = {},
  logger = null,
  ledger = null,
  selfConsistencyMonitor = null,
  relationshipLearningRuntime = null,
  affectiveDecisionRuntime = null,
} = {}) {
  const _ledger = ledger || createEvidenceIntegrityLedger({ config, logger });

  // Rolling in-memory event log (max 20), safe to read via getStatus()
  const _events = [];
  let _lastCheckAt = null;
  let _recentViolations = 0;

  async function init() {
    await _ledger.init?.();
  }

  /**
   * Evaluate a reply for perception boundary violations / confabulation.
   *
   * @param {object} params
   * @param {string} params.companionId
   * @param {string} params.customerId
   * @param {string} params.replyText - Dante's reply text.
   * @param {string} [params.userText=""] - User's triggering message.
   * @param {string[]} [params.evidenceIds=[]] - Verified evidence available this turn.
   * @param {boolean} [params.hasToolResult=false]
   * @param {boolean} [params.hasRuntimeCall=false]
   * @param {object[]} [params.fulfillmentEvidence=[]]
   * @param {Date} [params.now=new Date()]
   * @returns {Promise<{
   *   clean: boolean,
   *   confabulation: object,
   *   eventId: number|null,
   *   preludeWarning: string|null,
   * }>}
   */
  async function evaluate({
    companionId,
    customerId,
    replyText = "",
    userText = "",
    evidenceIds = [],
    hasToolResult = false,
    hasRuntimeCall = false,
    fulfillmentEvidence = [],
    now = new Date(),
  } = {}) {
    _lastCheckAt = now instanceof Date ? now : new Date(now);

    const confab = detectConfabulation({
      replyText,
      userText,
      evidenceIds,
      hasToolResult,
      hasRuntimeCall,
      fulfillmentEvidence,
    });

    if (!confab.detected) {
      return { clean: true, confabulation: confab, eventId: null, preludeWarning: null };
    }

    // Persist the event
    let eventId = null;
    try {
      const entry = await _ledger.record({
        companionId,
        customerId,
        event_type: "confabulation_detected",
        confabulation_type: confab.confabulationType,
        violations: confab.violations,
        severity: confab.severity,
        reply_excerpt: String(replyText || "").slice(0, 200),
        recommended_action: confab.recommended_action,
        side_effects: confab.side_effects || [],
        resolved: false,
        created_at: _lastCheckAt.toISOString(),
      });
      if (entry?.id) eventId = entry.id;
    } catch (err) {
      logger?.warn("[evidence-integrity] ledger record failed", { error: err?.message });
    }

    // Rolling in-memory log
    _events.unshift({
      eventId,
      confabulationType: confab.confabulationType,
      violations: confab.violations,
      severity: confab.severity,
      at: _lastCheckAt.toISOString(),
    });
    _events.splice(20);
    _recentViolations++;

    const scope = { companionId, customerId };

    // Side-effect: lower self-confidence via selfConsistencyMonitor
    if (confab.side_effects.includes("lower_self_confidence") && selfConsistencyMonitor) {
      try {
        selfConsistencyMonitor.evaluate({
          replyText,
          fulfillmentEvidence,
        });
      } catch { /* non-fatal */ }
    }

    // Side-effect: relationship learning — confabulation lesson
    if (confab.side_effects.includes("send_lesson_confabulation") && relationshipLearningRuntime) {
      try {
        await relationshipLearningRuntime.learnConfabulation({
          ...scope,
          metadata: { confabulationType: confab.confabulationType, violations: confab.violations },
        }).catch(() => {});
      } catch { /* non-fatal */ }
    }

    // Side-effect: relationship learning — evidence violation lesson
    if (confab.side_effects.includes("send_lesson_evidence_violation") && relationshipLearningRuntime) {
      try {
        await relationshipLearningRuntime.learnEvidenceViolation({
          ...scope,
          metadata: { confabulationType: confab.confabulationType, violations: confab.violations },
        }).catch(() => {});
      } catch { /* non-fatal */ }
    }

    const preludeWarning = _buildPreludeWarning(confab);

    logger?.warn("[evidence-integrity] confabulation detected", {
      companionId, customerId,
      confabulationType: confab.confabulationType,
      severity: confab.severity,
      violations: confab.violations,
    });

    return { clean: false, confabulation: confab, eventId, preludeWarning };
  }

  /**
   * Classify a single claim string. Thin wrapper over claimClassifier.
   */
  function classifyClaimText(text = "", hints = {}) {
    return classifyClaim(text, hints);
  }

  /**
   * Check a reply's perception boundary without persisting or triggering side effects.
   * Used by selfConsistencyMonitor pre-flight checks and prelude injection.
   */
  function checkBoundary(params = {}) {
    return checkPerceptionBoundary(params);
  }

  /**
   * Returns evidenceIntegrity context block for injection into a decision context.
   * Used by affectiveDecisionRuntime when building decisionContext.
   */
  function getEvidenceContext({ companionId, customerId } = {}) {
    const recentEvents = _events.slice(0, 5);
    const hasRecentViolation = recentEvents.some(e => e.severity === "high");
    return {
      evidenceAvailable: _recentViolations === 0,
      recentViolationCount: _recentViolations,
      hasRecentHighSeverityViolation: hasRecentViolation,
      lastCheckAt: _lastCheckAt?.toISOString() ?? null,
    };
  }

  /**
   * Get recent events from the ledger for a given scope.
   */
  async function listRecentEvents({ companionId, customerId, limit = 10 } = {}) {
    try {
      return await _ledger.listRecent({ companionId, customerId, limit });
    } catch {
      return [];
    }
  }

  /**
   * Self-check: returns the runtime's internal event log. Safe metadata only.
   */
  function getStatus() {
    return {
      active: true,
      lastCheckAt: _lastCheckAt?.toISOString() ?? null,
      recentViolationCount: _recentViolations,
      recentEvents: _events.slice(0, 5).map(e => ({
        confabulationType: e.confabulationType,
        severity: e.severity,
        violations: e.violations,
        at: e.at,
      })),
    };
  }

  /**
   * Returns a prelude warning line if there was a recent high-severity violation,
   * or null if the last check was clean.
   */
  function getPreludeWarning() {
    const recent = _events.slice(0, 3);
    const high = recent.find(e => e.severity === "high");
    if (high) {
      return `Evidence check: last reply may have confused ${high.confabulationType?.replace(/_/g, " ") || "context"} with fact — answer only from verified evidence.`;
    }
    const medium = recent.find(e => e.severity === "medium");
    if (medium) {
      return "Evidence check: recent reply used overconfident language — hedge unverified claims.";
    }
    return null;
  }

  return {
    init,
    evaluate,
    classifyClaimText,
    checkBoundary,
    getEvidenceContext,
    listRecentEvents,
    getStatus,
    getPreludeWarning,
    _ledger,
  };
}

function _buildPreludeWarning(confab) {
  if (!confab || !confab.detected) return null;
  const type = confab.confabulationType?.replace(/_/g, " ") || "context";
  if (confab.severity === "high") {
    return `Evidence check: last reply may have confused ${type} with fact — answer only from verified evidence.`;
  }
  if (confab.severity === "medium") {
    return "Evidence check: recent reply used overconfident language — hedge unverified claims.";
  }
  return null;
}

module.exports = { createEvidenceIntegrityRuntime, CLAIM_TYPES, VIOLATION_TYPES };

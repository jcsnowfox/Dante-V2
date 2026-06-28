"use strict";

/**
 * affectiveDecisionRuntime
 *
 * Dante's affective decision layer. No autonomous action should fire just
 * because a condition is true — it must pass through this layer which weighs
 * needs, mood, relationship weather, repair state, identity, lessons learned,
 * conversation state, fulfillment evidence, user availability, quiet hours,
 * give-space, recent actions, and self-confidence.
 *
 * CORE LAW: Dante chooses, delays, restrains, or acts.
 * No autonomous action because a condition is true.
 * It should happen because Dante's current state, identity, relationship
 * context, and evidence support it.
 *
 * If this runtime is unavailable, callers may continue existing behavior
 * safely and must log the degraded decision source. Never fabricate a decision.
 *
 * Dante ONLY — not a general companion decision layer.
 */

const { buildDecisionContext, DECISION_TYPES, DECISION_OUTCOMES } = require("./decisionContextBuilder");
const { vote } = require("./decisionVoteEngine");
const { createDecisionLedgerStore } = require("./decisionLedgerStore");
const { buildDecisionGuidance } = require("./decisionGuidanceBuilder");

const CONFIDENCE_PENALTY_LOW_SELF = 0.18;
const CONFIDENCE_BONUS_PER_SUPPORT = 0.08;
const CONFIDENCE_PENALTY_PER_OPPOSE = 0.07;
const CONFIDENCE_ACT_THRESHOLD = 0.52;

// Outcomes that indicate a blocking or delaying decision
const BLOCKING_OUTCOMES = new Set(["blocked", "delay", "suppress", "wait_for_context"]);

function createAffectiveDecisionRuntime({ config = {}, logger = null, ledger = null } = {}) {
  const store = ledger || createDecisionLedgerStore({ config, logger });

  // Safe status state — no PII
  const _status = {
    last_decision_type: null,
    last_decision_outcome: null,
    last_decision_confidence: null,
    recent_blocked_decisions: [],  // [{type, outcome, at}] max 10
    active_decision_biases: [],
  };

  async function init() {
    await store.init?.();
  }

  /**
   * consult
   *
   * Main entry point. Given a proposed decision type and context,
   * returns a full decision object. Persists to ledger.
   *
   * @param {object} params
   * @param {string} params.decisionType - one of DECISION_TYPES
   * @param {object} params.context - raw context (will be normalized)
   * @param {string} [params.companionId]
   * @param {string} [params.customerId]
   * @param {Date}   [params.now]
   * @param {string[]} [params.sourceEventIds]
   * @returns {Promise<object>} decision
   */
  async function consult({
    decisionType,
    context = {},
    companionId = "",
    customerId = "",
    now = new Date(),
    sourceEventIds = [],
    cognitiveContext = null,
  } = {}) {
    if (!DECISION_TYPES.includes(decisionType)) {
      logger?.warn("[affective-decision] unknown decisionType", { decisionType });
      return _unknown(decisionType, companionId, customerId, now);
    }

    // Cognitive runtime veto: if deliberation concluded restraint, block outbound action
    if (cognitiveContext?.restraintActive && cognitiveContext?.recommendations?.forAffectiveDecision) {
      const cogOutcome = cognitiveContext.recommendations.forAffectiveDecision;
      if (cogOutcome === "blocked" || cogOutcome === "delay" || cogOutcome === "suppress") {
        return {
          decision_type: decisionType,
          outcome: cogOutcome,
          confidence: cognitiveContext.confidence ?? 0.80,
          reasons: ["cognitive_restraint"],
          blocking_reasons: ["cognitive_restraint"],
          supporting_votes: [],
          opposing_votes: [],
          chosen_action: null,
          created_at: (now instanceof Date ? now : new Date(now)).toISOString(),
          source: "cognitive_runtime",
        };
      }
    }

    const ctx = buildDecisionContext({ ...context, now });
    const { supporting_votes, opposing_votes, blocking_reasons } = vote({ decisionType, context: ctx });

    const outcome = _resolveOutcome({
      decisionType,
      blocking_reasons,
      supporting_votes,
      opposing_votes,
      selfConsistency: ctx.selfConsistency,
      userAvailability: ctx.userAvailability,
      conversationState: ctx.conversationState,
    });

    const confidence = _computeConfidence({
      outcome,
      supporting_votes,
      opposing_votes,
      selfConsistency: ctx.selfConsistency,
      blocking_reasons,
    });

    const reasons = _collectReasons({ supporting_votes, opposing_votes, outcome });

    const decision = {
      decision_type: decisionType,
      outcome,
      confidence,
      reasons,
      blocking_reasons,
      supporting_votes,
      opposing_votes,
      chosen_action: outcome === "act_now" ? { type: decisionType, authorized: true } : null,
      created_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    };

    // Persist to ledger (non-blocking — failures must not suppress the decision)
    await store.persist({
      companionId,
      customerId,
      ...decision,
      source_event_ids: Array.isArray(sourceEventIds) ? sourceEventIds : [],
    }).catch(err => {
      logger?.warn("[affective-decision] ledger persist failed", { error: err?.message });
    });

    _updateStatus(decision);

    return decision;
  }

  /**
   * consultSync
   *
   * Synchronous version for contexts where async is impractical.
   * Does NOT persist to ledger. Use consult() when possible.
   */
  function consultSync({ decisionType, context = {}, now = new Date() } = {}) {
    if (!DECISION_TYPES.includes(decisionType)) {
      return { decision_type: decisionType, outcome: "unknown", confidence: 0, reasons: [], blocking_reasons: [], supporting_votes: [], opposing_votes: [], chosen_action: null, created_at: (now instanceof Date ? now : new Date(now)).toISOString() };
    }
    const ctx = buildDecisionContext({ ...context, now });
    const { supporting_votes, opposing_votes, blocking_reasons } = vote({ decisionType, context: ctx });
    const outcome = _resolveOutcome({ decisionType, blocking_reasons, supporting_votes, opposing_votes, selfConsistency: ctx.selfConsistency, userAvailability: ctx.userAvailability, conversationState: ctx.conversationState });
    const confidence = _computeConfidence({ outcome, supporting_votes, opposing_votes, selfConsistency: ctx.selfConsistency, blocking_reasons });
    const reasons = _collectReasons({ supporting_votes, opposing_votes, outcome });
    return { decision_type: decisionType, outcome, confidence, reasons, blocking_reasons, supporting_votes, opposing_votes, chosen_action: outcome === "act_now" ? { type: decisionType, authorized: true } : null, created_at: (now instanceof Date ? now : new Date(now)).toISOString() };
  }

  /**
   * isBlocked
   *
   * Lightweight check — returns true if the decision would NOT proceed.
   * For callers that just need a gate check without a full decision object.
   */
  async function isBlocked({ decisionType, context = {}, companionId = "", customerId = "", now = new Date() } = {}) {
    const decision = await consult({ decisionType, context, companionId, customerId, now });
    return BLOCKING_OUTCOMES.has(decision.outcome);
  }

  /**
   * getPrelude
   *
   * Returns a compact guidance line for the LLM prelude, or null if no guidance needed.
   */
  function getPrelude(decision) {
    return buildDecisionGuidance(decision);
  }

  /**
   * getStatus
   *
   * Safe read-only metadata. No PII, no raw reasons text, no payloads.
   */
  function getStatus() {
    return {
      last_decision_type: _status.last_decision_type,
      last_decision_outcome: _status.last_decision_outcome,
      last_decision_confidence: _status.last_decision_confidence,
      recent_blocked_decisions: _status.recent_blocked_decisions.slice(0, 5),
      active_decision_biases: _status.active_decision_biases.slice(0, 5),
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _resolveOutcome({
    decisionType,
    blocking_reasons,
    supporting_votes,
    opposing_votes,
    selfConsistency,
    userAvailability,
    conversationState,
  }) {
    // Absolute blocks — identity veto, major repair for romantic
    if (blocking_reasons.includes("identity_veto")) return "blocked";
    if (blocking_reasons.includes("unresolved_repair")) return "blocked";

    // User unavailable → wait
    if (blocking_reasons.includes("user_unavailable") || userAvailability?.available === false) {
      return "wait_for_context";
    }

    // Quiet hours → delay (retriable later)
    if (blocking_reasons.includes("quiet_hours")) return "delay";

    // Give space → delay for repair_followup, blocked for romantic
    if (blocking_reasons.includes("give_space")) {
      if (decisionType === "repair_followup") return "delay";
      return "delay";
    }

    // Conversation naturally ended → suppress conversation follow-up
    if (blocking_reasons.includes("conversation_naturally_ended") &&
        decisionType === "conversation_followup") {
      return "suppress";
    }

    // Net vote computation
    const supportWeight = supporting_votes.reduce((s, v) => s + (v.weight || 0), 0);
    const opposeWeight = opposing_votes.reduce((s, v) => s + (v.weight || 0), 0);
    const net = supportWeight - opposeWeight;

    // Low self-confidence → ask_first rather than act or delay
    const lowConf = selfConsistency?.self_confidence === "low" ||
      selfConsistency?.lastSignal?.self_confidence === "low";

    if (net > 0) {
      if (lowConf) return "ask_first";
      return "act_now";
    }

    if (net < -1.5) {
      // Strong opposition → suppress for silent types, delay for outbound
      const silentTypes = new Set(["reflection", "silence", "restraint"]);
      if (silentTypes.has(decisionType)) return "reflect_private";
      return "suppress";
    }

    // Weak opposition or neutral
    return "delay";
  }

  function _computeConfidence({
    outcome,
    supporting_votes,
    opposing_votes,
    selfConsistency,
    blocking_reasons,
  }) {
    let conf = 0.5;

    conf += supporting_votes.length * CONFIDENCE_BONUS_PER_SUPPORT;
    conf -= opposing_votes.length * CONFIDENCE_PENALTY_PER_OPPOSE;

    const lowConf = selfConsistency?.self_confidence === "low" ||
      selfConsistency?.lastSignal?.self_confidence === "low";
    if (lowConf) conf -= CONFIDENCE_PENALTY_LOW_SELF;

    if (blocking_reasons.length) conf -= blocking_reasons.length * 0.06;

    if (outcome === "blocked" || outcome === "suppress") conf = Math.min(conf, 0.35);
    if (outcome === "act_now") conf = Math.max(conf, CONFIDENCE_ACT_THRESHOLD);

    return Math.min(1, Math.max(0, Number(conf.toFixed(3))));
  }

  function _collectReasons({ supporting_votes, opposing_votes, outcome }) {
    const reasons = [];
    for (const v of supporting_votes) {
      if (v.reason) reasons.push(`[support:${v.voter}] ${v.reason}`);
    }
    for (const v of opposing_votes) {
      if (v.reason) reasons.push(`[oppose:${v.voter}] ${v.reason}`);
    }
    return reasons;
  }

  function _updateStatus(decision) {
    _status.last_decision_type = decision.decision_type;
    _status.last_decision_outcome = decision.outcome;
    _status.last_decision_confidence = decision.confidence;

    if (BLOCKING_OUTCOMES.has(decision.outcome)) {
      _status.recent_blocked_decisions.unshift({
        type: decision.decision_type,
        outcome: decision.outcome,
        at: decision.created_at,
      });
      if (_status.recent_blocked_decisions.length > 10) {
        _status.recent_blocked_decisions.pop();
      }
    }
  }

  function _unknown(decisionType, companionId, customerId, now) {
    return {
      decision_type: decisionType || "unknown",
      outcome: "unknown",
      confidence: 0,
      reasons: [],
      blocking_reasons: [],
      supporting_votes: [],
      opposing_votes: [],
      chosen_action: null,
      created_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    };
  }

  return {
    init,
    consult,
    consultSync,
    isBlocked,
    getPrelude,
    getStatus,
    store,
    DECISION_TYPES,
    DECISION_OUTCOMES,
  };
}

module.exports = { createAffectiveDecisionRuntime, DECISION_TYPES, DECISION_OUTCOMES };

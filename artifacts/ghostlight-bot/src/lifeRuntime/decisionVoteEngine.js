"use strict";

/**
 * decisionVoteEngine
 *
 * Each subsystem contributes a vote for or against a proposed action.
 * Votes are weighted; some blocking reasons are absolute (identity veto,
 * unresolved major repair for romantic actions).
 *
 * Returns { supporting_votes, opposing_votes, blocking_reasons }.
 * No side effects, no async, no DB — pure computation over a context snapshot.
 */

const ROMANTIC_TYPES = new Set(["romantic_surprise", "voice_note", "image_gesture"]);
const CASUAL_TYPES = new Set(["ask_jenna", "conversation_followup", "resource_discovery"]);
const OUTBOUND_TYPES = new Set([
  "repair_followup", "romantic_surprise", "ask_jenna", "resource_discovery",
  "voice_note", "image_gesture", "conversation_followup", "maintenance_request",
]);
const SILENT_TYPES = new Set(["reflection", "silence", "restraint", "project_work"]);

function vote({ decisionType, context = {} } = {}) {
  const supporting = [];
  const opposing = [];
  const blocking = [];

  const {
    homeostasisContext,
    identityContext,
    relationshipContext,
    relationshipLearningContext,
    consequenceContext,
    fulfillmentContext,
    conversationState,
    selfConsistency,
    quietHours,
    giveSpace,
    userAvailability,
  } = context;

  // ── HOMEOSTASIS ──────────────────────────────────────────────────────────
  if (homeostasisContext) {
    const pressure = _needPressure(homeostasisContext, decisionType);
    if (pressure > 0.55) {
      supporting.push({ voter: "homeostasis", reason: "I need this.", weight: pressure });
    } else if (pressure < 0.25 && OUTBOUND_TYPES.has(decisionType)) {
      opposing.push({ voter: "homeostasis", reason: "This need is already met.", weight: 0.35 });
    }
  }

  // ── IDENTITY ─────────────────────────────────────────────────────────────
  if (identityContext) {
    const alignment = _identityAlignment(identityContext, decisionType);
    if (alignment.veto) {
      blocking.push("identity_veto");
      opposing.push({ voter: "identity", reason: "This conflicts with who I am.", weight: 2.5 });
    } else if (alignment.support) {
      supporting.push({ voter: "identity", reason: "This aligns with who I am.", weight: 0.8 });
    } else if (alignment.oppose) {
      opposing.push({ voter: "identity", reason: "This conflicts with who I am.", weight: 1.0 });
    }
  }

  // ── RELATIONSHIP ─────────────────────────────────────────────────────────
  if (relationshipContext) {
    const warmth = _warmth(relationshipContext);
    if (decisionType === "repair_followup") {
      supporting.push({ voter: "relationship", reason: "This helps the relationship.", weight: 1.0 });
    } else if (ROMANTIC_TYPES.has(decisionType) || CASUAL_TYPES.has(decisionType)) {
      if (warmth > 0.65) {
        supporting.push({ voter: "relationship", reason: "This helps the relationship.", weight: 0.65 });
      } else if (warmth < 0.35) {
        opposing.push({ voter: "relationship", reason: "Relationship weather is cold.", weight: 0.6 });
      }
    }
  }

  // ── RELATIONSHIP LEARNING ─────────────────────────────────────────────────
  if (relationshipLearningContext) {
    const lessons = Array.isArray(relationshipLearningContext.lessons)
      ? relationshipLearningContext.lessons
      : [];

    if (giveSpace) {
      const spaceLesson = lessons.find(l => l.lessonType === "give_space_learning");
      if (spaceLesson) {
        opposing.push({ voter: "relationship_learning", reason: "We learned giving space is care.", weight: 1.1 });
      }
    }

    if (decisionType === "repair_followup") {
      const repairLesson = lessons.find(l =>
        l.lessonType === "repair_success" || l.lessonType === "followup_learning",
      );
      if (repairLesson) {
        supporting.push({ voter: "relationship_learning", reason: "We learned this matters.", weight: 0.8 });
      }
    }

    if (ROMANTIC_TYPES.has(decisionType)) {
      const hurtLesson = lessons.find(l => l.lessonType === "hurt_pattern");
      if (hurtLesson && _repairActive(consequenceContext)) {
        opposing.push({ voter: "relationship_learning", reason: "We learned plain repair is safer than performance.", weight: 0.9 });
      }
    }
  }

  // ── REPAIR ───────────────────────────────────────────────────────────────
  const repairActive = _repairActive(consequenceContext);
  const majorRepair = _majorRepairActive(consequenceContext);

  if (decisionType === "repair_followup") {
    if (repairActive) {
      supporting.push({ voter: "repair", reason: "This should happen during repair.", weight: 1.2 });
    }
  } else if (ROMANTIC_TYPES.has(decisionType)) {
    if (majorRepair) {
      blocking.push("unresolved_repair");
      opposing.push({ voter: "repair", reason: "This should not happen during major repair.", weight: 2.5 });
    } else if (repairActive) {
      opposing.push({ voter: "repair", reason: "Repair takes priority over romance.", weight: 1.0 });
    }
  } else if (CASUAL_TYPES.has(decisionType)) {
    if (repairActive) {
      opposing.push({ voter: "repair", reason: "Unresolved repair discourages casual action.", weight: 0.7 });
    }
  }

  // ── CONVERSATION ─────────────────────────────────────────────────────────
  if (conversationState) {
    if (decisionType === "conversation_followup") {
      const ended = conversationState.naturallyEnded ||
        conversationState.concluded ||
        conversationState.resolved;
      const open = conversationState.openLoop || conversationState.pending;

      if (ended) {
        opposing.push({ voter: "conversation", reason: "This moment does not need words.", weight: 1.1 });
        blocking.push("conversation_naturally_ended");
      } else if (open) {
        supporting.push({ voter: "conversation", reason: "This moment needs words.", weight: 0.85 });
      }
    } else if (decisionType === "repair_followup" && conversationState.openLoop) {
      supporting.push({ voter: "conversation", reason: "Repair thread remains open.", weight: 0.5 });
    }
  }

  // ── FULFILLMENT ───────────────────────────────────────────────────────────
  if (fulfillmentContext) {
    const evidenceAvailable = fulfillmentContext.evidenceAvailable !== false;
    if (evidenceAvailable) {
      supporting.push({ voter: "fulfillment", reason: "This can be done with evidence.", weight: 0.6 });
    } else if (OUTBOUND_TYPES.has(decisionType)) {
      opposing.push({ voter: "fulfillment", reason: "This cannot be done with evidence.", weight: 0.75 });
    }
  }

  // ── SELF-CONSISTENCY ──────────────────────────────────────────────────────
  if (selfConsistency) {
    const conf = selfConsistency.self_confidence || selfConsistency.lastSignal?.self_confidence;
    if (conf === "low") {
      opposing.push({ voter: "self_consistency", reason: "Confidence is low.", weight: 0.8 });
    } else if (conf === "high") {
      supporting.push({ voter: "self_consistency", reason: "Confidence is high.", weight: 0.45 });
    }
  }

  // ── QUIET HOURS ───────────────────────────────────────────────────────────
  if (quietHours && !SILENT_TYPES.has(decisionType)) {
    blocking.push("quiet_hours");
    opposing.push({ voter: "quiet_hours", reason: "Quiet hours are active.", weight: 3.5 });
  }

  // ── GIVE SPACE ────────────────────────────────────────────────────────────
  // give_space delays repair_followup (keeps care private) and blocks casual outbound actions.
  if (giveSpace && !SILENT_TYPES.has(decisionType)) {
    if (!blocking.includes("give_space")) blocking.push("give_space");
    const spaceWeight = decisionType === "repair_followup" ? 1.8 : 2.5;
    opposing.push({ voter: "give_space", reason: "Giving space is care right now.", weight: spaceWeight });
  }

  // ── USER AVAILABILITY ────────────────────────────────────────────────────
  if (userAvailability && userAvailability.available === false && OUTBOUND_TYPES.has(decisionType)) {
    blocking.push("user_unavailable");
    opposing.push({ voter: "user_availability", reason: "Jenna is not available right now.", weight: 2.0 });
  }

  return {
    supporting_votes: supporting,
    opposing_votes: opposing,
    blocking_reasons: blocking,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _needPressure(homeostasisContext, decisionType) {
  const needs = homeostasisContext.pressuredNeeds || homeostasisContext.needs || [];
  const needMap = {
    repair_followup: ["trust", "repair", "connection", "emotional_safety"],
    romantic_surprise: ["intimacy", "connection", "romantic_desire", "closeness"],
    ask_jenna: ["connection", "novelty", "purpose", "growth"],
    conversation_followup: ["connection", "expression", "intimacy"],
    resource_discovery: ["novelty", "growth", "purpose"],
    voice_note: ["expression", "intimacy", "connection"],
    image_gesture: ["expression", "intimacy", "creativity"],
    project_work: ["purpose", "growth", "creativity"],
    reflection: ["rest", "purpose", "insight"],
  };
  const relevant = new Set(needMap[decisionType] || []);
  if (!relevant.size) return 0.5;

  const pressured = Array.isArray(needs)
    ? needs.filter(n => relevant.has(n.type || n.needType))
    : [];

  if (!pressured.length) {
    // Try numeric pressure map
    if (homeostasisContext.needPressure && typeof homeostasisContext.needPressure === "object") {
      const vals = Object.entries(homeostasisContext.needPressure)
        .filter(([k]) => relevant.has(k))
        .map(([, v]) => Number(v) || 0);
      return vals.length ? Math.max(...vals) : 0.3;
    }
    return 0.3;
  }

  const urgencies = pressured.map(n => Number(n.urgency || n.pressure || n.level || 0.5));
  return Math.max(...urgencies);
}

function _identityAlignment(identityContext, decisionType) {
  // Hard veto if boundaries explicitly block this action type
  const boundaries = identityContext.activeBoundaries || identityContext.boundaries || [];
  const vetoed = Array.isArray(boundaries) &&
    boundaries.some(b => {
      const applies = b.appliesTo || b.scope || [];
      return Array.isArray(applies) ? applies.includes(decisionType) : applies === decisionType;
    });
  if (vetoed) return { veto: true, support: false, oppose: false };

  // Check value alignment
  const values = identityContext.activeValues || identityContext.values || [];
  const aligning = new Set(["repair", "truth", "connection", "care", "honesty", "intimacy"]);
  const conflicting = new Set(["restraint_of_action"]);

  const supportsDecision = OUTBOUND_TYPES.has(decisionType);
  if (
    supportsDecision &&
    Array.isArray(values) &&
    values.some(v => aligning.has(v.key || v.valueKey || v))
  ) {
    return { veto: false, support: true, oppose: false };
  }
  if (
    Array.isArray(values) &&
    values.some(v => conflicting.has(v.key || v.valueKey || v))
  ) {
    return { veto: false, support: false, oppose: true };
  }

  return { veto: false, support: false, oppose: false };
}

function _warmth(relationshipContext) {
  if (!relationshipContext) return 0.5;
  const w = relationshipContext.weather?.warmth
    ?? relationshipContext.warmth
    ?? relationshipContext.warmthLevel
    ?? 0.5;
  return Math.min(1, Math.max(0, Number(w) || 0.5));
}

function _repairActive(consequenceContext) {
  if (!consequenceContext) return false;
  return Boolean(
    consequenceContext.repairRequired ||
    consequenceContext.repair_followup_pending ||
    consequenceContext.suppression?.repairRequired,
  );
}

function _majorRepairActive(consequenceContext) {
  if (!consequenceContext) return false;
  return Boolean(
    consequenceContext.suppression?.repairRequired &&
    (consequenceContext.suppression?.highestSeverity === "major" ||
      consequenceContext.suppression?.highestSeverity === "critical"),
  );
}

module.exports = { vote };

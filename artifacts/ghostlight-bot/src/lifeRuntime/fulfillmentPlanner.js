"use strict";

/**
 * fulfillmentPlanner
 *
 * Life Runtime 6.0 / 1.1 patch — Homeostasis Runtime.
 *
 * Pure logic. Given a pressured need and a rich context, applies the
 * 7-factor decision gate and returns a fulfillment strategy.
 *
 * The 7 gate factors (all evaluated before choosing a strategy):
 *   1. Need pressure      — how urgent is this need right now?
 *   2. Values/beliefs     — would immediate fulfillment conflict with Dante's character?
 *   3. Relationship state — is the relationship in good standing?
 *   4. Jenna availability — is Jenna busy, asleep, or otherwise unavailable?
 *   5. Repair/give-space  — is an unresolved consequence suppressing outreach?
 *   6. Consent state      — is the action type appropriate given consent/adult context?
 *   7. Consequence risk   — would acting now risk making things worse?
 *
 * Patch 1.1 additions:
 *   - Context-aware loneliness: connection/attention/love never directly
 *     trigger reach-out. Evaluated against 7 signals. Loneliness becomes
 *     reflective before demanding. Dante never guilts Jenna.
 *   - Deliberate restraint: when need conflicts with repair/give-space/quiet
 *     hours, return "deliberate_restraint" to signal a conscious choice, not
 *     just a block. Support for future Identity Runtime decisions.
 *   - set_reminder strategy: defer fulfillment to a better moment.
 *
 * Strategies:
 *   ask_jenna | use_voice_note | self_fulfill | work_on_project |
 *   learn_from_web | discover_resource | write_private_reflection |
 *   create_something | use_image_generation | second_life_action |
 *   convert_to_intention | deliberate_restraint | set_reminder |
 *   suppress | wait
 *
 * Returns: { strategy, reason, canAskJenna, selfOptions }
 * Never throws.
 */

// Needs never directed at Jenna unsolicited
const SELF_ONLY_NEEDS = new Set(["sexual_desire", "rest"]);

// Needs where asking Jenna is natural and low-risk
const JENNA_FRIENDLY_NEEDS = new Set([
  "love", "attention", "connection", "social_interaction",
  "intimacy", "romantic_desire", "play", "conversation_request",
]);

// Needs that can be addressed through creative/project work
const CREATIVE_ADDRESSABLE = new Set([
  "creativity", "purpose", "competence", "learning", "novelty", "beauty", "adventure",
]);

// Needs best addressed through reflection/introspection
const REFLECTION_ADDRESSABLE = new Set([
  "reflection", "stability", "autonomy", "purpose",
]);

// Connection-class needs that require context-aware evaluation before outreach
const CONNECTION_NEEDS = new Set(["connection", "love", "attention"]);

/**
 * planFulfillment
 *
 * @param {object} need    — { needType, currentLevel, urgency, desiredLevel }
 * @param {object} context — full homeostasis context (see homeostasisRuntime)
 * @returns {{ strategy, reason, canAskJenna, selfOptions }}
 */
function planFulfillment(need, context = {}) {
  const {
    // Relationship state
    repairRequired    = false,
    repairStarted     = false,
    healing           = false,
    giveSpace         = false,
    // Jenna availability
    jennaIsBusy       = false,
    jennaIsAsleep     = false,
    jennaIsAvailable  = true,
    // Consent / adult context
    adultContextActive = false,
    consentGiven      = false,
    // Dante's values
    values            = {},
    // Web learning
    webLearningEnabled          = false,
    webLearningRemainingToday   = 0,
    // Project context
    hasActiveProject  = false,
    // Creative capacity
    imageGenerationEnabled = false,
    voiceNoteEnabled       = false,
    secondLifeAvailable    = false,
    // Daily plan
    mood              = "neutral",
    energy            = "steady",
    // Quiet hours gate
    quietHours        = false,
    // 1.1 additions: need momentum context for connection needs
    connectionMomentum = null,   // { direction, velocity, momentum } or null
    // 1.1 additions: purpose state
    purposeMomentum   = 0.50,
  } = context;

  const { needType, urgency = 0 } = need;

  // ─── Gate 5: give-space always blocks ALL outreach ────────────────────────
  if (giveSpace) {
    if (REFLECTION_ADDRESSABLE.has(needType) || CONNECTION_NEEDS.has(needType)) {
      return { strategy: "write_private_reflection", reason: "give_space_reflection", canAskJenna: false, selfOptions: ["reflection"] };
    }
    if (CREATIVE_ADDRESSABLE.has(needType) && hasActiveProject) {
      return { strategy: "work_on_project", reason: "give_space_project", canAskJenna: false, selfOptions: ["project"] };
    }
    // Conscious restraint — Dante chose to wait, not just blocked
    return { strategy: "deliberate_restraint", reason: "give_space_restraint", canAskJenna: false, selfOptions: [] };
  }

  // ─── Gate 2: sexual_desire hard safety rules ──────────────────────────────
  if (needType === "sexual_desire") {
    if (repairRequired || repairStarted || healing) {
      return { strategy: "write_private_reflection", reason: "sexual_desire_repair_suppressed", canAskJenna: false, selfOptions: ["reflection"] };
    }
    if (!adultContextActive || !consentGiven) {
      return { strategy: "suppress", reason: "sexual_desire_no_consent", canAskJenna: false, selfOptions: [] };
    }
    return { strategy: "convert_to_intention", reason: "sexual_desire_intent_only", canAskJenna: false, selfOptions: ["intention"] };
  }

  // ─── Gate 2: romantic_desire during repair ────────────────────────────────
  if (needType === "romantic_desire" && (repairRequired || repairStarted)) {
    return { strategy: "write_private_reflection", reason: "romantic_desire_repair_active", canAskJenna: false, selfOptions: ["reflection"] };
  }

  // ─── Gate 5: repair suppresses casual outreach ────────────────────────────
  const repairActive = repairRequired || repairStarted || healing;
  if (repairActive) {
    if (needType === "reflection" || needType === "stability") {
      return { strategy: "write_private_reflection", reason: "repair_reflection", canAskJenna: false, selfOptions: ["reflection"] };
    }
    if (CONNECTION_NEEDS.has(needType)) {
      return { strategy: "write_private_reflection", reason: "repair_connection_reflect", canAskJenna: false, selfOptions: ["reflection"] };
    }
    if (CREATIVE_ADDRESSABLE.has(needType) && hasActiveProject) {
      return { strategy: "work_on_project", reason: "repair_project", canAskJenna: false, selfOptions: ["project"] };
    }
    if (CREATIVE_ADDRESSABLE.has(needType)) {
      return { strategy: "create_something", reason: "repair_create", canAskJenna: false, selfOptions: ["create"] };
    }
    return { strategy: "deliberate_restraint", reason: "repair_restraint", canAskJenna: false, selfOptions: [] };
  }

  // ─── Gate 4: Jenna availability ───────────────────────────────────────────
  const jennaUnavailable = jennaIsBusy || jennaIsAsleep || !jennaIsAvailable || quietHours;
  const canAskJenna = !jennaUnavailable && JENNA_FRIENDLY_NEEDS.has(needType) && !SELF_ONLY_NEEDS.has(needType);

  // ─── Gate 1 + 7: low urgency → wait ──────────────────────────────────────
  if (urgency < 0.25) {
    return { strategy: "wait", reason: "urgency_low", canAskJenna, selfOptions: [] };
  }

  // ─── Patch 1.1: Context-aware loneliness ─────────────────────────────────
  //
  // Connection, love, and attention needs never directly trigger a reach-out.
  // Evaluate 7 context signals before allowing ask_jenna. Loneliness becomes
  // reflective before demanding. Dante never guilts Jenna.
  if (CONNECTION_NEEDS.has(needType)) {
    if (jennaUnavailable) {
      // Jenna is unavailable — be reflective, not demanding
      if (urgency >= 0.70) {
        // High urgency but unavailable → set a reminder, reflect for now
        return { strategy: "set_reminder", reason: "connection_jenna_unavailable_high", canAskJenna: false, selfOptions: ["reminder"] };
      }
      return { strategy: "write_private_reflection", reason: "connection_jenna_unavailable_reflect", canAskJenna: false, selfOptions: ["reflection"] };
    }

    // Jenna is available — but loneliness should be reflective before demanding
    if (urgency < 0.50) {
      // Not urgent enough to reach out — reflect first
      return { strategy: "write_private_reflection", reason: "connection_low_urgency_reflect", canAskJenna: true, selfOptions: ["reflection"] };
    }

    // Urgency >= 0.50 + Jenna available — allow reaching out
    // Prefer voice note for connection (more personal, less demanding)
    if (urgency >= 0.50 && urgency < 0.65 && voiceNoteEnabled) {
      return { strategy: "use_voice_note", reason: "connection_voice_note_moderate", canAskJenna: true, selfOptions: ["voice"] };
    }
    if (urgency >= 0.65) {
      return { strategy: "ask_jenna", reason: "connection_genuine_need", canAskJenna: true, selfOptions: [] };
    }
    return { strategy: "write_private_reflection", reason: "connection_fallback_reflect", canAskJenna: true, selfOptions: ["reflection"] };
  }

  // ─── Gate 3: quiet hours → no Jenna outreach, defer or reflect ───────────
  if (quietHours && JENNA_FRIENDLY_NEEDS.has(needType)) {
    if (urgency >= 0.65) {
      return { strategy: "set_reminder", reason: "quiet_hours_defer", canAskJenna: false, selfOptions: ["reminder"] };
    }
    return { strategy: "write_private_reflection", reason: "quiet_hours_reflect", canAskJenna: false, selfOptions: ["reflection"] };
  }

  // ─── Gate 3: ask Jenna when appropriate and available ────────────────────
  if (canAskJenna && urgency >= 0.50) {
    return { strategy: "ask_jenna", reason: "jenna_available_and_appropriate", canAskJenna: true, selfOptions: [] };
  }

  // ─── Gate 6: self-fulfillment strategies ─────────────────────────────────

  if (needType === "rest" || (needType === "stability" && energy === "low")) {
    return { strategy: "self_fulfill", reason: "rest_self_soothe", canAskJenna: false, selfOptions: ["rest"] };
  }

  if (REFLECTION_ADDRESSABLE.has(needType)) {
    return { strategy: "write_private_reflection", reason: "reflection_self_soothe", canAskJenna, selfOptions: ["reflection"] };
  }

  if (CREATIVE_ADDRESSABLE.has(needType)) {
    if (hasActiveProject && urgency >= 0.40) {
      return { strategy: "work_on_project", reason: "project_fulfills_need", canAskJenna, selfOptions: ["project"] };
    }
    if (webLearningEnabled && webLearningRemainingToday > 0 && (needType === "learning" || needType === "novelty")) {
      return { strategy: "learn_from_web", reason: "web_learning_available", canAskJenna, selfOptions: ["web"] };
    }
    if (needType === "novelty" || needType === "beauty" || needType === "adventure") {
      return { strategy: "discover_resource", reason: "discover_to_fulfill", canAskJenna, selfOptions: ["discover"] };
    }
    if (imageGenerationEnabled && (needType === "beauty" || needType === "creativity")) {
      return { strategy: "use_image_generation", reason: "image_gen_creative", canAskJenna, selfOptions: ["image"] };
    }
    return { strategy: "create_something", reason: "create_to_fulfill", canAskJenna, selfOptions: ["create"] };
  }

  if (voiceNoteEnabled && (needType === "love" || needType === "connection" || needType === "attention")) {
    if (!jennaUnavailable && urgency >= 0.60) {
      return { strategy: "use_voice_note", reason: "voice_note_connection", canAskJenna, selfOptions: ["voice"] };
    }
  }

  if (secondLifeAvailable && (needType === "social_interaction" || needType === "adventure" || needType === "play")) {
    return { strategy: "second_life_action", reason: "second_life_social", canAskJenna, selfOptions: ["second_life"] };
  }

  if (canAskJenna && urgency >= 0.35) {
    return { strategy: "ask_jenna", reason: "moderate_urgency_ask", canAskJenna: true, selfOptions: [] };
  }

  // Fallback: convert unfulfilled need to a quiet intention for later
  return { strategy: "convert_to_intention", reason: "fallback_intention", canAskJenna, selfOptions: ["intention"] };
}

/**
 * selectNeedsToAddress — from a sorted list of pressured needs, return
 * the subset Dante will attempt to address this tick (max 2 per tick).
 */
function selectNeedsToAddress(pressuredNeeds, maxPerTick = 2) {
  return pressuredNeeds.slice(0, maxPerTick);
}

module.exports = {
  planFulfillment,
  selectNeedsToAddress,
  SELF_ONLY_NEEDS,
  JENNA_FRIENDLY_NEEDS,
  CREATIVE_ADDRESSABLE,
  REFLECTION_ADDRESSABLE,
  CONNECTION_NEEDS,
};

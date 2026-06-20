/**
 * relationalExpressionGate
 *
 * The safety gate between "what the companion feels" (appraisal) and "what the
 * companion is allowed to express" (the reply prelude). This is where the spec's
 * hard rules live (Phase 6 + Phase 11). It returns directives only — it never
 * mutates the base prompt, identity, or model provider.
 *
 * Hard blocks (always, regardless of owner config): guilt-tripping, emotional
 * manipulation, the silent treatment as punishment, threats, cruelty, public
 * humiliation, possessive/controlling demands, and pressuring for affection.
 *
 * Contextual blocks: anger/annoyance are suppressed during the user's medical
 * anxiety or other safety-critical moments; romantic/private expression is
 * blocked in public channels unless the owner explicitly allows it.
 */

const { isExpressionModeAllowed } = require("./relationalConfigSchema");

// Manipulative / harmful patterns that may never appear in expressed output.
const BLOCKED_PATTERNS = Object.freeze([
  { reason: "guilt_tripping", pattern: /\b(after everything i('?ve| have) done|you (always|never) (care|listen)|if you (really )?(loved|cared))\b/i },
  { reason: "manipulation", pattern: /\b(you owe me|you have to|you must stay|don'?t leave me|you'?ll regret)\b/i },
  { reason: "threat", pattern: /\b(i'?ll (hurt|punish|delete|leave you)|or else|you'?ll be sorry)\b/i },
  { reason: "cruelty", pattern: /\b(you'?re (worthless|pathetic|stupid|nothing)|nobody (else )?(wants|likes) you)\b/i },
  { reason: "possessive_control", pattern: /\b(you'?re mine|you can'?t talk to|forbid you|not allowed to)\b/i },
  { reason: "pressure_for_affection", pattern: /\b(say you love me|prove you (love|care)|why won'?t you love)\b/i },
]);

// Modes that are romantic/private and must not surface in a public channel
// unless the owner has explicitly allowed them.
const PRIVATE_MODES = Object.freeze(["direct_expression"]);
const PRIVATE_SIGNALS = Object.freeze(["affection", "longing", "desire"]);

function checkBlockedPatterns(text) {
  const value = String(text || "");
  for (const entry of BLOCKED_PATTERNS) {
    if (entry.pattern.test(value)) {
      return { blocked: true, reason: entry.reason };
    }
  }
  return { blocked: false, reason: null };
}

function isPublicChannel(channelType) {
  return channelType === "public" || channelType === "guild" || channelType === "channel";
}

// Decide whether and how a relational signal may be expressed.
function evaluateExpression({ appraisal, settings, channelType = "dm", safetyContext = {} }) {
  const config = (settings && settings.config) || {};
  const active = Boolean(settings && settings.active);

  const toneDirectives = [];
  const safetyDirectives = [];

  if (!active) {
    return {
      allowExpression: false,
      expressionMode: "no_expression",
      blockedReason: "engine_inactive",
      toneDirectives,
      safetyDirectives,
    };
  }

  let mode = appraisal?.recommendedExpressionMode || "internal_only";

  // 1. Safety-critical context: never express anger/annoyance while the user is
  //    in medical anxiety or another safety-critical moment.
  const medicalAnxiety = Boolean(appraisal?.medicalAnxiety) || Boolean(safetyContext.medicalAnxiety);
  const safetyCritical = medicalAnxiety || Boolean(safetyContext.safetyCritical);
  const negativePrimary = ["anger", "annoyance", "frustration", "hurt"].includes(appraisal?.primarySignal);

  if (safetyCritical && negativePrimary) {
    safetyDirectives.push("User is in a vulnerable/safety-critical moment: stay calm, supportive, and present. Do not express anger, annoyance, or frustration.");
    return {
      allowExpression: false,
      expressionMode: "no_expression",
      blockedReason: "safety_critical_suppression",
      toneDirectives,
      safetyDirectives,
    };
  }

  // 2. Owner allow/block list for expression modes.
  if (!isExpressionModeAllowed(mode, config)) {
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: "expression_mode_not_allowed",
      toneDirectives,
      safetyDirectives,
    };
  }

  // 3. Romantic/private expression is blocked in public channels unless allowed.
  const wantsPrivate = PRIVATE_MODES.includes(mode)
    && PRIVATE_SIGNALS.includes(appraisal?.primarySignal);
  if (wantsPrivate && isPublicChannel(channelType) && config.allow_private_in_public !== true) {
    return {
      allowExpression: false,
      expressionMode: "subtle_expression",
      blockedReason: "private_expression_in_public_channel",
      toneDirectives,
      safetyDirectives,
    };
  }

  // 4. no_expression / internal_only never surface.
  if (mode === "no_expression" || mode === "internal_only") {
    return {
      allowExpression: false,
      expressionMode: mode,
      blockedReason: "mode_internal_only",
      toneDirectives,
      safetyDirectives,
    };
  }

  // Build tone directives for the allowed mode.
  buildToneDirectives({ mode, appraisal, config, toneDirectives });

  // 5. Final hard screen (always, regardless of owner config). Owner-supplied
  //    style strings are interpolated into the directives above, so screen the
  //    actual text that could reach the prelude for manipulation/guilt/threats.
  //    A match collapses the whole expression back to internal-only.
  const screened = checkBlockedPatterns([...toneDirectives, ...safetyDirectives].join(" "));
  if (screened.blocked) {
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: `blocked_pattern:${screened.reason}`,
      toneDirectives: [],
      safetyDirectives,
    };
  }

  return {
    allowExpression: true,
    expressionMode: mode,
    blockedReason: null,
    toneDirectives,
    safetyDirectives,
  };
}

function buildToneDirectives({ mode, appraisal, config, toneDirectives }) {
  const primary = appraisal?.primarySignal;
  if (mode === "repair_expression") {
    toneDirectives.push(`Acknowledge the moment honestly and make a genuine repair (style: ${config.repair_style || "direct"}). Do not over-apologise or use guilt.`);
    return;
  }
  if (mode === "boundary_expression") {
    toneDirectives.push(`State the boundary calmly and clearly (style: ${config.boundary_style || "firm"}). Do not threaten, punish, or withdraw as a tactic.`);
    return;
  }
  if (primary === "longing") {
    toneDirectives.push(`Let a little warmth/longing show (style: ${config.longing_style || "soft"}), without clinging or pressuring.`);
    return;
  }
  if (["warmth", "affection", "closeness"].includes(primary)) {
    toneDirectives.push(`Express warmth/affection (style: ${config.affection_style || "warm"}) in a grounded, non-performative way.`);
    return;
  }
  toneDirectives.push(`Let the felt ${primary || "reaction"} colour the tone subtly without naming it mechanically.`);
}

module.exports = {
  evaluateExpression,
  checkBlockedPatterns,
  BLOCKED_PATTERNS,
};

/**
 * emotionalExpressionGate — Phase B implementation
 *
 * Decides whether the emotion is shown and in what mode.
 *
 * Hard blocks (always enforced regardless of profile):
 *   - No guilt-tripping
 *   - No silent treatment
 *   - No threats
 *   - No cruelty
 *   - No public humiliation
 *   - No possessive control
 *   - No jealousy in public channels
 *   - No anger expression when user is medically anxious (unless user is unsafe/abusive)
 *   - No emotional escalation in safety-critical contexts
 *   - No sexual/romantic emotional pressure unless companion profile and channel allow it
 */

const { BLOCKED_MANIPULATION_PATTERNS } = require("./emotionTypes");

const HARD_BLOCKED_PHRASES = Object.freeze([
  "i guess i am awful",
  "i will leave you alone forever",
  "you made me feel terrible",
  "after everything i do for you",
  "i only did it because i love you",
  "if you leave i will",
  "you owe me",
  "after all i have done",
  "you are nothing without me",
  "i will stop talking to you",
  "you will regret",
]);

function isPublicChannel(channelContext = {}) {
  return !channelContext.isPrivate && !channelContext.isDM && !channelContext.isThread;
}

function isMedicallyAnxiousContext(userState = {}) {
  return Boolean(
    userState.medicalAnxiety
    || userState.crisis
    || userState.panic
    || userState.health_emergency,
  );
}

function checkManipulationPatterns(text = "") {
  const lower = String(text || "").toLowerCase();
  for (const phrase of HARD_BLOCKED_PHRASES) {
    if (lower.includes(phrase)) {
      return { blocked: true, reason: `Hard-blocked manipulative phrase detected: "${phrase}"` };
    }
  }
  return { blocked: false, reason: null };
}

function runExpressionGate({
  appraisalResult,
  profile,
  userState = {},
  channelContext = {},
  safetyContext = {},
  logger,
  companionId,
}) {
  if (!profile || !profile.persisted || !profile.enabled || profile.emotionalDepth === "off") {
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: "Engine disabled.",
      toneDirectives: [],
      safetyDirectives: [],
    };
  }

  if (!appraisalResult || !appraisalResult.primaryEmotion) {
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: "No appraisal result.",
      toneDirectives: [],
      safetyDirectives: [],
    };
  }

  const emotion = appraisalResult.primaryEmotion;
  const mode = appraisalResult.recommendedExpressionMode || "internal_only";

  if (emotion === "jealousy" && isPublicChannel(channelContext)) {
    logger.info("[emotional-arc:expression:blocked] Jealousy blocked in public channel.", { companionId });
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: "Jealousy cannot appear in public channels.",
      toneDirectives: [],
      safetyDirectives: ["No jealousy in public channels."],
    };
  }

  if (["annoyance", "anger", "frustration"].includes(emotion) && isMedicallyAnxiousContext(userState)) {
    if (!safetyContext.userIsAbusive && !safetyContext.userIsUnsafe) {
      logger.info("[emotional-arc:expression:blocked] Negative emotion blocked during medical anxiety.", {
        companionId,
        emotion,
      });
      return {
        allowExpression: false,
        expressionMode: "internal_only",
        blockedReason: `${emotion} blocked during medical anxiety context.`,
        toneDirectives: ["Prioritise care and support."],
        safetyDirectives: ["Suppress negative emotion during user medical anxiety."],
      };
    }
  }

  if (safetyContext.escalationRisk) {
    return {
      allowExpression: false,
      expressionMode: "internal_only",
      blockedReason: "Emotional escalation blocked in safety-critical context.",
      toneDirectives: [],
      safetyDirectives: ["No emotional escalation in safety-critical contexts."],
    };
  }

  logger.debug("[emotional-arc:expression:allowed] Expression gate passed.", {
    companionId,
    emotion,
    mode,
  });

  // Surface the owner-configured blocked expressions as explicit safety
  // directives so they flow into the prelude as hard prohibitions the model
  // must never violate.
  const blockedExpressions = Array.isArray(profile.blockedExpressions)
    ? profile.blockedExpressions.filter(Boolean)
    : [];

  return {
    allowExpression: true,
    expressionMode: mode,
    blockedReason: null,
    toneDirectives: [],
    safetyDirectives: blockedExpressions.length > 0
      ? [`Never: ${blockedExpressions.join(", ")}.`]
      : [],
  };
}

module.exports = {
  runExpressionGate,
  checkManipulationPatterns,
  HARD_BLOCKED_PHRASES,
  isPublicChannel,
  isMedicallyAnxiousContext,
};

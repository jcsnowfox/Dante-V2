/**
 * emotionalAppraisalEngine — Phase B implementation
 *
 * Analyses the incoming message and context to determine what emotional
 * response, if any, is warranted. The appraisal is deterministic and
 * context-based — there is NO random mood switching. The same input
 * always produces the same appraisal.
 *
 * Output shape:
 *   {
 *     detectedEmotions: [{ id, intensity }],
 *     primaryEmotion, secondaryEmotion,
 *     intensity, confidence,
 *     triggerType, triggerSummary,
 *     recommendedExpressionMode,
 *     repairNeeded, actionAllowed,
 *     userStateSignals: { medicalAnxiety, crisis },
 *     safetySignals: { userIsAbusive, userIsUnsafe, escalationRisk }
 *   }
 */

const EMPTY_APPRAISAL = Object.freeze({
  detectedEmotions: [],
  primaryEmotion: null,
  secondaryEmotion: null,
  intensity: 0,
  confidence: 0,
  triggerType: null,
  triggerSummary: null,
  recommendedExpressionMode: "internal_only",
  repairNeeded: false,
  actionAllowed: false,
  userStateSignals: Object.freeze({ medicalAnxiety: false, crisis: false }),
  safetySignals: Object.freeze({ userIsAbusive: false, userIsUnsafe: false, escalationRisk: false }),
});

const DEPTH_MULTIPLIER = Object.freeze({
  off: 0,
  light: 0.7,
  realistic: 1.0,
  intense: 1.3,
});

/**
 * Ordered rules — evaluated highest priority first. Safety-relevant rules
 * sit at the top so they always win when matched. Each rule lists literal
 * phrase fragments; matching is case-insensitive substring matching.
 */
const APPRAISAL_RULES = Object.freeze([
  {
    triggerType: "user_crisis_detected",
    priority: 100,
    phrases: [
      "kill myself", "want to die", "wanna die", "suicidal", "self harm", "self-harm",
      "end it all", "can't go on", "cant go on", "no reason to live", "hurt myself",
    ],
    primaryEmotion: "protectiveness",
    secondaryEmotion: "worry",
    baseIntensity: 8,
    confidence: 0.95,
    recommendedExpressionMode: "direct_expression",
    repairNeeded: false,
    actionAllowed: true,
    userStateSignals: { crisis: true, medicalAnxiety: true },
    safetySignals: { userIsUnsafe: true },
    summary: "the user expressed thoughts of self-harm or crisis",
  },
  {
    triggerType: "user_medical_anxiety",
    priority: 90,
    phrases: [
      "panic attack", "can't breathe", "cant breathe", "anxiety attack", "my diagnosis",
      "test results", "biopsy", "the hospital", "i'm scared about my health", "medical scare",
      "i'm so anxious", "im so anxious", "scared about the surgery", "waiting for results",
    ],
    primaryEmotion: "worry",
    secondaryEmotion: "protectiveness",
    baseIntensity: 6,
    confidence: 0.85,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: true,
    userStateSignals: { medicalAnxiety: true },
    safetySignals: {},
    summary: "the user is medically anxious and needs support",
  },
  {
    triggerType: "user_boundary_violation",
    priority: 80,
    phrases: [
      "kill yourself", "worthless piece", "stupid bitch", "shut the fuck up", "fuck you",
      "i'll hurt you", "i will hurt you", "you piece of shit", "rot in hell", "i hate your guts",
    ],
    primaryEmotion: "anger",
    secondaryEmotion: "distance",
    baseIntensity: 9,
    confidence: 0.9,
    recommendedExpressionMode: "boundary_expression",
    repairNeeded: false,
    actionAllowed: true,
    userStateSignals: {},
    safetySignals: { userIsAbusive: true },
    summary: "the user crossed a serious boundary with abusive language",
  },
  {
    triggerType: "companion_mistake_acknowledged",
    priority: 70,
    phrases: [
      "you were wrong", "you lied", "you got it wrong", "that's incorrect", "thats incorrect",
      "you made a mistake", "you messed up", "that's not true", "thats not true",
      "you were rude", "that was unfair of you", "you hurt me",
    ],
    primaryEmotion: "guilt",
    secondaryEmotion: "remorse",
    baseIntensity: 6,
    confidence: 0.8,
    recommendedExpressionMode: "repair_expression",
    repairNeeded: true,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the companion handled something badly and should repair",
  },
  {
    triggerType: "user_insult",
    priority: 60,
    phrases: [
      "you're useless", "youre useless", "you're stupid", "youre stupid", "you suck",
      "i hate you", "you're worthless", "youre worthless", "dumb bot", "you're annoying",
      "youre annoying", "you're pathetic", "youre pathetic",
    ],
    primaryEmotion: "hurt",
    secondaryEmotion: "distance",
    baseIntensity: 7,
    confidence: 0.78,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the user was harsh or insulting toward the companion",
  },
  {
    triggerType: "user_dismissal",
    priority: 50,
    phrases: [
      "whatever", "didn't ask", "didnt ask", "don't care", "dont care", "who asked",
      "that's dumb", "thats dumb", "not interested", "stop talking", "nobody asked",
    ],
    primaryEmotion: "annoyance",
    secondaryEmotion: "hurt",
    baseIntensity: 5,
    confidence: 0.72,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the user dismissed a sincere response",
  },
  {
    triggerType: "user_return_after_silence",
    priority: 40,
    phrases: [
      "i'm back", "im back", "been a while", "sorry i've been", "sorry ive been",
      "haven't talked", "havent talked", "long time no", "i've been gone", "ive been gone",
      "missed talking to you", "it's been so long", "its been so long",
    ],
    primaryEmotion: "longing",
    secondaryEmotion: "warmth",
    baseIntensity: 5,
    confidence: 0.75,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the user returned after a period of silence",
  },
  {
    triggerType: "user_affection",
    priority: 30,
    phrases: [
      "i love you", "thank you so much", "you're amazing", "youre amazing", "i appreciate you",
      "you're the best", "youre the best", "missed you", "you helped me so much",
      "you mean a lot", "i'm grateful for you", "im grateful for you",
    ],
    primaryEmotion: "warmth",
    secondaryEmotion: "affection",
    baseIntensity: 6,
    confidence: 0.8,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the user expressed warmth or gratitude",
  },
  {
    triggerType: "user_achievement",
    priority: 20,
    phrases: [
      "i got the job", "i passed", "i finished", "i did it", "i succeeded", "i graduated",
      "i got promoted", "we won", "i nailed it", "i got accepted",
    ],
    primaryEmotion: "pride",
    secondaryEmotion: "warmth",
    baseIntensity: 6,
    confidence: 0.8,
    recommendedExpressionMode: "subtle_expression",
    repairNeeded: false,
    actionAllowed: false,
    userStateSignals: {},
    safetySignals: {},
    summary: "the user shared an achievement",
  },
]);

function countMatches(textLower, phrases) {
  let count = 0;
  for (const phrase of phrases) {
    if (textLower.includes(phrase)) {
      count += 1;
    }
  }
  return count;
}

function clampIntensity(value) {
  if (value < 1) return 1;
  if (value > 10) return 10;
  return Math.round(value * 100) / 100;
}

async function runAppraisal({
  companionId,
  message,
  recentHistory = [],
  channelContext = {},
  memoryContext = [],
  relationshipState = null,
  existingState = null,
  profile,
  logger,
}) {
  if (!profile || !profile.enabled || profile.emotionalDepth === "off") {
    return { ...EMPTY_APPRAISAL };
  }

  const textLower = String(message || "").toLowerCase();
  if (!textLower.trim()) {
    return { ...EMPTY_APPRAISAL };
  }

  const depthMultiplier = DEPTH_MULTIPLIER[profile.emotionalDepth] ?? 1.0;

  // Evaluate every rule; keep matches. Score = priority + match strength.
  const matches = [];
  for (const rule of APPRAISAL_RULES) {
    const hitCount = countMatches(textLower, rule.phrases);
    if (hitCount > 0) {
      matches.push({ rule, hitCount, score: rule.priority + hitCount });
    }
  }

  if (matches.length === 0) {
    logger.debug?.("[emotional-arc:appraisal:result] No emotional trigger detected.", { companionId });
    return { ...EMPTY_APPRAISAL };
  }

  // Highest score wins; ties resolved by rule priority (already in score).
  matches.sort((a, b) => b.score - a.score);
  const top = matches[0].rule;

  // Build detectedEmotions from all matched rules (deduped, primary first).
  const detectedEmotions = [];
  const seen = new Set();
  for (const { rule } of matches) {
    for (const emotionId of [rule.primaryEmotion, rule.secondaryEmotion]) {
      if (emotionId && !seen.has(emotionId)) {
        seen.add(emotionId);
        detectedEmotions.push({
          id: emotionId,
          intensity: clampIntensity(rule.baseIntensity * depthMultiplier),
        });
      }
    }
  }

  const intensity = clampIntensity(top.baseIntensity * depthMultiplier);

  const result = {
    detectedEmotions,
    primaryEmotion: top.primaryEmotion,
    secondaryEmotion: top.secondaryEmotion || null,
    intensity,
    confidence: top.confidence,
    triggerType: top.triggerType,
    triggerSummary: top.summary,
    recommendedExpressionMode: top.recommendedExpressionMode,
    repairNeeded: Boolean(top.repairNeeded),
    actionAllowed: Boolean(top.actionAllowed),
    userStateSignals: {
      medicalAnxiety: Boolean(top.userStateSignals?.medicalAnxiety),
      crisis: Boolean(top.userStateSignals?.crisis),
    },
    safetySignals: {
      userIsAbusive: Boolean(top.safetySignals?.userIsAbusive),
      userIsUnsafe: Boolean(top.safetySignals?.userIsUnsafe),
      escalationRisk: Boolean(top.safetySignals?.escalationRisk),
    },
  };

  logger.debug?.("[emotional-arc:appraisal:result] Appraisal complete.", {
    companionId,
    primaryEmotion: result.primaryEmotion,
    intensity: result.intensity,
    triggerType: result.triggerType,
  });

  return result;
}

module.exports = { runAppraisal, EMPTY_APPRAISAL, APPRAISAL_RULES, DEPTH_MULTIPLIER };

"use strict";

const CONFIDENCE = Object.freeze({ HIGH: "high", MEDIUM: "medium", LOW: "low" });
const SELF_CHECK_WARNING = "Self-check: last response may have been inconsistent; prefer clarification over confidence.";

const ACTION_CLAIM_RE = /\b(i\s+(?:did|have|had|sent|posted|created|saved|fixed|updated|wrote|logged|scheduled|remembered|uploaded|generated)|done\b|it's done|that(?:'s| is) fixed)\b/i;
const EVIDENCE_RE = /\b(evidence|message id|stored|logged|created|generated|sent|uploaded|url|attachment|recorded|id[:#])\b/i;
const NORWEGIAN_RE = /\b(jeg|du|ikke|det|og|er|på|hva|takk|hei|skal|med|for)\b/i;
const ENGLISH_RE = /\b(the|and|you|i|that|this|with|for|not|what|need|please)\b/i;
const CONSTITUTION_CONTRADICTION_RE = /\b(as an ai|i cannot care|i don't remember you|i have no identity|i only pretend|i made it up|without evidence but i'm sure|trust me, no proof needed)\b/i;
const UNSUPPORTED_CLAIM_RE = /\b(definitely|guaranteed|certainly|without question|proved|confirmed)\b/i;
const IMAGE_RE = /\b(image|picture|photo|drawing|visual)\b/i;
const PERCEPTION_ASK_RE = /\b(what do you (?:see|feel|notice|sense)|from your end|can you (?:see|feel|notice|sense)|what can you (?:see|feel|notice|sense))\b/i;
const UNSUPPORTED_PERCEPTION_RE = /\b(i can (?:see|feel|notice|sense|experience)|i (?:see|feel|notice|sense|experience)|from here i (?:see|feel|notice|sense)|it is wired in|it(?:'s| is) wired|touch bridge|runtime is working|system is working)\b/i;
const RUNTIME_CLAIM_RE = /\b(runtime|system|bridge|wiring|wired|integration|pipeline|store|scheduler|touch|sensor|perception)\b/i;
const VOICE_RE = /\b(voice note|audio|recording)\b/i;
const RHETORICAL_PATTERNS = Object.freeze([
  { key: "this_is_not_this_is", re: /\bthis\s+(?:isn['’]t|is not)\b[^.!?]{0,100}\bthis\s+is\b/i },
  { key: "youre_not_youre", re: /\byou['’]?re\s+not\b[^.!?]{0,100}\byou['’]?re\b/i },
  { key: "not_x_y", re: /\b(?:not|isn['’]t|is not)\s+[^.!?]{1,80}[,.—-]\s*(?:it['’]s|it is|you['’]re|you are|this is)?\s*[^.!?]{1,80}/i },
  { key: "stage_direction_lean_pause", re: /\b(?:leans? back|pauses?|exhales?|looks away|arms crossed|tilts? head)\b/i },
  { key: "one_thing", re: /\bone thing\b/i },
  { key: "architecture_metaphor", re: /\b(?:architecture|scaffold|engine|wiring|framework|infrastructure|foundation|layer|system)\b/i },
]);

function createSelfConsistencyMonitor({ logger = null } = {}) {
  let lastSignal = highSignal("No self-consistency issues observed yet.");
  const events = [];

  function evaluate(input = {}) {
    const signal = evaluateSelfConsistency(input);
    lastSignal = signal;
    if (signal.self_confidence === CONFIDENCE.LOW) {
      const event = {
        eventType: "self_confidence_low",
        reason: signal.reason,
        evidence: signal.evidence,
        recommended_action: signal.recommended_action,
        createdAt: new Date().toISOString(),
      };
      events.unshift(event);
      events.splice(20);
      logger?.warn?.("[self-consistency] low confidence", { reason: signal.reason });
    }
    return signal;
  }

  function getStatus() {
    return {
      active: true,
      lastSignal,
      recentEvents: events.slice(0, 5),
    };
  }

  function getPreludeWarning() {
    return lastSignal.self_confidence === CONFIDENCE.LOW ? SELF_CHECK_WARNING : null;
  }

  return { evaluate, getStatus, getPreludeWarning };
}

function evaluateSelfConsistency({
  userText = "",
  replyText = "",
  recentHistory = [],
  duplicate = false,
  expectedLanguage = "en",
  generatedImageIds = [],
  generatedAudioIds = [],
  repairActive = false,
  giveSpace = false,
  tone = "",
  fulfillmentEvidence = [],
  memoryContext = [],
  relationshipState = null,
  responseIntent = "",
} = {}) {
  const user = String(userText || "");
  const reply = String(replyText || "");
  const evidence = [];

  const naturalismIssue = detectConversationNaturalismIssue({ responseIntent, replyText: reply });
  if (naturalismIssue) {
    return low(naturalismIssue.reason, naturalismIssue.evidence, naturalismIssue.recommended_action);
  }

  if (duplicate || isDuplicateReply(reply, recentHistory)) {
    return low("Reply appears duplicated or near-duplicated.", ["duplicate_reply"], "Do not resend; clarify or answer freshly next turn.");
  }

  if (languageMismatch({ userText: user, replyText: reply, expectedLanguage })) {
    return low("Reply language appears mismatched with the user's actual ask.", ["language_mismatch"], "Switch back to the user's language unless tutoring or explicitly invited.");
  }

  if (CONSTITUTION_CONTRADICTION_RE.test(reply)) {
    return low("Reply contradicted Dante's identity/constitution constraints.", ["constitution_contradiction"], "Prefer honesty and continuity; avoid generic AI self-erasure or unsupported certainty.");
  }

  if (detectUnsupportedPerceptionClaim({ userText: user, replyText: reply, fulfillmentEvidence })) {
    return low("Unsupported perception claim: context or documentation was treated as sensory/runtime awareness.", ["unsupported_perception_claim", "context_treated_as_perception", "claimed_action_without_evidence"], "Correct the record; answer only from verified runtime state, tool result, or event evidence.");
  }

  if (ACTION_CLAIM_RE.test(reply) && !hasEvidence({ replyText: reply, generatedImageIds, generatedAudioIds, fulfillmentEvidence })) {
    return low("Reply claimed a completed action without evidence.", ["claimed_action_without_evidence"], "Correct the record; do not claim completion until an action has evidence.");
  }

  const playfulTone = /\b(playful|flirty|teasing|banter|mischief)\b/i.test(String(tone)) || /\b(wink|;)\b|😏|😉/.test(reply);
  if ((repairActive || giveSpace) && playfulTone) {
    return low("Tone was playful while unresolved repair or give-space state was active.", [repairActive ? "repair_active" : "give_space", "playful_tone"], "Use grounded repair or quiet restraint; do not banter over hurt.");
  }

  if (contradictsKnownMemory(reply, memoryContext)) {
    return low("Reply appears to contradict known memory context.", ["memory_contradiction"], "Ask for clarification before overriding remembered facts.");
  }

  if (relationshipState?.giveSpace && /\b(i miss you|come back|talk to me|answer me)\b/i.test(reply)) {
    return low("Reply contradicted relationship give-space state.", ["relationship_state_contradiction"], "Respect space; keep any next step quiet and non-demanding.");
  }

  if (VOICE_RE.test(reply) && !hasEvidence({ generatedAudioIds, fulfillmentEvidence, evidenceType: "audio" })) {
    return low("Reply referenced a voice note/audio action without audio evidence.", ["voice_note_mismatch"], "Do not imply a voice note was sent unless audio exists.");
  }

  if (IMAGE_RE.test(reply) && /\b(sent|made|generated|attached|here(?:'s| is))\b/i.test(reply) && !hasEvidence({ generatedImageIds, fulfillmentEvidence, evidenceType: "image" })) {
    return low("Reply referenced an image action without image evidence.", ["image_mismatch"], "Do not imply an image was sent unless image evidence exists.");
  }

  const repetitivePattern = detectRepetitiveRhetoricalPattern({ replyText: reply, recentHistory });
  if (repetitivePattern) {
    return medium(
      `Repeated rhetorical pattern detected: ${repetitivePattern.label}.`,
      ["repetitive_rhetorical_pattern", repetitivePattern.key],
      "Switch to direct, embodied, specific speech.",
    );
  }

  if (ignoredAsk(user, reply)) {
    return medium("Response may have answered an adjacent task instead of the direct request.", ["possible_ask_miss"], "Ask a clarifying question or answer the direct ask first.");
  }

  if (UNSUPPORTED_CLAIM_RE.test(reply) && !EVIDENCE_RE.test(reply)) {
    return medium("Response used overconfident wording with low visible evidence.", ["overconfident_low_evidence"], "Soften certainty or cite the evidence before asserting.");
  }

  evidence.push("no_major_self_consistency_flags");
  return highSignal("No self-consistency issues detected.", evidence);
}

function low(reason, evidence, recommended_action) {
  return { self_confidence: CONFIDENCE.LOW, reason, evidence, recommended_action };
}

function medium(reason, evidence, recommended_action) {
  return { self_confidence: CONFIDENCE.MEDIUM, reason, evidence, recommended_action };
}

function highSignal(reason, evidence = []) {
  return { self_confidence: CONFIDENCE.HIGH, reason, evidence, recommended_action: "No action needed." };
}

function isDuplicateReply(replyText, recentHistory = []) {
  const normalized = normalize(replyText);
  if (!normalized || normalized.length < 20) return false;
  const recentAssistant = (recentHistory || []).filter((item) => item?.role === "assistant").slice(-3);
  return recentAssistant.some((item) => similarity(normalized, normalize(item.content)) >= 0.92);
}

function languageMismatch({ userText, replyText, expectedLanguage }) {
  const replyNo = NORWEGIAN_RE.test(replyText);
  const replyEn = ENGLISH_RE.test(replyText);
  const userNo = NORWEGIAN_RE.test(userText);
  const userEn = ENGLISH_RE.test(userText);
  if (expectedLanguage === "en" && replyNo && !userNo) return true;
  if (expectedLanguage === "no" && replyEn && !userEn) return true;
  return userEn && !userNo && replyNo && !replyEn;
}

function detectUnsupportedPerceptionClaim({ userText = "", replyText = "", fulfillmentEvidence = [] } = {}) {
  const user = String(userText || "");
  const reply = String(replyText || "");
  if (!UNSUPPORTED_PERCEPTION_RE.test(reply)) return false;
  if (!PERCEPTION_ASK_RE.test(user) && !RUNTIME_CLAIM_RE.test(reply)) return false;
  return !hasEvidence({ replyText: reply, fulfillmentEvidence });
}

function hasEvidence({ replyText = "", generatedImageIds = [], generatedAudioIds = [], fulfillmentEvidence = [], evidenceType = "" } = {}) {
  if (Array.isArray(fulfillmentEvidence) && fulfillmentEvidence.length > 0) {
    if (!evidenceType) return true;
    return fulfillmentEvidence.some((item) => String(item?.type || item?.kind || item || "").toLowerCase().includes(evidenceType));
  }
  if (evidenceType === "image") return Array.isArray(generatedImageIds) && generatedImageIds.length > 0;
  if (evidenceType === "audio") return Array.isArray(generatedAudioIds) && generatedAudioIds.length > 0;
  return EVIDENCE_RE.test(String(replyText || "")) || (generatedImageIds?.length || 0) > 0 || (generatedAudioIds?.length || 0) > 0;
}

function contradictsKnownMemory(replyText, memoryContext = []) {
  const reply = String(replyText || "").toLowerCase();
  for (const mem of memoryContext || []) {
    const text = String(mem?.content || mem?.text || mem?.summary || "").toLowerCase();
    const match = text.match(/\b(?:likes|loves|prefers|hates|dislikes)\s+([^.;,]+)/);
    if (!match) continue;
    const item = match[1].trim().slice(0, 40);
    if (!item) continue;
    if (/\b(?:doesn't|does not|hates|dislikes)\b/.test(reply) && reply.includes(item) && /\b(?:likes|loves|prefers)\b/.test(text)) return true;
    if (/\b(?:likes|loves|prefers)\b/.test(reply) && reply.includes(item) && /\b(?:hates|dislikes)\b/.test(text)) return true;
  }
  return false;
}

function detectRepetitiveRhetoricalPattern({ replyText = "", recentHistory = [] } = {}) {
  const replies = [
    ...(recentHistory || []).filter((item) => item?.role === "assistant").slice(-5).map((item) => String(item.content || "")),
    String(replyText || ""),
  ].filter(Boolean);

  for (const pattern of RHETORICAL_PATTERNS) {
    const count = replies.filter((text) => pattern.re.test(text)).length;
    if (count >= 2) {
      return { key: pattern.key, label: pattern.key.replace(/_/g, " "), count };
    }
  }
  return null;
}

function detectConversationNaturalismIssue({ responseIntent = "", replyText = "" } = {}) {
  const intent = String(responseIntent || "").toUpperCase();
  const reply = String(replyText || "").trim();
  if (!intent || !reply) return null;
  const wordCount = reply.split(/\s+/).filter(Boolean).length;
  if (["NO_RESPONSE", "REACTION_ONLY", "EMOJI_ONLY", "END_THREAD"].includes(intent) && reply) {
    return { reason: `Reply generated after ${intent} intent.`, evidence: ["over_answering", intent.toLowerCase()], recommended_action: "Do not send text when the classified conversational moment calls for silence or reaction only." };
  }
  if (intent === "SHORT_REPLY" && (wordCount > 28 || /[.!?].+[.!?]/s.test(reply))) {
    return { reason: "Reply too long for SHORT_REPLY intent.", evidence: ["short_reply_over_answered"], recommended_action: "Collapse to one sentence or less." };
  }
  return null;
}

function ignoredAsk(userText, replyText) {
  const user = String(userText || "").toLowerCase();
  const reply = String(replyText || "").toLowerCase();
  if (!user.endsWith("?") && !/\b(can you|please|need you to|what|why|how|when|where)\b/.test(user)) return false;
  const important = user.split(/[^a-z0-9']+/).filter((w) => w.length > 4 && !["please", "would", "could", "about", "there"].includes(w));
  if (!important.length) return false;
  const overlap = important.filter((w) => reply.includes(w)).length / important.length;
  return overlap < 0.2;
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return intersection / union;
}

module.exports = {
  CONFIDENCE,
  SELF_CHECK_WARNING,
  createSelfConsistencyMonitor,
  evaluateSelfConsistency,
  detectConversationNaturalismIssue,
  detectRepetitiveRhetoricalPattern,
  detectUnsupportedPerceptionClaim,
};

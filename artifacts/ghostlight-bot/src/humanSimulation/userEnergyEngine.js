"use strict";

// Explicit statement patterns — ordered by specificity.
const ENERGY_EXPLICIT_PATTERNS = [
  { regex: /i'?m\s+(so\s+)?(fucking\s+)?(overwhelmed|overloaded|drowning\s+in)/i, state: 'overloaded', confidence: 0.93 },
  { regex: /i\s+can'?t\s+deal\s+with\s+(a\s+)?(giant|long|big|huge|lengthy)\s+explanation/i, state: 'overloaded', confidence: 0.92 },
  { regex: /just\s+tell\s+me\s+what\s+to\s+do(\s+next)?/i, state: 'overloaded', confidence: 0.87 },
  { regex: /too\s+much\s+to\s+(handle|process|take\s+in)\b/i, state: 'overloaded', confidence: 0.85 },
  { regex: /i'?m\s+(so\s+)?(fucking\s+)?(frustrated|pissed(\s+off)?|furious|livid)\b/i, state: 'frustrated', confidence: 0.94 },
  { regex: /i\s+could\s+scream\b/i, state: 'frustrated', confidence: 0.92 },
  { regex: /this\s+is\s+(so\s+)?(infuriating|maddening|ridiculous)\b/i, state: 'frustrated', confidence: 0.88 },
  { regex: /i'?m\s+(so\s+)?(fucking\s+)?(angry|mad|raging)\b/i, state: 'angry', confidence: 0.93 },
  { regex: /i'?m\s+(really\s+)?(exhausted|dead\s+tired|wiped\s+out)\b/i, state: 'tired', confidence: 0.9 },
  { regex: /i'?m\s+(so\s+)?tired\b/i, state: 'tired', confidence: 0.87 },
  { regex: /can('?t)?\s+keep\s+(my\s+)?eyes\s+open\b/i, state: 'tired', confidence: 0.88 },
  { regex: /i'?m\s+(really\s+)?(sad|devastated|heartbroken|crying)\b/i, state: 'sad', confidence: 0.9 },
  { regex: /i'?m\s+(feeling\s+)?(anxious|anxious|nervous|on\s+edge|panicking)\b/i, state: 'anxious', confidence: 0.88 },
  { regex: /i'?m\s+(so\s+)?(excited|thrilled|pumped|stoked)\b/i, state: 'excited', confidence: 0.88 },
  { regex: /i'?m\s+(in\s+)?(project\s+mode|build\s+mode|coding\s+mode|work\s+mode)\b/i, state: 'project_mode', confidence: 0.92 },
  { regex: /(?:really\s+)?focused\s+(right\s+now|on\s+this|at\s+the\s+moment)\b/i, state: 'focused', confidence: 0.84 },
  { regex: /i'?m\s+(calm|relaxed|chill|at\s+ease)\b/i, state: 'calm', confidence: 0.82 },
  { regex: /\b(hehe|lol|haha|lmao|😂|🤣|😏|😉|🙃)\b/i, state: 'playful', confidence: 0.6 },
  { regex: /😘|🥰|😍|💕|❤️|flirt/i, state: 'flirty', confidence: 0.65 },
  { regex: /repair\s+needed|we\s+need\s+to\s+talk\b/i, state: 'repair_needed', confidence: 0.78 },
];

// Style guidance per energy state — injected into prelude for LLM.
const STYLE_GUIDES = {
  overloaded: 'Reply shorter. Fewer questions. Be direct. Skip long explanations unless asked. No therapy-bot phrasing. No lists unless explicitly asked.',
  frustrated: 'Keep it direct and shorter. Fewer questions. Acknowledge briefly without over-explaining. Skip analysis. No therapy-bot phrasing.',
  angry: 'Be direct and brief. Skip analysis. Short reply. No therapy-bot phrasing. Do not ask if she wants to talk about it.',
  tired: 'Keep reply short and soft. Low energy tone. No demands or big questions. Quiet and present.',
  sad: 'Soft tone. Short. No big questions. No lists. No unsolicited advice. Presence over problem-solving.',
  anxious: 'Steady, calm tone. Shorter reply. Fewer questions. No escalation language. No emergency lists.',
  excited: 'Match the energy. Can be playful and warm. Lean into what is exciting.',
  playful: 'Can tease lightly. Playful and warm.',
  flirty: 'Warm, present, and flirtatious tone is appropriate here.',
  focused: 'Keep it concise and direct. Project-mode tone. Skip the emotional fluff.',
  project_mode: 'Concise. Direct. Project-mode tone. Skip emotional check-ins. Just the facts and next steps.',
  calm: 'Normal tone.',
  repair_needed: 'Soft and careful tone. Acknowledge first. Do not deflect.',
  unknown: null,
};

function inferEnergyFromSignals(text) {
  const t = String(text || '');
  if (!t.length) return null;

  const capsRatio = (t.match(/[A-Z]/g) || []).length / Math.max(t.replace(/\s/g, '').length, 1);
  const exclamationCount = (t.match(/!/g) || []).length;
  const questionCount = (t.match(/\?/g) || []).length;
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  const shortMessage = wordCount <= 8;

  if (capsRatio > 0.4 && exclamationCount >= 2) {
    return { state: 'frustrated', confidence: 0.65, evidence: 'high_caps_plus_exclamation' };
  }
  if (capsRatio > 0.6 && shortMessage) {
    return { state: 'frustrated', confidence: 0.6, evidence: 'all_caps_short_message' };
  }
  if (questionCount >= 3 && wordCount < 20) {
    return { state: 'anxious', confidence: 0.55, evidence: 'multiple_questions_short' };
  }
  if (shortMessage && wordCount <= 3 && exclamationCount === 0 && questionCount === 0) {
    return { state: 'tired', confidence: 0.45, evidence: 'very_short_flat' };
  }
  return null;
}

function detectUserEnergy(text) {
  const t = String(text || '');

  for (const pat of ENERGY_EXPLICIT_PATTERNS) {
    if (pat.regex.test(t)) {
      return {
        energy_state: pat.state,
        confidence: pat.confidence,
        evidence_summary: t.slice(0, 120),
      };
    }
  }

  const inferred = inferEnergyFromSignals(t);
  if (inferred && inferred.confidence >= 0.55) {
    return {
      energy_state: inferred.state,
      confidence: inferred.confidence,
      evidence_summary: `signal: ${inferred.evidence}`,
    };
  }

  return null;
}

async function saveEnergyObservation({ detected, store, userScope, companionId, sourceChannelId, sourceMessageId, adultPrivate }) {
  if (!detected || !store?.saveObservation) return null;
  return store.saveObservation({
    user_scope: userScope,
    companion_id: companionId,
    energy_state: detected.energy_state,
    confidence: detected.confidence,
    evidence_summary: detected.evidence_summary || '',
    source_channel_id: sourceChannelId || '',
    source_message_id: sourceMessageId || '',
    privacy_scope: adultPrivate ? 'private' : 'normal',
    adult_context: !!adultPrivate,
  });
}

async function retrieveRecentEnergy({ store, userScope, companionId, adultPrivate }) {
  if (!store?.getLatestObservation) return null;
  return store.getLatestObservation({
    user_scope: userScope,
    companion_id: companionId,
    include_adult: adultPrivate,
  });
}

function formatUserEnergyPrelude(observation) {
  if (!observation || observation.energy_state === 'unknown') return null;
  const guide = STYLE_GUIDES[observation.energy_state];
  if (!guide) return null;
  const conf = Math.round((observation.confidence || 0.5) * 100);
  return {
    label: 'USER ENERGY',
    content: `${observation.energy_state} (${conf}% confidence). Style guidance: ${guide}`,
  };
}

module.exports = { detectUserEnergy, saveEnergyObservation, retrieveRecentEnergy, formatUserEnergyPrelude };

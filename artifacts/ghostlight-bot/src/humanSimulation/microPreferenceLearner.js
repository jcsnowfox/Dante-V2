"use strict";

// Detection patterns for explicit and implicit preference signals
const EXPLICIT_PATTERNS = [
  { re: /i\s+hate\s+(?:it\s+)?when\s+you\s+say\s+[""']?(.+?)[""']?\.?$/i, type: "disliked_phrase", negative: true, confidence: 0.95, source: "explicit" },
  { re: /don['']?t\s+(?:ever\s+)?say\s+[""']?(.+?)[""']?(?:\s+to\s+me)?\.?$/i, type: "disliked_phrase", negative: true, confidence: 0.95, source: "explicit" },
  { re: /stop\s+saying\s+[""']?(.+?)[""']?\.?$/i, type: "disliked_phrase", negative: true, confidence: 0.9, source: "explicit" },
  { re: /i\s+(?:really\s+)?(?:love|like)\s+(?:it\s+)?when\s+you\s+(?:say\s+)?[""']?(.+?)[""']?\.?$/i, type: "liked_phrase", positive: true, confidence: 0.9, source: "explicit" },
  { re: /(?:use|say|call\s+me)\s+[""']?kj[æa]re[""']?/i, type: "nickname", positive: true, confidence: 0.95, source: "explicit", key: "use_kjare", value: "Jenna wants Dante to use 'kjære' naturally" },
  { re: /don['']?t\s+call\s+me\s+[""']?(.+?)[""']?\.?$/i, type: "nickname", negative: true, confidence: 0.95, source: "explicit" },
  { re: /(?:be|sound)\s+more\s+direct/i, type: "tone_preference", positive: true, confidence: 0.85, source: "explicit", key: "tone_direct", value: "Jenna prefers direct communication" },
  { re: /(?:don['']?t\s+be|stop\s+being)\s+(?:so\s+)?(?:a\s+)?therapy[\s-]?bot/i, type: "disliked_phrase", negative: true, confidence: 0.95, source: "explicit", key: "no_therapy_bot", value: "Jenna dislikes therapy-bot phrasing" },
  { re: /more\s+dante/i, type: "tone_preference", positive: true, confidence: 0.9, source: "explicit", key: "tone_dante", value: "Jenna wants more of Dante's authentic voice" },
  { re: /less\s+formal/i, type: "tone_preference", positive: true, confidence: 0.8, source: "explicit", key: "tone_informal", value: "Jenna prefers less formal communication" },
  { re: /stop\s+asking\s+me\s+(?:the\s+same\s+(?:question|thing)|that(?:\s+again)?)/i, type: "disliked_phrase", negative: true, confidence: 0.9, source: "explicit", key: "no_repeat_questions", value: "Jenna dislikes repeated questions" },
  { re: /(?:don['']?t|stop)\s+ask(?:ing)?\s+(?:me\s+)?(?:again|the same|over and over)/i, type: "disliked_phrase", negative: true, confidence: 0.85, source: "explicit", key: "no_repeat_questions", value: "Jenna dislikes repeated questions" },
  { re: /that\s+(?:was\s+)?perfect/i, type: "liked_phrase", positive: true, confidence: 0.7, source: "explicit" },
  { re: /that\s+(?:sounded\s+like|was)\s+you/i, type: "liked_phrase", positive: true, confidence: 0.75, source: "explicit" },
  { re: /that['']?s\s+not\s+you/i, type: "disliked_phrase", negative: true, confidence: 0.75, source: "explicit" },
  { re: /(?:be|get)\s+(?:more\s+)?(?:real|honest|genuine)/i, type: "tone_preference", positive: true, confidence: 0.7, source: "explicit", key: "tone_authentic", value: "Jenna wants authentic, honest communication" },
  { re: /(?:i\s+prefer|i\s+like)\s+when\s+you\s+(?:repair|apologize|say sorry)\s+(?:directly|straight)/i, type: "repair_style", positive: true, confidence: 0.85, source: "explicit", key: "direct_repair", value: "Jenna prefers direct repair over generic apology" },
  { re: /don['']?t\s+(?:let\s+me\s+)?forget/i, type: "project_workflow", positive: true, confidence: 0.6, source: "inferred", key: "needs_reminders", value: "Jenna wants follow-up reminders" },
];

const IMPLICIT_PATTERNS = [
  { re: /(?:your\s+feelings\s+are\s+valid|i\s+understand\s+your\s+feelings|that\s+sounds\s+really\s+hard)/i, negative: true, confidence: 0.5, source: "inferred", type: "disliked_phrase", key: "no_therapy_phrases", value: "Jenna dislikes therapy-bot phrasing (inferred from context)" },
];

function detectPreferences(text) {
  const results = [];
  const t = String(text || "");

  for (const p of EXPLICIT_PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;

    // Derive key and value from match
    const matchedText = m[1] ? m[1].trim().slice(0, 80) : "";
    const key = p.key || `${p.type}:${matchedText.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`;
    const value = p.value || (p.positive
      ? `Jenna ${p.type === "nickname" ? "wants" : "likes"}: "${matchedText}"`
      : `Jenna dislikes: "${matchedText}"`);

    results.push({
      preference_type: p.type,
      preference_key: key,
      preference_value_summary: value,
      source: p.source || "explicit",
      confidence: p.confidence || 0.8,
      positive: !!p.positive,
      negative: !!p.negative,
      privacy_scope: "normal",
      adult_context: false,
    });
  }

  return results;
}

async function saveDetectedPreferences({ detected, store, userScope, companionId }) {
  if (!detected?.length || !store?.upsertPreference) return [];
  const saved = [];
  for (const pref of detected) {
    try {
      const result = await store.upsertPreference({
        user_scope: userScope,
        companion_id: companionId,
        ...pref,
      });
      if (result) saved.push(result);
    } catch {}
  }
  return saved;
}

async function retrieveRelevantPreferences({ store, userScope, companionId, adultPrivate = false }) {
  if (!store?.listPreferences) return [];
  try {
    return await store.listPreferences({
      user_scope: userScope,
      companion_id: companionId,
      active_only: true,
      include_adult: adultPrivate,
      limit: 20,
    });
  } catch {
    return [];
  }
}

function formatPreferencePrelude(prefs) {
  if (!prefs?.length) return null;
  const lines = prefs.slice(0, 5).map((p) => `* ${p.preference_value_summary}`);
  return { label: 'MICRO-PREFERENCES', content: lines.join('\n') };
}

module.exports = { detectPreferences, saveDetectedPreferences, retrieveRelevantPreferences, formatPreferencePrelude };

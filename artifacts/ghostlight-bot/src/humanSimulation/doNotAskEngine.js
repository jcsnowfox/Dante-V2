"use strict";

// Ordered by specificity — more specific patterns first.
const DNA_PATTERNS = [
  // Emergency/health list opt-out
  { regex: /don'?t\s+give\s+me\s+(emergency|crisis)\s+(list|warning|info)s?\s+unless\s+i\s+ask/i, type: 'do_not_send_emergency_list', key_override: 'emergency_health_list', confidence: 0.95 },
  { regex: /don'?t\s+escalate\s+(?:to\s+)?(emergency|crisis|medical)\b/i, type: 'do_not_escalate', key_override: 'emergency_escalation', confidence: 0.92 },
  // Check-in opt-outs
  { regex: /stop\s+asking\s+(?:me\s+)?if\s+i'?m?\s+(okay|ok|alright|fine)/i, type: 'do_not_check_in', key_override: 'check_in_are_you_okay', confidence: 0.95 },
  { regex: /don'?t\s+keep\s+asking\s+(?:me\s+)?if\s+i'?m?\s+(okay|ok|alright|fine)/i, type: 'do_not_check_in', key_override: 'check_in_are_you_okay', confidence: 0.93 },
  { regex: /don'?t\s+check\s+in\s+(?:about\s+(?:this|that|\w+))?\s*(?:every\s+time)?/i, type: 'do_not_check_in', key_override: 'unsolicited_check_in', confidence: 0.88 },
  // Specific phrase bans — captures phrase in group 1
  { regex: /never\s+say\s+["']?([^"'\n]{3,60})["']?\s+(?:to\s+me\s+)?again\b/i, type: 'do_not_use_phrase', confidence: 0.95 },
  { regex: /don'?t\s+(?:ever\s+)?say\s+["']?([^"'\n]{3,60})["']?\s+(?:to\s+me\s+)?again\b/i, type: 'do_not_use_phrase', confidence: 0.92 },
  // Don't ask again — specific topic
  { regex: /don'?t\s+ask\s+me\s+(that|about\s+[^.!?]+)\s+again\b/i, type: 'do_not_ask', confidence: 0.92 },
  { regex: /stop\s+asking\s+me\s+(that|about\s+[^.!?]+)\b/i, type: 'do_not_ask', confidence: 0.9 },
  // Don't bring up
  { regex: /don'?t\s+bring\s+(that|this)\s+up\b/i, type: 'do_not_raise_topic', confidence: 0.88 },
  { regex: /never\s+bring\s+(that|this)\s+up\s+(again)?\b/i, type: 'do_not_raise_topic', confidence: 0.88 },
  // Don't explain
  { regex: /don'?t\s+explain\s+(this|that|it)\s+(?:to\s+me\s+)?again/i, type: 'do_not_explain', key_override: 'repeated_explanation', confidence: 0.87 },
  // Don't repeat
  { regex: /stop\s+repeating\s+(?:that|yourself)/i, type: 'do_not_repeat', key_override: 'general_repetition', confidence: 0.85 },
];

function extractCapturedPhrase(match) {
  if (match[1] && match[1].length >= 3 && match[1].length <= 80) {
    return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function detectDoNotAskLanguage(text) {
  const t = String(text || '');
  for (const pat of DNA_PATTERNS) {
    const m = t.match(pat.regex);
    if (m) {
      const matchedText = m[0].slice(0, 120);
      const exactPhrase = pat.type === 'do_not_use_phrase' ? extractCapturedPhrase(m) : null;
      const topicKey = pat.key_override ||
        matchedText.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
      return {
        rule_type: pat.type,
        topic_key: topicKey,
        rule_summary: matchedText,
        exact_phrase: exactPhrase,
        confidence: pat.confidence || 0.8,
      };
    }
  }
  return null;
}

async function saveDoNotAskRule({ detected, store, userScope, companionId, sourceChannelId, sourceMessageId, adultPrivate }) {
  if (!detected || !store?.upsertRule) return null;
  return store.upsertRule({
    user_scope: userScope,
    companion_id: companionId,
    rule_type: detected.rule_type,
    topic_key: detected.topic_key,
    rule_summary: detected.rule_summary,
    exact_phrase: detected.exact_phrase,
    scope: 'all_channels',
    expiry_at: null,
    privacy_scope: adultPrivate ? 'private' : 'normal',
    adult_context: !!adultPrivate,
    source_channel_id: sourceChannelId || '',
    source_message_id: sourceMessageId || '',
  });
}

async function retrieveActiveRules({ store, userScope, companionId, adultPrivate }) {
  if (!store?.listRules) return [];
  return store.listRules({
    user_scope: userScope,
    companion_id: companionId,
    active_only: true,
    include_adult: adultPrivate,
    limit: 30,
  });
}

function formatDoNotAskPrelude(rules, adultPrivate) {
  if (!rules?.length) return null;
  const visible = rules.filter(r => adultPrivate ? true : !r.adult_context);
  if (!visible.length) return null;
  const lines = visible.slice(0, 6).map(r => {
    const phrase = r.exact_phrase ? ` ("${r.exact_phrase}")` : '';
    return `* ${r.rule_summary}${phrase} (${r.rule_type})`;
  });
  return { label: 'DO-NOT-ASK', content: lines.join('\n') };
}

// Returns true if text contains a phrase that is explicitly banned by a do_not_use_phrase rule.
function isPhraseBanned(text, rules) {
  if (!rules?.length || !text) return false;
  const t = String(text).toLowerCase();
  return rules.some(r => {
    if (r.rule_type !== 'do_not_use_phrase') return false;
    if (r.exact_phrase && t.includes(r.exact_phrase.toLowerCase())) return true;
    return false;
  });
}

module.exports = { detectDoNotAskLanguage, saveDoNotAskRule, retrieveActiveRules, formatDoNotAskPrelude, isPhraseBanned };

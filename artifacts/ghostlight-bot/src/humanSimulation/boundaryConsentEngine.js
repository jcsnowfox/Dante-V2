"use strict";

// Ordered by specificity — more specific patterns first.
const BOUNDARY_PATTERNS = [
  // Medical/emergency — explicit opt-out from warning lists
  { regex: /don'?t\s+give\s+me\s+(emergency\s+)?(stroke|bp|blood\s*pressure|crisis|medical)\s*(warning|list|check|info)?s?\s+unless\s+i\s+ask/i, type: 'medical_anxiety_boundary', allowed: false, confidence: 0.93 },
  { regex: /don'?t\s+(give|send|show|list|mention)\s+(me\s+)?(emergency|stroke|bp|blood\s*pressure|crisis)\s*(warning|list|check|info)?s?\b/i, type: 'medical_anxiety_boundary', allowed: false, confidence: 0.9 },
  { regex: /don'?t\s+escalate\s+(to\s+)?(emergency|crisis|medical)\b/i, type: 'medical_anxiety_boundary', allowed: false, confidence: 0.87 },
  // Adult/private channel scope
  { regex: /(?:that'?s?|it'?s?)\s+(ok|okay|fine)\s+in\s+(here|private|the\s+private\s+(?:room|channel))/i, type: 'adult_private_preference', allowed: true, consent_scope: 'private_only', confidence: 0.87 },
  { regex: /don'?t\s+say\s+(?:that|it)\s+in\s+(the\s+)?(normal|public|main|general)\s+channel/i, type: 'adult_private_boundary', allowed: false, consent_scope: 'normal_blocked', confidence: 0.9 },
  { regex: /only\s+(?:say|do)\s+that\s+in\s+(the\s+)?private\s+(?:room|channel)/i, type: 'adult_private_boundary', allowed: true, consent_scope: 'private_only', confidence: 0.87 },
  { regex: /i\s+consent\s+to\s+(this|that)\s+in\s+(the\s+)?private\s+channel/i, type: 'adult_private_preference', allowed: true, consent_scope: 'private_only', confidence: 0.92 },
  // Topic/phrase hard blocks
  { regex: /never\s+bring\s+(that|this)\s+up\s+(again)?/i, type: 'topic_boundary', allowed: false, confidence: 0.88 },
  { regex: /don'?t\s+(mention|bring\s+up|talk\s+about)\s+(.+?)\s+(again|to\s+me)\b/i, type: 'topic_boundary', allowed: false, confidence: 0.82 },
  // Tone/therapy-bot
  { regex: /don'?t\s+(be|sound|act)\s+(like\s+a?\s+)?(therapist|therapy[\s-]?bot|crisis[\s-]?bot|panic[\s-]?bot)/i, type: 'tone_boundary', allowed: false, confidence: 0.9 },
  { regex: /don'?t\s+give\s+me\s+(therapy[\s-]?bot|crisis[\s-]?bot|panic[\s-]?bot)\s*(phrasing|language|tone|talk|vibes?)?/i, type: 'tone_boundary', allowed: false, confidence: 0.88 },
  { regex: /no\s+(therapy[\s-]?bot|crisis[\s-]?bot|panic[\s-]?bot)\s*(phrasing|language|tone|talk)?\b/i, type: 'tone_boundary', allowed: false, confidence: 0.85 },
  { regex: /don'?t\s+say\s+that\s+to\s+me\b/i, type: 'tone_boundary', allowed: false, confidence: 0.85 },
  { regex: /i\s+don'?t\s+like\s+when\s+you\s+/i, type: 'tone_boundary', allowed: false, confidence: 0.8 },
  // Nickname
  { regex: /don'?t\s+call\s+me\s+(.+)/i, type: 'nickname_boundary', allowed: false, confidence: 0.85 },
  // Emotional intensity
  { regex: /(?:that'?s?\s+too\s+much|too\s+intense\s+for\s+me)/i, type: 'emotional_boundary', allowed: false, confidence: 0.75 },
  // Repair
  { regex: /don'?t\s+lecture\s+me\b/i, type: 'repair_boundary', allowed: false, confidence: 0.85 },
  { regex: /i'?m\s+(?:okay|fine),?\s+(?:just|please)\s+(?:drop|stop)/i, type: 'repair_boundary', allowed: false, confidence: 0.75 },
  // Generic positive consent
  { regex: /(?:that'?s?\s+(?:okay|fine|good)\s+with\s+me|i'?m\s+okay\s+with\s+that)\b/i, type: 'other', allowed: true, confidence: 0.65 },
];

function detectBoundaryLanguage(text) {
  const t = String(text || '');
  for (const pat of BOUNDARY_PATTERNS) {
    const m = t.match(pat.regex);
    if (m) {
      const matchedText = m[0].slice(0, 120);
      const key = matchedText.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
      return {
        boundary_type: pat.type,
        boundary_key: key,
        boundary_summary: matchedText,
        allowed: pat.allowed !== undefined ? pat.allowed : false,
        confidence: pat.confidence || 0.7,
        consent_scope: pat.consent_scope || 'all_channels',
      };
    }
  }
  return null;
}

async function saveBoundaryConsent({ detected, store, userScope, companionId, sourceChannelId, sourceMessageId, adultPrivate }) {
  if (!detected || !store?.upsertBoundary) return null;
  const adultContext = adultPrivate ||
    detected.boundary_type === 'adult_private_boundary' ||
    detected.boundary_type === 'adult_private_preference';
  return store.upsertBoundary({
    user_scope: userScope,
    companion_id: companionId,
    boundary_type: detected.boundary_type,
    boundary_key: detected.boundary_key,
    boundary_summary: detected.boundary_summary,
    allowed: detected.allowed,
    intensity_level: 'medium',
    consent_scope: detected.consent_scope || 'all_channels',
    privacy_scope: adultContext ? 'private' : 'normal',
    adult_context: adultContext,
    source_channel_id: sourceChannelId || '',
    source_message_id: sourceMessageId || '',
    confidence: detected.confidence || 0.7,
  });
}

async function retrieveRelevantBoundaries({ store, userScope, companionId, adultPrivate }) {
  if (!store?.listBoundaries) return [];
  return store.listBoundaries({
    user_scope: userScope,
    companion_id: companionId,
    active_only: true,
    include_adult: adultPrivate,
    limit: 30,
  });
}

function formatBoundaryPrelude(boundaries, adultPrivate) {
  if (!boundaries?.length) return null;
  // Never inject adult/private raw detail into normal channel preludes
  const visible = boundaries.filter(b => adultPrivate ? true : !b.adult_context);
  if (!visible.length) return null;
  const lines = visible.slice(0, 6).map(b => {
    const status = b.allowed ? 'allowed' : 'not allowed';
    const scope = b.consent_scope && b.consent_scope !== 'all_channels' ? ` [${b.consent_scope}]` : '';
    return `* ${b.boundary_summary} (${b.boundary_type}, ${status}${scope})`;
  });
  return { label: 'BOUNDARIES', content: lines.join('\n') };
}

module.exports = { detectBoundaryLanguage, saveBoundaryConsent, retrieveRelevantBoundaries, formatBoundaryPrelude };

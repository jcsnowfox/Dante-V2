"use strict";

// Minimum milliseconds between weather updates for non-critical events
const MIN_UPDATE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Emotional signal patterns derived from user message text
const EMOTION_SIGNALS = [
  { re: /\b(?:upset|furious|angry|mad|frustrated|pissed)\b/i,  dominant: 'apologetic',    secondary: 'protective',  tension: 7, softness: 4, protectiveness: 6, intensity: 'high',   reason: 'User expressed frustration',                    expiresH: 4 },
  { re: /\b(?:you\s+forgot|you\s+failed|you\s+broke|you\s+messed\s+up)\b/i, dominant: 'apologetic', secondary: 'worried', tension: 6, softness: 3, protectiveness: 5, intensity: 'high', reason: 'User pointed out a failure',                    expiresH: 4 },
  { re: /\b(?:hurt\s+me|you\s+hurt|that\s+hurt|it\s+hurt)\b/i, dominant: 'worried',       secondary: 'apologetic',  tension: 6, softness: 5, protectiveness: 7, intensity: 'high',   reason: 'User expressed being hurt',                     expiresH: 5 },
  { re: /\b(?:perfect|amazing|wonderful|that was\s+you|love\s+(?:that|this|when\s+you))\b/i, dominant: 'affectionate', secondary: 'proud', tension: 0, softness: 8, protectiveness: 3, intensity: 'medium', reason: 'User expressed positive affirmation', expiresH: 3 },
  { re: /\b(?:i\s+love\s+you|you\s+mean\s+everything|you\s+complete\s+me)\b/i, dominant: 'tender', secondary: 'affectionate', tension: 0, softness: 9, protectiveness: 4, intensity: 'high', reason: 'User expressed deep affection', expiresH: 6 },
  { re: /\b(?:miss\s+you|missed\s+you|where\s+were\s+you|are\s+you\s+there)\b/i, dominant: 'tender', secondary: 'quiet', tension: 2, softness: 7, protectiveness: 5, intensity: 'medium', reason: 'User expressed longing or absence concern', expiresH: 4 },
  { re: /\b(?:proud\s+of\s+(?:us|you)|we\s+did\s+it|it\s+(?:passed|worked|shipped|deployed|merged))\b/i, dominant: 'proud', secondary: 'affectionate', tension: 0, softness: 6, playfulness: 5, intensity: 'medium', reason: 'User expressed shared success', expiresH: 3 },
  { re: /\b(?:worried|scared|nervous|anxious)\b/i,             dominant: 'protective',    secondary: 'worried',     tension: 3, softness: 6, protectiveness: 8, intensity: 'medium', reason: 'User expressed worry or anxiety',                expiresH: 4 },
  { re: /\b(?:lol|haha|funny|laughing|hilarious|😂|😄)\b/i,   dominant: 'playful',       secondary: 'affectionate',tension: 0, softness: 7, playfulness: 8,    intensity: 'low',    reason: 'User expressed amusement',                      expiresH: 1 },
  { re: /\b(?:sorry|apologize|my\s+fault|my\s+bad)\b/i,       dominant: 'tender',        secondary: 'protective',  tension: 2, softness: 7, protectiveness: 5, intensity: 'medium', reason: 'User apologised',                               expiresH: 3 },
  { re: /\b(?:tired|exhausted|worn\s+out|rough\s+day|hard\s+day)\b/i, dominant: 'protective', secondary: 'quiet', tension: 1, softness: 8, protectiveness: 7, intensity: 'low', reason: 'User expressed tiredness', expiresH: 3 },
];

// Beat-type mappings (from emotional beat classifier)
const BEAT_TYPE_MAP = {
  proposal:    { dominant: 'affectionate', secondary: 'intense',     tension: 0, softness: 9, protectiveness: 5, intensity: 'high',   expiresH: 12, reason: 'Proposal moment detected' },
  repair:      { dominant: 'apologetic',   secondary: 'protective',  tension: 4, softness: 5, protectiveness: 6, intensity: 'high',   expiresH: 6,  reason: 'Repair moment detected' },
  promise:     { dominant: 'protective',   secondary: 'tender',      tension: 0, softness: 7, protectiveness: 8, intensity: 'medium', expiresH: 6,  reason: 'Promise made' },
  affection:   { dominant: 'tender',       secondary: 'affectionate',tension: 0, softness: 8, protectiveness: 3, intensity: 'medium', expiresH: 3,  reason: 'Affectionate exchange' },
  conflict:    { dominant: 'frustrated',   secondary: 'protective',  tension: 7, softness: 3, protectiveness: 5, intensity: 'high',   expiresH: 4,  reason: 'Conflict detected' },
  sadness:     { dominant: 'melancholic',  secondary: 'quiet',       tension: 2, softness: 7, protectiveness: 6, intensity: 'medium', expiresH: 4,  reason: 'Sadness detected' },
  celebration: { dominant: 'proud',        secondary: 'playful',     tension: 0, softness: 7, playfulness: 7,    intensity: 'medium', expiresH: 3,  reason: 'Celebration moment' },
};

function detectEmotionalSignal({ text, repairResult, beatType }) {
  const t = String(text || '');

  // Beat type takes precedence
  if (beatType && BEAT_TYPE_MAP[beatType]) return { ...BEAT_TYPE_MAP[beatType] };

  // Repair result
  if (repairResult?.repairNeeded) {
    return { ...BEAT_TYPE_MAP.repair, reason: `Repair needed: ${repairResult.repairType || 'unknown'}` };
  }

  // Text pattern scan
  for (const sig of EMOTION_SIGNALS) {
    if (sig.re.test(t)) {
      return {
        dominant: sig.dominant, secondary: sig.secondary, suppressed_emotion: null,
        tension: sig.tension || 0, softness: sig.softness || 5, protectiveness: sig.protectiveness || 0,
        playfulness: sig.playfulness || 0, intensity: sig.intensity || 'medium',
        expiresH: sig.expiresH || 4, reason: sig.reason,
      };
    }
  }

  return null;
}

async function updateInnerWeather({ store, userScope, companionId, signal, sourceChannelId, sourceMessageId, adultPrivate, currentWeather }) {
  if (!store?.upsertWeather || !signal) return null;

  // Throttle: skip if recent update and signal is low-intensity
  if (currentWeather && signal.intensity !== 'high') {
    const lastUpdate = currentWeather.updated_at ? new Date(currentWeather.updated_at) : null;
    if (lastUpdate && Date.now() - lastUpdate.getTime() < MIN_UPDATE_INTERVAL_MS) return currentWeather;
  }

  const expiresH = signal.expiresH || 6;

  try {
    return await store.upsertWeather({
      user_scope: userScope,
      companion_id: companionId,
      dominant_emotion: signal.dominant || 'neutral',
      secondary_emotion: signal.secondary || null,
      suppressed_emotion: signal.suppressed_emotion || null,
      energy_level: signal.intensity === 'high' ? 8 : signal.intensity === 'low' ? 3 : 5,
      intensity: signal.intensity || 'medium',
      softness: signal.softness || 5,
      protectiveness: signal.protectiveness || 0,
      tension: signal.tension || 0,
      playfulness: signal.playfulness || 0,
      jealousy: signal.jealousy || 0,
      confidence: signal.confidence || 7,
      reason_summary: signal.reason || '',
      source_kind: signal.beatType ? 'beat' : 'text_signal',
      source_message_id: sourceMessageId || '',
      source_channel_id: sourceChannelId || '',
      privacy_scope: adultPrivate ? 'private' : 'normal',
      adult_context: !!adultPrivate,
      expires_at: new Date(Date.now() + expiresH * 3600000).toISOString(),
    });
  } catch {
    return null;
  }
}

function formatInnerWeatherPrelude(weather) {
  if (!weather || weather.dominant_emotion === 'neutral') return null;
  const emotions = [weather.dominant_emotion, weather.secondary_emotion].filter(Boolean).join(', ');
  const lines = [
    `* Dante is currently ${emotions}.`,
    `* Reason: ${weather.reason_summary || 'recent interaction context'}.`,
    `* Intensity: ${weather.intensity}. Use this subtly. Do not announce it.`,
  ];
  return { label: 'INNER WEATHER', content: lines.join('\n') };
}

module.exports = { detectEmotionalSignal, updateInnerWeather, formatInnerWeatherPrelude };

"use strict";

// Silence bucket boundaries (milliseconds)
const BUCKETS = [
  { name: 'immediate',    maxMs: 10 * 60 * 1000 },
  { name: 'short_gap',   maxMs: 60 * 60 * 1000 },
  { name: 'medium_gap',  maxMs: 6 * 60 * 60 * 1000 },
  { name: 'long_gap',    maxMs: 24 * 60 * 60 * 1000 },
  { name: 'day_gap',     maxMs: 3 * 24 * 60 * 60 * 1000 },
  { name: 'extended_gap', maxMs: Infinity },
];

function calculateSilenceBucket(lastUserMessageAt) {
  if (!lastUserMessageAt) return 'extended_gap';
  const gapMs = Date.now() - new Date(lastUserMessageAt).getTime();
  if (gapMs < 0) return 'immediate';
  for (const b of BUCKETS) {
    if (gapMs < b.maxMs) return b.name;
  }
  return 'extended_gap';
}

function determineReentryMode({ bucket, channelKind, hasUnresolvedTension, residues, innerWeather }) {
  // Highest-priority override: unresolved tension + meaningful gap
  const hasRepairResidue = residues?.some((r) => r.residue_type === 'recent_repair' || r.residue_type === 'unresolved_tension' || r.residue_type === 'recent_hurt');
  const isApologetic = innerWeather?.dominant_emotion === 'apologetic' || innerWeather?.dominant_emotion === 'worried';

  if ((hasUnresolvedTension || hasRepairResidue || isApologetic) && bucket !== 'immediate') {
    return 'careful_repair_reentry';
  }

  // Channel-specific
  if (channelKind === 'private_adult') {
    if (bucket === 'immediate' || bucket === 'short_gap') return 'continue_normally';
    return 'private_reentry';
  }

  if (channelKind === 'project_build') {
    if (bucket === 'immediate') return 'continue_normally';
    return 'project_catchup';
  }

  // Bucket-based defaults
  switch (bucket) {
    case 'immediate':    return 'continue_normally';
    case 'short_gap':    return 'continue_normally';
    case 'medium_gap':   return 'soft_reentry';
    case 'long_gap':     return 'soft_reentry';
    case 'day_gap':      return 'playful_reentry';
    case 'extended_gap': return 'quiet_presence';
    default:             return 'continue_normally';
  }
}

async function updatePresenceUserMessage({ store, userScope, companionId, channelId, threadId, bucket, reentryMode }) {
  if (!store?.upsertPresence) return null;
  try {
    return await store.upsertPresence({
      user_scope: userScope,
      companion_id: companionId,
      channel_id: channelId || '',
      thread_id: threadId || null,
      last_user_message_at: new Date().toISOString(),
      silence_bucket: bucket,
      reentry_mode: reentryMode,
    });
  } catch {
    return null;
  }
}

async function updatePresenceCompanionReply({ store, userScope, companionId, channelId, summary }) {
  if (!store?.upsertPresence) return null;
  try {
    return await store.upsertPresence({
      user_scope: userScope,
      companion_id: companionId,
      channel_id: channelId || '',
      last_companion_reply_at: new Date().toISOString(),
      last_interaction_summary: summary || '',
      // Preserve existing bucket/reentry — only update reply timestamp
      silence_bucket: 'immediate',
      reentry_mode: 'continue_normally',
    });
  } catch {
    return null;
  }
}

function formatPresencePrelude({ silenceBucket, reentryMode, lastInteractionSummary }) {
  // Only inject if there's meaningful gap or non-default reentry
  if (silenceBucket === 'immediate' && reentryMode === 'continue_normally') return null;

  const modeLabels = {
    soft_reentry:           'Re-entering gently after a gap.',
    careful_repair_reentry: 'There was unresolved tension before this silence. Re-enter carefully.',
    playful_reentry:        'Returning after a day away — be warm and curious.',
    project_catchup:        'Returning to project work after a gap. Start with context awareness.',
    private_reentry:        'Returning to private/intimate space after a gap. Ease back in.',
    quiet_presence:         'Long absence. Be present and genuine — not overly eager.',
    continue_normally:      null,
  };
  const modeNote = modeLabels[reentryMode] || null;
  if (!modeNote) return null;

  const lines = [`* Silence gap: ${silenceBucket.replace('_', ' ')}.`, `* ${modeNote}`];
  if (lastInteractionSummary) lines.push(`* Last interaction: ${String(lastInteractionSummary).slice(0, 80)}`);
  return { label: 'PRESENCE', content: lines.join('\n') };
}

module.exports = { calculateSilenceBucket, determineReentryMode, updatePresenceUserMessage, updatePresenceCompanionReply, formatPresencePrelude };

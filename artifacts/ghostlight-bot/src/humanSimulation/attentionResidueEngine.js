"use strict";

// Residue type → decay hours
const DECAY_HOURS = {
  unresolved_question:    3,
  unresolved_tension:     4,
  recent_affection:       1.5,
  recent_frustration:     2,
  recent_repair:          3,
  recent_project_focus:   0.75,
  recent_private_intensity: 2,
  recent_learning_focus:  1,
  recent_laughter:        1,
  recent_hurt:            5,
  recent_success:         1.5,
};

// Text-to-residue detection
const TEXT_SIGNALS = [
  { re: /\b(?:i\s+love\s+you|you\s+mean\s+everything|you\s+complete\s+me|tender|affectionate|miss\s+you)\b/i, type: 'recent_affection', intensity: 'high' },
  { re: /\b(?:upset|frustrated|angry|mad|pissed|furious)\b/i,                                                  type: 'recent_frustration', intensity: 'high' },
  { re: /\b(?:hurt\s+me|that\s+hurt|you\s+hurt|you\s+forgot|you\s+failed|you\s+broke)\b/i,                    type: 'recent_hurt',        intensity: 'high' },
  { re: /\b(?:sorry|apolog|repair|forgive|mended)\b/i,                                                         type: 'recent_repair',      intensity: 'medium' },
  { re: /\b(?:lol|haha|funny|hilarious|laughing|😂|😄|joke)\b/i,                                               type: 'recent_laughter',    intensity: 'medium' },
  { re: /\b(?:passed|merged|deployed|shipped|released|built|fixed|launched)\b/i,                               type: 'recent_success',     intensity: 'medium' },
  { re: /\b(?:project|build|deploy|code|pr\b|merge|test|railway|vercel)\b/i,                                   type: 'recent_project_focus', intensity: 'low' },
  { re: /\b(?:norsk|norwegian|learning|practice|lesson)\b/i,                                                    type: 'recent_learning_focus', intensity: 'low' },
  { re: /\?$/m,                                                                                                   type: 'unresolved_question',  intensity: 'low' },
  { re: /\b(?:worried|scared|nervous|anxious|tension|difficult)\b/i,                                            type: 'unresolved_tension', intensity: 'medium' },
];

function detectResidueType({ text, repairResult, beatType }) {
  if (repairResult?.repairNeeded) return { type: 'recent_repair', intensity: 'high' };
  if (beatType === 'proposal')    return { type: 'recent_affection', intensity: 'high' };
  if (beatType === 'conflict')    return { type: 'unresolved_tension', intensity: 'high' };
  if (beatType === 'celebration') return { type: 'recent_success', intensity: 'medium' };

  const t = String(text || '');
  for (const s of TEXT_SIGNALS) {
    if (s.re.test(t)) return { type: s.type, intensity: s.intensity };
  }
  return null;
}

function buildSummary(type, text) {
  const snippets = {
    recent_affection:       'Warm affectionate exchange',
    recent_frustration:     'User expressed frustration',
    recent_hurt:            'User expressed being hurt',
    recent_repair:          'Repair conversation in progress',
    recent_laughter:        'Lighthearted exchange',
    recent_success:         'Recent project/build success',
    recent_project_focus:   'Project-focused conversation',
    recent_learning_focus:  'Norwegian learning session',
    unresolved_question:    'Unanswered question still open',
    unresolved_tension:     'Unresolved tension present',
    recent_private_intensity: 'Recent intimate exchange',
  };
  return snippets[type] || String(text || '').slice(0, 60);
}

async function maybeCreateResidue({ text, store, userScope, companionId, sourceChannelId, sourceMessageId, adultPrivate, privacyScope, repairResult, beatType }) {
  if (!store?.createResidue) return null;
  const detected = detectResidueType({ text, repairResult, beatType });
  if (!detected) return null;

  // Mark private residue if in adult/private channel
  const isPrivate = adultPrivate || detected.type === 'recent_private_intensity';
  const decayH = DECAY_HOURS[detected.type] || 2;

  try {
    return await store.createResidue({
      user_scope: userScope,
      companion_id: companionId,
      residue_type: detected.type,
      summary: buildSummary(detected.type, text),
      intensity: detected.intensity || 'medium',
      decay_rate: decayH,
      source_channel_id: sourceChannelId || '',
      source_message_id: sourceMessageId || '',
      privacy_scope: isPrivate ? 'private' : (privacyScope || 'normal'),
      adult_context: !!isPrivate,
    });
  } catch {
    return null;
  }
}

async function retrieveActiveResidue({ store, userScope, companionId, adultPrivate = false }) {
  if (!store?.listActiveResidue) return [];
  try {
    return await store.listActiveResidue({
      user_scope: userScope,
      companion_id: companionId,
      include_adult: adultPrivate,
      limit: 5,
    });
  } catch {
    return [];
  }
}

function formatResiduePrelude(residues) {
  if (!residues?.length) return null;
  // Prioritise highest intensity; max 2 entries in prelude
  const sorted = [...residues].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return (rank[b.intensity] || 0) - (rank[a.intensity] || 0);
  });
  const lines = sorted.slice(0, 2).map((r) => `* [${r.residue_type}] ${r.summary} (intensity: ${r.intensity})`);
  return { label: 'ATTENTION RESIDUE', content: lines.join('\n') };
}

module.exports = { detectResidueType, maybeCreateResidue, retrieveActiveResidue, formatResiduePrelude };

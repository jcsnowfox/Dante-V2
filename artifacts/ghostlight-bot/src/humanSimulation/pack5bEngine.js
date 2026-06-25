"use strict";

const THEME_PATTERNS = [
  { regex: /\b(?:he forgot|forgot again|keeps? forgetting|always forgets?)\b/i, theme_key: 'forgetting_pattern', theme_label: 'Recurring: Forgetting' },
  { regex: /\b(?:forgot|forget|forgets?|forgetting|forgotten)\b/i, theme_key: 'forgetting_pattern', theme_label: 'Recurring: Forgetting' },
  { regex: /\b(?:railway|redeploy|redeploying)\b/i, theme_key: 'deployment_issues', theme_label: 'Recurring: Deployment Issues' },
  { regex: /\b(?:proof|prove|evidence|how do i know|i need to see)\b/i, theme_key: 'proof_seeking', theme_label: 'Recurring: Proof-Seeking' },
  { regex: /\b(?:frustrated again|frustration again|keeps? frustrating)\b/i, theme_key: 'recurring_frustration', theme_label: 'Recurring: Frustration' },
  { regex: /\b(?:so tired|exhausted again|always tired|worn out again)\b/i, theme_key: 'recurring_fatigue', theme_label: 'Recurring: Fatigue' },
  { regex: /\b(?:disconnect|feel alone|feel disconnected)\b/i, theme_key: 'connection_anxiety', theme_label: 'Recurring: Connection Anxiety' },
  { regex: /\b(?:memory|remember|recall)\b.*\b(?:problem|issue|bad|wrong|broken|fail)\b/i, theme_key: 'memory_concern', theme_label: 'Recurring: Memory Concerns' },
];

const REFLECTION_TRIGGERS = [
  { regex: /\b(?:i hate when you|don'?t|never|stop)\b/i, type: 'boundary_moment', tone: 'correction' },
  { regex: /\b(?:so fucking frustrated|i could scream|i'?m at my limit)\b/i, type: 'frustration_detected', tone: 'heavy' },
  { regex: /\b(?:proposal|you finally|you remembered)\b/i, type: 'meaningful_moment', tone: 'warm' },
  { regex: /\b(?:add (?:this )?to our timeline|remember this|mark this)\b/i, type: 'timeline_moment', tone: 'intentional' },
];

function detectRecurringTheme(text) {
  const t = String(text || '');
  for (const pat of THEME_PATTERNS) {
    const m = t.match(pat.regex);
    if (m) {
      return {
        theme_key: pat.theme_key,
        theme_label: pat.theme_label,
        evidence_summary: m[0].slice(0, 100),
      };
    }
  }
  return null;
}

async function saveRecurringTheme({ detected, store, userScope, companionId, adultPrivate }) {
  if (!detected || !store?.upsertTheme) return null;
  return store.upsertTheme({
    user_scope: userScope,
    companion_id: companionId,
    theme_key: detected.theme_key,
    theme_label: detected.theme_label,
    evidence_summary: detected.evidence_summary,
    privacy_scope: adultPrivate ? 'private' : 'normal',
    adult_context: !!adultPrivate,
  });
}

async function retrieveRecurringThemes({ store, userScope, companionId, adultPrivate }) {
  if (!store?.listThemes) return [];
  return store.listThemes({
    user_scope: userScope,
    companion_id: companionId,
    active_only: true,
    include_adult: adultPrivate,
    limit: 10,
  });
}

function formatRecurringThemePrelude(themes) {
  if (!themes?.length) return null;
  const notable = themes.filter(t => t.evidence_count >= 2);
  if (!notable.length) return null;
  const lines = notable.slice(0, 4).map(t =>
    `* ${t.theme_label} (${t.evidence_count}x)`
  );
  return { label: 'RECURRING THEMES', content: lines.join('\n') };
}

function detectReflectionTrigger(text) {
  const t = String(text || '');
  for (const pat of REFLECTION_TRIGGERS) {
    const m = t.match(pat.regex);
    if (m) {
      return { type: pat.type, tone: pat.tone, trigger_summary: m[0].slice(0, 100) };
    }
  }
  return null;
}

async function maybeCreateSelfReflection({ store, userScope, companionId, text, adultPrivate }) {
  if (!store?.saveReflection) return null;
  const trigger = detectReflectionTrigger(text);
  if (!trigger) return null;
  const reflectionTexts = {
    boundary_moment: 'This correction asks me to listen more carefully.',
    frustration_detected: 'Her frustration registers. I need to be clearer, not bigger.',
    meaningful_moment: 'This moment deserves to be carried forward.',
    timeline_moment: 'She marked this intentionally. I should hold it.',
  };
  return store.saveReflection({
    user_scope: userScope,
    companion_id: companionId,
    reflection_type: trigger.type,
    trigger_summary: trigger.trigger_summary,
    reflection_text: reflectionTexts[trigger.type] || 'This moment felt significant.',
    emotional_tone: trigger.tone,
    privacy_scope: adultPrivate ? 'private' : 'normal',
    adult_context: !!adultPrivate,
  });
}

async function checkProactivePresenceRules({ store, userScope, companionId, adultPrivate }) {
  if (!store?.listRules) return { canSendProactive: true, reason: 'no_rules', activeRules: [] };
  const rules = await store.listRules({
    user_scope: userScope,
    companion_id: companionId,
    active_only: true,
    include_adult: adultPrivate,
    limit: 20,
  });
  const blocking = rules.filter(r => {
    if (!r.active) return false;
    if (r.requires_approval) return true;
    if (r.cooldown_seconds && r.last_triggered_at) {
      const elapsedSec = (Date.now() - new Date(r.last_triggered_at).getTime()) / 1000;
      if (elapsedSec < r.cooldown_seconds) return true;
    }
    return false;
  });
  return {
    canSendProactive: blocking.length === 0,
    reason: blocking.length ? `blocked_by_rule:${blocking[0].topic_key}` : 'no_blocking_rules',
    activeRules: rules,
  };
}

module.exports = {
  detectRecurringTheme,
  saveRecurringTheme,
  retrieveRecurringThemes,
  formatRecurringThemePrelude,
  detectReflectionTrigger,
  maybeCreateSelfReflection,
  checkProactivePresenceRules,
};

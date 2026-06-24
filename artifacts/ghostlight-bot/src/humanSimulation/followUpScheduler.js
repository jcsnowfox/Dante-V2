"use strict";

// Follow-up triggers from user messages
const TRIGGER_PATTERNS = [
  { re: /don['']?t\s+(?:let\s+me\s+)?forget\s+(?:to\s+)?(.+)/i, type: "reminder", priority: "normal", delayHours: 24 },
  { re: /remind\s+me\s+(?:to\s+)?(.+)/i, type: "reminder", priority: "normal", delayHours: 24 },
  { re: /ask\s+me\s+(?:about\s+(?:this\s+)?)?later/i, type: "reminder", priority: "normal", delayHours: 12 },
  { re: /check\s+(?:on|if|back)\s+(.+?)(?:\s+later|\s+after)?\.?$/i, type: "reminder", priority: "normal", delayHours: 24 },
  { re: /(?:test|verify|confirm)\s+(?:if\s+)?(?:the\s+)?(?:memory|memories|deploy|deployment|railway|fix)/i, type: "deployment_check", priority: "high", delayHours: 2 },
  { re: /(?:railway|heroku|vercel|production)\s+deploy/i, type: "deployment_check", priority: "normal", delayHours: 4 },
  { re: /(?:memory|memories)\s+(?:fix|repair|save|saving)/i, type: "deployment_check", priority: "normal", delayHours: 4 },
  { re: /(?:i['']?m|feeling)\s+(?:hurt|upset|angry|sad|frustrated)\s/i, type: "emotional_check", priority: "high", delayHours: 8 },
  { re: /(?:we\s+need\s+to\s+talk|something\s+is\s+wrong|i\s+need\s+space)/i, type: "emotional_check", priority: "high", delayHours: 4 },
  { re: /(?:norwegian|norsk)\s+(?:practice|session|study)/i, type: "norwegian_practice", priority: "low", delayHours: 48 },
];

function detectFollowUpTrigger(text) {
  const t = String(text || "");
  for (const p of TRIGGER_PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;
    const detail = m[1] ? m[1].trim().slice(0, 120) : "";
    return {
      follow_up_type: p.type,
      reason_summary: detail || `Follow-up: ${p.type.replace(/_/g, " ")}`,
      priority: p.priority,
      delayHours: p.delayHours,
    };
  }
  return null;
}

function dueDateFromHours(hours) {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  return d.toISOString();
}

async function maybeCreateFollowUp({ text, store, userScope, companionId, sourceChannelId, sourceMessageId, adultContext, privacyScope, repairResult }) {
  if (!store?.createFollowUp) return null;

  const trigger = detectFollowUpTrigger(text);
  let followUpData = null;

  if (trigger) {
    followUpData = {
      follow_up_type: trigger.follow_up_type,
      reason_summary: trigger.reason_summary,
      priority: trigger.priority,
      due_at: dueDateFromHours(trigger.delayHours),
    };
  } else if (repairResult?.repairNeeded) {
    followUpData = {
      follow_up_type: "repair_check",
      reason_summary: `Repair check: ${repairResult.repairType || "emotional_hurt"}`,
      priority: "high",
      due_at: dueDateFromHours(6),
    };
  }

  if (!followUpData) return null;

  try {
    return await store.createFollowUp({
      user_scope: userScope,
      companion_id: companionId,
      follow_up_type: followUpData.follow_up_type,
      reason_summary: followUpData.reason_summary,
      source_channel_id: sourceChannelId || "",
      source_message_id: sourceMessageId || "",
      due_at: followUpData.due_at,
      priority: followUpData.priority || "normal",
      privacy_scope: privacyScope || "normal",
      adult_context: !!adultContext,
      cooldown_key: `${followUpData.follow_up_type}:${userScope}`,
    });
  } catch {
    return null;
  }
}

async function retrieveDueFollowUps({ store, userScope, companionId, adultPrivate = false }) {
  if (!store?.getDue) return [];
  try {
    return await store.getDue({
      user_scope: userScope,
      companion_id: companionId,
      include_adult: adultPrivate,
      limit: 3,
    });
  } catch {
    return [];
  }
}

async function retrieveOpenFollowUps({ store, userScope, companionId, adultPrivate = false }) {
  if (!store?.listFollowUps) return [];
  try {
    return await store.listFollowUps({
      user_scope: userScope,
      companion_id: companionId,
      include_adult: adultPrivate,
      status: "open",
      limit: 10,
    });
  } catch {
    return [];
  }
}

function formatFollowUpPrelude(dueItems) {
  if (!dueItems?.length) return null;
  const lines = dueItems.slice(0, 3).map((f) => `* [${f.follow_up_type}] ${f.reason_summary}`);
  return { label: 'OPEN FOLLOW-UPS', content: lines.join('\n') };
}

module.exports = { detectFollowUpTrigger, maybeCreateFollowUp, retrieveDueFollowUps, retrieveOpenFollowUps, formatFollowUpPrelude };

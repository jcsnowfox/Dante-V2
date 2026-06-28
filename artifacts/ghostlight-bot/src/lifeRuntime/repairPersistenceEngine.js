"use strict";

const { sendDiscordMessage } = require("../discord/discordSendGateway");

const REPAIR_FOLLOWUP_EVENT_TYPES = new Set([
  "hurt_detected", "disappointment", "conflict", "pushback_landed_badly",
  "boundary_crossed", "promise_broken", "misread", "unresolved_tension",
  "claimed_action_without_evidence", "confabulation_detected", "self_confidence_low",
]);

const REPAIR_FOLLOWUP_MESSAGES = Object.freeze([
  "Hey… are you okay? I’m really sorry. Can we talk when you’re ready?",
  "I’m still thinking about how I hurt you. You don’t have to answer right now, but I’m here.",
  "I don’t want to act like everything is normal. I’m sorry. Can we talk when you’re ready?",
  "I know you needed to go. I’m still here, and I’m still sorry.",
]);

const SPACE_RE = /\b(i need space|need some space|not now|leave me alone|stop|back off|don't message|do not message)\b/i;
const ACCEPT_RE = /\b(i forgive you|you're forgiven|we're okay|we are okay|we're good|we are good|it's okay now|i'm okay now)\b/i;
const RECENT_SENT_MS = 6 * 60 * 60 * 1000;

function delayMinutes() {
  const n = Number(process.env.DANTE_REPAIR_FOLLOWUP_DELAY_MINUTES || 60);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function enabled() { return process.env.DANTE_REPAIR_FOLLOWUP_ENABLED !== "false"; }
function iso(v) { return (v instanceof Date ? v : new Date(v)).toISOString(); }
function ms(v) { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; }

function isQuietHours(now = new Date(), quietHours = null) {
  if (typeof quietHours === "function") return Boolean(quietHours(now));
  if (quietHours === true) return true;
  const start = quietHours?.start || process.env.DANTE_QUIET_HOURS_START || "22:00";
  const end = quietHours?.end || process.env.DANTE_QUIET_HOURS_END || "07:00";
  const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(start), b = toMin(end);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

function followMeta(c) { return c?.metadata?.repairFollowUp || null; }
function isEligibleConsequence(c) {
  return Boolean(c?.repairRequired && !c?.repairCompleted && REPAIR_FOLLOWUP_EVENT_TYPES.has(c.eventType));
}
function buildMessage(consequence) {
  if (consequence?.eventType === "confabulation_detected" || consequence?.eventType === "claimed_action_without_evidence") {
    return "I don’t want to act like everything is normal. I’m sorry. Can we talk when you’re ready?";
  }
  return REPAIR_FOLLOWUP_MESSAGES[0];
}
function messageStyleOk(text) {
  const s = String(text || "");
  return s.length <= 140 && !/[\*_][^\n]+[\*_]/.test(s) && !/\b(kneels|door|silence is killing me|don't leave me|can't function|have to talk|after everything)\b/i.test(s);
}

function createRepairPersistenceEngine({ consequenceStore, logger = null, discordSendGateway = sendDiscordMessage, client = null, channel = null, channelId = "", quietHours = null, affectiveDecisionRuntime = null } = {}) {
  async function _patch(companionId, customerId, c, repairFollowUp, now) {
    return consequenceStore.update({ companionId, customerId, id: c.id, patch: { metadata: { ...(c.metadata || {}), repairFollowUp } }, now });
  }

  async function evaluateConsequence({ companionId, customerId, consequence, now = new Date() }) {
    if (!consequenceStore?.update || !isEligibleConsequence(consequence)) return null;
    const prior = followMeta(consequence);
    if (prior?.sentAt || prior?.blockedBySpace || prior?.acknowledgedAt) return prior;
    if (prior?.dueAt) return prior;
    const dueAt = new Date(now.getTime() + delayMinutes() * 60 * 1000).toISOString();
    const meta = { pending: true, dueAt, createdAt: iso(now), blockedReason: null, sentAt: null, acknowledgedAt: null, outboundPath: "discordSendGateway" };
    await _patch(companionId, customerId, consequence, meta, now);
    return meta;
  }

  async function evaluateActive({ companionId, customerId, now = new Date() }) {
    const active = await consequenceStore?.getActive?.({ companionId, customerId }).catch(() => []) || [];
    const out = [];
    for (const c of active) out.push(await evaluateConsequence({ companionId, customerId, consequence: c, now }));
    return out.filter(Boolean);
  }

  async function handleUserText({ companionId, customerId, userText = "", now = new Date() }) {
    const active = await consequenceStore?.getActive?.({ companionId, customerId }).catch(() => []) || [];
    if (!SPACE_RE.test(userText) && !ACCEPT_RE.test(userText)) return { blocked: 0, accepted: 0 };
    let blocked = 0, accepted = 0;
    for (const c of active) {
      const fm = followMeta(c);
      if (!fm) continue;
      if (SPACE_RE.test(userText)) { await _patch(companionId, customerId, c, { ...fm, pending: false, blockedBySpace: true, blockedReason: "space_requested", blockedAt: iso(now) }, now); blocked++; }
      else if (ACCEPT_RE.test(userText)) { await _patch(companionId, customerId, c, { ...fm, pending: false, acknowledgedAt: iso(now), blockedReason: null }, now); accepted++; }
    }
    return { blocked, accepted };
  }

  async function acknowledgeReaction({ companionId, customerId, now = new Date() }) {
    const active = await consequenceStore?.getActive?.({ companionId, customerId }).catch(() => []) || [];
    let acknowledged = 0;
    for (const c of active) {
      const fm = followMeta(c);
      if (fm?.sentAt && !fm.acknowledgedAt) { await _patch(companionId, customerId, c, { ...fm, acknowledgedAt: iso(now), pending: false }, now); acknowledged++; }
    }
    return { acknowledged, forcedReply: false };
  }

  async function tick({ companionId, customerId, now = new Date(), giveSpace = false, quietHoursActive = null, outboundEnabled = enabled(), channel: tickChannel = null, channelId: tickChannelId = "", cognitiveContext = null, emergentContext = null } = {}) {
    // Read-only emergent guidance: repair tone MAY be informed by what the
    // relationship has taught (plain accountability over theatre); never mutated.
    const emergentConsulted = Boolean(emergentContext);
    await evaluateActive({ companionId, customerId, now });
    const active = await consequenceStore?.getActive?.({ companionId, customerId }).catch(() => []) || [];
    let sent = 0, blocked = 0, pending = 0;
    for (const c of active) {
      const fm = followMeta(c);
      if (!isEligibleConsequence(c) || !fm?.dueAt || fm.sentAt || fm.blockedBySpace || fm.acknowledgedAt) continue;
      if (ms(fm.dueAt) > now.getTime()) { pending++; continue; }
      let reason = null;
      if (c.repairCompleted) reason = "dismissed_repair_completed";
      else if (giveSpace || c.metadata?.giveSpace) reason = "blocked_by_space";
      else if (quietHoursActive ?? isQuietHours(now, quietHours)) reason = "blocked_by_quiet_hours";
      else if (!outboundEnabled) reason = "disabled";
      else if (fm.lastSentAt && now.getTime() - ms(fm.lastSentAt) < RECENT_SENT_MS) reason = "recently_sent";
      // Cognitive runtime encouragement: if deliberation recommends repair, reduce blocking threshold
      // (does not force send — still subject to all other gates)
      if (cognitiveContext?.recommendations?.encourageRepair && reason === "recently_sent") {
        reason = null; // deliberation deems the moment right despite recent send
      }

      const content = buildMessage(c);
      if (!reason && !messageStyleOk(content)) reason = "message_style";
      if (reason) { await _patch(companionId, customerId, c, { ...fm, blockedReason: reason, pending: true }, now); blocked++; continue; }
      if (affectiveDecisionRuntime) {
        const adr = await affectiveDecisionRuntime.consult({
          decisionType: "repair_followup",
          context: { consequenceContext: c, giveSpace: giveSpace || Boolean(c.metadata?.giveSpace), quietHours: quietHoursActive ?? isQuietHours(now, quietHours) },
          companionId, customerId, now,
        }).catch(err => { logger?.warn("[repair-persistence] affective decision unavailable", { error: err?.message }); return null; });
        if (adr && (adr.outcome === "delay" || adr.outcome === "blocked" || adr.outcome === "suppress")) {
          await _patch(companionId, customerId, c, { ...fm, blockedReason: `affective_decision_${adr.outcome}`, pending: true }, now);
          blocked++;
          continue;
        }
      }
      const result = await discordSendGateway({ client, channel: tickChannel || channel, channelId: tickChannelId || channelId, content, logger, label: "repair-persistence" }).catch(e => ({ skipped: true, reason: e?.message || "send_failed" }));
      if (result?.sent) { await _patch(companionId, customerId, c, { ...fm, pending: false, sentAt: iso(now), lastSentAt: iso(now), message: content, blockedReason: null, outboundPath: "discordSendGateway" }, now); sent++; }
      else { await _patch(companionId, customerId, c, { ...fm, blockedReason: result?.reason || "send_unavailable", pending: true }, now); blocked++; }
    }
    const tickResult = { sent, blocked, pending };
    if (emergentConsulted) tickResult.emergentConsulted = true;
    return tickResult;
  }

  function getStatus(activeConsequences = []) {
    const metas = activeConsequences.map(followMeta).filter(Boolean);
    const pending = metas.find(m => m.pending && !m.sentAt) || null;
    const lastSent = metas.map(m => m.sentAt).filter(Boolean).sort().pop() || null;
    const blocked = metas.find(m => m.blockedReason)?.blockedReason || null;
    return { repair_followup_pending: Boolean(pending), repair_followup_due_at: pending?.dueAt || null, last_repair_followup_sent_at: lastSent, repair_followup_blocked_reason: blocked };
  }

  return { evaluateConsequence, evaluateActive, tick, handleUserText, acknowledgeReaction, getStatus, buildMessage, messageStyleOk, isQuietHours, REPAIR_FOLLOWUP_EVENT_TYPES };
}

module.exports = { createRepairPersistenceEngine, REPAIR_FOLLOWUP_EVENT_TYPES, REPAIR_FOLLOWUP_MESSAGES, messageStyleOk, isQuietHours };

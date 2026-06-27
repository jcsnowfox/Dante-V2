"use strict";

const { sendDiscordMessage } = require("../discord/discordSendGateway");
const { createRomanticSurprisePlanner } = require("./romanticSurprisePlanner");
const { createRomanticSurpriseStore } = require("./romanticSurpriseStore");
const { evaluateRomanticSurpriseConsent } = require("./romanticSurpriseConsentGate");
const { isMessageStyleSafe } = require("./romanticGestureLibrary");

const ACK_REACTIONS = new Set(["❤️", "❤", "🥹", "😭", "😂", "💕", "💜", "🥰"]);
function iso(v = new Date()) { return (v instanceof Date ? v : new Date(v)).toISOString(); }

function createRomanticSurpriseRuntime({ config = {}, logger = null, planner = null, store = null, discordSendGateway = sendDiscordMessage, client = null, channel = null, channelId = "", relationshipWeatherEngine = null, runtimeEventBus = null, affectiveDecisionRuntime = null } = {}) {
  const surprisePlanner = planner || createRomanticSurprisePlanner(config?.romanticSurprise || {});
  const surpriseStore = store || createRomanticSurpriseStore({ db: config?.db || null, config, logger });
  async function init() { await surpriseStore.init?.(); }

  function scope(explicit = {}) { return { companionId: explicit.companionId || config?.memory?.companionId || config?.companion?.id || "", customerId: explicit.customerId || config?.memory?.userScope || "user" }; }

  async function consider(input = {}) {
    const { companionId, customerId } = scope(input);
    if (!companionId) return { skipped: true, reason: "no_companion_id" };
    const temporaryBlock = await surpriseStore.getActiveTemporaryBlock?.({ companionId, customerId, now: input.now || new Date() }).catch(() => null);
    if (temporaryBlock) return { shouldSurprise: false, blockedReason: temporaryBlock.blocked_reason || "temporary_block", confidence: 0, evidence: [] };
    const recentSurprises = input.recentSurprises || await surpriseStore.listRecent({ companionId, customerId, limit: 10 }).catch(() => []);
    const decision = surprisePlanner.plan({ ...input, companionId, customerId, config, recentSurprises });
    if (!decision.shouldSurprise) return decision.blockedReason ? await surpriseStore.create({ companionId, customerId, surpriseType: decision.surpriseType || "just_because", status: "blocked", reason: decision.reason || "blocked", evidenceIds: decision.evidence || [], blockedReason: decision.blockedReason, metadata: { confidence: decision.confidence || 0 }, now: input.now || new Date() }) : decision;
    return surpriseStore.create({ companionId, customerId, surpriseType: decision.surpriseType, status: "planned", reason: decision.reason, evidenceIds: decision.evidence, message: decision.message, plannedFor: decision.earliestSendAt, metadata: { confidence: decision.confidence, channelPreference: decision.channelPreference, requiresMedia: decision.requiresMedia, outboundPath: "discordSendGateway" }, now: input.now || new Date() });
  }

  async function tick(input = {}) {
    const now = input.now || new Date();
    const { companionId, customerId } = scope(input);
    if (!companionId) return { skipped: true, reason: "no_companion_id" };
    await consider(input).catch(e => logger?.warn?.("[romantic-surprise] consider failed", { error: e?.message }));
    await surpriseStore.expireIgnored({ companionId, customerId, now }).catch(() => 0);
    const due = await surpriseStore.getDue({ companionId, customerId, now, limit: 3 }).catch(() => []);
    let sent = 0, blocked = 0;
    for (const row of due) {
      const gate = evaluateRomanticSurpriseConsent({ companionId, customerId, config, surpriseType: row.surprise_type, now, quietHours: input.quietHours, giveSpace: input.giveSpace, consentState: input.consentState, consequenceContext: input.consequenceContext, userAvailability: input.userAvailability });
      if (!gate.allowed) { await surpriseStore.markBlocked({ id: row.id, companionId, customerId, reason: gate.blockedReason, now }); blocked++; continue; }
      if (!isMessageStyleSafe(row.message)) { await surpriseStore.markBlocked({ id: row.id, companionId, customerId, reason: "message_style", now }); blocked++; continue; }
      if (affectiveDecisionRuntime) {
        const adr = await affectiveDecisionRuntime.consult({
          decisionType: "romantic_surprise",
          context: { consequenceContext: input.consequenceContext, relationshipContext: input.relationshipContext, giveSpace: input.giveSpace, quietHours: input.quietHours, userAvailability: input.userAvailability, fulfillmentContext: { evidenceAvailable: Boolean(row.evidence_ids?.length) } },
          companionId, customerId, now,
        }).catch(err => { logger?.warn("[romantic-surprise] affective decision unavailable", { error: err?.message }); return null; });
        if (adr && (adr.outcome === "blocked" || adr.outcome === "delay" || adr.outcome === "suppress")) {
          await surpriseStore.markBlocked({ id: row.id, companionId, customerId, reason: `affective_decision_${adr.outcome}`, now });
          blocked++;
          continue;
        }
      }
      const result = await discordSendGateway({ client: input.client || client, channel: input.channel || channel, channelId: input.channelId || channelId || config?.chat?.channelId || config?.discord?.channelId || "", content: row.message, logger, label: "romantic-surprise-runtime" }).catch(e => ({ skipped: true, reason: e?.message || "send_failed" }));
      if (result?.sent) { await surpriseStore.markSent({ id: row.id, companionId, customerId, now, metadata: { ...(row.metadata || {}), sentMessageId: result.messageId || null, sentAt: iso(now), outboundPath: "discordSendGateway" } }); sent++; await runtimeEventBus?.emit?.({ companionId, customerId, event_type: "romantic_surprise_sent", source_runtime: "romanticSurpriseRuntime", summary: "Romantic surprise sent", payload: { surpriseType: row.surprise_type } }).catch(() => {}); }
      else { await surpriseStore.markBlocked({ id: row.id, companionId, customerId, reason: result?.reason || "send_unavailable", now }); blocked++; }
    }
    return { sent, blocked, due: due.length };
  }

  async function acknowledgeReaction({ companionId, customerId, reaction = "", now = new Date() } = {}) {
    const s = scope({ companionId, customerId });
    if (!ACK_REACTIONS.has(String(reaction))) return { acknowledged: false, forcedReply: false };
    const row = await surpriseStore.acknowledgeLatest({ ...s, now, reaction });
    if (row && relationshipWeatherEngine?.recordSignal) await relationshipWeatherEngine.recordSignal({ ...s, signal: "romantic_surprise_acknowledged", warmthDelta: 0.02, now }).catch(() => {});
    return { acknowledged: Boolean(row), forcedReply: false };
  }

  async function handleUserText({ companionId, customerId, userText = "", now = new Date() } = {}) {
    if (/\b(not now|stop|don't|do not|give me space)\b/i.test(userText)) {
      const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await surpriseStore.createTemporaryBlock?.({ ...scope({ companionId, customerId }), reason: "not_now", until, now });
      return { temporaryBlock: true, until: iso(until) };
    }
    return { temporaryBlock: false };
  }

  async function getStatus({ companionId, customerId } = {}) {
    const s = scope({ companionId, customerId });
    const recent = await surpriseStore.listRecent({ ...s, limit: 5 }).catch(() => []);
    const pending = recent.find(r => r.status === "planned");
    const last = recent.find(r => ["sent", "acknowledged", "blocked", "expired"].includes(r.status));
    return { romantic_surprise_pending: Boolean(pending), romantic_surprise_type: pending?.surprise_type || last?.surprise_type || null, last_romantic_surprise_at: last?.sent_at || last?.updated_at || null, last_romantic_surprise_status: last?.status || null, romantic_surprise_blocked_reason: last?.blocked_reason || null };
  }

  return { init, consider, tick, acknowledgeReaction, handleUserText, getStatus, planner: surprisePlanner, store: surpriseStore, ACK_REACTIONS };
}

module.exports = { createRomanticSurpriseRuntime, ACK_REACTIONS };

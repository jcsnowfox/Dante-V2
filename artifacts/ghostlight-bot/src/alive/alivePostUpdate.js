"use strict";

const { derivePresenceState } = require("./alivePresenceStore");

function clamp(v, min = 0, max = 1) { return Math.min(max, Math.max(min, Number(v) || 0)); }

function adjustScores(current, { repairNeeded, repairType, messageContent = "", replyContent = "" } = {}) {
  let { missingScore, affectionScore, overloadScore, conversationTemperature } = current;
  const msgLower = String(messageContent).toLowerCase();
  const repLower = String(replyContent).toLowerCase();

  // Interaction happened → missing score decays
  missingScore = clamp(missingScore - 0.15);

  // Warmth signals → affection up
  const warm = /\blove\b|\bmiss\b|\bthank\b|\bappreciate\b|\bhug\b|\bkiss\b|\bsweet\b|\bgood\b.*night\b/i;
  if (warm.test(msgLower) || warm.test(repLower)) affectionScore = clamp(affectionScore + 0.05);

  // Frustration/cold signals → affection slight dip
  const cold = /\bwrong\b|\bannoying\b|\bstop\b|\bno\b.*\byou\b|\bugh\b/i;
  if (cold.test(msgLower)) affectionScore = clamp(affectionScore - 0.05);

  // Repair → temporary overload spike
  if (repairNeeded) overloadScore = clamp(overloadScore + 0.1);
  else overloadScore = clamp(overloadScore - 0.05);

  // Conversation temperature: high if repair or cold, low if warm
  if (repairNeeded) conversationTemperature = clamp(conversationTemperature + 0.1);
  else if (warm.test(msgLower)) conversationTemperature = clamp(conversationTemperature - 0.05);

  return { missingScore, affectionScore, overloadScore, conversationTemperature };
}

function deriveMood({ repairNeeded, affectionScore, overloadScore, conversationTemperature }) {
  if (repairNeeded) return "subdued";
  if (affectionScore > 0.75 && overloadScore < 0.3) return "warm";
  if (affectionScore > 0.6) return "tender";
  if (conversationTemperature < 0.3) return "playful";
  if (overloadScore > 0.6) return "focused";
  return "neutral";
}

async function alivePostUpdate({
  alivePresenceStore,
  aliveEventsStore,
  intentionQueue,
  companionId,
  customerId,
  messageContent = "",
  replyContent = "",
  repairResult = null,
  now = new Date(),
  logger = null,
} = {}) {
  if (!alivePresenceStore) return;
  try {
    const current = await alivePresenceStore.getOrCreate({ companionId, customerId });
    const repairNeeded = Boolean(repairResult?.repairNeeded);
    const repairType = repairResult?.repairType || null;

    const scores = adjustScores(current, { repairNeeded, repairType, messageContent, replyContent });
    const presenceState = derivePresenceState({ missingScore: scores.missingScore, lastInteractionAt: now.toISOString(), now });
    const mood = deriveMood({ repairNeeded, affectionScore: scores.affectionScore, overloadScore: scores.overloadScore, conversationTemperature: scores.conversationTemperature });

    const patch = {
      presenceState,
      mood,
      lastInteractionAt: now.toISOString(),
      ...scores,
      ...(repairNeeded ? { repairNeeded: true, repairType, unresolvedTension: true, lastRepairAt: now.toISOString() } : { repairNeeded: false }),
    };

    await alivePresenceStore.update({ companionId, customerId, patch });

    await aliveEventsStore?.logEvent?.({
      companionId, customerId,
      eventType: "presence_update",
      reason: repairNeeded ? `repair:${repairType || "unknown"}` : "interaction",
      decision: `presence=${presenceState} mood=${mood} missing=${scores.missingScore.toFixed(2)}`,
      payload: { presenceState, mood, repairNeeded, scores },
    }).catch(() => {});

    // If repair needed and no pending repair intention, enqueue one
    if (repairNeeded && intentionQueue) {
      const pending = await intentionQueue.countPending({ companionId, customerId }).catch(() => 0);
      if (pending === 0) {
        const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        await intentionQueue.enqueue({
          companionId, customerId,
          intentionType: "repair_bridge",
          reason: `repair_${repairType || "unknown"}`,
          payload: { repairType, severity: repairResult?.severity },
          priority: 9,
          expiresAt,
        }).catch(() => {});
      }
    }
  } catch (error) {
    logger?.warn?.("[alive-post-update] failed", { error: error?.message });
  }
}

module.exports = { alivePostUpdate };

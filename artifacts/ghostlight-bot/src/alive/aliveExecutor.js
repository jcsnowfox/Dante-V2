"use strict";

/**
 * alive/aliveExecutor
 *
 * Reads the highest-priority pending intention from intentionQueueStore and
 * executes it. Reuses the existing runCheckInAutomation pathway for all
 * outbound messages (text, voice note, image). Never builds a parallel sender.
 *
 * Safety gates before sending:
 *   1. ALIVE_UNPROMPTED_ENABLED must be "true"
 *   2. ALIVE_TARGET_CHANNEL_ID must be set
 *   3. Not in quiet hours
 *   4. give_space suppresses casual intentions
 *   5. repair_bridge always allowed (priority overrides give_space)
 */

const { runCheckInAutomation } = require("../automations/runners");

const CASUAL_INTENTION_TYPES = new Set(["reach_out", "check_in", "share_thought", "voice_note", "image"]);

function isInQuietHours(now, { quietStart = 23, quietEnd = 7, timezone = "UTC" } = {}) {
  try {
    const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(now));
    if (quietStart > quietEnd) {
      return localHour >= quietStart || localHour < quietEnd;
    }
    return localHour >= quietStart && localHour < quietEnd;
  } catch {
    const utcHour = now.getUTCHours();
    if (quietStart > quietEnd) return utcHour >= quietStart || utcHour < quietEnd;
    return utcHour >= quietStart && utcHour < quietEnd;
  }
}

function buildIntentionPrompt(intention, presenceState) {
  const type = intention.intentionType;
  const mood = presenceState?.mood || "neutral";
  const energy = presenceState?.energy || "steady";

  const prompts = {
    reach_out: `Reach out only if it feels worth interrupting the quiet. One small, specific thing — no check-in script, no question list. Mood: ${mood}. Energy: ${energy}.`,
    check_in: `Check in warmly, but lightly. One open question, one tiny observation, or one sentence that lets her ignore it without guilt. Mood: ${mood}.`,
    share_thought: `Share something that crossed your mind — a small thought, a quick laugh, a remembered ritual, or nothing grand. Mood: ${mood}.`,
    repair_bridge: `Reach out after the earlier friction. Own it without over-explaining. No analysis request — one plain repair beat.`,
    voice_note: `Send a voice note only if the voice adds warmth. Keep it short, natural, a little imperfect. Mood: ${mood}.`,
    image: `Share something visual only if it fits the moment — soft, specific, not loud. Mood: ${mood}.`,
  };

  return prompts[type] || prompts.reach_out;
}

async function executeNextIntention({
  intentionQueue,
  alivePresenceStore,
  aliveEventsStore,
  client,
  config,
  logger,
  memory,
  tools,
  conversations,
  now = new Date(),
} = {}) {
  if (!intentionQueue || !client || !config) return { skipped: true, reason: "missing_deps" };

  const aliveConfig = config?.alive || {};
  const unpromptedEnabled = aliveConfig.unpromptedEnabled === true
    || process.env.ALIVE_UNPROMPTED_ENABLED === "true";

  if (!unpromptedEnabled) {
    return { skipped: true, reason: "unprompted_disabled" };
  }

  const targetChannelId = aliveConfig.targetChannelId
    || process.env.ALIVE_TARGET_CHANNEL_ID
    || "";

  if (!targetChannelId) {
    return { skipped: true, reason: "no_target_channel" };
  }

  const quietStart = Number(aliveConfig.quietHoursStart ?? process.env.ALIVE_QUIET_HOURS_START ?? 23);
  const quietEnd = Number(aliveConfig.quietHoursEnd ?? process.env.ALIVE_QUIET_HOURS_END ?? 7);
  const timezone = aliveConfig.timezone || process.env.ALIVE_TIMEZONE || config.chat?.timezone || "UTC";

  const companionId = config?.memory?.companionId || "";
  const customerId = config?.memory?.userScope || "user";

  // Get current presence for give_space check
  let presenceState = null;
  try {
    presenceState = alivePresenceStore
      ? await alivePresenceStore.getOrCreate({ companionId, customerId })
      : null;
  } catch { /* non-fatal */ }

  // Get highest priority pending intention
  const pending = intentionQueue?.listPending
    ? await intentionQueue.listPending({ companionId, customerId, limit: 1 }).catch(() => [])
    : [];

  if (!pending.length) return { skipped: true, reason: "no_pending_intentions" };

  const intention = pending[0];
  const isCasual = CASUAL_INTENTION_TYPES.has(intention.intentionType);
  const isRepair = intention.intentionType === "repair_bridge";

  // Quiet hours — repair always bypasses
  if (isCasual && !isRepair && isInQuietHours(now, { quietStart, quietEnd, timezone })) {
    await aliveEventsStore?.logEvent?.({
      companionId, customerId, eventType: "reachout_suppressed",
      reason: "quiet_hours", decision: `intentionType=${intention.intentionType}`,
    }).catch(() => {});
    return { skipped: true, reason: "quiet_hours", intentionId: intention.id };
  }

  // Give space — repair always bypasses
  if (presenceState?.giveSpace && isCasual && !isRepair) {
    await aliveEventsStore?.logEvent?.({
      companionId, customerId, eventType: "reachout_suppressed",
      reason: "give_space", decision: `intentionType=${intention.intentionType}`,
    }).catch(() => {});
    return { skipped: true, reason: "give_space", intentionId: intention.id };
  }

  // Build enabledTools based on intention type
  const enabledTools = [];
  if (intention.intentionType === "voice_note") enabledTools.push("generate_audio");
  if (intention.intentionType === "image") enabledTools.push("generate_image");

  const prompt = buildIntentionPrompt(intention, presenceState);

  let result = null;
  try {
    result = await runCheckInAutomation({
      automation: {
        automationId: `alive:${intention.id}`,
        type: "check_in",
        label: `alive:${intention.intentionType}`,
        channelId: targetChannelId,
        scheduleTime: "00:00",
        timezone,
        prompt,
        enabledTools,
        enabled: true,
        mentionUser: false,
        userId: "",
        userScope: customerId,
      },
      client,
      config,
      logger,
      memory,
      tools,
      conversations,
      automationStore: null,
      cache: null,
      persistState: false,
      channelIdOverride: targetChannelId,
      promptOverride: prompt,
      labelOverride: `alive:${intention.intentionType}`,
      automationIdOverride: `alive:${intention.id}`,
    });
  } catch (error) {
    logger?.warn?.("[alive-executor] runCheckInAutomation failed", { intentionId: intention.id, error: error?.message });
    await aliveEventsStore?.logEvent?.({
      companionId, customerId, eventType: "error",
      reason: "executor_failed", decision: error?.message || "unknown",
      payload: { intentionId: intention.id, intentionType: intention.intentionType },
    }).catch(() => {});
    return { skipped: true, reason: "executor_error", error: error?.message };
  }

  // Mark completed
  await intentionQueue.markCompleted({ id: intention.id }).catch(() => {});

  // Update last_reachout_at
  if (alivePresenceStore) {
    await alivePresenceStore.update({
      companionId, customerId,
      patch: { lastReachoutAt: now.toISOString(), ...(isRepair ? { repairNeeded: false, unresolvedTension: false } : {}) },
    }).catch(() => {});
  }

  // Log event
  const eventType = intention.intentionType === "voice_note" ? "voice_note_sent"
    : intention.intentionType === "image" ? "image_sent"
    : "reachout_sent";

  await aliveEventsStore?.logEvent?.({
    companionId, customerId, eventType,
    reason: intention.reason || intention.intentionType,
    decision: `sent to channel=${targetChannelId}`,
    payload: { intentionId: intention.id, intentionType: intention.intentionType, channelId: result?.channelId || targetChannelId },
  }).catch(() => {});

  logger?.info?.("[alive-executor] intention executed", { intentionId: intention.id, intentionType: intention.intentionType });
  return { executed: true, intentionId: intention.id, intentionType: intention.intentionType, channelId: result?.channelId };
}

module.exports = { executeNextIntention, isInQuietHours };

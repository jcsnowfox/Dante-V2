"use strict";

async function buildAliveStatusPayload({ innerContext } = {}) {
  const aliveEngine = innerContext?.aliveEngine || null;
  const aliveEventsStore = innerContext?.aliveEventsStore || null;
  const intentionQueue = innerContext?.intentionQueue || null;
  const alivePresenceStore = innerContext?.alivePresenceStore || null;
  const config = innerContext?.config || {};

  const companionId = config?.memory?.companionId || "";
  const customerId = config?.memory?.userScope || "user";
  const scope = { companionId, customerId };

  const engineStatus = aliveEngine?.getStatus?.() ?? { enabled: false, running: false };

  const [presence, pendingIntentions, recentEvents] = await Promise.all([
    alivePresenceStore?.getOrCreate?.(scope).catch(() => null),
    intentionQueue?.listPending?.({ ...scope, limit: 5 }).catch(() => []),
    aliveEventsStore?.listRecent?.({ ...scope, limit: 20 }).catch(() => []),
  ]);

  // Count today's events by type
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEvents = (recentEvents || []).filter((e) => new Date(e.createdAt) >= todayStart);
  const reachouts_today = todayEvents.filter((e) => e.eventType === "reachout_sent").length;
  const voice_notes_today = todayEvents.filter((e) => e.eventType === "voice_note_sent").length;
  const images_today = todayEvents.filter((e) => e.eventType === "image_sent").length;
  const last_reachout = recentEvents?.find((e) => e.eventType === "reachout_sent")?.createdAt || null;

  return {
    enabled: engineStatus.enabled,
    running: engineStatus.running,
    presence_state: presence?.presenceState ?? null,
    energy: presence?.energy ?? null,
    mood: presence?.mood ?? null,
    missing_score: presence?.missingScore ?? null,
    affection_score: presence?.affectionScore ?? null,
    overload_score: presence?.overloadScore ?? null,
    conversation_temperature: presence?.conversationTemperature ?? null,
    repair_needed: presence?.repairNeeded ?? null,
    repair_type: presence?.repairType ?? null,
    unresolved_tension: presence?.unresolvedTension ?? null,
    give_space: presence?.giveSpace ?? null,
    last_interaction_at: presence?.lastInteractionAt ?? null,
    last_reachout_at: last_reachout,
    reachouts_today,
    voice_notes_today,
    images_today,
    current_intentions: (pendingIntentions || []).map((i) => ({
      id: i.id,
      type: i.intentionType,
      priority: i.priority,
      reason: i.reason,
      created_at: i.createdAt,
      expires_at: i.expiresAt,
    })),
    recent_alive_events: (recentEvents || []).slice(0, 20).map((e) => ({
      id: e.id,
      type: e.eventType,
      reason: e.reason,
      decision: e.decision,
      created_at: e.createdAt,
    })),
    engine: {
      tick_interval_ms: engineStatus.tickIntervalMs,
      absence_threshold_ms: engineStatus.absenceThresholdMs,
      daily_cap: engineStatus.dailyCap,
      cooldown_ms: engineStatus.cooldownMs,
      quiet_hours: engineStatus.quietHours,
      last_assess_at: engineStatus.lastAssessAt,
      last_result: engineStatus.lastResult,
    },
  };
}

module.exports = { buildAliveStatusPayload };

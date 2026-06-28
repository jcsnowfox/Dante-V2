"use strict";

/**
 * worldStateBuilder
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Assembles the full world state object from available signals
 * and inferred contexts.
 *
 * World state shape:
 * {
 *   jenna:       { availability, busy_confidence, sleeping_confidence,
 *                  last_meaningful_contact, current_channel, recent_reaction,
 *                  give_space, repair_state }
 *   dante:       { runtime_health, self_confidence, current_capabilities,
 *                  degraded_sources }
 *   conversation: { state, satisfaction, open_loops, followup_pending }
 *   environment: { time, quiet_hours, season, platform }
 *   second_life: { presence, confidence } | null
 *   uncertainty: string[]
 * }
 */

const { AVAILABILITY } = require("./presenceInterpreter");
const {
  inferQuietHours,
  inferSeason,
  inferJennaActivity,
  inferDanteState,
  inferConversationState,
  inferRepairState,
} = require("./activityInferenceEngine");
const { resolveConfidence } = require("./perceptionConfidenceResolver");

function buildWorldState({
  signals              = [],
  now                  = new Date(),
  consequenceContext   = null,
  selfInspectionStatus = null,
  identityContext      = null,
  narrativeContext      = null,
  learningContext       = null,
  capabilities         = {},
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);

  // ─── Jenna ───────────────────────────────────────────────────────────────────
  const jennaActivity = inferJennaActivity({ signals, consequenceContext, now: nowDate });

  const busyConfSigs  = signals.filter(s => s.key === "jenna.busy_confidence");
  const sleepConfSigs = signals.filter(s => s.key === "jenna.sleeping_confidence");

  const busyConf  = busyConfSigs.length
    ? resolveConfidence(busyConfSigs).confidence
    : (jennaActivity.availability === AVAILABILITY.BUSY ? jennaActivity.confidence : 0);
  const sleepConf = sleepConfSigs.length
    ? resolveConfidence(sleepConfSigs).confidence
    : (jennaActivity.availability === AVAILABILITY.ASLEEP ? jennaActivity.confidence : 0);

  const lastContactSig = signals.find(s => s.key === "jenna.last_meaningful_contact");
  const channelSig     = signals.find(s => s.key === "jenna.current_channel");
  const reactionSig    = signals.find(s => s.key === "jenna.recent_reaction");
  const giveSpaceSig   = signals.find(s => s.key === "jenna.give_space");

  const giveSpace   = Boolean(giveSpaceSig?.value) || Boolean(consequenceContext?.suppression?.giveSpace);
  const repairState = inferRepairState(consequenceContext);

  const jenna = {
    availability:            jennaActivity.availability,
    busy_confidence:         _round(busyConf),
    sleeping_confidence:     _round(sleepConf),
    last_meaningful_contact: lastContactSig?.value ?? null,
    current_channel:         channelSig?.value ?? null,
    recent_reaction:         reactionSig?.value ?? null,
    give_space:              giveSpace,
    repair_state:            repairState,
    // Internal — for prelude/uncertainty building, not exposed in status
    _confidence:             jennaActivity.confidence,
    _source:                 jennaActivity.source,
  };

  // ─── Dante ───────────────────────────────────────────────────────────────────
  const danteState = inferDanteState({ selfInspectionStatus, identityContext, capabilities });
  const dante = {
    runtime_health:       danteState.runtimeHealth,
    self_confidence:      danteState.selfConfidence,
    current_capabilities: danteState.currentCapabilities,
    degraded_sources:     danteState.degradedSources,
  };

  // ─── Conversation ─────────────────────────────────────────────────────────────
  const convState  = inferConversationState({ learningContext, consequenceContext });
  const conversation = {
    state:            convState.state,
    satisfaction:     convState.satisfaction,
    open_loops:       convState.open_loops,
    followup_pending: convState.followup_pending,
  };

  // ─── Environment ─────────────────────────────────────────────────────────────
  const quietHours = inferQuietHours(nowDate);
  const environment = {
    time:        nowDate.toISOString(),
    quiet_hours: quietHours.active,
    season:      inferSeason(nowDate),
    platform:    capabilities.platform || "discord",
  };

  // ─── Second Life ─────────────────────────────────────────────────────────────
  const slSig = signals.find(s => s.key === "second_life.presence");
  const second_life = capabilities.secondLifeAvailable
    ? { presence: slSig?.value ?? "unknown", confidence: _round(slSig?.confidence ?? 0) }
    : null;

  // ─── Uncertainty ─────────────────────────────────────────────────────────────
  const uncertainty = buildUncertainties({ jenna, dante, conversation, signals });

  return { jenna, dante, conversation, environment, second_life, uncertainty };
}

function buildUncertainties({ jenna = {}, dante = {}, conversation = {}, signals = [] } = {}) {
  const u = [];

  if (jenna.availability === AVAILABILITY.UNKNOWN) {
    u.push("Jenna availability unknown: no recent presence signal.");
  } else if ((jenna._confidence ?? 0) < 0.40) {
    u.push(`Jenna availability uncertain (${Math.round((jenna._confidence ?? 0) * 100)}% confidence): signal may be stale.`);
  }

  if (!signals.some(s => s.key === "jenna.last_meaningful_contact")) {
    u.push("Last contact with Jenna unknown: no timestamp evidence.");
  }

  if (dante.runtime_health === "unknown") {
    u.push("Dante runtime health unknown: no self-inspection data.");
  } else if (dante.runtime_health === "degraded") {
    const srcs = (dante.degraded_sources || []).slice(0, 3);
    u.push(`Dante runtime degraded${srcs.length ? ": " + srcs.join(", ") : ""}.`);
  }

  if (conversation.state === "unknown") {
    u.push("Conversation state unknown: no recent interaction context.");
  }

  return u;
}

function _round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = { buildWorldState, buildUncertainties };

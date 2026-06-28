"use strict";

const crypto = require("crypto");
const { createRuntimeEventStore } = require("./runtimeEventStore");
const { createSourceHealthTracker } = require("./sourceHealth");

// Active event types — emitted or consumed in current code.
// Dead events removed 2026-06-28 (audit: never emitted AND never consumed).
const EVENT_TYPES = Object.freeze([
  // ── consumed: perceptionRuntime reacts to these ──────────────────────────
  "repair_started", "repair_completed", "diagnostic_warning", "self_confidence_low",
  // ── emitted with live data; audit_only (no real-time consumer) ───────────
  "need_changed", "identity_value_changed", "project_progressed", "insight_created",
  "relationship_weather_changed", "consequence_created",
  "fulfillment_succeeded", "fulfillment_failed", "fulfillment_deferred",
  "narrative_chapter_updated", "prelude_refreshed",
  "perception_world_state_updated",
  "world_model_updated", "world_belief_conflict", "world_belief_decayed",
  // ── emitted by sub-runtimes; audit_only ──────────────────────────────────
  "identity_belief_changed", "journal_entry_created", "romantic_surprise_sent",
]);

// Event ownership registry — documents the consumer status of each event type.
// Categories: "consumed" = real-time reactor; "audit_only" = emitted, no reactor.
// Removed from EVENT_TYPES (2026-06-28): need_satisfied, need_depleted,
//   identity_preference_changed, project_completed, project_abandoned,
//   curiosity_matured, resource_discovered, first_experience_recorded,
//   narrative_chapter_opened, narrative_self_story_updated,
//   perception_availability_changed, perception_confidence_decayed —
//   never emitted AND never consumed.
const EVENT_OWNERSHIP = Object.freeze({
  repair_started:                  { category: "consumed",    consumer: "perceptionRuntime" },
  repair_completed:                { category: "consumed",    consumer: "perceptionRuntime" },
  diagnostic_warning:              { category: "consumed",    consumer: "perceptionRuntime" },
  self_confidence_low:             { category: "consumed",    consumer: "perceptionRuntime" },
  need_changed:                    { category: "audit_only",  emitter: "lifeRuntime/homeostasis" },
  identity_value_changed:          { category: "audit_only",  emitter: "lifeRuntime/identity" },
  project_progressed:              { category: "audit_only",  emitter: "lifeRuntime/growth" },
  insight_created:                 { category: "audit_only",  emitter: "lifeRuntime/curiosity" },
  relationship_weather_changed:    { category: "audit_only",  emitter: "lifeRuntime/relationship" },
  consequence_created:             { category: "audit_only",  emitter: "lifeRuntime/consequences" },
  fulfillment_succeeded:           { category: "audit_only",  emitter: "lifeRuntime/fulfillment" },
  fulfillment_failed:              { category: "audit_only",  emitter: "lifeRuntime/fulfillment" },
  fulfillment_deferred:            { category: "audit_only",  emitter: "lifeRuntime/fulfillment" },
  narrative_chapter_updated:       { category: "audit_only",  emitter: "narrativeIdentityRuntime" },
  prelude_refreshed:               { category: "audit_only",  emitter: "lifeRuntime" },
  perception_world_state_updated:  { category: "audit_only",  emitter: "perceptionRuntime" },
  world_model_updated:             { category: "audit_only",  emitter: "worldModelRuntime" },
  world_belief_conflict:           { category: "audit_only",  emitter: "worldModelRuntime" },
  world_belief_decayed:            { category: "audit_only",  emitter: "worldModelRuntime" },
  identity_belief_changed:         { category: "audit_only",  emitter: "lifeRuntime/relationshipLearning" },
  journal_entry_created:           { category: "audit_only",  emitter: "repairReflectionEngine" },
  romantic_surprise_sent:          { category: "audit_only",  emitter: "romanticSurpriseRuntime" },
});

function stripSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map(v => stripSecrets(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (/secret|token|password|api[_-]?key|authorization|cookie|session/i.test(k)) continue;
    out[k] = stripSecrets(v, seen);
  }
  return out;
}

function createRuntimeEventBus({ store = createRuntimeEventStore(), logger = null, sourceHealth = createSourceHealthTracker() } = {}) {
  const fallback = [];
  async function emit(input = {}) {
    const event = Object.freeze({
      id: input.id || crypto.randomUUID(),
      companion_id: input.companion_id || input.companionId || "",
      customer_id: input.customer_id || input.customerId || "user",
      event_type: input.event_type || input.eventType,
      source_runtime: input.source_runtime || input.sourceRuntime || "unknown",
      target_runtime: input.target_runtime || input.targetRuntime || null,
      summary: input.summary || "",
      evidence_ids: Array.isArray(input.evidence_ids || input.evidenceIds) ? (input.evidence_ids || input.evidenceIds) : [],
      payload: stripSecrets(input.payload || {}),
      confidence: Number.isFinite(input.confidence) ? input.confidence : 1,
      created_at: input.created_at || input.createdAt || new Date().toISOString(),
    });
    if (!EVENT_TYPES.includes(event.event_type)) throw new Error(`unsupported runtime event type: ${event.event_type}`);
    try {
      if (!store?.append) throw new Error("runtime event store unavailable");
      await store.append(event);
      sourceHealth.healthy("runtimeEventStore");
    } catch (err) {
      fallback.push(event);
      if (fallback.length > 500) fallback.shift();
      sourceHealth.degraded("runtimeEventStore", err?.message || "append_failed");
      logger?.warn?.("[runtime-event-bus] fallback append", { error: err?.message });
    }
    return event;
  }
  async function listRecent(opts = {}) {
    try {
      const stored = store?.listRecent ? await store.listRecent(opts) : [];
      return [...stored, ...fallback.slice().reverse()].slice(0, opts.limit || 50);
    } catch { return fallback.slice(-Number(opts.limit || 50)).reverse(); }
  }
  function getStatus() { return { eventTypes: EVENT_TYPES.length, fallbackEvents: fallback.length, sourceHealth: sourceHealth.get("runtimeEventStore") }; }
  return { emit, listRecent, getStatus, EVENT_TYPES, EVENT_OWNERSHIP };
}

module.exports = { createRuntimeEventBus, EVENT_TYPES, EVENT_OWNERSHIP, stripSecrets };

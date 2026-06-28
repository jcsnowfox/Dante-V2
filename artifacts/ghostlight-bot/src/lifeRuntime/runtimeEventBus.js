"use strict";

const crypto = require("crypto");
const { createRuntimeEventStore } = require("./runtimeEventStore");
const { createSourceHealthTracker } = require("./sourceHealth");

const EVENT_TYPES = Object.freeze([
  "need_changed","need_satisfied","need_depleted","identity_value_changed","identity_belief_changed","identity_preference_changed","project_progressed","project_completed","project_abandoned","curiosity_matured","insight_created","relationship_weather_changed","repair_started","repair_completed","consequence_created","fulfillment_succeeded","fulfillment_failed","fulfillment_deferred","resource_discovered","diagnostic_warning","self_confidence_low","first_experience_recorded","journal_entry_created","prelude_refreshed",
  "narrative_chapter_opened","narrative_chapter_updated","narrative_self_story_updated",
]);

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
  return { emit, listRecent, getStatus, EVENT_TYPES };
}

module.exports = { createRuntimeEventBus, EVENT_TYPES, stripSecrets };

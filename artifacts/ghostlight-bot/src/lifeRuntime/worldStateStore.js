"use strict";

/**
 * worldStateStore
 *
 * In-memory store for Dante's perception signals.
 *
 * Each signal represents one perceived fact about the world:
 *   key       — what is being perceived (e.g. "jenna.availability")
 *   value     — the perceived value
 *   confidence — 0-1, decays with age
 *   source    — where the evidence came from
 *   evidence_ids — what events back this up
 *   timestamp — when the signal was last updated
 *
 * Confidence decays logarithmically with age. Explicit statements from
 * Jenna are honoured for up to 4 hours regardless of other signals.
 *
 * No scheduler. No Discord sender. Ticked by perceptionRuntime.
 */

const crypto = require("crypto");

const MAX_SIGNALS_PER_SCOPE    = 500;
const DEFAULT_STALENESS_MS     = 30 * 60 * 1000; // 30 min
const STALENESS_DECAY_RATE     = 0.15;            // confidence loss per stale period
const EXPLICIT_GRACE_MS        = 4 * 60 * 60 * 1000; // 4 h

const SIGNAL_SOURCES = Object.freeze([
  "discord_presence",
  "discord_event",
  "alive_presence",
  "explicit_statement",
  "consequence_context",
  "self_inspection",
  "identity_context",
  "narrative_context",
  "time_inference",
  "activity_inference",
  "repair_persistence",
  "second_life_bridge",
  "runtime_event",
  "fallback",
]);

function createWorldStateStore({ config = {}, logger = null } = {}) {
  // Map key: `${companionId}:${customerId}:${signalKey}`
  const _mem = new Map();

  async function init() {}

  function _mk(companionId, customerId, signalKey) {
    return `${companionId}:${customerId}:${signalKey}`;
  }

  function _scopePrefix(companionId, customerId) {
    return `${companionId}:${customerId}:`;
  }

  async function upsertSignal({
    companionId,
    customerId,
    key,
    value,
    confidence            = 0.50,
    source                = "fallback",
    evidence_ids          = [],
    staleness_threshold_ms = DEFAULT_STALENESS_MS,
    now                   = new Date(),
  } = {}) {
    if (!companionId || !key) return null;
    if (!SIGNAL_SOURCES.includes(source)) source = "fallback";

    const nowTs = now instanceof Date ? now : new Date(now);
    const existing = _mem.get(_mk(companionId, customerId, key));

    // Explicit statement wins for EXPLICIT_GRACE_MS
    if (existing?.source === "explicit_statement" && source !== "explicit_statement") {
      const ageMs = nowTs.getTime() - new Date(existing.timestamp).getTime();
      if (ageMs < EXPLICIT_GRACE_MS) return existing;
    }

    const signal = {
      id:                    crypto.randomUUID(),
      companionId,
      customerId,
      key,
      value,
      confidence:            Math.max(0, Math.min(1, Number(confidence) || 0)),
      source,
      evidence_ids:          Array.isArray(evidence_ids) ? [...new Set(evidence_ids)] : [],
      staleness_threshold_ms: Number(staleness_threshold_ms) || DEFAULT_STALENESS_MS,
      timestamp:             nowTs.toISOString(),
      created_at:            existing?.created_at ?? nowTs.toISOString(),
      updated_at:            nowTs.toISOString(),
    };

    // Prune scope at capacity: remove oldest non-explicit
    const prefix = _scopePrefix(companionId, customerId);
    const scopeKeys = [..._mem.keys()].filter(k => k.startsWith(prefix));
    if (scopeKeys.length >= MAX_SIGNALS_PER_SCOPE) {
      // Drop oldest non-explicit entry
      let oldest = null, oldestKey = null, oldestTime = Infinity;
      for (const k of scopeKeys) {
        const s = _mem.get(k);
        if (s?.source === "explicit_statement") continue;
        const t = s?.timestamp ? new Date(s.timestamp).getTime() : 0;
        if (t < oldestTime) { oldest = s; oldestKey = k; oldestTime = t; }
      }
      if (oldestKey) _mem.delete(oldestKey);
    }

    _mem.set(_mk(companionId, customerId, key), signal);
    return signal;
  }

  async function getSignal({ companionId, customerId, key } = {}) {
    if (!companionId || !key) return null;
    return _mem.get(_mk(companionId, customerId, key)) ?? null;
  }

  async function getAll({ companionId, customerId } = {}) {
    if (!companionId) return [];
    const prefix = _scopePrefix(companionId, customerId);
    const out = [];
    for (const [k, v] of _mem) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }

  // Resolve a signal with staleness decay applied
  async function resolveSignal({ companionId, customerId, key, now = new Date() } = {}) {
    const sig = await getSignal({ companionId, customerId, key });
    if (!sig) return { value: null, confidence: 0, source: "unknown", stale: false, ageMs: null };

    const nowMs   = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const ageMs   = nowMs - new Date(sig.timestamp).getTime();
    const periods = ageMs / (sig.staleness_threshold_ms || DEFAULT_STALENESS_MS);
    const decayed = Math.max(0, sig.confidence - periods * STALENESS_DECAY_RATE);

    return {
      value:        sig.value,
      confidence:   decayed,
      source:       sig.source,
      stale:        periods >= 1,
      ageMs,
      evidence_ids: sig.evidence_ids,
    };
  }

  async function pruneStale({ companionId, customerId, maxAgeMs = 24 * 60 * 60 * 1000, now = new Date() } = {}) {
    if (!companionId) return 0;
    const prefix = _scopePrefix(companionId, customerId);
    const nowMs  = now instanceof Date ? now.getTime() : new Date(now).getTime();
    let pruned   = 0;
    for (const [k, v] of _mem) {
      if (!k.startsWith(prefix)) continue;
      if (v.source === "explicit_statement") continue; // never auto-prune explicit
      const ageMs = nowMs - new Date(v.timestamp).getTime();
      if (ageMs > maxAgeMs) {
        _mem.delete(k);
        pruned++;
      }
    }
    return pruned;
  }

  return {
    init,
    upsertSignal,
    getSignal,
    getAll,
    resolveSignal,
    pruneStale,
    SIGNAL_SOURCES,
    DEFAULT_STALENESS_MS,
  };
}

module.exports = {
  createWorldStateStore,
  SIGNAL_SOURCES,
  DEFAULT_STALENESS_MS,
  STALENESS_DECAY_RATE,
};

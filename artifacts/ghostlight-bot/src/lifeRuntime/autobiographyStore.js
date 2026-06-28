"use strict";

/**
 * autobiographyStore
 *
 * Narrative Identity Runtime 1.0 — Defining Moment Storage.
 *
 * Stores defining moments — the raw material Dante's self-story is built from.
 * Each moment requires at least one source_event_id (evidence).
 * Private by default. Safe fields only exposed via getStatus().
 *
 * Moment types map to narrative categories:
 *   defining_moment, mistake, repair, first_experience, belief_change,
 *   value_change, lesson_learned, romantic_milestone, maintenance_moment,
 *   trust_rupture, trust_repair, major_project, recurring_theme
 *
 * Storage: in-memory, capped at 200 moments per scope.
 */

const crypto = require("crypto");

const MOMENT_TYPES = Object.freeze([
  "defining_moment",
  "mistake",
  "repair",
  "first_experience",
  "belief_change",
  "value_change",
  "lesson_learned",
  "romantic_milestone",
  "maintenance_moment",
  "trust_rupture",
  "trust_repair",
  "major_project",
  "recurring_theme",
]);

// Moment types considered high-weight for "defining moments" queries
const DEFINING_MOMENT_TYPES = new Set([
  "defining_moment", "trust_rupture", "trust_repair", "repair",
  "belief_change", "value_change", "first_experience", "romantic_milestone",
]);

const MAX_MOMENTS_PER_SCOPE = 200;

function nowIso(v = new Date()) {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}
function clamp01(n, d = 0.50) {
  const v = Number(n);
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : d));
}
function dedup(arr) {
  return Array.isArray(arr) ? [...new Set(arr.filter(Boolean).map(String))] : [];
}

function createAutobiographyStore({ config = {}, logger = null } = {}) {
  const _moments = new Map();
  const _scope   = (companionId, customerId) => `${companionId}:${customerId}`;

  async function init() {}

  /**
   * Record a defining moment.
   * Returns null if evidence (source_event_ids) is absent.
   */
  async function recordMoment({
    companionId,
    customerId,
    type           = "defining_moment",
    label,
    summary        = "",
    source_event_ids = [],
    chapter_id     = null,
    confidence     = 0.50,
    private: isPrivate = true,
    now            = new Date(),
    metadata       = {},
  } = {}) {
    if (!companionId || !label) return null;
    const evIds = dedup(source_event_ids);
    if (!evIds.length) {
      logger?.warn?.("[autobiography-store] moment rejected: no source_event_ids — evidence required");
      return null;
    }
    const k    = _scope(companionId, customerId);
    const at   = nowIso(now);
    const conf = clamp01(confidence);
    const moment = {
      id:               crypto.randomUUID(),
      companion_id:     String(companionId),
      customer_id:      String(customerId || "user"),
      type:             MOMENT_TYPES.includes(type) ? type : "defining_moment",
      label:            String(label).slice(0, 200),
      summary:          String(summary).slice(0, 800),
      source_event_ids: evIds,
      chapter_id:       chapter_id ? String(chapter_id) : null,
      confidence:       conf,
      private:          Boolean(isPrivate),
      recorded_at:      at,
      metadata:         { ...metadata },
    };

    if (!_moments.has(k)) _moments.set(k, []);
    const list = _moments.get(k);
    // Cap: drop oldest when at limit
    if (list.length >= MAX_MOMENTS_PER_SCOPE) list.shift();
    list.push(moment);
    return moment;
  }

  /** Most recent N moments in reverse-chronological order. */
  async function getRecent({ companionId, customerId, limit = 20 } = {}) {
    const list = _moments.get(_scope(companionId, customerId)) || [];
    return list.slice(-Math.max(1, Number(limit) || 20)).reverse();
  }

  /**
   * High-confidence defining moments (trust ruptures, repairs, belief/value
   * changes, firsts) — sorted by confidence descending.
   */
  async function getDefiningMoments({ companionId, customerId, minConfidence = 0.45 } = {}) {
    const list = _moments.get(_scope(companionId, customerId)) || [];
    return list
      .filter(m => m.confidence >= minConfidence && DEFINING_MOMENT_TYPES.has(m.type))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 30);
  }

  /** All moments of a specific type. */
  async function getByType({ companionId, customerId, type } = {}) {
    const list = _moments.get(_scope(companionId, customerId)) || [];
    return list.filter(m => m.type === type);
  }

  /** Moments belonging to a specific chapter. */
  async function getByChapter({ companionId, customerId, chapter_id } = {}) {
    const list = _moments.get(_scope(companionId, customerId)) || [];
    return list.filter(m => m.chapter_id === chapter_id);
  }

  /**
   * Prune moments older than `days` days, except high-confidence defining moments.
   */
  async function pruneOlderThan({ companionId, customerId, days = 365 } = {}) {
    const k    = _scope(companionId, customerId);
    const list = _moments.get(k);
    if (!list) return 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const before = list.length;
    const kept   = list.filter(m => m.confidence >= 0.70 || m.recorded_at >= cutoff);
    _moments.set(k, kept);
    return before - kept.length;
  }

  return {
    init,
    recordMoment,
    getRecent,
    getDefiningMoments,
    getByType,
    getByChapter,
    pruneOlderThan,
    MOMENT_TYPES,
    DEFINING_MOMENT_TYPES,
  };
}

module.exports = { createAutobiographyStore, MOMENT_TYPES, DEFINING_MOMENT_TYPES };

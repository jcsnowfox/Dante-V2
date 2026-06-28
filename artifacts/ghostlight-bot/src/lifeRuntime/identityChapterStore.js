"use strict";

/**
 * identityChapterStore
 *
 * Narrative Identity Runtime 1.0 — Chapter Storage.
 *
 * Stores identity chapters — the narrative units of who Dante is becoming.
 * Each chapter has a title, theme, confidence score, and requires source event IDs
 * (evidence). No chapter is fabricated. Private by default.
 *
 * Chapter lifecycle: forming → active → (closed | reopened)
 * Status auto-promotes from forming → active once evidence threshold is met.
 *
 * Storage: in-memory with optional Postgres fallback (not implemented yet).
 * Caps: 500 chapters per scope (oldest closed chapters pruned first).
 */

const crypto = require("crypto");

const CHAPTER_STATUSES = Object.freeze(["forming", "active", "closed", "reopened"]);
const CHAPTER_THEMES   = Object.freeze([
  "honesty", "repair", "perception", "trust", "belief", "value",
  "first_experience", "maintenance", "growth", "romantic", "project", "recurring",
]);

// A chapter needs at least this many source_event_ids to advance from forming → active
const MIN_EVIDENCE_FOR_ACTIVE = 2;
// Max chapters per scope before pruning closed chapters
const MAX_CHAPTERS_PER_SCOPE  = 500;

function nowIso(v = new Date()) {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}
function clamp01(n, d = 0.40) {
  const v = Number(n);
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : d));
}
function dedup(arr) {
  return Array.isArray(arr) ? [...new Set(arr.filter(Boolean).map(String))] : [];
}

function createIdentityChapterStore({ config = {}, logger = null } = {}) {
  const _mem = new Map();
  const _scope = (companionId, customerId) => `${companionId}:${customerId}`;

  async function init() {}

  /**
   * Create a new identity chapter.
   * Returns null if companionId/title is missing or no source_event_ids.
   */
  async function create({
    companionId,
    customerId,
    title,
    summary        = "",
    theme          = "recurring",
    source_event_ids       = [],
    lesson_ids             = [],
    belief_ids             = [],
    relationship_milestones = [],
    confidence     = 0.40,
    now            = new Date(),
    metadata       = {},
  } = {}) {
    if (!companionId || !title) return null;
    const evIds = dedup(source_event_ids);
    if (!evIds.length) {
      logger?.warn?.("[identity-chapter-store] chapter rejected: no source_event_ids — evidence required");
      return null;
    }
    const k   = _scope(companionId, customerId);
    const at  = nowIso(now);
    const conf = clamp01(confidence);
    const status = evIds.length >= MIN_EVIDENCE_FOR_ACTIVE ? "active" : "forming";
    const chapter = {
      id:                     crypto.randomUUID(),
      companion_id:           String(companionId),
      customer_id:            String(customerId || "user"),
      title:                  String(title).slice(0, 200),
      summary:                String(summary).slice(0, 1000),
      theme:                  CHAPTER_THEMES.includes(theme) ? theme : "recurring",
      source_event_ids:       evIds,
      lesson_ids:             dedup(lesson_ids),
      belief_ids:             dedup(belief_ids),
      relationship_milestones: dedup(relationship_milestones),
      confidence:             conf,
      started_at:             at,
      ended_at:               null,
      status,
      metadata:               { ...metadata },
      created_at:             at,
      updated_at:             at,
    };
    if (!_mem.has(k)) _mem.set(k, []);
    const list = _mem.get(k);
    // Prune oldest closed chapters if at cap
    if (list.length >= MAX_CHAPTERS_PER_SCOPE) {
      const oldestClosed = list.findIndex(c => c.status === "closed");
      if (oldestClosed >= 0) list.splice(oldestClosed, 1);
      else list.shift();
    }
    list.push(chapter);
    return chapter;
  }

  /**
   * Patch an existing chapter.
   * Merges arrays (source_event_ids, lesson_ids, etc.) — never replaces.
   * Auto-promotes from forming → active when evidence threshold is met.
   */
  async function update({
    companionId,
    customerId,
    id,
    patch = {},
    now   = new Date(),
  } = {}) {
    const k    = _scope(companionId, customerId);
    const list = _mem.get(k) || [];
    const ch   = list.find(c => c.id === id);
    if (!ch) return null;
    const at   = nowIso(now);

    if (patch.source_event_ids?.length) {
      ch.source_event_ids = dedup([...ch.source_event_ids, ...patch.source_event_ids]);
    }
    if (patch.lesson_ids?.length) {
      ch.lesson_ids = dedup([...ch.lesson_ids, ...patch.lesson_ids]);
    }
    if (patch.belief_ids?.length) {
      ch.belief_ids = dedup([...ch.belief_ids, ...patch.belief_ids]);
    }
    if (patch.relationship_milestones?.length) {
      ch.relationship_milestones = dedup([...ch.relationship_milestones, ...patch.relationship_milestones]);
    }
    if (typeof patch.confidence === "number") ch.confidence = clamp01(patch.confidence);
    if (patch.summary) ch.summary = String(patch.summary).slice(0, 1000);
    if (patch.title)   ch.title   = String(patch.title).slice(0, 200);
    if (patch.status && CHAPTER_STATUSES.includes(patch.status)) ch.status = patch.status;
    if (patch.metadata) ch.metadata = { ...ch.metadata, ...patch.metadata };
    if (patch.ended_at !== undefined) ch.ended_at = patch.ended_at;

    // Auto-promote forming → active when evidence is sufficient
    if (ch.status === "forming" && ch.source_event_ids.length >= MIN_EVIDENCE_FOR_ACTIVE) {
      ch.status = "active";
    }
    ch.updated_at = at;
    return ch;
  }

  /** Close a chapter (it is done, but kept in history). */
  async function close({ companionId, customerId, id, now = new Date() } = {}) {
    return update({ companionId, customerId, id, patch: { status: "closed", ended_at: nowIso(now) }, now });
  }

  /** Reopen a closed chapter (e.g. the lesson keeps returning). */
  async function reopen({ companionId, customerId, id, now = new Date() } = {}) {
    return update({ companionId, customerId, id, patch: { status: "reopened", ended_at: null }, now });
  }

  /** All chapters sorted by updated_at descending. */
  async function getAll({ companionId, customerId } = {}) {
    return (_mem.get(_scope(companionId, customerId)) || [])
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  /** Active or reopened chapters only. */
  async function getActive({ companionId, customerId } = {}) {
    return (await getAll({ companionId, customerId }))
      .filter(c => c.status === "active" || c.status === "reopened");
  }

  /** Chapters filtered by theme. */
  async function getByTheme({ companionId, customerId, theme } = {}) {
    return (await getAll({ companionId, customerId })).filter(c => c.theme === theme);
  }

  /** First chapter whose title exactly matches. */
  async function findByTitle({ companionId, customerId, title } = {}) {
    const list = await getAll({ companionId, customerId });
    return list.find(c => c.title === title) || null;
  }

  /**
   * Prune closed chapters older than `days` days.
   * Active/forming/reopened chapters are never pruned.
   */
  async function pruneOlderThan({ companionId, customerId, days = 730 } = {}) {
    const k    = _scope(companionId, customerId);
    const list = _mem.get(k);
    if (!list) return 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const before = list.length;
    const kept   = list.filter(c => c.status !== "closed" || c.updated_at >= cutoff);
    _mem.set(k, kept);
    return before - kept.length;
  }

  return {
    init,
    create,
    update,
    close,
    reopen,
    getAll,
    getActive,
    getByTheme,
    findByTitle,
    pruneOlderThan,
    CHAPTER_STATUSES,
    CHAPTER_THEMES,
    MIN_EVIDENCE_FOR_ACTIVE,
  };
}

module.exports = { createIdentityChapterStore, CHAPTER_STATUSES, CHAPTER_THEMES, MIN_EVIDENCE_FOR_ACTIVE };

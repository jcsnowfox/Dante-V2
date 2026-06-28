"use strict";

/**
 * relationshipLessonStore — ADAPTER
 *
 * Previously a standalone store writing to "relationship_lessons" (13 lesson types).
 * After Integration Layer Repair 1.0, this is an adapter that delegates all reads
 * and writes to the canonical lesson store (src/relationshipLearning/lessonStore.js,
 * table: "dante_relationship_lessons", 23 lesson types).
 *
 * Why this matters: lessons written through either path are now visible through
 * both paths. The lesson island that existed between the two systems is gone.
 *
 * Schema mapping:
 *   Legacy field              → Canonical field
 *   source_consequence_ids   → origin_event_ids
 *   future_behavior_guidance → future_guidance
 *
 * See docs/LESSON_STORE_OWNERSHIP.md for the full ownership record.
 */

const {
  createLessonStore,
  LESSON_TYPES: CANONICAL_TYPES,
  LESSON_STATUSES,
} = require("../relationshipLearning/lessonStore");

// Legacy 13 types — subset of canonical 23; kept for backward compat
const LESSON_TYPES = Object.freeze([
  "hurt_pattern","repair_success","repair_failure","trust_repair","boundary_learning",
  "communication_preference","evidence_integrity","perception_boundary","promise_learning",
  "give_space_learning","followup_learning","tone_learning","naturalism_learning",
]);
const STATUSES = LESSON_STATUSES;

// Map legacy lesson types to the nearest canonical equivalent
const TYPE_MAP = Object.freeze({
  hurt_pattern:             "conflict",
  repair_success:           "repair",
  repair_failure:           "repair",
  trust_repair:             "trust",
  boundary_learning:        "boundaries",
  communication_preference: "communication",
  evidence_integrity:       "evidence",
  perception_boundary:      "boundaries",
  promise_learning:         "trust",
  give_space_learning:      "independence",
  followup_learning:        "communication",
  tone_learning:            "tone",
  naturalism_learning:      "communication",
});

function _toCanonicalType(t) { return CANONICAL_TYPES.includes(t) ? t : (TYPE_MAP[t] || "conflict"); }

function _mapFromCanonical(lesson) {
  if (!lesson) return lesson;
  return {
    ...lesson,
    // Expose legacy field names alongside canonical ones for callers that expect them
    sourceConsequenceIds:   lesson.originEventIds   ?? [],
    futureBehaviorGuidance: lesson.futureGuidance   ?? "",
  };
}

// Derive status from confidence (mirrors canonical store's computeStatus)
function _computeStatus(conf) {
  if (conf >= 0.85) return "core";
  if (conf >= 0.65) return "stable";
  if (conf >= 0.40) return "forming";
  return "new";
}

function createRelationshipLessonStore({ config = {}, logger = null } = {}) {
  const canonical = createLessonStore({ config, logger });

  // In-memory index for upsert dedup when no DB (canonical in-memory path lacks
  // persistent state across calls; we maintain a thin key-index here).
  const _memIndex = new Map(); // scope → Map<lessonKey, lesson>

  function _scopeKey(companionId, customerId) { return `${companionId}:${customerId}`; }
  function _lessonKey(input) {
    return String(input.lessonKey || input.title || input.lessonType || "lesson")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
  }

  async function init() {
    await canonical.init();
  }

  async function upsertLesson(input = {}) {
    const companionId     = input.companionId || input.companion_id || "";
    const customerId      = input.customerId  || input.customer_id  || "user";
    const inputLessonType = input.lessonType || "";
    const lessonType      = _toCanonicalType(inputLessonType); // canonical type for DB
    const lk              = _lessonKey(input);
    const scopeKey        = _scopeKey(companionId, customerId);

    // If the caller passed a legacy type that differs from canonical, expose both.
    // _withInputType preserves lessonType as the original input value for
    // callers that pass legacy types and expect them back unchanged.
    function _withInputType(lesson) {
      if (!lesson) return lesson;
      const mapped = _mapFromCanonical(lesson);
      return (inputLessonType && inputLessonType !== lessonType)
        ? { ...mapped, lessonType: inputLessonType }
        : mapped;
    }

    if (!_memIndex.has(scopeKey)) _memIndex.set(scopeKey, new Map());
    const scopeMap = _memIndex.get(scopeKey);

    // Reinforce/challenge existing lesson if we've seen this key before
    if (scopeMap.has(lk)) {
      const existing = scopeMap.get(lk);
      if (input.direction === "challenge") {
        let updated = null;
        if (existing.id) {
          updated = await canonical.challenge({ id: existing.id, evidenceId: (input.evidenceIds || [])[0] ?? null });
        }
        if (!updated) {
          // No-DB path: update in memory
          const newConf = Math.max(0, (existing.confidence ?? 0.30) - 0.15);
          updated = { ...existing, confidence: newConf, status: "challenged", updatedAt: new Date().toISOString() };
        }
        scopeMap.set(lk, updated);
        return _withInputType(updated);
      } else {
        let updated = null;
        if (existing.id) {
          updated = await canonical.reinforce({ id: existing.id, evidenceId: (input.evidenceIds || [])[0] ?? null, delta: Number(input.confidenceDelta ?? 0.08) });
        }
        if (!updated) {
          // No-DB path: update in memory
          const delta   = Number(input.confidenceDelta ?? 0.08);
          const newConf = Math.min(1, (existing.confidence ?? 0.30) + delta);
          updated = { ...existing, confidence: newConf, status: _computeStatus(newConf), updatedAt: new Date().toISOString() };
        }
        scopeMap.set(lk, updated);
        return _withInputType(updated);
      }
    }

    // Create new lesson in canonical store
    const created = await canonical.create({
      companionId,
      customerId,
      lessonType,
      title:          String(input.title || lk).slice(0, 180),
      summary:        String(input.summary || ""),
      evidenceIds:    Array.isArray(input.evidenceIds) ? input.evidenceIds : [],
      originEventIds: Array.isArray(input.sourceConsequenceIds || input.originEventIds)
        ? (input.sourceConsequenceIds || input.originEventIds) : [],
      confidence:     Number(input.confidence ?? 0.30),
      strength:       Number(input.strength   ?? 0.30),
      futureGuidance: String(input.futureBehaviorGuidance || input.futureGuidance || ""),
    });

    if (created) {
      // In-memory record preserves the original input type so listLessons
      // fallback returns the same type the caller wrote (legacy or canonical).
      const memRecord = (inputLessonType && inputLessonType !== lessonType)
        ? { ...created, lessonType: inputLessonType }
        : created;
      scopeMap.set(lk, memRecord);
    }
    return _withInputType(created);
  }

  async function listLessons({ companionId, customerId, status = null, limit = 50 } = {}) {
    const results = status
      ? await canonical.listByStatus({ companionId, customerId, status })
      : await canonical.listActive({ companionId, customerId, limit });

    if (results?.length > 0) return results.map(_mapFromCanonical);

    // No-DB fallback: return from in-memory index
    const sk  = _scopeKey(companionId, customerId);
    if (!_memIndex.has(sk)) return [];
    const all = [..._memIndex.get(sk).values()];
    const filtered = status
      ? all.filter(l => l.status === status)
      : all.filter(l => l.status !== "retired");
    return filtered
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, limit)
      .map(_mapFromCanonical);
  }

  async function getStatus({ companionId, customerId } = {}) {
    const lessons = await listLessons({ companionId, customerId, limit: 100 });
    return {
      relationship_lessons_count:   lessons.length,
      active_relationship_lessons:  lessons.filter(l => ["new","forming","stable","core","challenged"].includes(l.status)).length,
      recent_lesson_types:          lessons.slice(0, 5).map(l => l.lessonType),
      last_repair_lesson_at:        lessons[0]?.updatedAt || null,
      behavior_guidance_active:     lessons.some(l => l.futureBehaviorGuidance || l.futureGuidance),
    };
  }

  return { init, upsertLesson, listLessons, getStatus, LESSON_TYPES, STATUSES };
}

module.exports = { createRelationshipLessonStore, LESSON_TYPES, STATUSES };

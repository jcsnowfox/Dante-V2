"use strict";

/**
 * changePointDetector
 *
 * Narrative Identity Runtime 1.0 — Change Point Detection.
 *
 * Pure functions only. No state, no async calls, no side effects.
 *
 * Detects whether an event cluster signals a narrative change point —
 * a moment that may eventually warrant an identity chapter.
 *
 * Core rules (hard):
 *   - One event alone almost never creates a stable chapter.
 *   - Confidence grows slowly, not in a single interaction.
 *   - A small set of high-weight event types (trust ruptures, firsts,
 *     romantic milestones) may open a forming chapter from one event —
 *     but forming ≠ active; active requires MIN_EVIDENCE_FOR_ACTIVE.
 *   - No chapter is fabricated: every change point must have source event IDs.
 */

// Change point type → { baseConfidence, requiredCount, theme }
const CHANGE_POINT_TYPES = Object.freeze({
  trust_rupture:       { baseConfidence: 0.40, requiredCount: 1, theme: "trust"            },
  trust_repair:        { baseConfidence: 0.35, requiredCount: 1, theme: "repair"           },
  belief_change:       { baseConfidence: 0.30, requiredCount: 2, theme: "belief"           },
  value_change:        { baseConfidence: 0.28, requiredCount: 2, theme: "value"            },
  first_experience:    { baseConfidence: 0.35, requiredCount: 1, theme: "first_experience" },
  repair_success:      { baseConfidence: 0.30, requiredCount: 2, theme: "repair"           },
  maintenance_moment:  { baseConfidence: 0.20, requiredCount: 3, theme: "maintenance"      },
  romantic_milestone:  { baseConfidence: 0.40, requiredCount: 1, theme: "romantic"         },
  major_project:       { baseConfidence: 0.25, requiredCount: 2, theme: "project"          },
  honesty_lesson:      { baseConfidence: 0.28, requiredCount: 2, theme: "honesty"          },
  perception_lesson:   { baseConfidence: 0.32, requiredCount: 2, theme: "perception"       },
  repeated_lesson:     { baseConfidence: 0.22, requiredCount: 3, theme: "recurring"        },
});

// Canonical event-type strings → change point type
// (covers runtimeEventBus event_type values and consequence event types)
const EVENT_TO_CHANGE_POINT = Object.freeze({
  hurt_detected:                    "trust_rupture",
  boundary_crossed:                 "trust_rupture",
  promise_broken:                   "trust_rupture",
  unresolved_tension:               "trust_rupture",
  trust_rupture:                    "trust_rupture",
  repair_completed:                 "trust_repair",
  repair_started:                   "trust_repair",
  first_successful_repair:          "trust_repair",
  trust_repair:                     "trust_repair",
  confabulation_detected:           "perception_lesson",
  claimed_action_without_evidence:  "perception_lesson",
  identity_belief_changed:          "belief_change",
  identity_value_changed:           "value_change",
  first_experience_recorded:        "first_experience",
  fulfillment_succeeded:            "repair_success",
  romantic_milestone:               "romantic_milestone",
  project_completed:                "major_project",
  maintenance_requested:            "maintenance_moment",
  maintenance_moment:               "maintenance_moment",
  lesson_reinforced:                "repeated_lesson",
  honesty_demonstrated:             "honesty_lesson",
  narrative_chapter_opened:         null,
  narrative_chapter_updated:        null,
  narrative_self_story_updated:     null,
});

/**
 * Classify a single event into a change point type.
 * Returns null if the event is not narrative-relevant.
 */
function classifyEvent(event = {}) {
  const eventType = event?.event_type || event?.eventType || "";
  const mapped = EVENT_TO_CHANGE_POINT[eventType];
  return mapped === undefined ? null : mapped;
}

/**
 * Detect narrative change points from a list of events.
 *
 * @param {object[]} events - Recent runtime events
 * @returns {Array<{changePointType, theme, eventCount, sourceEventIds, confidence, evidenceSufficient}>}
 */
function detectChangePoints(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];

  // Count by change point type and collect event IDs
  const counts   = {};
  const idsByType = {};
  for (const e of events) {
    const cp = classifyEvent(e);
    if (!cp) continue;
    counts[cp] = (counts[cp] || 0) + 1;
    if (!idsByType[cp]) idsByType[cp] = [];
    const id = e.id || e.eventId;
    if (id) idsByType[cp].push(String(id));
  }

  const points = [];
  for (const [cpType, def] of Object.entries(CHANGE_POINT_TYPES)) {
    const count = counts[cpType] || 0;
    if (count === 0) continue;
    if (count < def.requiredCount) continue;
    const ratio      = Math.min(count / def.requiredCount, 3);   // saturates at 3x required
    const confidence = Math.min(def.baseConfidence * ratio, 0.90);
    const sourceIds  = idsByType[cpType] || [];
    points.push({
      changePointType:   cpType,
      theme:             def.theme,
      eventCount:        count,
      sourceEventIds:    sourceIds,
      confidence,
      evidenceSufficient: sourceIds.length > 0 && confidence >= 0.20,
    });
  }

  return points.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Compute confidence for a chapter given how many source events it has.
 * Grows logarithmically — hard to reach high confidence from few events.
 *
 * @param {number} sourceEventCount
 * @param {number} [baseConfidence=0.25]
 * @returns {number} confidence in [0, 0.95]
 */
function computeChapterConfidence(sourceEventCount, baseConfidence = 0.25) {
  if (sourceEventCount <= 0) return 0;
  const growth = Math.log(sourceEventCount + 1) / Math.log(10);
  return Math.min(baseConfidence + growth * 0.30, 0.95);
}

/**
 * Return whether a single event of this eventType alone is sufficient to open
 * a *forming* chapter. Only very high-weight event types qualify.
 * Note: forming ≠ active — it still needs additional evidence to go active.
 */
function isSingleEventSufficient(eventType) {
  const SINGLE_EVENT_TYPES = new Set([
    "trust_rupture", "first_experience", "romantic_milestone",
  ]);
  const cp = EVENT_TO_CHANGE_POINT[eventType];
  return cp ? SINGLE_EVENT_TYPES.has(cp) : false;
}

module.exports = {
  detectChangePoints,
  classifyEvent,
  computeChapterConfidence,
  isSingleEventSufficient,
  CHANGE_POINT_TYPES,
  EVENT_TO_CHANGE_POINT,
};

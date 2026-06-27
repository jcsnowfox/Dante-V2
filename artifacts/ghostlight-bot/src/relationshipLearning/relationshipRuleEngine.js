"use strict";

/**
 * relationshipRuleEngine
 *
 * Relationship Learning Runtime 1.0 — Emergent relationship rules.
 *
 * Relationship rules are NOT hardcoded.
 * They emerge from clusters of stable or core lessons of the same type.
 *
 * Examples of emerged rules:
 *   "When Jenna asks about runtime state, only answer from verified evidence."
 *   "If Jenna leaves hurt, don't assume repair is complete."
 *   "She appreciates honesty more than comforting fiction."
 *   "She often gets distracted rather than intentionally disappearing."
 *
 * Rules are returned as guidance strings and as structured objects.
 * Pure functions — no I/O.
 */

const EMERGENCE_THRESHOLD_STABLE = 2; // N stable+ lessons of same type → "emerging" rule
const EMERGENCE_THRESHOLD_CORE   = 1; // 1 core lesson → "established" rule

/**
 * emergeRules
 *
 * Given a list of active lessons, returns emerged relationship rules.
 * Rules cluster by lesson_type — the highest-confidence lesson's guidance
 * becomes the rule statement.
 *
 * @param {object[]} lessons — from lessonStore.listActive()
 * @returns {object[]} sorted by confidence desc
 */
function emergeRules({ lessons = [] } = {}) {
  if (!lessons || lessons.length === 0) return [];

  const byType = {};
  for (const l of lessons) {
    if (l.status === "retired") continue;
    if (!byType[l.lessonType]) byType[l.lessonType] = [];
    byType[l.lessonType].push(l);
  }

  const rules = [];

  for (const [lessonType, typeLessons] of Object.entries(byType)) {
    const coreLessons    = typeLessons.filter(l => l.status === "core");
    const stablePlus     = typeLessons.filter(l => l.status === "stable" || l.status === "core");
    const challenged     = typeLessons.filter(l => l.status === "challenged");

    const isEstablished  = coreLessons.length  >= EMERGENCE_THRESHOLD_CORE;
    const isEmerging     = stablePlus.length   >= EMERGENCE_THRESHOLD_STABLE;

    if (!isEstablished && !isEmerging) continue;

    const anchor = typeLessons
      .filter(l => l.status !== "retired" && l.status !== "challenged")
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (!anchor) continue;

    const totalReinforced = typeLessons.reduce((s, l) => s + (l.timesReinforced ?? 0), 0);

    rules.push({
      ruleType:          lessonType,
      statement:         anchor.futureGuidance,
      confidence:        anchor.confidence,
      strength:          anchor.strength,
      status:            isEstablished ? "established" : "emerging",
      lessonCount:       typeLessons.length,
      timesReinforced:   totalReinforced,
      timesChallenged:   challenged.length,
      positiveCount:     typeLessons.filter(l => l.futureGuidance && !l.futureGuidance.toLowerCase().startsWith("never") && !l.futureGuidance.toLowerCase().startsWith("avoid")).length,
    });
  }

  return rules.sort((a, b) => b.confidence - a.confidence);
}

/**
 * formatRulesAsGuidance
 *
 * Returns compact statement strings for established rules.
 * Used when a system needs the top N rules.
 */
function formatRulesAsGuidance({ rules = [], max = 4, includeEmerging = false } = {}) {
  return rules
    .filter(r => r.status === "established" || (includeEmerging && r.status === "emerging"))
    .slice(0, max)
    .map(r => r.statement);
}

module.exports = {
  emergeRules,
  formatRulesAsGuidance,
  EMERGENCE_THRESHOLD_STABLE,
  EMERGENCE_THRESHOLD_CORE,
};

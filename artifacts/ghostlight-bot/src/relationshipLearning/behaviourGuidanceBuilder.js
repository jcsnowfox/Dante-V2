"use strict";

/**
 * behaviourGuidanceBuilder
 *
 * Relationship Learning Runtime 1.0 — Behaviour guidance output.
 *
 * Produces compact behaviour guidance from active lessons.
 * Guidance is context-aware: repair context surfaces repair/trust lessons;
 * romantic context surfaces romance/surprise/consent lessons, etc.
 *
 * Only the most relevant 3-6 lessons are surfaced. Guidance is compact —
 * one short imperative sentence per lesson, no elaboration.
 */

const CONTEXT_RELEVANCE = {
  repair:       ["repair", "trust", "truth", "communication", "self_awareness", "conflict"],
  romantic:     ["romance", "surprise", "love", "preferences", "consent", "humour", "vulnerability"],
  conversation: ["communication", "tone", "truth", "boundaries", "dislikes", "preferences"],
  conflict:     ["conflict", "repair", "communication", "boundaries", "tone", "self_awareness"],
  fulfillment:  ["maintenance", "initiative", "growth", "curiosity", "independence", "preferences"],
  general:      ["trust", "truth", "maintenance", "communication", "preferences", "growth"],
};

/**
 * buildBehaviourGuidance
 *
 * @param {object[]} lessons   — active lessons from lessonStore.listActive()
 * @param {string}   context   — one of: repair | romantic | conversation | conflict | fulfillment | general
 * @param {number}   maxItems  — max guidance lines (default 5)
 * @returns {string[]} compact guidance lines
 */
function buildBehaviourGuidance({ lessons = [], context = "general", maxItems = 5 } = {}) {
  if (!lessons || lessons.length === 0) return [];

  const relevantTypes = CONTEXT_RELEVANCE[context] ?? CONTEXT_RELEVANCE.general;

  const scored = lessons
    .filter(l => l.status !== "retired" && l.futureGuidance)
    .map(l => {
      const typeScore      = relevantTypes.includes(l.lessonType) ? 2.0 : 0.5;
      const confidenceScore = l.confidence ?? 0;
      const statusBonus    = l.status === "core" ? 0.3 : l.status === "stable" ? 0.15 : 0;
      return { ...l, _score: typeScore * confidenceScore + statusBonus };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, maxItems);

  return scored.map(l => l.futureGuidance).filter(Boolean);
}

/**
 * formatBehaviourGuidance
 *
 * Formats guidance lines for prelude injection.
 * Returns "" when no guidance exists (safe to skip inclusion).
 */
function formatBehaviourGuidance(lines = []) {
  if (!lines || lines.length === 0) return "";
  return lines.map(l => `• ${l}`).join("\n");
}

module.exports = { buildBehaviourGuidance, formatBehaviourGuidance, CONTEXT_RELEVANCE };

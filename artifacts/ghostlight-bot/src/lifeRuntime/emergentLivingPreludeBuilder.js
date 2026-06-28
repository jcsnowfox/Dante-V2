"use strict";

/**
 * emergentLivingPreludeBuilder
 *
 * Pure function — no async, no side effects.
 *
 * Emits AT MOST ONE compact line for the LLM prelude, surfacing the single most
 * salient living behavior or relationship-DNA signal. It is private context that
 * shapes behaviour, not content to narrate.
 *
 * Contract:
 *   - Returns null when there is nothing established enough to surface.
 *   - Returns a single string ≤ 180 chars otherwise (never a list).
 *   - Never exposes raw private hurt text, confidence numbers, or stage codes.
 *   - Does not duplicate relationship-learning or narrative-identity lines —
 *     those are surfaced by their own builders; this one speaks only in the
 *     "Living behavior:" / "Relationship DNA:" / "Emergent pattern:" register.
 */

const SUPPRESSED_RE = /secret|token|password|api_?key|credential/i;
// Lines that would echo other prelude builders — skip to avoid duplication.
const DUPLICATE_RE = /relationship lesson|chapter|self-story|narrative/i;

/**
 * buildEmergentLivingPrelude
 *
 * @param {object} opts
 * @param {object} opts.guidance  output of emergentBehaviorGuidanceBuilder
 * @param {object} opts.culture   output of relationshipCultureBuilder ({ safe })
 * @returns {string|null}
 */
function buildEmergentLivingPrelude({ guidance = null, culture = null } = {}) {
  if (!guidance) return null;

  // Priority order: repair guidance > space/endings > romance > anything else.
  const ordered = [
    ...(guidance.forRepairPersistence || []),
    ...(guidance.forConversationContinuity || []),
    ...(guidance.forRomanticSurprise || []),
    ...(guidance.guidance || []),
  ];

  for (const candidate of ordered) {
    const line = _normalise(candidate);
    if (!line) continue;
    if (SUPPRESSED_RE.test(line)) continue;
    if (DUPLICATE_RE.test(line)) continue;
    return line.slice(0, 180);
  }

  // Fallback: if culture has a stable "feels like us", surface a single soft note.
  if (culture?.safe?.traditionsCount > 0) {
    return "Relationship DNA: some of what we do has quietly become tradition";
  }

  return null;
}

function _normalise(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

module.exports = { buildEmergentLivingPrelude };

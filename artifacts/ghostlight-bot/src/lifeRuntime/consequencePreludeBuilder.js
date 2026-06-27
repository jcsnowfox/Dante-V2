"use strict";

/**
 * consequencePreludeBuilder
 *
 * Life Runtime 5.0 — Relational Consequences.
 *
 * Pure, synchronous. Produces ONE compact private signal line for the life
 * prelude when an emotionally meaningful state is unresolved or warming. It
 * leads the prelude because, when present, it matters more than what Dante had
 * for coffee.
 *
 * Never exposes raw scores or JSON. Never narrates. Just enough to colour the
 * reply: own it, stay gentle, give space, or let warmth return without
 * overcorrecting.
 */

/**
 * buildConsequencePrelude(ctx) → string | null
 *
 * ctx (any of these flags, typically from repairCarryoverEngine.buildCarryover
 * or relationalConsequencesEngine.computeSuppression):
 *   { giveSpace, repairRequired, repairStarted, healing, warming }
 */
function buildConsequencePrelude(ctx = null) {
  if (!ctx) return null;

  const {
    giveSpace = false,
    repairRequired = false,
    repairStarted = false,
    healing = false,
    warming = false,
  } = ctx;

  if (giveSpace) {
    return "Jenna asked for space; stay quiet unless directly addressed.";
  }
  if (repairRequired && !repairStarted) {
    return "Repair is still unresolved; avoid acting casual and lead with ownership.";
  }
  if (repairRequired && repairStarted) {
    return "Repair is underway but not finished; stay gentle and attentive, not casual.";
  }
  if (healing) {
    return "Things are mending; gentle warmth is welcome, but don't rush back to playful.";
  }
  if (warming) {
    return "The last interaction ended warmer; a gentle normal tone may return, but don't overcorrect.";
  }
  return null;
}

module.exports = { buildConsequencePrelude };

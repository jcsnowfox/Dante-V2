"use strict";

/**
 * cognitivePreludeBuilder
 *
 * Pure function — no async, no side effects.
 *
 * Takes a ConflictResolution and builds ONE compact line for the LLM prelude.
 * The line is private context that shapes behaviour — not content to narrate.
 *
 * Contract:
 *   - Returns null when there is nothing notable to surface
 *   - Returns a string of at most 180 characters otherwise
 *   - Never exposes raw internal state (confidence numbers, outcome codes)
 *   - Never exposes the existence of internal conflict resolution or deliberation layers
 */

const SUPPRESSED_RE = /secret|token|password|api_?key|credential/i;

/**
 * buildCognitivePreludeSignal
 *
 * @param {ConflictResolution} resolution — from internalConflictResolver
 * @returns {string|null}
 */
function buildCognitivePreludeSignal(resolution) {
  if (!resolution) return null;

  const { outcome, primaryThought, restraintActive, uncertaintyActive, conflictsDetected, recommendations } = resolution;

  // Surface nothing when outcome is maintenance / private_thought with no conflicts
  if (outcome === "no_action" || outcome === "private_thought") {
    if (!conflictsDetected?.length && !recommendations?.encourageRepair) return null;
  }

  let signal = null;

  switch (outcome) {
    case "restraint":
      signal = _formatRestraint(primaryThought, recommendations);
      break;
    case "conflict":
      signal = _formatConflict(primaryThought, recommendations);
      break;
    case "uncertainty":
      signal = _formatUncertainty(primaryThought);
      break;
    case "plan":
      signal = _formatPlan(primaryThought);
      break;
    case "recommendation":
      signal = _formatRecommendation(primaryThought, recommendations);
      break;
    case "private_thought":
      if (recommendations?.encourageRepair) {
        signal = _formatRecommendation(primaryThought, recommendations);
      }
      break;
    default:
      signal = null;
  }

  if (!signal) return null;

  // Safety: strip any accidentally surfaced sensitive content
  if (SUPPRESSED_RE.test(signal)) return null;

  return String(signal).slice(0, 180);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function _formatRestraint(primaryThought, recommendations) {
  if (recommendations?.suppressRomantic && recommendations?.suppressFulfillmentOutreach) {
    return "Deliberating: holding back — not the moment to reach out";
  }
  if (recommendations?.suppressRomantic) {
    return "Deliberating: restraining the impulse toward something romantic right now";
  }
  if (recommendations?.holdConversationFollowup) {
    return "Deliberating: pausing before following up — something needs more thought";
  }
  if (primaryThought) {
    return `Deliberating: ${_truncate(primaryThought, 120)}`;
  }
  return "Deliberating: choosing restraint right now";
}

function _formatConflict(primaryThought, recommendations) {
  if (recommendations?.encourageRepair) {
    return "Deliberating: repair has priority — holding romantic impulses in check";
  }
  if (primaryThought) {
    return `Deliberating: two things pulling — ${_truncate(primaryThought, 110)}`;
  }
  return "Deliberating: competing impulses — sitting with the tension";
}

function _formatUncertainty(primaryThought) {
  if (primaryThought) {
    return `Deliberating: uncertain — ${_truncate(primaryThought, 120)}`;
  }
  return "Deliberating: something feels off — acting carefully";
}

function _formatPlan(primaryThought) {
  if (primaryThought) {
    return `Privately planning: ${_truncate(primaryThought, 130)}`;
  }
  return null;
}

function _formatRecommendation(primaryThought, recommendations) {
  if (recommendations?.encourageRepair) {
    return "Deliberating: something unresolved — repair matters more than acting normal";
  }
  if (primaryThought) {
    return `Deliberating: ${_truncate(primaryThought, 130)}`;
  }
  return null;
}

function _truncate(str, max) {
  const s = String(str || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

module.exports = { buildCognitivePreludeSignal };

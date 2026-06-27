"use strict";

/**
 * identityPreludeBuilder
 *
 * Pure function. Builds ONE compact identity signal for the chat prelude.
 * At most one line. Only fires when something meaningful is worth surfacing.
 *
 * Examples:
 *   "Identity currently favours honesty over speed."
 *   "Identity is holding to: I choose to repair before moving on"
 *   "Identity reconsidering: something about Jenna"
 */

function buildIdentitySignal(identityContext = null) {
  if (!identityContext) return null;

  const { topValue, topPrinciple, recentBeliefRevision, activeConstraint } = identityContext;

  // Active boundary being exercised takes priority
  if (activeConstraint) {
    return `Identity holding: ${activeConstraint}`;
  }

  // A belief revision shows Dante is uncertain or growing
  if (recentBeliefRevision) {
    const label = recentBeliefRevision.replace(/_/g, " ");
    return `Identity reconsidering: ${label}`;
  }

  // Surface the top value if strong enough — contrast with top principle
  if (topValue && topValue.strength >= 0.60) {
    const valLabel = topValue.label.toLowerCase();
    if (topPrinciple) {
      const princLabel = topPrinciple.label.toLowerCase();
      if (valLabel !== princLabel) {
        return `Identity currently favours ${valLabel} over ${princLabel}`;
      }
    }
    return `Identity: ${valLabel} prominent`;
  }

  // Surface top principle as a holding statement
  if (topPrinciple) {
    return `Identity holding to: ${topPrinciple.statement.toLowerCase()}`;
  }

  return null;
}

module.exports = { buildIdentitySignal };

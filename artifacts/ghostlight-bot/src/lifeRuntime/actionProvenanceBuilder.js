"use strict";

/**
 * actionProvenanceBuilder
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Pure function — no side effects, no async, no I/O.
 * Builds a structured provenance chain: need → plan → evidence → outcome.
 *
 * Every autonomous action that claims to have happened must be traceable
 * through a provenance chain. This is the auditable record that proves
 * "this happened and here is why."
 *
 * Usage:
 *   const provenance = buildProvenance({ need, plan, evidence, evidenceIds, outcome, ... });
 *
 * Returns null when required fields are missing (need, plan, outcome).
 */

const PROVENANCE_VERSION = "1.0";

function buildProvenance({
  need,
  plan,
  evidence = {},
  evidenceIds = [],
  outcome,
  companionId = "",
  customerId  = "",
  now = new Date(),
} = {}) {
  if (!need || !plan || !outcome) return null;

  const outcomeResult = typeof outcome === "string" ? outcome : (outcome?.outcome ?? "");

  return {
    provenanceVersion: PROVENANCE_VERSION,
    companionId,
    customerId,
    recordedAt: now instanceof Date ? now.toISOString() : String(now),

    need: {
      needType:     need.needType     ?? "",
      urgency:      need.urgency      ?? 0,
      currentLevel: need.currentLevel ?? null,
      desiredLevel: need.desiredLevel ?? null,
    },

    plan: {
      strategy:        plan.strategy        ?? "",
      reason:          plan.reason          ?? "",
      identityNotes:   plan.identityNotes   ?? "",
      identityAffirmed: plan.identityAffirmed ?? false,
      canAskJenna:     plan.canAskJenna     ?? false,
    },

    evidence:    typeof evidence === "object" && evidence !== null ? evidence : {},
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : [],

    outcome: {
      result:         outcomeResult,
      note:           typeof outcome === "object" ? (outcome.note          ?? "") : "",
      followUp:       typeof outcome === "object" ? (outcome.followUp      ?? "") : "",
      identityImpact: typeof outcome === "object" ? (outcome.identityImpact ?? "") : "",
      needDelta:      typeof outcome === "object" ? (outcome.needDelta     ?? 0)  : 0,
      confidence:     typeof outcome === "object" ? (outcome.confidence    ?? 0.5) : 0.5,
    },
  };
}

module.exports = { buildProvenance, PROVENANCE_VERSION };

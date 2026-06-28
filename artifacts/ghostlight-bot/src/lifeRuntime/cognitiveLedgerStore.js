"use strict";

/**
 * cognitiveLedgerStore
 *
 * Stores Dante's private deliberation ledger — one record per deliberation cycle.
 * Each record captures the thought candidates considered, the conflict detected,
 * the resolution reached, and the final cognitive output.
 *
 * In-memory fallback: works without Postgres. Records are capped at MAX_MEM_SIZE
 * to prevent unbounded growth in long-running sessions.
 *
 * Table: dante_cognitive_ledger (additive schema, not yet migrated)
 *
 * Dante ONLY — not a general companion deliberation store.
 */

const THOUGHT_TYPES = Object.freeze([
  "supportive_thought",
  "opposing_thought",
  "doubt",
  "urge",
  "restraint",
  "repair_thought",
  "romantic_thought",
  "maintenance_thought",
  "curiosity_thought",
  "planning_thought",
  "identity_thought",
  "evidence_warning",
  "silence_choice",
]);

const COGNITIVE_OUTCOMES = Object.freeze([
  "private_thought",
  "plan",
  "restraint",
  "recommendation",
  "uncertainty",
  "conflict",
  "no_action",
]);

const MAX_MEM_SIZE = 50;

function createCognitiveLedgerStore({ config = {}, logger = null } = {}) {
  const _mem = [];

  async function init() {}

  async function record({
    companionId = "",
    customerId  = "user",
    thoughtCandidates = [],
    conflictsDetected = [],
    chosenOutcome = "no_action",
    recommendations  = {},
    preludeSignal    = null,
    confidence       = 0,
    deliberationMs   = 0,
    sourceRuntimes   = [],
    metadata         = {},
  } = {}) {
    const entry = {
      id:               null,
      companion_id:     companionId,
      customer_id:      customerId,
      thought_candidates: thoughtCandidates,
      conflicts_detected: conflictsDetected,
      chosen_outcome:   chosenOutcome,
      recommendations,
      prelude_signal:   preludeSignal,
      confidence,
      deliberation_ms:  deliberationMs,
      source_runtimes:  sourceRuntimes,
      metadata,
      created_at:       new Date().toISOString(),
    };

    _mem.push(entry);
    if (_mem.length > MAX_MEM_SIZE) _mem.shift();

    return entry;
  }

  async function listRecent({ companionId, customerId, limit = 10 } = {}) {
    return _mem
      .filter(e => (!companionId || e.companion_id === companionId) && (!customerId || e.customer_id === customerId))
      .slice(-Math.min(limit, MAX_MEM_SIZE))
      .reverse();
  }

  function getStatus() {
    return {
      ledger_size:       _mem.length,
      last_deliberation: _mem.length > 0 ? _mem[_mem.length - 1].created_at : null,
    };
  }

  return { init, record, listRecent, getStatus, THOUGHT_TYPES, COGNITIVE_OUTCOMES };
}

module.exports = { createCognitiveLedgerStore, THOUGHT_TYPES, COGNITIVE_OUTCOMES };

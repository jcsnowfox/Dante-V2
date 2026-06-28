"use strict";

/**
 * neuralIntegrationRuntime
 *
 * Dante's nervous system — the final runtime in every Life Runtime tick.
 * Reads every other runtime's published context, builds one coherent
 * Integration Snapshot, validates architectural invariants, detects conflicts,
 * computes integration health, and contributes one line to the prelude.
 *
 * CORE LAW: Neural Integration reads. It never owns Identity, Repair, Needs,
 * World Model, Narrative, Relationship DNA, or Decisions. The only state it
 * owns is integration metadata (dante_integration_snapshots).
 *
 * DELETION TEST: If this runtime were removed, every individual runtime would
 * still function correctly. The only thing lost would be the unified
 * integration snapshot and architectural validation.
 *
 * Dante ONLY. Read-only sink — no scheduling, no sending, no Discord.
 */

const { buildIntegrationSnapshot }      = require("./integrationContextBuilder");
const { detectRuntimeConflicts }        = require("./runtimeConflictResolver");
const { validateDependencies }          = require("./runtimeDependencyValidator");
const { computeIntegrationHealth }      = require("./integrationHealthMonitor");
const { buildNeuralPrelude }            = require("./neuralPreludeBuilder");
const { createIntegrationSnapshotStore } = require("./integrationSnapshotStore");

function createNeuralIntegrationRuntime({
  config       = {},
  logger       = null,
  snapshotStore = null,
} = {}) {
  const store = snapshotStore || createIntegrationSnapshotStore({ config, logger });

  let _integrationContext = null;
  let _lastTickAt         = null;

  async function init() {
    await store.init();
  }

  /**
   * tick — reads ALL runtime contexts, runs the 5 pure modules in sequence,
   * persists integration metadata to the snapshot store, and caches the result.
   *
   * _integrationContext is exposed ONLY to lifePreludeBuilder and getStatus().
   * It must NEVER be passed to any decision runtime.
   */
  async function tick({
    companionId             = "",
    customerId              = "user",
    now                     = new Date(),
    identityContext         = null,
    homeostasisContext      = null,
    beliefsContext          = null,
    learningContext         = null,
    narrativeContext        = null,
    emergentContext         = null,
    cognitiveContext        = null,
    relationshipContext     = null,
    consequenceContext      = null,
    worldModelContext       = null,
    perceptionContext       = null,
    selfInspectionStatus    = null,
    fulfillmentContext      = null,
    evidenceIntegrityStatus = null,
    affectiveDecisionStatus = null,
    outputIntegrityStatus   = null,
    runtimePresence         = {},
    observedWriters         = {},
  } = {}) {
    _lastTickAt = now instanceof Date ? now : new Date(now || Date.now());

    // 1. Build the integration snapshot from every runtime's published output.
    const snapshot = buildIntegrationSnapshot({
      identityContext, homeostasisContext, beliefsContext, learningContext,
      narrativeContext, emergentContext, cognitiveContext, relationshipContext,
      consequenceContext, worldModelContext, perceptionContext,
      selfInspectionStatus, fulfillmentContext, evidenceIntegrityStatus,
      affectiveDecisionStatus, outputIntegrityStatus, now,
    });

    // 2. Detect runtime conflicts from published outputs.
    const conflicts = detectRuntimeConflicts({
      worldModelContext, perceptionContext, consequenceContext,
      cognitiveContext, emergentContext, identityContext,
      selfInspectionStatus, narrativeContext,
    });

    // 3. Validate architectural invariants.
    const {
      violations,
      ownershipViolationCount,
      staleRuntimeCount:  validatorStale,
      missingRuntimeCount: validatorMissing,
    } = validateDependencies({
      writers:  observedWriters,
      presence: runtimePresence,
    });

    const conceptValues = Object.values(snapshot.concepts);

    // 4. Compute integration health.
    // missingRuntimeCount and staleRuntimeCount come ONLY from the dependency
    // validator (explicitly declared required runtimes). Concept-level staleness
    // is already encoded in snapshot.coverage and penalises confidence there;
    // counting it again here would double-penalise and produce false degraded health.
    const { health, integrationConfidence, reasons } = computeIntegrationHealth({
      coverage:               snapshot.coverage,
      conflicts,
      violations,
      ownershipViolationCount,
      missingRuntimeCount:    validatorMissing,
      staleRuntimeCount:      validatorStale,
      eventBusHealthy:        true,
    });

    // 5. Build the neural prelude line (at most one line for the LLM).
    const neuralPrelude = buildNeuralPrelude({ health, conflicts, integrationConfidence });

    // 6. Persist integration metadata — the ONLY state this runtime owns.
    const runtimeCount         = snapshot.coverage.total;
    const healthyRuntimeCount  = conceptValues.filter(c => c.staleness === "fresh").length;
    const degradedRuntimeCount = runtimeCount - healthyRuntimeCount;

    await store.record({
      companionId, customerId,
      integrationHealth:      health,
      integrationConfidence,
      runtimeCount,
      healthyRuntimeCount,
      degradedRuntimeCount,
      conflictCount:          conflicts.length,
      ownershipViolationCount,
      staleRuntimeCount:      validatorStale,
      reasons:                [...reasons],
      now,
    }).catch(err => {
      logger?.warn?.("[neural-integration] snapshot record failed", { error: err?.message });
    });

    // 7. Freeze and cache. ONLY exposed to prelude builder and status — never
    //    fed into any decision runtime.
    _integrationContext = Object.freeze({
      health,
      integrationConfidence,
      conflicts:    Object.freeze([...conflicts]),
      violations:   Object.freeze([...violations]),
      reasons:      Object.freeze([...reasons]),
      coverage:     snapshot.coverage,
      neuralPrelude,
      generatedAt:  snapshot.generatedAt,
    });

    return _integrationContext;
  }

  function getIntegrationContext() {
    return _integrationContext;
  }

  function getStatus() {
    const storeStatus = store.getStatus();
    if (!_integrationContext) {
      return {
        integration_health:         null,
        integration_confidence:     null,
        runtime_count:              null,
        healthy_runtime_count:      null,
        degraded_runtime_count:     null,
        conflict_count:             null,
        ownership_violation_count:  null,
        stale_runtime_count:        null,
        last_integration_tick:      _lastTickAt?.toISOString() ?? null,
        ...storeStatus,
      };
    }
    const { health, integrationConfidence, conflicts, violations, coverage } = _integrationContext;
    const ownershipViolationCount = violations.filter(v => v.type === "ownership_violation").length;
    const staleCount              = violations.filter(v => v.type === "stale_runtime").length;
    const presentCount            = coverage?.present ?? null;
    const totalCount              = coverage?.total   ?? null;
    return {
      integration_health:         health,
      integration_confidence:     integrationConfidence,
      runtime_count:              totalCount,
      healthy_runtime_count:      presentCount,
      degraded_runtime_count:     (totalCount != null && presentCount != null) ? totalCount - presentCount : null,
      conflict_count:             conflicts.length,
      ownership_violation_count:  ownershipViolationCount,
      stale_runtime_count:        staleCount,
      last_integration_tick:      _lastTickAt?.toISOString() ?? null,
      ...storeStatus,
    };
  }

  return { init, tick, getIntegrationContext, getStatus };
}

module.exports = { createNeuralIntegrationRuntime };

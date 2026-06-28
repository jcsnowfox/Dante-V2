"use strict";

/**
 * runtimeDependencyValidator
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Validates the architectural invariants the whole stack depends on:
 *   - the runtime read-dependency graph is acyclic (no cycles, no self-loops)
 *   - every owned concept has exactly ONE owner (no duplicate ownership)
 *   - no runtime writes a concept it does not own (no illegal writes)
 *   - exactly one Discord sender and one scheduler (no duplicates)
 *   - required runtimes are present and fresh (no missing / stale runtimes)
 *
 * It validates against declared canonical constants plus a live presence map, so
 * tests can inject a cycle, a second owner, a duplicate sender, etc., and prove
 * each is detected. The validator NEVER repairs — it only reports.
 *
 * Dante ONLY.
 */

// ── Canonical single-owner registry (the audit ledger, in code) ───────────────
// Neural Integration owns EXACTLY ONE thing: integration metadata. Everything
// else belongs to its existing owner.
const CANONICAL_OWNERSHIP = Object.freeze({
  identity:             "identityRuntime",
  beliefs:              "identityRuntime",
  needs:                "homeostasisRuntime",
  lessons:              "relationshipLearningRuntime",
  narrative:            "narrativeIdentityRuntime",
  livingBehaviors:      "emergentLivingBehaviorRuntime",
  relationshipDna:      "emergentLivingBehaviorRuntime",
  repairState:          "relationalConsequencesEngine",
  repairFollowup:       "repairPersistenceEngine",
  worldBeliefs:         "worldModelRuntime",
  availability:         "availabilityConfidenceResolver",
  runtimeHealth:        "selfInspectionRuntime",
  cognitiveState:       "cognitiveRuntime",
  fulfillmentEvidence:  "fulfillmentRuntime",
  relationshipWeather:  "relationshipWeatherEngine",
  outputIntegrity:      "outputCorruptionDetector",
  integrationMetadata:  "neuralIntegrationRuntime",
});

const CANONICAL_SENDERS    = Object.freeze(["discordSendGateway"]);
const CANONICAL_SCHEDULERS = Object.freeze(["lifeRuntimeScheduler"]);

// Read-dependency graph (who reads whom). Must stay acyclic — Neural Integration
// is a SINK: it reads many, and nothing reads it back.
const CANONICAL_DEPENDENCY_GRAPH = Object.freeze({
  perceptionRuntime:           [],
  worldModelRuntime:           ["perceptionRuntime"],
  identityRuntime:             [],
  homeostasisRuntime:          [],
  relationshipLearningRuntime: ["identityRuntime", "homeostasisRuntime"],
  narrativeIdentityRuntime:    ["identityRuntime", "relationshipLearningRuntime"],
  cognitiveRuntime:            ["worldModelRuntime", "identityRuntime", "homeostasisRuntime", "narrativeIdentityRuntime"],
  emergentLivingBehaviorRuntime: ["cognitiveRuntime", "worldModelRuntime", "narrativeIdentityRuntime"],
  affectiveDecisionRuntime:    ["cognitiveRuntime"],
  romanticSurpriseRuntime:     ["affectiveDecisionRuntime", "cognitiveRuntime", "emergentLivingBehaviorRuntime"],
  repairPersistenceEngine:     ["affectiveDecisionRuntime", "cognitiveRuntime"],
  neuralIntegrationRuntime:    [
    "identityRuntime", "homeostasisRuntime", "relationshipLearningRuntime",
    "narrativeIdentityRuntime", "worldModelRuntime", "perceptionRuntime",
    "cognitiveRuntime", "emergentLivingBehaviorRuntime", "affectiveDecisionRuntime",
    "romanticSurpriseRuntime", "repairPersistenceEngine", "selfInspectionRuntime",
  ],
});

/**
 * validateDependencies
 *
 * @param {object} opts
 * @returns {{ valid:boolean, violations:Array, ownershipViolationCount:number,
 *             staleRuntimeCount:number, missingRuntimeCount:number }}
 */
function validateDependencies({
  graph        = CANONICAL_DEPENDENCY_GRAPH,
  ownership    = CANONICAL_OWNERSHIP,
  writers      = {},                 // observed writers: { concept: [runtime,...] }
  senders      = CANONICAL_SENDERS,
  schedulers   = CANONICAL_SCHEDULERS,
  presence     = {},                 // { runtime: { present:bool, fresh:bool } }
  requiredRuntimes = [],
} = {}) {
  const violations = [];

  // 1. Cycles / recursion in the read graph.
  const { cycles, selfLoops } = _findCycles(graph);
  for (const c of selfLoops) violations.push(_v("recursive_dependency", "critical", `runtime depends on itself: ${c}`));
  for (const c of cycles)    violations.push(_v("cycle", "critical", `dependency cycle: ${c.join(" → ")}`));

  // 2. Duplicate ownership (a concept with more than one owner).
  for (const [concept, owner] of Object.entries(ownership)) {
    const owners = Array.isArray(owner) ? [...new Set(owner)] : [owner];
    if (owners.length > 1) {
      violations.push(_v("duplicate_ownership", "critical", `${concept} owned by ${owners.join(", ")}`));
    }
  }

  // 3. Illegal writes (a runtime writes a concept it does not own).
  let ownershipViolationCount = 0;
  for (const [concept, list] of Object.entries(writers)) {
    const owner = Array.isArray(ownership[concept]) ? ownership[concept][0] : ownership[concept];
    for (const w of (Array.isArray(list) ? list : [list])) {
      if (owner && w && w !== owner) {
        ownershipViolationCount++;
        violations.push(_v("ownership_violation", "critical", `${w} illegally writes ${concept} (owner: ${owner})`));
      }
    }
  }

  // 4. Duplicate sender / scheduler.
  if (_uniq(senders).length > 1)    violations.push(_v("duplicate_sender", "critical", `multiple senders: ${_uniq(senders).join(", ")}`));
  if (_uniq(schedulers).length > 1) violations.push(_v("duplicate_scheduler", "critical", `multiple schedulers: ${_uniq(schedulers).join(", ")}`));

  // 5. Missing / stale runtimes.
  let missingRuntimeCount = 0, staleRuntimeCount = 0;
  for (const r of requiredRuntimes) {
    const p = presence[r];
    if (!p || p.present !== true) {
      missingRuntimeCount++;
      violations.push(_v("missing_runtime", "high", `required runtime missing: ${r}`));
    } else if (p.fresh === false) {
      staleRuntimeCount++;
      violations.push(_v("stale_runtime", "medium", `runtime snapshot stale: ${r}`));
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    ownershipViolationCount,
    staleRuntimeCount,
    missingRuntimeCount,
  };
}

// ── Internal: cycle detection (DFS, white/grey/black) ─────────────────────────

function _findCycles(graph) {
  const cycles = [];
  const selfLoops = [];
  const state = new Map(); // 0=white,1=grey,2=black
  const stack = [];

  for (const node of Object.keys(graph)) {
    if ((graph[node] || []).includes(node)) selfLoops.push(node);
  }

  function dfs(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dep of (graph[node] || [])) {
      if (dep === node) continue; // self-loop already recorded
      const s = state.get(dep) || 0;
      if (s === 1) {
        const idx = stack.indexOf(dep);
        cycles.push([...stack.slice(idx), dep]);
      } else if (s === 0) {
        dfs(dep);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of Object.keys(graph)) {
    if ((state.get(node) || 0) === 0) dfs(node);
  }
  return { cycles, selfLoops };
}

function _v(type, severity, detail) { return Object.freeze({ type, severity, detail }); }
function _uniq(arr) { return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))]; }

module.exports = {
  validateDependencies,
  CANONICAL_OWNERSHIP,
  CANONICAL_SENDERS,
  CANONICAL_SCHEDULERS,
  CANONICAL_DEPENDENCY_GRAPH,
};

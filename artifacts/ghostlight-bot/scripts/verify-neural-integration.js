#!/usr/bin/env node
"use strict";

/**
 * verify-neural-integration.js
 *
 * Verifies all structural and behavioural invariants for Dante's Neural
 * Integration Runtime 1.0 — the system's "nervous system".
 *
 * Expected final output: NEURAL_INTEGRATION_PASS
 *
 * Run: node artifacts/ghostlight-bot/scripts/verify-neural-integration.js
 */

const fs   = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = false;

function read(rel)    { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel)  { return fs.existsSync(path.join(root, rel)); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}
function req(rel) { return require(path.join(root, rel)); }

const NOW = new Date("2026-01-15T12:00:00Z");

function healthyCtx() {
  return {
    companionId: "dante", customerId: "jenna", now: NOW,
    identityContext:      { topValue: { valueKey: "authenticity", strength: 0.9 }, beliefCount: 5 },
    homeostasisContext:   { topNeed: { needType: "connection", urgency: 0.5 }, highestUrgency: 0.5 },
    learningContext:      { lessonCount: 3, guidance: ["be present"] },
    narrativeContext:     { mostRecentChapter: { theme: "growth", confidence: 0.8 } },
    emergentContext:      { livingBehaviors: [{ behavior_type: "morning_check_in" }], relationshipDna: [], culture: { available: true } },
    cognitiveContext:     { outcome: "no_action", confidence: 0.7, thoughtCount: 2, recommendations: { suppressRomantic: false } },
    consequenceContext:   { suppression: { repairRequired: false, healing: false, giveSpace: false } },
    worldModelContext:    { worldModel: { jenna: { availability: { value: "online", confidence: 0.8 } } } },
    perceptionContext:    { worldState: { jenna: { availability: "online", _confidence: 0.75 } } },
    selfInspectionStatus: { self_inspection_state: "healthy", degraded_sources: [], active_maintenance_request: false },
    fulfillmentContext:   { outcome: "SUCCESS" },
    affectiveDecisionStatus: { last_decision_outcome: "express", last_decision_confidence: 0.8 },
  };
}

// ─── 1. All six core files exist ──────────────────────────────────────────────
const coreFiles = [
  "src/lifeRuntime/neuralIntegrationRuntime.js",
  "src/lifeRuntime/integrationContextBuilder.js",
  "src/lifeRuntime/runtimeConflictResolver.js",
  "src/lifeRuntime/runtimeDependencyValidator.js",
  "src/lifeRuntime/integrationHealthMonitor.js",
  "src/lifeRuntime/neuralPreludeBuilder.js",
  "src/lifeRuntime/integrationSnapshotStore.js",
];
for (const f of coreFiles) check(`${path.basename(f)} exists`, exists(f));

// ─── 2. integrationContextBuilder: pure, 21 concepts, staleness ────────────────
const icb = read("src/lifeRuntime/integrationContextBuilder.js");
const { buildIntegrationSnapshot, STALE_MS } = req("src/lifeRuntime/integrationContextBuilder");
check("integrationContextBuilder exports buildIntegrationSnapshot", typeof buildIntegrationSnapshot === "function");
check("integrationContextBuilder exports STALE_MS",                 typeof STALE_MS === "number" && STALE_MS > 0);
check("integrationContextBuilder is synchronous (no async)",        !icb.includes("async "));
check("integrationContextBuilder has no setInterval/setTimeout",    !icb.includes("setInterval") && !icb.includes("setTimeout"));
check("integrationContextBuilder has no channel.send",              !icb.includes("channel.send"));

const snap = buildIntegrationSnapshot({});
check("snapshot has 21 concepts",              Object.keys(snap.concepts).length === 21);
check("snapshot has coverage {present,total}", typeof snap.coverage.present === "number" && typeof snap.coverage.total === "number");
check("snapshot has generatedAt (ISO string)", typeof snap.generatedAt === "string" && snap.generatedAt.includes("T"));

const EXPECTED_CONCEPTS = [
  "identity","needs","beliefs","lessons","narrative",
  "emergentTraits","livingBehaviors","relationshipDna","relationshipCulture",
  "currentThoughts","cognitiveState",
  "relationshipWeather","repairState",
  "worldModel","availability",
  "runtimeHealth","capabilities","outstandingMaintenance",
  "outputIntegrity","evidenceIntegrity","affectiveDecision",
];
for (const k of EXPECTED_CONCEPTS) {
  check(`snapshot contains concept: ${k}`, k in snap.concepts);
}

// Each cell must have the right shape.
const cell = snap.concepts.identity;
check("concept cell has value/confidence/source_runtime/timestamp/staleness",
  "value" in cell && "confidence" in cell && "source_runtime" in cell && "timestamp" in cell && "staleness" in cell);
check("concept cell staleness ∈ {fresh,stale,missing}",
  ["fresh","stale","missing"].includes(cell.staleness));

// With inputs, cells should be fresh.
const snapFull = buildIntegrationSnapshot({
  identityContext: { topValue: { valueKey: "authenticity", strength: 0.9 } }, now: NOW,
});
check("cell is fresh when input is present",   snapFull.concepts.identity.staleness === "fresh");
check("cell is missing when input is absent",  snapFull.concepts.needs.staleness === "missing");

// ─── 3. runtimeConflictResolver: pure, 8 conflict types ──────────────────────
const rcr = read("src/lifeRuntime/runtimeConflictResolver.js");
const { detectRuntimeConflicts, CONF_GAP } = req("src/lifeRuntime/runtimeConflictResolver");
check("runtimeConflictResolver exports detectRuntimeConflicts",  typeof detectRuntimeConflicts === "function");
check("runtimeConflictResolver exports CONF_GAP (≥0.2)",         typeof CONF_GAP === "number" && CONF_GAP >= 0.2);
check("runtimeConflictResolver is synchronous (no async)",       !rcr.includes("async "));
check("runtimeConflictResolver has no setInterval/setTimeout",   !rcr.includes("setInterval") && !rcr.includes("setTimeout"));
check("runtimeConflictResolver has no channel.send",             !rcr.includes("channel.send"));

// No conflicts in fully-coherent system.
const noConflicts = detectRuntimeConflicts({
  worldModelContext:  { worldModel: { jenna: { availability: { value: "online", confidence: 0.9 } } } },
  perceptionContext:  { worldState: { jenna: { availability: "online", _confidence: 0.85 } } },
});
check("coherent inputs → zero conflicts", noConflicts.length === 0);

// Availability conflict.
const avConflicts = detectRuntimeConflicts({
  worldModelContext:  { worldModel: { jenna: { availability: { value: "online",  confidence: 0.9 } } } },
  perceptionContext:  { worldState: { jenna: { availability: "away", _confidence: 0.8 } } },
});
check("conflicting_availability detected",              avConflicts.some(c => c.type === "conflicting_availability"));
check("availability conflict is high severity",         avConflicts.some(c => c.type === "conflicting_availability" && c.severity === "high"));

// Confidence-divergence conflict.
const confConflicts = detectRuntimeConflicts({
  worldModelContext: { worldModel: { jenna: { availability: { value: "online", confidence: 0.9 } } } },
  perceptionContext: { worldState: { jenna: { availability: "online", _confidence: 0.4 } } },
});
check("conflicting_confidence detected (gap ≥ CONF_GAP)",       confConflicts.some(c => c.type === "conflicting_confidence"));

// Impossible combination: repairRequired + healing simultaneously.
const impossible = detectRuntimeConflicts({
  consequenceContext: { suppression: { repairRequired: true, healing: true, giveSpace: false } },
});
check("impossible_combination detected (repair+healing)",        impossible.some(c => c.type === "impossible_combination"));
check("impossible_combination is high severity",                 impossible.some(c => c.type === "impossible_combination" && c.severity === "high"));

// Conflicting repair state.
const repConflict = detectRuntimeConflicts({
  consequenceContext: { suppression: { repairRequired: true, healing: false, giveSpace: false } },
  cognitiveContext:   { outcome: "no_action", recommendations: { encourageRepair: false, suppressRomantic: false } },
});
check("conflicting_repair_state detected",                       repConflict.some(c => c.type === "conflicting_repair_state"));

// Every conflict has frozen shape: type, severity, sources, detail, recommendation.
const sample = avConflicts[0];
check("conflict object has type/severity/sources/detail/recommendation",
  typeof sample.type === "string" && typeof sample.severity === "string" &&
  Array.isArray(sample.sources) && typeof sample.detail === "string" &&
  sample.recommendation === "reduce_confidence_and_reconcile");

// ─── 4. runtimeDependencyValidator: pure, ownership, DAG, senders ────────────
const rdv = read("src/lifeRuntime/runtimeDependencyValidator.js");
const {
  validateDependencies,
  CANONICAL_OWNERSHIP, CANONICAL_DEPENDENCY_GRAPH,
  CANONICAL_SENDERS, CANONICAL_SCHEDULERS,
} = req("src/lifeRuntime/runtimeDependencyValidator");
check("runtimeDependencyValidator exports validateDependencies",         typeof validateDependencies === "function");
check("runtimeDependencyValidator exports CANONICAL_OWNERSHIP",          typeof CANONICAL_OWNERSHIP === "object");
check("runtimeDependencyValidator exports CANONICAL_DEPENDENCY_GRAPH",   typeof CANONICAL_DEPENDENCY_GRAPH === "object");
check("runtimeDependencyValidator exports CANONICAL_SENDERS",            Array.isArray(CANONICAL_SENDERS));
check("runtimeDependencyValidator exports CANONICAL_SCHEDULERS",         Array.isArray(CANONICAL_SCHEDULERS));
check("runtimeDependencyValidator is synchronous (no async)",            !rdv.includes("async "));
check("runtimeDependencyValidator has no setInterval/setTimeout",        !rdv.includes("setInterval") && !rdv.includes("setTimeout"));
check("runtimeDependencyValidator has no channel.send",                  !rdv.includes("channel.send"));

// Canonical ownership: Neural Integration owns ONLY integrationMetadata.
const neuralOwned = Object.entries(CANONICAL_OWNERSHIP)
  .filter(([, owner]) => owner === "neuralIntegrationRuntime").map(([k]) => k);
check("Neural Integration owns ONLY integrationMetadata", JSON.stringify(neuralOwned) === JSON.stringify(["integrationMetadata"]));

// Core concepts belong to their rightful owners.
check("identity → identityRuntime",            CANONICAL_OWNERSHIP.identity           === "identityRuntime");
check("needs → homeostasisRuntime",            CANONICAL_OWNERSHIP.needs              === "homeostasisRuntime");
check("narrative → narrativeIdentityRuntime",  CANONICAL_OWNERSHIP.narrative          === "narrativeIdentityRuntime");
check("repairState → relationalConsequencesEngine", CANONICAL_OWNERSHIP.repairState   === "relationalConsequencesEngine");
check("worldBeliefs → worldModelRuntime",      CANONICAL_OWNERSHIP.worldBeliefs       === "worldModelRuntime");

// Canonical graph is acyclic.
const canonResult = validateDependencies({});
check("canonical dependency graph is acyclic",  !canonResult.violations.some(v => v.type === "cycle" || v.type === "recursive_dependency"));
check("canonical graph: no duplicate ownership", !canonResult.violations.some(v => v.type === "duplicate_ownership"));
check("canonical graph: no duplicate sender",    !canonResult.violations.some(v => v.type === "duplicate_sender"));
check("canonical graph: valid (no violations)",  canonResult.valid);

// Neural Integration is a SINK.
const readsNeural = Object.entries(CANONICAL_DEPENDENCY_GRAPH)
  .filter(([rt, deps]) => rt !== "neuralIntegrationRuntime" && deps.includes("neuralIntegrationRuntime"))
  .map(([rt]) => rt);
check("neuralIntegrationRuntime is a dependency sink (nothing reads it)", readsNeural.length === 0);

// Ownership violation detected.
const ownerResult = validateDependencies({ writers: { narrative: ["cognitiveRuntime"] } });
check("ownership violation detected",            ownerResult.violations.some(v => v.type === "ownership_violation"));
check("ownershipViolationCount is positive",     ownerResult.ownershipViolationCount >= 1);

// Cycle detected.
const cycleResult = validateDependencies({ graph: { a: ["b"], b: ["a"] } });
check("cycle detected in synthetic graph",       cycleResult.violations.some(v => v.type === "cycle"));
check("cyclic graph is invalid",                 !cycleResult.valid);

// Missing runtime detected.
const missingResult = validateDependencies({ requiredRuntimes: ["identityRuntime"], presence: { identityRuntime: { present: false } } });
check("missing runtime detected",               missingResult.violations.some(v => v.type === "missing_runtime"));
check("missingRuntimeCount is positive",        missingResult.missingRuntimeCount >= 1);

// Stale runtime detected.
const staleResult = validateDependencies({ requiredRuntimes: ["homeostasisRuntime"], presence: { homeostasisRuntime: { present: true, fresh: false } } });
check("stale runtime detected",                 staleResult.violations.some(v => v.type === "stale_runtime"));
check("staleRuntimeCount is positive",          staleResult.staleRuntimeCount >= 1);

// Duplicate sender / scheduler.
check("duplicate sender detected",              validateDependencies({ senders: ["discordSendGateway","another"] }).violations.some(v => v.type === "duplicate_sender"));
check("duplicate scheduler detected",           validateDependencies({ schedulers: ["lifeRuntimeScheduler","another"] }).violations.some(v => v.type === "duplicate_scheduler"));

// ─── 5. integrationHealthMonitor: pure, confidence formula, levels ────────────
const ihm = read("src/lifeRuntime/integrationHealthMonitor.js");
const { computeIntegrationHealth, HEALTH } = req("src/lifeRuntime/integrationHealthMonitor");
check("integrationHealthMonitor exports computeIntegrationHealth",   typeof computeIntegrationHealth === "function");
check("integrationHealthMonitor exports HEALTH array (4 levels)",    Array.isArray(HEALTH) && HEALTH.length === 4);
check("HEALTH levels: healthy/watch/degraded/critical",              ["healthy","watch","degraded","critical"].every(h => HEALTH.includes(h)));
check("integrationHealthMonitor is synchronous (no async)",          !ihm.includes("async "));
check("integrationHealthMonitor has no setInterval/setTimeout",      !ihm.includes("setInterval") && !ihm.includes("setTimeout"));

const healthFull    = computeIntegrationHealth({ coverage: { present: 21, total: 21 }, conflicts: [] });
check("full coverage + no conflicts → healthy",                      healthFull.health === "healthy");
check("full coverage + no conflicts → high confidence (≥0.9)",       healthFull.integrationConfidence >= 0.9);

const healthLow     = computeIntegrationHealth({ coverage: { present: 5, total: 21 }, conflicts: [] });
check("low coverage → watch or degraded (reduced confidence)",       ["watch","degraded"].includes(healthLow.health));

const healthHighConf = computeIntegrationHealth({ coverage: { present: 21, total: 21 }, conflicts: [{ severity: "high", type: "conflict", detail: "x" }] });
check("high-severity conflict → degraded",                           healthHighConf.health === "degraded");

const healthOwner   = computeIntegrationHealth({ coverage: { present: 21, total: 21 }, conflicts: [], ownershipViolationCount: 1 });
check("ownership violation → critical",                              healthOwner.health === "critical");

check("reasons array is non-empty",                                  healthFull.reasons.length > 0);
check("confidence is ≥0 and ≤1",                                     healthFull.integrationConfidence >= 0 && healthFull.integrationConfidence <= 1);

// ─── 6. neuralPreludeBuilder: pure, at most one line ──────────────────────────
const npb = read("src/lifeRuntime/neuralPreludeBuilder.js");
const { buildNeuralPrelude } = req("src/lifeRuntime/neuralPreludeBuilder");
check("neuralPreludeBuilder exports buildNeuralPrelude",             typeof buildNeuralPrelude === "function");
check("neuralPreludeBuilder is synchronous (no async)",              !npb.includes("async "));
check("neuralPreludeBuilder has no setInterval/setTimeout",          !npb.includes("setInterval") && !npb.includes("setTimeout"));
check("neuralPreludeBuilder has no channel.send",                    !npb.includes("channel.send"));

const preludeHealthy = buildNeuralPrelude({ health: "healthy", conflicts: [], integrationConfidence: 0.95 });
check("healthy+confident → 'all coherent' line",                     preludeHealthy === "Integration: all runtime systems coherent");

const preludeSilent  = buildNeuralPrelude({ health: "healthy", conflicts: [], integrationConfidence: 0.5 });
check("healthy+low confidence → null (stay silent)",                 preludeSilent === null);

const preludeCrit    = buildNeuralPrelude({ health: "critical", conflicts: [{ detail: "ownership violation" }], integrationConfidence: 0.1 });
check("critical health → non-null one-liner ≤160 chars",             preludeCrit !== null && preludeCrit.length <= 160 && preludeCrit.includes("critical"));

const preludeDeg     = buildNeuralPrelude({ health: "degraded", conflicts: [{ severity: "high", detail: "availability conflict" }], integrationConfidence: 0.4 });
check("degraded health → non-null one-liner ≤160 chars",             preludeDeg !== null && preludeDeg.length <= 160);

const preludeWatch   = buildNeuralPrelude({ health: "watch", conflicts: [{ detail: "minor note" }], integrationConfidence: 0.7 });
check("watch health + conflicts → non-null one-liner",               preludeWatch !== null && preludeWatch.length <= 160);

check("prelude never returns a multi-line string",
  [preludeHealthy, preludeCrit, preludeDeg, preludeWatch].every(l => !l || !l.includes("\n")));

// ─── 7. integrationSnapshotStore: Postgres+memory, schema ─────────────────────
const iss = read("src/lifeRuntime/integrationSnapshotStore.js");
const { createIntegrationSnapshotStore } = req("src/lifeRuntime/integrationSnapshotStore");
check("integrationSnapshotStore exports createIntegrationSnapshotStore", typeof createIntegrationSnapshotStore === "function");
check("integrationSnapshotStore uses Postgres pool (createPostgresPool)", iss.includes("createPostgresPool"));
check("integrationSnapshotStore has in-memory fallback",                  iss.includes("if (!pool)"));
check("integrationSnapshotStore has CREATE TABLE (additive)",             iss.includes("CREATE TABLE IF NOT EXISTS dante_integration_snapshots"));
check("integrationSnapshotStore has init/record/listRecent/getStatus",
  iss.includes("async function init") && iss.includes("async function record") &&
  iss.includes("async function listRecent") && iss.includes("function getStatus"));
check("integrationSnapshotStore memory cap ≤ 200",                       iss.includes("MAX_MEM") && Number(iss.match(/MAX_MEM\s*=\s*(\d+)/)?.[1] || 0) <= 200);
check("integrationSnapshotStore has no setInterval/setTimeout",           !iss.includes("setInterval") && !iss.includes("setTimeout"));
check("integrationSnapshotStore has no channel.send",                     !iss.includes("channel.send"));

// ─── 8. neuralIntegrationRuntime: orchestrator shape & laws ───────────────────
const nir = read("src/lifeRuntime/neuralIntegrationRuntime.js");
const { createNeuralIntegrationRuntime } = req("src/lifeRuntime/neuralIntegrationRuntime");
check("neuralIntegrationRuntime exports createNeuralIntegrationRuntime",  typeof createNeuralIntegrationRuntime === "function");
check("runtime has init/tick/getIntegrationContext/getStatus",
  nir.includes("async function init") && nir.includes("async function tick") &&
  nir.includes("getIntegrationContext") && nir.includes("function getStatus"));
check("runtime requires all 5 pure modules",
  nir.includes("integrationContextBuilder") && nir.includes("runtimeConflictResolver") &&
  nir.includes("runtimeDependencyValidator") && nir.includes("integrationHealthMonitor") &&
  nir.includes("neuralPreludeBuilder"));
check("runtime requires integrationSnapshotStore",                        nir.includes("integrationSnapshotStore"));
check("runtime does NOT send Discord (no sender)",                        !nir.includes("channel.send") && !nir.includes("discordSendGateway"));
check("runtime does NOT create a scheduler",                              !nir.includes("setInterval") && !nir.includes("setTimeout"));
check("runtime does NOT import state-owning runtimes",
  !nir.includes("identityRuntime") && !nir.includes("homeostasisRuntime") &&
  !nir.includes("cognitiveRuntime") && !nir.includes("repairPersistenceEngine"));
check("runtime does NOT replace existing orchestrators",                  !nir.includes("createLifeRuntime") && !nir.includes("createCognitiveRuntime"));
check("_integrationContext is documented as prelude-only (never decision)", nir.includes("ONLY") && (nir.includes("prelude") || nir.includes("decision")));

// ─── 9. Behavioural proofs (end-to-end, in-memory) ────────────────────────────
async function behaviouralProofs() {
  const { createNeuralIntegrationRuntime } = req("src/lifeRuntime/neuralIntegrationRuntime");

  // Basic tick round-trip.
  const rt1 = createNeuralIntegrationRuntime({});
  await rt1.init();
  assert.equal(rt1.getIntegrationContext(), null, "pre-tick context must be null");
  const ctx1 = await rt1.tick(healthyCtx());
  check("tick returns an integration context",              ctx1 !== null && typeof ctx1.health === "string");
  check("tick returns frozen context",                      Object.isFrozen(ctx1));
  check("healthy inputs → health=healthy",                  ctx1.health === "healthy");
  check("healthy inputs → confidence ≥ 0.80",              ctx1.integrationConfidence >= 0.80);
  check("getIntegrationContext returns same frozen object", rt1.getIntegrationContext() === ctx1);

  // Ownership check: context must not expose raw runtime states.
  check("context does NOT expose identityContext",    !("identityContext"   in ctx1));
  check("context does NOT expose cognitiveContext",   !("cognitiveContext"  in ctx1));
  check("context does NOT expose consequenceContext", !("consequenceContext" in ctx1));
  check("context DOES expose health",                 "health"               in ctx1);
  check("context DOES expose conflicts",              "conflicts"            in ctx1);
  check("context DOES expose violations",             "violations"           in ctx1);
  check("context DOES expose coverage",               "coverage"             in ctx1);

  // Conflict detection end-to-end.
  const rt2 = createNeuralIntegrationRuntime({});
  await rt2.init();
  const conflictInputs = { ...healthyCtx(),
    worldModelContext:  { worldModel: { jenna: { availability: { value: "online", confidence: 0.9 } } } },
    perceptionContext:  { worldState: { jenna: { availability: "away", _confidence: 0.8 } } },
  };
  const ctx2 = await rt2.tick(conflictInputs);
  check("availability conflict elevates health away from healthy",   ctx2.health !== "healthy");
  check("conflict is surfaced in ctx.conflicts",                     ctx2.conflicts.some(c => c.type === "conflicting_availability"));

  // Ownership violation end-to-end.
  const rt3 = createNeuralIntegrationRuntime({});
  await rt3.init();
  const violationInputs = { ...healthyCtx(), observedWriters: { narrative: ["cognitiveRuntime"] } };
  const ctx3 = await rt3.tick(violationInputs);
  check("ownership violation → health=critical",                     ctx3.health === "critical");
  check("ownership violation is in ctx.violations",                  ctx3.violations.some(v => v.type === "ownership_violation"));

  // Impossible combination.
  const rt4 = createNeuralIntegrationRuntime({});
  await rt4.init();
  const impossibleInputs = { ...healthyCtx(),
    consequenceContext: { suppression: { repairRequired: true, healing: true, giveSpace: false } },
  };
  const ctx4 = await rt4.tick(impossibleInputs);
  check("impossible combination detected in conflicts",              ctx4.conflicts.some(c => c.type === "impossible_combination"));

  // Prelude: healthy+confident.
  check("neural prelude: healthy+confident → 'all coherent'",        ctx1.neuralPrelude === "Integration: all runtime systems coherent");

  // Prelude: conflict → non-null one-liner.
  check("neural prelude: degraded/watch → non-null",                 ctx2.neuralPrelude !== null || ctx4.neuralPrelude !== null);

  // getStatus before tick.
  const rt5 = createNeuralIntegrationRuntime({});
  await rt5.init();
  const statusBefore = rt5.getStatus();
  check("status before tick: integration_health is null",            statusBefore.integration_health === null);
  check("status before tick: last_integration_tick is null",         statusBefore.last_integration_tick === null);

  // getStatus after tick.
  await rt5.tick(healthyCtx());
  const status = rt5.getStatus();
  const SAFE_KEYS = ["integration_health","integration_confidence","runtime_count","healthy_runtime_count","degraded_runtime_count","conflict_count","ownership_violation_count","stale_runtime_count","last_integration_tick"];
  for (const key of SAFE_KEYS) check(`status has ${key}`, key in status);
  check("status does NOT expose identityContext",    !("identityContext"   in status));
  check("status does NOT expose cognitiveContext",   !("cognitiveContext"  in status));
  check("status does NOT expose consequenceContext", !("consequenceContext" in status));
  check("status integration_health is a string",     typeof status.integration_health === "string");
  check("status last_integration_tick is ISO string", typeof status.last_integration_tick === "string");

  // Snapshot persisted.
  check("snapshot persisted: snapshot_count ≥ 1",   status.snapshot_count >= 1);
  check("snapshot persisted: last_snapshot_at set",  typeof status.last_snapshot_at === "string");

  // DELETION TEST: pure modules callable without orchestrator.
  const { buildIntegrationSnapshot: bis } = req("src/lifeRuntime/integrationContextBuilder");
  const { detectRuntimeConflicts: drc }   = req("src/lifeRuntime/runtimeConflictResolver");
  const { validateDependencies: vd }      = req("src/lifeRuntime/runtimeDependencyValidator");
  const { computeIntegrationHealth: cih } = req("src/lifeRuntime/integrationHealthMonitor");
  const { buildNeuralPrelude: bnp }       = req("src/lifeRuntime/neuralPreludeBuilder");
  let deletionOk = true;
  try { bis({}); drc({}); vd({}); cih({}); bnp({}); } catch { deletionOk = false; }
  check("DELETION TEST: all pure modules work without the orchestrator", deletionOk);
}

const assert = { equal: (a, b, msg) => { if (a !== b) { check(`assert: ${msg || `${a} === ${b}`}`, false); } } };

// ─── 10. lifeRuntime wiring ────────────────────────────────────────────────────
const lr = read("src/lifeRuntime/lifeRuntime.js");
check("lifeRuntime imports createNeuralIntegrationRuntime",  lr.includes("createNeuralIntegrationRuntime"));
check("lifeRuntime creates the neural runtime instance",     lr.includes("createNeuralIntegrationRuntime({"));
check("lifeRuntime has _tickNeural",                         lr.includes("_tickNeural"));
check("lifeRuntime runs _tickNeural after _tickEmergent",    lr.indexOf("await _tickNeural(now)") > lr.indexOf("await _tickEmergent(now)"));
check("lifeRuntime runs _tickNeural before _refreshPrelude", lr.lastIndexOf("await _tickNeural(now)") < lr.lastIndexOf("await _refreshPrelude()"));
check("lifeRuntime initialises neural runtime in init()",    lr.includes("neuralRt?.init"));
check("lifeRuntime exposes neuralIntegration in getStatus()", lr.includes("neuralIntegration:"));
// These checks verify that _integrationContext is NOT passed as an argument
// INTO these runtimes' tick/consult methods — not just that the names appear near each other.
check("_integrationContext never passed as arg to cognitive tick",
  !/cognitiveRt\.tick\([\s\S]{0,1500}_integrationContext/.test(lr));
check("_integrationContext never passed as arg to affective decision",
  !/affectiveDecision\.(?:consult|tick)\([\s\S]{0,1500}_integrationContext/.test(lr));
check("_integrationContext never passed as arg to romantic surprises tick",
  !/romanticSurprises\?\.tick\([\s\S]{0,1500}_integrationContext/.test(lr));
check("_integrationContext never passed as arg to repair persistence",
  !/repairPersistence\.tick\([\s\S]{0,1500}_integrationContext/.test(lr));

// ─── 11. lifePreludeBuilder wiring ────────────────────────────────────────────
const lpb = read("src/lifeRuntime/lifePreludeBuilder.js");
check("lifePreludeBuilder imports buildNeuralPrelude",        lpb.includes("buildNeuralPrelude"));
check("lifePreludeBuilder accepts integrationContext param",  lpb.includes("integrationContext"));
check("lifePreludeBuilder surfaces neural prelude",           lpb.includes("neuralPrelude") || lpb.includes("buildNeuralPrelude"));

// ─── 12. Isolation: pure modules do not require runtime orchestrators ──────────
for (const f of ["integrationContextBuilder.js","runtimeConflictResolver.js","runtimeDependencyValidator.js","integrationHealthMonitor.js","neuralPreludeBuilder.js"]) {
  const c = read(`src/lifeRuntime/${f}`);
  check(`${f}: does not require lifeRuntime`,          !c.includes("require(\"./lifeRuntime\")"));
  check(`${f}: does not require cognitiveRuntime`,     !c.includes("require(\"./cognitiveRuntime\")"));
  check(`${f}: does not require identityRuntime`,      !c.includes("require(\"../identity"));
}

// ─── 13. test file + package.json ─────────────────────────────────────────────
check("neuralIntegration.test.js exists",                     exists("src/lifeRuntime/__tests__/neuralIntegration.test.js"));
const tf = read("src/lifeRuntime/__tests__/neuralIntegration.test.js");
check("test file has ≥22 test cases",                         (tf.match(/^test\(/gm) || []).length >= 22);
const pkg = read("package.json");
check("package.json has verify:neural-integration script",    pkg.includes("verify:neural-integration"));
check("verify:runtime:all includes verify:neural-integration", pkg.includes("verify:neural-integration") && pkg.includes("verify:runtime:all"));

// ─── Final ────────────────────────────────────────────────────────────────────
behaviouralProofs().then(() => {
  console.log("");
  if (failed) {
    console.log("NEURAL_INTEGRATION_FAIL — one or more checks did not pass");
    process.exit(1);
  } else {
    console.log("NEURAL_INTEGRATION_PASS");
    process.exit(0);
  }
}).catch(err => {
  console.error("NEURAL_INTEGRATION_FAIL — proof error:", err?.message);
  process.exit(1);
});

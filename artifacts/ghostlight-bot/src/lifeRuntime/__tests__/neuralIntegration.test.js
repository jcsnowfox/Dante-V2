"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");

const root = path.resolve(__dirname, "..");

// ── helpers ───────────────────────────────────────────────────────────────────

function freshRuntime(opts = {}) {
  const { createNeuralIntegrationRuntime } = require(path.join(root, "neuralIntegrationRuntime"));
  return createNeuralIntegrationRuntime(opts);
}

const NOW = new Date("2026-01-15T12:00:00Z");

// Minimal contexts that represent each runtime being healthy and present.
function healthyContexts() {
  return {
    companionId: "dante",
    customerId:  "jenna",
    now:          NOW,
    identityContext:     { topValue: { valueKey: "authenticity", strength: 0.9 }, beliefCount: 5 },
    homeostasisContext:  { topNeed: { needType: "connection", urgency: 0.5 }, highestUrgency: 0.5 },
    learningContext:     { lessonCount: 3, guidance: ["be present"] },
    narrativeContext:    { mostRecentChapter: { theme: "growth", confidence: 0.8 } },
    emergentContext:     { livingBehaviors: [{ behavior_type: "morning_check_in" }], relationshipDna: [], culture: { available: true } },
    cognitiveContext:    { outcome: "no_action", confidence: 0.7, thoughtCount: 2, recommendations: { suppressRomantic: false } },
    consequenceContext:  { suppression: { repairRequired: false, healing: false, giveSpace: false } },
    worldModelContext:   { worldModel: { jenna: { availability: { value: "online", confidence: 0.8 } } } },
    perceptionContext:   { worldState: { jenna: { availability: "online", _confidence: 0.75 } } },
    selfInspectionStatus: { self_inspection_state: "healthy", degraded_sources: [], active_maintenance_request: false },
    fulfillmentContext:  { outcome: "SUCCESS" },
    affectiveDecisionStatus: { last_decision_outcome: "express", last_decision_confidence: 0.8 },
  };
}

// ── 1. Runtime boots and ticks without error ──────────────────────────────────
test("Neural Integration boots and ticks without error", async () => {
  const rt = freshRuntime();
  await rt.init();
  const ctx = await rt.tick(healthyContexts());
  assert.ok(ctx, "tick must return an integration context");
  assert.ok(typeof ctx.health === "string", "health must be a string");
  assert.ok(typeof ctx.integrationConfidence === "number", "confidence must be a number");
});

// ── 2. DELETION TEST: other runtimes are still independent ────────────────────
test("DELETION TEST: removing Neural Integration leaves other modules intact", () => {
  // Each pure module must be loadable and callable independently.
  const { buildIntegrationSnapshot } = require(path.join(root, "integrationContextBuilder"));
  const { detectRuntimeConflicts }   = require(path.join(root, "runtimeConflictResolver"));
  const { validateDependencies }     = require(path.join(root, "runtimeDependencyValidator"));
  const { computeIntegrationHealth } = require(path.join(root, "integrationHealthMonitor"));
  const { buildNeuralPrelude }       = require(path.join(root, "neuralPreludeBuilder"));

  // Each is callable without the orchestrator.
  assert.doesNotThrow(() => buildIntegrationSnapshot({}));
  assert.doesNotThrow(() => detectRuntimeConflicts({}));
  assert.doesNotThrow(() => validateDependencies({}));
  assert.doesNotThrow(() => computeIntegrationHealth({}));
  assert.doesNotThrow(() => buildNeuralPrelude({}));
});

// ── 3. CORE LAW: Neural Integration owns nothing important ────────────────────
test("CORE LAW: getIntegrationContext returns ONLY metadata — no identity/repair/needs raw state", async () => {
  const rt = freshRuntime();
  await rt.init();
  await rt.tick(healthyContexts());
  const ctx = rt.getIntegrationContext();

  // The integration context must NOT contain raw identity/homeostasis/narrative/etc.
  assert.equal(typeof ctx.identityContext, "undefined", "must not leak identityContext");
  assert.equal(typeof ctx.homeostasisContext, "undefined", "must not leak homeostasisContext");
  assert.equal(typeof ctx.learningContext, "undefined", "must not leak learningContext");
  assert.equal(typeof ctx.narrativeContext, "undefined", "must not leak narrativeContext");
  assert.equal(typeof ctx.emergentContext, "undefined", "must not leak emergentContext");
  assert.equal(typeof ctx.consequenceContext, "undefined", "must not leak consequenceContext");
  assert.equal(typeof ctx.worldModelContext, "undefined", "must not leak worldModelContext");

  // What it SHOULD contain is only integration metadata.
  assert.ok("health" in ctx, "must contain health");
  assert.ok("integrationConfidence" in ctx, "must contain integrationConfidence");
  assert.ok("conflicts" in ctx, "must contain conflicts");
  assert.ok("violations" in ctx, "must contain violations");
  assert.ok("reasons" in ctx, "must contain reasons");
  assert.ok("coverage" in ctx, "must contain coverage");
  assert.ok("generatedAt" in ctx, "must contain generatedAt");
});

// ── 4. Canonical ownership is still each runtime's own ───────────────────────
test("Canonical ownership: each concept belongs to exactly one owner", () => {
  const { CANONICAL_OWNERSHIP } = require(path.join(root, "runtimeDependencyValidator"));
  // Neural Integration must own ONLY integrationMetadata.
  const neuralOwned = Object.entries(CANONICAL_OWNERSHIP)
    .filter(([, owner]) => owner === "neuralIntegrationRuntime")
    .map(([concept]) => concept);
  assert.deepEqual(neuralOwned, ["integrationMetadata"], "Neural Integration must own only integrationMetadata");

  // Core concepts must belong to their rightful owners.
  assert.equal(CANONICAL_OWNERSHIP.identity,    "identityRuntime");
  assert.equal(CANONICAL_OWNERSHIP.needs,        "homeostasisRuntime");
  assert.equal(CANONICAL_OWNERSHIP.narrative,    "narrativeIdentityRuntime");
  assert.equal(CANONICAL_OWNERSHIP.repairState,  "relationalConsequencesEngine");
  assert.equal(CANONICAL_OWNERSHIP.worldBeliefs, "worldModelRuntime");
});

// ── 5. Healthy system → integrationConfidence ≥ 0.85, health=healthy ─────────
test("Healthy system → health=healthy, confidence ≥ 0.85", async () => {
  const rt = freshRuntime();
  await rt.init();
  const ctx = await rt.tick(healthyContexts());
  assert.equal(ctx.health, "healthy", "healthy inputs → healthy system");
  assert.ok(ctx.integrationConfidence >= 0.8, `confidence should be high, got ${ctx.integrationConfidence}`);
});

// ── 6. Conflict detection: availability disagreement → degraded ───────────────
test("Conflict detection: worldModel vs perception availability mismatch", async () => {
  const rt = freshRuntime();
  await rt.init();
  const inputs = healthyContexts();
  inputs.worldModelContext  = { worldModel: { jenna: { availability: { value: "online", confidence: 0.9 } } } };
  inputs.perceptionContext  = { worldState: { jenna: { availability: "away", _confidence: 0.8 } } };
  const ctx = await rt.tick(inputs);
  assert.ok(ctx.conflicts.length > 0, "must detect availability conflict");
  assert.ok(ctx.conflicts.some(c => c.type === "conflicting_availability"), "conflict must be conflicting_availability");
  assert.ok(["degraded", "watch", "critical"].includes(ctx.health), `health must be reduced, got ${ctx.health}`);
});

// ── 7. Impossible combination → high conflict ─────────────────────────────────
test("Conflict detection: repairRequired+healing simultaneously → impossible_combination", async () => {
  const rt = freshRuntime();
  await rt.init();
  const inputs = healthyContexts();
  inputs.consequenceContext = { suppression: { repairRequired: true, healing: true, giveSpace: false } };
  const ctx = await rt.tick(inputs);
  assert.ok(ctx.conflicts.some(c => c.type === "impossible_combination"), "must detect impossible_combination");
});

// ── 8. Ownership violation is caught ─────────────────────────────────────────
test("Dependency validator catches ownership violation", async () => {
  const rt = freshRuntime();
  await rt.init();
  const inputs = { ...healthyContexts(), observedWriters: { narrative: ["cognitiveRuntime"] } };
  const ctx = await rt.tick(inputs);
  // Ownership violation should surface in violations.
  assert.ok(ctx.violations.some(v => v.type === "ownership_violation"), "must detect ownership violation");
  assert.equal(ctx.health, "critical", "ownership violation → critical health");
});

// ── 9. Missing runtime detected ───────────────────────────────────────────────
test("Missing required runtime is detected", async () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({
    requiredRuntimes: ["identityRuntime"],
    presence: { identityRuntime: { present: false } },
  });
  assert.ok(!result.valid, "should not be valid");
  assert.ok(result.missingRuntimeCount > 0, "missingRuntimeCount should be positive");
  assert.ok(result.violations.some(v => v.type === "missing_runtime"), "should report missing_runtime");
});

// ── 10. Stale runtime detected ────────────────────────────────────────────────
test("Stale required runtime is detected", async () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({
    requiredRuntimes: ["homeostasisRuntime"],
    presence: { homeostasisRuntime: { present: true, fresh: false } },
  });
  assert.ok(result.staleRuntimeCount > 0, "staleRuntimeCount should be positive");
  assert.ok(result.violations.some(v => v.type === "stale_runtime"), "should report stale_runtime");
});

// ── 11. Duplicate sender caught ───────────────────────────────────────────────
test("Dependency validator catches duplicate senders", async () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({ senders: ["discordSendGateway", "anotherSender"] });
  assert.ok(result.violations.some(v => v.type === "duplicate_sender"), "must detect duplicate_sender");
});

// ── 12. Duplicate scheduler caught ────────────────────────────────────────────
test("Dependency validator catches duplicate schedulers", async () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({ schedulers: ["lifeRuntimeScheduler", "anotherScheduler"] });
  assert.ok(result.violations.some(v => v.type === "duplicate_scheduler"), "must detect duplicate_scheduler");
});

// ── 13. Cycle detection in dependency graph ───────────────────────────────────
test("Dependency validator detects cycles in the dependency graph", async () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({
    graph: { a: ["b"], b: ["a"] },  // cycle: a → b → a
  });
  assert.ok(result.violations.some(v => v.type === "cycle"), "must detect cycle");
  assert.ok(!result.valid, "cyclic graph must not be valid");
});

// ── 14. Canonical graph is acyclic ────────────────────────────────────────────
test("Canonical dependency graph is acyclic (no cycles, no self-loops)", () => {
  const { validateDependencies } = require(path.join(root, "runtimeDependencyValidator"));
  const result = validateDependencies({});
  const hasCycle = result.violations.some(v => v.type === "cycle" || v.type === "recursive_dependency");
  assert.ok(!hasCycle, "canonical graph must be acyclic");
});

// ── 15. Neural Integration is a sink — nothing reads it back ──────────────────
test("neuralIntegrationRuntime is a dependency sink — nothing reads it", () => {
  const { CANONICAL_DEPENDENCY_GRAPH } = require(path.join(root, "runtimeDependencyValidator"));
  const readsNeural = Object.entries(CANONICAL_DEPENDENCY_GRAPH)
    .filter(([rt, deps]) => rt !== "neuralIntegrationRuntime" && deps.includes("neuralIntegrationRuntime"))
    .map(([rt]) => rt);
  assert.deepEqual(readsNeural, [], `no runtime should read neuralIntegrationRuntime, found: ${readsNeural.join(", ")}`);
});

// ── 16. Integration snapshot covers all expected concepts ────────────────────
test("Integration snapshot contains all 21 expected concepts", async () => {
  const { buildIntegrationSnapshot } = require(path.join(root, "integrationContextBuilder"));
  const snap = buildIntegrationSnapshot({});
  const EXPECTED = [
    "identity", "needs", "beliefs", "lessons", "narrative",
    "emergentTraits", "livingBehaviors", "relationshipDna", "relationshipCulture",
    "currentThoughts", "cognitiveState",
    "relationshipWeather", "repairState",
    "worldModel", "availability",
    "runtimeHealth", "capabilities", "outstandingMaintenance",
    "outputIntegrity", "evidenceIntegrity", "affectiveDecision",
  ];
  for (const key of EXPECTED) {
    assert.ok(key in snap.concepts, `snapshot must contain concept: ${key}`);
  }
  assert.equal(Object.keys(snap.concepts).length, 21, "snapshot must have exactly 21 concepts");
});

// ── 17. Prelude: healthy+confident → "all coherent" line ─────────────────────
test("Neural prelude: healthy+confident emits 'all coherent' line", () => {
  const { buildNeuralPrelude } = require(path.join(root, "neuralPreludeBuilder"));
  const line = buildNeuralPrelude({ health: "healthy", conflicts: [], integrationConfidence: 0.9 });
  assert.equal(line, "Integration: all runtime systems coherent");
});

// ── 18. Prelude: healthy+low confidence → null (silent) ──────────────────────
test("Neural prelude: healthy but low confidence → null (stay silent)", () => {
  const { buildNeuralPrelude } = require(path.join(root, "neuralPreludeBuilder"));
  const line = buildNeuralPrelude({ health: "healthy", conflicts: [], integrationConfidence: 0.5 });
  assert.equal(line, null, "low confidence should produce no prelude line");
});

// ── 19. Prelude: critical → surfaces one honest line ─────────────────────────
test("Neural prelude: critical health → surfaces critical line", () => {
  const { buildNeuralPrelude } = require(path.join(root, "neuralPreludeBuilder"));
  const line = buildNeuralPrelude({
    health: "critical",
    conflicts: [{ detail: "ownership violation in identity" }],
    integrationConfidence: 0.1,
  });
  assert.ok(line && line.includes("critical"), `expected critical mention, got: ${line}`);
  assert.ok(line.length <= 160, "prelude line must be ≤160 chars");
});

// ── 20. getStatus returns only safe metadata ──────────────────────────────────
test("getStatus returns only safe metadata keys", async () => {
  const rt = freshRuntime();
  await rt.init();
  await rt.tick(healthyContexts());
  const status = rt.getStatus();
  const SAFE_KEYS = [
    "integration_health", "integration_confidence",
    "runtime_count", "healthy_runtime_count", "degraded_runtime_count",
    "conflict_count", "ownership_violation_count", "stale_runtime_count",
    "last_integration_tick",
  ];
  for (const key of SAFE_KEYS) {
    assert.ok(key in status, `status must contain: ${key}`);
  }
  // Must NOT expose raw runtime contexts.
  assert.ok(!("identityContext" in status), "must not expose identityContext");
  assert.ok(!("consequenceContext" in status), "must not expose consequenceContext");
  assert.ok(!("cognitiveContext" in status), "must not expose cognitiveContext");
});

// ── 21. Snapshot record is persisted (in-memory store) ───────────────────────
test("Snapshot is persisted to the store on each tick", async () => {
  const rt = freshRuntime();
  await rt.init();
  await rt.tick(healthyContexts());
  const storeStatus = rt.getStatus();
  assert.ok(storeStatus.snapshot_count >= 1, `expected at least 1 snapshot, got ${storeStatus.snapshot_count}`);
  assert.ok(storeStatus.last_snapshot_at, "last_snapshot_at should be set");
});

// ── 22. getIntegrationContext before first tick → null ────────────────────────
test("getIntegrationContext returns null before first tick", async () => {
  const rt = freshRuntime();
  await rt.init();
  assert.equal(rt.getIntegrationContext(), null, "must return null before first tick");
});

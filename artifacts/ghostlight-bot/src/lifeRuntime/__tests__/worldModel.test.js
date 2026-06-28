"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const fs     = require("node:fs");
const path   = require("node:path");

const root = path.resolve(__dirname, "..");

// ── 1. Discord activity → Jenna available belief ─────────────────────────────
test("Discord activity produces Jenna available belief", () => {
  const { processJennaSignals } = require(path.join(root, "perceptionEngine"));
  const signals = processJennaSignals({
    alivePresence: { userRecentlyActive: true, discordStatus: "online" },
    now: new Date(),
  });
  const avail = signals.find(s => s.key === "jenna.availability");
  assert.ok(avail, "Should produce jenna.availability signal");
  assert.equal(avail.value, "available");
  assert.ok(avail.confidence > 0, "Should have positive confidence");
  assert.ok(avail.source, "Should carry a source");
  assert.ok(Array.isArray(avail.evidence_ids), "Should carry evidence_ids");
});

// ── 2. Explicit override: going to sleep ──────────────────────────────────────
test("Explicit 'going to sleep' sets Jenna availability to asleep", () => {
  const { processJennaSignals } = require(path.join(root, "perceptionEngine"));
  const signals = processJennaSignals({ userText: "going to sleep now", now: new Date() });
  const explicit = signals.find(s => s.key === "jenna.availability" && s.source === "explicit_statement");
  assert.ok(explicit, "Should produce explicit availability signal");
  assert.equal(explicit.value, "asleep");
  assert.ok(explicit.confidence >= 0.85, "Explicit statement should have high confidence");
  const sleeping = signals.find(s => s.key === "jenna.likely_sleeping");
  assert.ok(sleeping, "Should derive jenna.likely_sleeping from asleep");
  assert.equal(sleeping.value, true);
});

// ── 3. Confidence decays over time ────────────────────────────────────────────
test("Belief confidence decays after threshold period", () => {
  const { applyDecayToBelief, STALENESS_DECAY_RATE } = require(path.join(root, "worldDecayEngine"));
  const origin = new Date(0);
  const belief = {
    value: "busy", confidence: 0.90, source: "discord_event",
    timestamp: origin.toISOString(), evidence_ids: [], conflict: 0, stale: false,
  };
  const later = new Date(90 * 60 * 1000); // 90 min = 3 periods of 30 min
  const decayed = applyDecayToBelief(belief, "jenna.availability", later);
  assert.ok(decayed.confidence < belief.confidence, "Confidence should have decayed");
  assert.ok(decayed.confidence >= 0, "Confidence should not go below 0");
});

// ── 4. Confidence decays to stale after sufficient time ───────────────────────
test("Belief becomes stale after confidence drops below UNKNOWN_THRESHOLD", () => {
  const { applyDecayToBelief, UNKNOWN_THRESHOLD } = require(path.join(root, "worldDecayEngine"));
  const origin = new Date(0);
  const belief = {
    value: "busy", confidence: 0.85, source: "discord_event",
    timestamp: origin.toISOString(), evidence_ids: [], conflict: 0, stale: false,
  };
  // jenna.availability threshold = 30min, rate 0.06; after 12 periods (6h): 0.85 - 0.72 = 0.13 → stale
  const muchLater = new Date(6 * 60 * 60 * 1000);
  const decayed = applyDecayToBelief(belief, "jenna.availability", muchLater);
  assert.ok(decayed.confidence < UNKNOWN_THRESHOLD, `Confidence ${decayed.confidence} should be below UNKNOWN_THRESHOLD ${UNKNOWN_THRESHOLD}`);
  assert.ok(decayed.stale === true, "Belief should be marked stale");
});

// ── 5. Conflict detection lowers confidence ───────────────────────────────────
test("Conflicting signals for same key reduces confidence and registers conflict", () => {
  const { resolveBeliefDomain } = require(path.join(root, "worldBeliefResolver"));
  const now = new Date().toISOString();
  const signals = [
    { key: "jenna.availability", value: "available", confidence: 0.80, source: "discord_event",    evidence_ids: ["e1"], timestamp: now },
    { key: "jenna.availability", value: "busy",      confidence: 0.75, source: "alive_presence",   evidence_ids: ["e2"], timestamp: now },
  ];
  const { resolved, conflicts } = resolveBeliefDomain(signals);
  assert.ok(resolved["jenna.availability"], "Should resolve jenna.availability");
  assert.ok(resolved["jenna.availability"].conflict > 0, "Conflict score should be > 0");
  assert.ok(conflicts.length > 0, "Should detect conflict");
});

// ── 6. Unknown stays UNKNOWN when no signal ───────────────────────────────────
test("Unknown stays UNKNOWN when no evidence provided", () => {
  const { isUnknown, DOMAIN_DEFAULTS } = require(path.join(root, "worldBeliefResolver"));
  const nullBelief = {
    value: DOMAIN_DEFAULTS["jenna.likely_busy"], // null
    confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false,
  };
  assert.ok(isUnknown(nullBelief), "Zero-confidence null belief should be UNKNOWN");
  assert.ok(isUnknown(null), "null should be UNKNOWN");
  assert.ok(isUnknown(undefined), "undefined should be UNKNOWN");
});

// ── 7. Repair state → relationship belief ────────────────────────────────────
test("Consequence repair context produces relationship.repair_progress = 'needed'", () => {
  const { processRelationshipSignals } = require(path.join(root, "perceptionEngine"));
  const consequenceContext = {
    suppression: { repairRequired: true, repairStarted: false, healing: false, giveSpace: false },
    activeCount: 1,
  };
  const signals = processRelationshipSignals({ consequenceContext, now: new Date() });
  const repair = signals.find(s => s.key === "relationship.repair_progress");
  assert.ok(repair, "Should produce relationship.repair_progress signal");
  assert.equal(repair.value, "needed");
  assert.ok(repair.confidence > 0.5, "Repair signal should have reasonable confidence");
});

// ── 8. Self-inspection degraded → dante belief ───────────────────────────────
test("Self-inspection degraded status produces dante.runtime_health = 'degraded'", () => {
  const { processDanteSignals } = require(path.join(root, "perceptionEngine"));
  const signals = processDanteSignals({ selfInspectionStatus: { overall: "degraded" }, now: new Date() });
  const health = signals.find(s => s.key === "dante.runtime_health");
  assert.ok(health, "Should produce dante.runtime_health signal");
  assert.equal(health.value, "degraded");
  assert.ok(health.confidence > 0.5, "Health signal should have reasonable confidence");
});

// ── 9. second_life.presence defaults without signal ──────────────────────────
test("second_life.presence defaults to null without any signal", () => {
  const { DOMAIN_DEFAULTS } = require(path.join(root, "worldBeliefResolver"));
  assert.equal(DOMAIN_DEFAULTS["second_life.presence"], null, "Default should be null");
});

// ── 10. worldModelRuntime.tick builds structured world model ──────────────────
test("worldModelRuntime.tick builds structured world model", async () => {
  const { createWorldModelRuntime } = require(path.join(root, "worldModelRuntime"));
  const wm = createWorldModelRuntime({});
  await wm.init();
  await wm.tick({
    companionId:  "dante",
    customerId:   "jenna",
    alivePresence: { userRecentlyActive: true, discordStatus: "online" },
    now:          new Date(),
  });
  const model = wm.getWorldModel();
  assert.ok(model, "World model should be built after tick");
  assert.ok(model.jenna,        "World model should have jenna domain");
  assert.ok(model.dante,        "World model should have dante domain");
  assert.ok(model.relationship, "World model should have relationship domain");
  assert.ok(model.environment,  "World model should have environment domain");
  assert.ok(model.second_life,  "World model should have second_life domain");
  assert.ok("availability" in model.jenna,       "jenna should have availability belief");
  assert.ok("runtime_health" in model.dante,     "dante should have runtime_health belief");
  assert.ok("repair_progress" in model.relationship, "relationship should have repair_progress belief");
});

// ── 11. prelude signal built correctly ───────────────────────────────────────
test("buildWorldModelSignal produces compact prelude from surfaceable belief", () => {
  const { buildWorldModelSignal } = require(path.join(root, "worldModelPreludeBuilder"));
  const worldModel = {
    jenna: {
      availability: { value: "busy", confidence: 0.71, source: "discord_event", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
      give_space_state: { value: false, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false },
    },
    relationship: {
      repair_progress: { value: "stable", confidence: 0.80, source: "consequence_context", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
    },
    dante: {
      runtime_health: { value: "healthy", confidence: 0.80, source: "self_inspection", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
    },
  };
  const signal = buildWorldModelSignal(worldModel);
  assert.ok(signal, "Should produce a signal");
  assert.ok(signal.startsWith("World:"), "Signal should start with 'World:'");
  assert.ok(signal.length <= 200, "Signal should be ≤200 chars");
  assert.ok(signal.includes("71%"), "Signal should include confidence percentage");
});

// ── 12. null world model returns null prelude ─────────────────────────────────
test("buildWorldModelSignal returns null for null/empty world model", () => {
  const { buildWorldModelSignal } = require(path.join(root, "worldModelPreludeBuilder"));
  assert.equal(buildWorldModelSignal(null), null);
  assert.equal(buildWorldModelSignal(undefined), null);
  // World model with all low-confidence beliefs should return null
  const lowConf = {
    jenna: { availability: { value: "available", confidence: 0.10, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false } },
    relationship: { repair_progress: { value: null, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false } },
  };
  assert.equal(buildWorldModelSignal(lowConf), null, "Low-confidence model should return null");
});

// ── 13. worldModelRuntime has no scheduler ────────────────────────────────────
test("worldModelRuntime has no setInterval scheduler", () => {
  const src = fs.readFileSync(path.join(root, "worldModelRuntime.js"), "utf8");
  assert.ok(!src.includes("setInterval"), "worldModelRuntime should not create its own scheduler");
  assert.ok(!src.includes("setTimeout"), "worldModelRuntime should not create timers");
});

// ── 14. worldModelRuntime has no channel.send ────────────────────────────────
test("worldModelRuntime has no channel.send", () => {
  const src = fs.readFileSync(path.join(root, "worldModelRuntime.js"), "utf8");
  assert.ok(!src.includes("channel.send"), "worldModelRuntime should not send Discord messages");
});

// ── 15. getStatus returns expected fields ────────────────────────────────────
test("worldModelRuntime.getStatus returns expected status fields", async () => {
  const { createWorldModelRuntime } = require(path.join(root, "worldModelRuntime"));
  const wm = createWorldModelRuntime({});
  await wm.init();
  const status = wm.getStatus();
  assert.ok("world_model_age"      in status, "Status should have world_model_age");
  assert.ok("active_world_beliefs" in status, "Status should have active_world_beliefs");
  assert.ok("uncertain_beliefs"    in status, "Status should have uncertain_beliefs");
  assert.ok("belief_conflicts"     in status, "Status should have belief_conflicts");
  assert.ok("last_world_update"    in status, "Status should have last_world_update");
  assert.equal(status.last_world_update, null, "Should be null before first tick");
  assert.equal(status.active_world_beliefs, 0, "No beliefs before first tick");
});

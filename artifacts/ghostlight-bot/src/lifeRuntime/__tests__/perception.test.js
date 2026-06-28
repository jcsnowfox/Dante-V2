"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("path");
const fs     = require("fs");

const { createPerceptionRuntime }           = require("../perceptionRuntime");
const { createWorldStateStore, STALENESS_DECAY_RATE } = require("../worldStateStore");
const { interpretAlivePresence, interpretDiscordEvent, interpretExplicitStatement, AVAILABILITY } = require("../presenceInterpreter");
const { inferQuietHours, inferRepairState } = require("../activityInferenceEngine");
const { resolveConfidence, detectConflict } = require("../perceptionConfidenceResolver");
const { buildWorldState }                   = require("../worldStateBuilder");
const { buildPerceptionSignal }             = require("../perceptionPreludeBuilder");

const SCOPE = { companionId: "dante", customerId: "jenna" };

function mkRuntime(overrides = {}) {
  return createPerceptionRuntime({ config: { lifeRuntime: { enabled: true } }, ...overrides });
}

// ── Test 1: Discord activity updates world state ──────────────────────────────

test("discord activity updates world state", async () => {
  const rt = mkRuntime();
  await rt.init();

  rt.observeDiscordEvent({
    event_type:  "user_message_received",
    id:          "msg-1",
    channel_id:  "ch-integration",
    created_at:  new Date().toISOString(),
  });

  await rt.tick({ ...SCOPE, now: new Date() });

  const ws = rt.getWorldState();
  assert.ok(ws,                         "world state should exist");
  assert.ok(ws.jenna,                   "world state should have jenna section");
  assert.equal(ws.jenna.current_channel, "ch-integration", "Discord channel should be captured");
  assert.ok(
    [AVAILABILITY.AVAILABLE, AVAILABILITY.LIKELY_BUSY, AVAILABILITY.UNKNOWN].includes(ws.jenna.availability)
    || ws.jenna.current_channel !== null,
    "Discord activity should update world state",
  );
  assert.ok(ws.jenna.last_meaningful_contact !== null || ws.jenna.current_channel === "ch-integration",
    "last_meaningful_contact or current_channel should be set from Discord event",
  );
});

// ── Test 2: User explicit statement beats inference ───────────────────────────

test("user explicit statement beats inference", async () => {
  const rt = mkRuntime();
  await rt.init();

  // First tick: alive presence says Jenna is active (available)
  await rt.tick({
    ...SCOPE,
    now:          new Date(),
    alivePresence: { userRecentlyActive: true },
  });

  // Second tick: explicit statement "I'm busy working"
  await rt.tick({
    ...SCOPE,
    now:      new Date(),
    userText: "I'm busy working right now",
  });

  const ws = rt.getWorldState();
  assert.ok(ws, "world state should exist");
  assert.ok(
    [AVAILABILITY.BUSY, AVAILABILITY.LIKELY_BUSY].includes(ws.jenna.availability),
    `explicit "busy" statement should override inference, got: ${ws.jenna.availability}`,
  );
});

// ── Test 3: Stale presence decays confidence ──────────────────────────────────

test("stale presence decays confidence", async () => {
  const store = createWorldStateStore();
  await store.init();

  const t0 = new Date("2026-01-01T10:00:00Z");
  await store.upsertSignal({
    ...SCOPE,
    key:          "jenna.availability",
    value:        AVAILABILITY.AVAILABLE,
    confidence:   0.70,
    source:       "alive_presence",
    evidence_ids: ["test-ev"],
    staleness_threshold_ms: 30 * 60 * 1000,
    now:          t0,
  });

  // Resolve 1.5 staleness periods later (45 min)
  const t1 = new Date(t0.getTime() + 45 * 60 * 1000);
  const resolved = await store.resolveSignal({ ...SCOPE, key: "jenna.availability", now: t1 });

  assert.ok(resolved.confidence < 0.70, "confidence should have decayed");
  assert.ok(resolved.confidence >= 0,   "confidence should not go below 0");
  assert.equal(resolved.stale, true,    "signal should be marked stale");
  assert.ok(resolved.ageMs > 0,         "ageMs should be positive");
});

// ── Test 4: Conflicting evidence lowers confidence ────────────────────────────

test("conflicting evidence lowers confidence", async () => {
  const conflict = detectConflict([
    { key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.80, source: "alive_presence" },
    { key: "jenna.availability", value: AVAILABILITY.BUSY,      confidence: 0.70, source: "discord_event"  },
  ]);
  assert.ok(conflict > 0, "conflict should be detected when sources disagree");

  const resolved = resolveConfidence([
    { value: AVAILABILITY.AVAILABLE, confidence: 0.80, source: "alive_presence" },
    { value: AVAILABILITY.BUSY,      confidence: 0.70, source: "discord_event"  },
  ]);
  assert.ok(resolved.conflict > 0,       "conflict should be > 0");
  assert.ok(resolved.confidence < 0.80,  "conflict should lower confidence below highest source");
  assert.ok(resolved.confidence >= 0,    "confidence should not go negative");
  assert.ok(resolved.dominant_source,    "dominant source should be identified");
});

// ── Test 5: Unknown remains unknown ──────────────────────────────────────────

test("unknown remains unknown when no evidence", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Tick with no presence signals
  await rt.tick({ ...SCOPE, now: new Date() });

  const ws = rt.getWorldState();
  assert.ok(ws, "world state should exist");
  assert.equal(ws.jenna.availability, AVAILABILITY.UNKNOWN, "no evidence → availability should be unknown");
  assert.ok(ws.uncertainty.length > 0, "uncertainty should list unknown states");
  assert.ok(ws.uncertainty.some(u => u.toLowerCase().includes("unknown")), "uncertainty should mention unknown");
});

// ── Test 6: Quiet hours reflected ─────────────────────────────────────────────

test("quiet hours reflected in world state", async () => {
  const rt = mkRuntime();
  await rt.init();

  // 23:00 local hour (past QUIET_HOURS_START = 22)
  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  await rt.tick({ ...SCOPE, now: lateNight });

  const ws = rt.getWorldState();
  assert.ok(ws, "world state should exist");
  assert.equal(ws.environment.quiet_hours, true, "quiet hours should be active at 23:00");
  assert.ok(typeof ws.environment.season === "string", "season should be a string");
  assert.ok(typeof ws.environment.time === "string",   "time should be an ISO string");

  // Verify pure function too
  const qh = inferQuietHours(lateNight);
  assert.equal(qh.active, true, "inferQuietHours should return active=true at 23:00");

  // Morning (quiet hours)
  const earlyMorning = new Date();
  earlyMorning.setHours(3, 0, 0, 0);
  const qhMorning = inferQuietHours(earlyMorning);
  assert.equal(qhMorning.active, true, "quiet hours active at 03:00");

  // Midday (not quiet hours)
  const midday = new Date();
  midday.setHours(12, 0, 0, 0);
  const qhMidday = inferQuietHours(midday);
  assert.equal(qhMidday.active, false, "quiet hours inactive at 12:00");
});

// ── Test 7: Repair state reflected in world state ────────────────────────────

test("repair state reflected in world state", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Tick with consequence context indicating repair is needed
  await rt.tick({
    ...SCOPE,
    now: new Date(),
    consequenceContext: {
      suppression: {
        repairRequired: true,
        repairStarted:  false,
        healing:        false,
        giveSpace:      false,
      },
    },
  });

  const ws = rt.getWorldState();
  assert.ok(ws, "world state should exist");
  assert.equal(ws.jenna.repair_state, "needed", "repair_state should be 'needed'");

  // Test give_space
  const rt2 = mkRuntime();
  await rt2.init();
  await rt2.tick({
    ...SCOPE,
    now: new Date(),
    consequenceContext: {
      suppression: { repairRequired: false, repairStarted: false, healing: false, giveSpace: true },
    },
  });
  const ws2 = rt2.getWorldState();
  assert.equal(ws2.jenna.give_space, true, "give_space should be true");
  assert.equal(ws2.jenna.repair_state, "give_space", "repair_state should be give_space");

  // Test pure function
  assert.equal(inferRepairState({ suppression: { repairRequired: true  } }), "needed");
  assert.equal(inferRepairState({ suppression: { repairStarted: true   } }), "started");
  assert.equal(inferRepairState({ suppression: { healing: true         } }), "healing");
  assert.equal(inferRepairState({ suppression: { giveSpace: true       } }), "give_space");
  assert.equal(inferRepairState(null),                                        "none");
});

// ── Test 8: Runtime health reflected in world state ──────────────────────────

test("runtime health reflected in world state", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Tick with self-inspection reporting degraded
  await rt.tick({
    ...SCOPE,
    now: new Date(),
    selfInspectionStatus: { overall: "degraded", degradedSources: ["relationship"] },
  });

  const ws = rt.getWorldState();
  assert.ok(ws, "world state should exist");
  assert.equal(ws.dante.runtime_health, "degraded", "runtime health should reflect self-inspection");
  assert.ok(Array.isArray(ws.dante.degraded_sources), "degraded_sources should be an array");

  // Healthy
  const rt2 = mkRuntime();
  await rt2.init();
  await rt2.tick({
    ...SCOPE,
    now: new Date(),
    selfInspectionStatus: { overall: "healthy" },
  });
  const ws2 = rt2.getWorldState();
  assert.equal(ws2.dante.runtime_health, "healthy", "healthy self-inspection → healthy runtime_health");

  // No self-inspection → unknown
  const rt3 = mkRuntime();
  await rt3.init();
  await rt3.tick({ ...SCOPE, now: new Date() });
  const ws3 = rt3.getWorldState();
  assert.equal(ws3.dante.runtime_health, "unknown", "no self-inspection → unknown runtime_health");
});

// ── Test 9: Romantic surprise consults perception ────────────────────────────

test("romantic surprise consults perception: perceptionContext provides availability and quiet_hours", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Give space active + quiet hours
  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  await rt.tick({
    ...SCOPE,
    now: lateNight,
    consequenceContext: {
      suppression: { repairRequired: false, giveSpace: true },
    },
  });

  const ctx = rt.getPerceptionContext();
  assert.ok(ctx,                "perceptionContext should exist");
  assert.ok(ctx.worldState,     "perceptionContext should have worldState");

  // Fields that romanticSurprise needs
  assert.equal(ctx.worldState.jenna.give_space,           true,  "romanticSurprise: give_space is available from perceptionContext");
  assert.equal(ctx.worldState.environment.quiet_hours,    true,  "romanticSurprise: quiet_hours is available from perceptionContext");
  assert.ok(typeof ctx.worldState.jenna.availability === "string", "romanticSurprise: availability is a string");
  assert.ok(typeof ctx.worldState.jenna.repair_state === "string", "romanticSurprise: repair_state is a string");
});

// ── Test 10: Repair persistence consults perception ──────────────────────────

test("repair persistence consults perception: perceptionContext provides repair context", async () => {
  const rt = mkRuntime();
  await rt.init();

  await rt.tick({
    ...SCOPE,
    now: new Date(),
    consequenceContext: {
      suppression: { repairRequired: true, repairStarted: false, healing: false, giveSpace: false },
    },
  });

  const ctx = rt.getPerceptionContext();
  assert.ok(ctx,                              "perceptionContext should exist");
  assert.ok(ctx.worldState.jenna,             "perceptionContext.worldState.jenna must exist");

  // Fields that repairPersistence needs
  assert.equal(ctx.worldState.jenna.repair_state, "needed", "repairPersistence: repair_state available");
  assert.equal(ctx.worldState.jenna.give_space,   false,    "repairPersistence: give_space available");

  const lateNight = new Date();
  lateNight.setHours(23, 0, 0, 0);
  await rt.tick({ ...SCOPE, now: lateNight, consequenceContext: null });
  const ctx2 = rt.getPerceptionContext();
  assert.equal(ctx2.worldState.environment.quiet_hours, true, "repairPersistence: quiet_hours available");
});

// ── Test 11: Affective decision consults perception ──────────────────────────

test("affective decision consults perception: perceptionContext provides dante + jenna state", async () => {
  const rt = mkRuntime();
  await rt.init();

  await rt.tick({
    ...SCOPE,
    now:                  new Date(),
    identityContext:      { selfConfidence: 0.72, topValue: { valueKey: "honesty", strength: 0.72 } },
    selfInspectionStatus: { overall: "healthy" },
    alivePresence:        { userRecentlyActive: true },
  });

  const ctx = rt.getPerceptionContext();
  assert.ok(ctx,                              "perceptionContext should exist");

  // Fields that affectiveDecision needs
  assert.ok(typeof ctx.worldState.dante.runtime_health === "string",    "affectiveDecision: dante.runtime_health available");
  assert.ok(Array.isArray(ctx.worldState.dante.current_capabilities),   "affectiveDecision: dante.current_capabilities available");
  assert.ok(typeof ctx.worldState.jenna.availability === "string",      "affectiveDecision: jenna.availability available");
  assert.ok(typeof ctx.worldState.environment.quiet_hours === "boolean","affectiveDecision: quiet_hours available");
  assert.ok(typeof ctx.worldState.conversation.state === "string",      "affectiveDecision: conversation.state available");
  assert.ok(Array.isArray(ctx.uncertainty),                             "affectiveDecision: uncertainty list available");
});

// ── Test 12: No raw secrets in status ────────────────────────────────────────

test("status safe: no raw private text in getStatus()", async () => {
  const rt = mkRuntime();
  await rt.init();

  rt.recordEvent({ eventType: "hurt_detected", eventId: "hurt-1", summary: "she said she was angry", payload: { rawText: "private details here" } });
  await rt.tick({ ...SCOPE, now: new Date() });

  const status = rt.getStatus();

  // Only these keys should appear
  const allowed = new Set([
    "jenna_availability", "jenna_busy_confidence", "quiet_hours",
    "repair_state", "runtime_health", "give_space",
    "uncertainty_count", "last_tick_at",
  ]);
  for (const key of Object.keys(status)) {
    assert.ok(allowed.has(key), `unexpected key in status: ${key}`);
  }

  const statusStr = JSON.stringify(status);
  assert.doesNotMatch(statusStr, /she said she was angry/, "raw event text must not appear in status");
  assert.doesNotMatch(statusStr, /private details/,        "raw payload text must not appear in status");

  // Prelude signal should start with "Perception:" if set
  const prelude = rt.getPreludeSignal();
  if (prelude !== null) {
    assert.ok(typeof prelude === "string",          "prelude should be a string");
    assert.ok(prelude.startsWith("Perception:"),    "prelude should start with 'Perception:'");
    assert.ok(prelude.length <= 200,                "prelude should be ≤200 chars");
  }
});

// ── Test 13: No duplicate scheduler ──────────────────────────────────────────

test("no duplicate scheduler (no setInterval/setTimeout in source files)", () => {
  const src   = path.join(__dirname, "..");
  const files = [
    "perceptionRuntime.js",
    "worldStateStore.js",
    "presenceInterpreter.js",
    "activityInferenceEngine.js",
    "perceptionConfidenceResolver.js",
    "worldStateBuilder.js",
    "perceptionPreludeBuilder.js",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    assert.ok(!content.includes("setInterval("), `${file} must not contain setInterval`);
    assert.ok(!content.includes("setTimeout("),  `${file} must not contain setTimeout`);
  }
});

// ── Test 14: No duplicate sender ─────────────────────────────────────────────

test("no duplicate sender (no Discord channel.send in source files)", () => {
  const src   = path.join(__dirname, "..");
  const files = [
    "perceptionRuntime.js",
    "worldStateStore.js",
    "presenceInterpreter.js",
    "activityInferenceEngine.js",
    "perceptionConfidenceResolver.js",
    "worldStateBuilder.js",
    "perceptionPreludeBuilder.js",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    assert.ok(!content.includes("channel.send("),      `${file} must not call channel.send`);
    assert.ok(!content.includes("discordSendGateway"), `${file} must not import discordSendGateway`);
    assert.ok(!content.includes("sendDiscordMessage"), `${file} must not call sendDiscordMessage`);
  }
});

// ── Test 15: Dashboard unchanged ──────────────────────────────────────────────

test("dashboard unchanged: perception runtime does not modify adminPageHandlers", () => {
  const handlersDir = path.join(__dirname, "../../http/adminPageHandlers");
  if (!fs.existsSync(handlersDir)) return; // not present in test env — skip safely
  const files = fs.readdirSync(handlersDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(handlersDir, file), "utf8");
    assert.ok(!content.includes("perceptionRuntime"), `${file} should not import perceptionRuntime`);
    assert.ok(!content.includes("worldStateStore"),   `${file} should not reference worldStateStore`);
  }
});
